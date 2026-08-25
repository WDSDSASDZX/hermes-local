"""Discover local model servers, configure Hermes, and launch its WebUI.

The launcher stays outside the agent's narrow core: it reuses Hermes' config
writer and dashboard instead of introducing another runtime or provider layer.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence


MIN_AGENT_CONTEXT = 64_000
DEFAULT_CONTEXT = 65_536


@dataclass(frozen=True)
class EndpointCandidate:
    name: str
    base_url: str
    family: str = "openai"
    source: str = "default"


@dataclass(frozen=True)
class ProbeResult:
    name: str
    base_url: str
    family: str
    source: str
    reachable: bool
    models: tuple[str, ...] = ()
    error: str | None = None
    latency_ms: float | None = None

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["models"] = list(self.models)
        return value


def normalise_base_url(url: str) -> str:
    value = url.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Invalid HTTP endpoint: {url!r}")
    return value


def _openai_base_url(url: str) -> str:
    value = normalise_base_url(url)
    return value if value.endswith("/v1") else f"{value}/v1"


def _ollama_root(url: str) -> str:
    value = normalise_base_url(url)
    return value[:-3].rstrip("/") if value.endswith("/v1") else value


def is_wsl() -> bool:
    release = platform.release().lower()
    return "microsoft" in release or "wsl" in release


def wsl_host_ips() -> list[str]:
    """Return likely Windows host addresses for NAT and mirrored WSL modes."""
    if not is_wsl():
        return []
    found: list[str] = []
    try:
        route = subprocess.run(
            ["ip", "route", "show", "default"],
            check=False,
            capture_output=True,
            text=True,
            timeout=1,
        ).stdout.split()
        if "via" in route:
            found.append(route[route.index("via") + 1])
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        pass
    try:
        for line in Path("/etc/resolv.conf").read_text(encoding="utf-8").splitlines():
            fields = line.split()
            if len(fields) == 2 and fields[0] == "nameserver":
                socket.inet_aton(fields[1])
                found.append(fields[1])
    except (OSError, UnicodeError, ValueError):
        pass
    return list(dict.fromkeys(found))


def configured_endpoint() -> str | None:
    """Read the active URL when Hermes dependencies are already installed."""
    try:
        from hermes_cli.config import load_config_readonly

        model = load_config_readonly().get("model", {})
        if isinstance(model, dict) and isinstance(model.get("base_url"), str):
            return normalise_base_url(model["base_url"])
    except Exception:
        # Detection is also useful before the editable install is complete.
        return None
    return None


def build_candidates(*, include_configured: bool = True) -> list[EndpointCandidate]:
    candidates: list[EndpointCandidate] = []
    if include_configured and (configured := configured_endpoint()):
        family = "ollama" if urllib.parse.urlsplit(configured).port == 11434 else "openai"
        candidates.append(EndpointCandidate("Configured endpoint", configured, family, "config"))
    defaults = (
        ("Ollama", 11434, "ollama"),
        ("LM Studio", 1234, "openai"),
        ("vLLM", 8000, "openai"),
        ("llama.cpp / LocalAI", 8080, "openai"),
        ("SGLang", 30000, "openai"),
    )
    hosts = [("127.0.0.1", "loopback")]
    hosts.extend((host, "wsl-host") for host in wsl_host_ips())
    for host, source in hosts:
        display_host = f"[{host}]" if ":" in host else host
        for name, port, family in defaults:
            candidates.append(
                EndpointCandidate(name, f"http://{display_host}:{port}", family, source)
            )
    unique: list[EndpointCandidate] = []
    seen: set[str] = set()
    for candidate in candidates:
        # Treat /v1 and the server root as the same discovery target.
        key = _ollama_root(candidate.base_url) if candidate.family == "ollama" else _openai_base_url(candidate.base_url)
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def _get_json(url: str, timeout: float) -> object:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "hermes-local/0.1"},
    )
    # Do not leak local probes into a configured HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        return json.loads(response.read(2 * 1024 * 1024).decode("utf-8"))


def model_ids(payload: object) -> tuple[str, ...]:
    if not isinstance(payload, dict):
        return ()
    rows = payload.get("data")
    if not isinstance(rows, list):
        rows = payload.get("models")
    if not isinstance(rows, list):
        return ()
    values: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = row.get("id") or row.get("name") or row.get("model")
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    return tuple(dict.fromkeys(values))


def probe_endpoint(candidate: EndpointCandidate, *, timeout: float = 1.5) -> ProbeResult:
    started = time.perf_counter()
    try:
        if candidate.family == "ollama":
            root = _ollama_root(candidate.base_url)
            payload = _get_json(f"{root}/api/tags", timeout)
            base_url = f"{root}/v1"
        else:
            base_url = _openai_base_url(candidate.base_url)
            payload = _get_json(f"{base_url}/models", timeout)
        return ProbeResult(
            candidate.name,
            base_url,
            candidate.family,
            candidate.source,
            True,
            model_ids(payload),
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
        )
    except urllib.error.HTTPError as exc:
        detail = f"HTTP {exc.code}"
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as exc:
        detail = str(getattr(exc, "reason", exc))
    except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
        detail = f"Invalid response: {exc}"
    return ProbeResult(
        candidate.name,
        candidate.base_url,
        candidate.family,
        candidate.source,
        False,
        error=detail,
        latency_ms=round((time.perf_counter() - started) * 1000, 1),
    )


def detect_endpoints(
    candidates: Iterable[EndpointCandidate] | None = None,
    *,
    timeout: float = 1.5,
) -> list[ProbeResult]:
    items = list(candidates if candidates is not None else build_candidates())
    if not items:
        return []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(12, len(items))) as pool:
        futures = [pool.submit(probe_endpoint, item, timeout=timeout) for item in items]
        return [future.result() for future in futures]


def print_results(results: Sequence[ProbeResult], *, show_failures: bool = False) -> None:
    healthy = [result for result in results if result.reachable]
    if healthy:
        print("Detected local model servers:")
        for index, result in enumerate(healthy, 1):
            models = ", ".join(result.models) if result.models else "reachable; no models reported"
            print(f"  {index}. {result.name}: {result.base_url}")
            print(f"     models: {models}")
    else:
        print("No local model server was detected.")
    if show_failures:
        print("\nProbe details:")
        for result in results:
            state = "ok" if result.reachable else (result.error or "unreachable")
            print(f"  {result.name} [{result.source}] {result.base_url}: {state}")


def _pick_result(
    healthy: Sequence[ProbeResult], requested_endpoint: str, *, assume_yes: bool
) -> ProbeResult:
    if requested_endpoint != "auto":
        normalised = normalise_base_url(requested_endpoint)
        family = "ollama" if urllib.parse.urlsplit(normalised).port == 11434 else "openai"
        result = probe_endpoint(EndpointCandidate("Custom", normalised, family, "explicit"), timeout=3)
        if not result.reachable:
            raise RuntimeError(f"Endpoint {normalised} is not usable: {result.error}")
        return result
    if not healthy:
        raise RuntimeError("No local model server is reachable. Start Ollama, LM Studio, vLLM, llama.cpp, or SGLang first.")
    if len(healthy) == 1 or assume_yes:
        return healthy[0]
    print("Choose a local server:")
    for index, result in enumerate(healthy, 1):
        print(f"  {index}. {result.name} ({result.base_url})")
    choice = input("Server [1]: ").strip() or "1"
    try:
        return healthy[int(choice) - 1]
    except (ValueError, IndexError) as exc:
        raise RuntimeError("Invalid server selection") from exc


def _pick_model(result: ProbeResult, requested_model: str | None, *, assume_yes: bool) -> str:
    if requested_model:
        return requested_model
    if not result.models:
        raise RuntimeError(
            f"{result.name} is reachable but reports no models. Load/pull a model or pass --model."
        )
    if len(result.models) == 1 or assume_yes:
        return result.models[0]
    print(f"Choose a model from {result.name}:")
    for index, model in enumerate(result.models, 1):
        print(f"  {index}. {model}")
    choice = input("Model [1]: ").strip() or "1"
    try:
        return result.models[int(choice) - 1]
    except (ValueError, IndexError) as exc:
        raise RuntimeError("Invalid model selection") from exc


def write_model_config(result: ProbeResult, model: str, context_length: int) -> Path:
    if context_length < MIN_AGENT_CONTEXT:
        raise ValueError(
            f"Hermes tool use requires at least {MIN_AGENT_CONTEXT:,} context tokens; got {context_length:,}."
        )
    from hermes_cli.config import get_config_path, read_raw_config, save_config

    raw = read_raw_config()
    current_model = raw.get("model", {}) if isinstance(raw, dict) else {}
    if not isinstance(current_model, dict):
        current_model = {}
    updated_model = dict(current_model)
    updated_model.update(
        {
            "provider": "custom",
            "default": model,
            "base_url": result.base_url,
            "context_length": context_length,
        }
    )
    save_config(
        {"model": updated_model},
        merge_existing=True,
        preserve_keys={
            ("model", "provider"),
            ("model", "default"),
            ("model", "base_url"),
            ("model", "context_length"),
        },
    )
    return get_config_path()


def configure_local(args: argparse.Namespace) -> tuple[ProbeResult, str, Path]:
    results = detect_endpoints(timeout=args.timeout)
    selected = _pick_result(
        [result for result in results if result.reachable],
        args.endpoint,
        assume_yes=args.yes,
    )
    model = _pick_model(selected, args.model, assume_yes=args.yes)
    path = write_model_config(selected, model, args.context_length)
    print(f"Configured Hermes: {selected.name} / {model}")
    print(f"  endpoint: {selected.base_url}")
    print(f"  config:   {path}")
    if selected.family == "ollama":
        print("  reminder: set Ollama runtime context to 64K+ (OLLAMA_CONTEXT_LENGTH=65536).")
    return selected, model, path



def command_locations() -> dict[str, str | None]:
    """Find prerequisites even when the calling shell has not activated them."""
    locations = {
        name: shutil.which(name)
        for name in ("hermes", "uv", "node", "npm", "docker", "ollama")
    }
    if locations["hermes"] is None:
        sibling = Path(sys.executable).with_name("hermes")
        if sibling.is_file():
            locations["hermes"] = str(sibling)
    nvm_root = Path.home() / ".nvm" / "versions" / "node"
    if nvm_root.is_dir():
        versions = sorted(nvm_root.iterdir(), key=lambda path: path.name, reverse=True)
        for command in ("node", "npm"):
            if locations[command] is not None:
                continue
            for version in versions:
                candidate = version / "bin" / command
                if candidate.is_file():
                    locations[command] = str(candidate)
                    break
    return locations


def doctor_report(results: Sequence[ProbeResult]) -> dict[str, object]:
    config_path: str | None = None
    try:
        from hermes_cli.config import get_config_path

        config_path = str(get_config_path())
    except Exception:
        pass
    return {
        "platform": platform.platform(),
        "wsl": is_wsl(),
        "python": sys.version.split()[0],
        "config_path": config_path,
        "commands": command_locations(),
        "endpoints": [result.to_dict() for result in results],
        "ready": any(result.reachable and result.models for result in results),
    }


def _run_dashboard(args: argparse.Namespace) -> int:
    if not args.keep_model:
        configure_local(args)
    locations = command_locations()
    hermes = locations["hermes"]
    if hermes is None:
        print("hermes executable not found. Install this checkout: uv pip install -e '.[web]'", file=sys.stderr)
        return 2
    command = [hermes, "dashboard", "--host", args.host, "--port", str(args.port)]
    dist_index = Path(__file__).resolve().parents[1] / "hermes_cli" / "web_dist" / "index.html"
    if not args.rebuild_ui and dist_index.is_file():
        command.append("--skip-build")
    if args.no_open:
        command.append("--no-open")
    print(f"Starting Hermes WebUI at http://{args.host}:{args.port}")
    if "--skip-build" in command:
        print("  using prebuilt WebUI (pass --rebuild-ui after changing web/)")
    env = os.environ.copy()
    runtime_dirs = {
        str(Path(path).parent)
        for name in ("node", "npm")
        if (path := locations.get(name))
    }
    if runtime_dirs:
        env["PATH"] = os.pathsep.join([*sorted(runtime_dirs), env.get("PATH", "")])
    return subprocess.call(command, env=env)


def _add_selection_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--endpoint", default="auto", help="auto or an explicit HTTP base URL")
    parser.add_argument("--model", help="model id; auto-selects when omitted")
    parser.add_argument("--context-length", type=int, default=DEFAULT_CONTEXT)
    parser.add_argument("--timeout", type=float, default=1.5)
    parser.add_argument("-y", "--yes", action="store_true", help="select first healthy endpoint/model")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hermes-local",
        description="Local-model discovery, configuration, diagnostics, and WebUI launcher.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    detect = subparsers.add_parser("detect", help="discover local model servers")
    detect.add_argument("--timeout", type=float, default=1.5)
    detect.add_argument("--json", action="store_true")
    detect.add_argument("--all", action="store_true", help="show failed probes too")
    configure = subparsers.add_parser("configure", help="configure Hermes for a local model")
    _add_selection_args(configure)
    doctor = subparsers.add_parser("doctor", help="check local-model and WebUI prerequisites")
    doctor.add_argument("--timeout", type=float, default=1.5)
    doctor.add_argument("--json", action="store_true")
    dashboard = subparsers.add_parser("dashboard", help="configure a local model and launch WebUI")
    _add_selection_args(dashboard)
    dashboard.add_argument("--host", default="127.0.0.1")
    dashboard.add_argument("--port", type=int, default=9119)
    dashboard.add_argument("--no-open", action="store_true")
    dashboard.add_argument("--keep-model", action="store_true", help="do not change active model")
    dashboard.add_argument(
        "--rebuild-ui",
        action="store_true",
        help="check/install frontend dependencies and rebuild instead of using prebuilt assets",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    incoming = list(argv) if argv is not None else sys.argv[1:]
    if not incoming:
        incoming = ["dashboard", "--keep-model"]
    args = build_parser().parse_args(incoming)
    try:
        if args.command == "detect":
            results = detect_endpoints(timeout=args.timeout)
            if args.json:
                print(json.dumps([result.to_dict() for result in results], indent=2, ensure_ascii=False))
            else:
                print_results(results, show_failures=args.all)
            return 0 if any(result.reachable for result in results) else 1
        if args.command == "configure":
            configure_local(args)
            return 0
        if args.command == "doctor":
            results = detect_endpoints(timeout=args.timeout)
            report = doctor_report(results)
            if args.json:
                print(json.dumps(report, indent=2, ensure_ascii=False))
            else:
                print(f"Platform: {report['platform']} (WSL={report['wsl']})")
                print(f"Python:   {report['python']}")
                print(f"Config:   {report['config_path'] or 'not available'}")
                for name, location in report["commands"].items():
                    print(f"{name:8} {location or 'not found'}")
                print()
                print_results(results, show_failures=True)
            return 0 if report["ready"] else 1
        if args.command == "dashboard":
            return _run_dashboard(args)
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"hermes-local: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
