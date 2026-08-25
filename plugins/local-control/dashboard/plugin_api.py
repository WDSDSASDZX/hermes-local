"""Local model control tower and privacy-preserving runtime trace API."""

from __future__ import annotations

import json
import math
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Iterable

from fastapi import APIRouter, HTTPException, Query
from hermes_constants import get_hermes_home
from hermes_local.launcher import (
    DEFAULT_CONTEXT, detect_endpoints, doctor_report, normalise_base_url,
    write_model_config,
)

router = APIRouter()
_LOCK = threading.Lock()
_CACHE: Dict[str, Any] | None = None
_CACHE_AT = 0.0
_CACHE_TTL = 3.0
_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/-]{8,}"),
)


def _safe_endpoint(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        parsed = urllib.parse.urlsplit(value.strip())
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    port = f":{parsed.port}" if parsed.port else ""
    return urllib.parse.urlunsplit(
        (parsed.scheme, host + port, parsed.path.rstrip("/"), "", "")
    )


def _safe_text(value: object, limit: int = 280) -> str:
    text = str(value or "").replace("\x00", " ").replace("\r", " ").replace("\n", " ")
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text[:limit]


def _percent(value: int, total: int) -> float:
    return round(value * 100 / total, 1) if total else 0.0


def _quantile(values: Iterable[float], ratio: float) -> float | None:
    ordered = sorted(float(value) for value in values if value is not None)
    if not ordered:
        return None
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * ratio) - 1))
    return round(ordered[index], 1)


class _ControlStore:
    """Independent WAL store containing operational metadata, never prompts."""

    def __init__(self, path: Path | None = None):
        self.path = path or (
            get_hermes_home() / "plugin-data" / "local-control" / "control-tower.db"
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=3)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=3000")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS model_probes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL,
                    name TEXT NOT NULL, family TEXT NOT NULL, source TEXT NOT NULL,
                    base_url TEXT NOT NULL, reachable INTEGER NOT NULL,
                    latency_ms REAL, models_json TEXT NOT NULL DEFAULT '[]', error TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_model_probes_url_ts
                    ON model_probes(base_url, ts DESC);
                CREATE TABLE IF NOT EXISTS model_switches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL,
                    previous_model TEXT, model TEXT NOT NULL, base_url TEXT NOT NULL,
                    latency_ms REAL, success INTEGER NOT NULL, error TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_model_switches_ts
                    ON model_switches(ts DESC);
                CREATE TABLE IF NOT EXISTS errors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL,
                    area TEXT NOT NULL, message TEXT NOT NULL, model TEXT, base_url TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts DESC);
                CREATE TABLE IF NOT EXISTS pet_interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL,
                    action TEXT NOT NULL, reason TEXT NOT NULL, bond INTEGER, energy INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_pet_interactions_ts
                    ON pet_interactions(ts DESC);
                """
            )

    def record_probes(self, results: Iterable[object], *, force: bool = False) -> None:
        now = time.time()
        with self._write_lock, self._connect() as conn:
            for result in results:
                row = result.to_dict() if hasattr(result, "to_dict") else dict(result)
                url = _safe_endpoint(row.get("base_url"))
                if not url:
                    continue
                models = json.dumps(list(row.get("models") or []), ensure_ascii=False)
                error = _safe_text(row.get("error")) or None
                last = conn.execute(
                    "SELECT ts,reachable,models_json,error FROM model_probes "
                    "WHERE base_url=? ORDER BY ts DESC LIMIT 1", (url,)
                ).fetchone()
                same = (
                    last and int(last["reachable"]) == int(bool(row.get("reachable")))
                    and last["models_json"] == models and (last["error"] or None) == error
                )
                if not force and same and now - float(last["ts"]) < 30:
                    continue
                conn.execute(
                    "INSERT INTO model_probes "
                    "(ts,name,family,source,base_url,reachable,latency_ms,models_json,error) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (
                        now, _safe_text(row.get("name"), 80),
                        _safe_text(row.get("family"), 32),
                        _safe_text(row.get("source"), 32), url,
                        int(bool(row.get("reachable"))), row.get("latency_ms"),
                        models, error,
                    ),
                )
            cutoff = now - 30 * 86400
            for table in ("model_probes", "errors", "pet_interactions"):
                conn.execute(f"DELETE FROM {table} WHERE ts < ?", (cutoff,))

    def record_switch(
        self, *, previous_model: object, model: object, base_url: object,
        success: bool, latency_ms: float | None, error: object = None,
    ) -> None:
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO model_switches "
                "(ts,previous_model,model,base_url,latency_ms,success,error) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    time.time(), _safe_text(previous_model, 160) or None,
                    _safe_text(model, 160), _safe_endpoint(base_url), latency_ms,
                    int(success), _safe_text(error) or None,
                ),
            )

    def record_error(
        self, area: str, error: object, *, model: object = None,
        base_url: object = None,
    ) -> None:
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO errors(ts,area,message,model,base_url) VALUES (?,?,?,?,?)",
                (
                    time.time(), _safe_text(area, 48), _safe_text(error),
                    _safe_text(model, 160) or None, _safe_endpoint(base_url) or None,
                ),
            )

    def record_pet(self, payload: Dict[str, Any]) -> None:
        action = _safe_text(payload.get("action"), 80)
        reason = _safe_text(payload.get("reason"), 40)
        if not action or not reason:
            raise ValueError("action and reason are required")
        bond = payload.get("bond")
        energy = payload.get("energy")
        bond = max(0, min(100, int(bond))) if bond is not None else None
        energy = max(0, min(100, int(energy))) if energy is not None else None
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO pet_interactions(ts,action,reason,bond,energy) VALUES (?,?,?,?,?)",
                (time.time(), action, reason, bond, energy),
            )

    def dashboard(self) -> Dict[str, Any]:
        cutoff = time.time() - 86400
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM model_probes WHERE ts>=? ORDER BY ts DESC", (cutoff,)
            ).fetchall()
            grouped: dict[str, list[sqlite3.Row]] = {}
            for row in rows:
                grouped.setdefault(row["base_url"], []).append(row)
            endpoints = []
            for url, samples in grouped.items():
                latest = samples[0]
                latencies = [
                    sample["latency_ms"] for sample in samples
                    if sample["latency_ms"] is not None
                ]
                successes = sum(int(sample["reachable"]) for sample in samples)
                endpoints.append(
                    {
                        "name": latest["name"], "family": latest["family"],
                        "source": latest["source"], "base_url": url,
                        "reachable": bool(latest["reachable"]),
                        "models": json.loads(latest["models_json"] or "[]"),
                        "latest_latency_ms": latest["latency_ms"],
                        "p50_latency_ms": _quantile(latencies, .5),
                        "p95_latency_ms": _quantile(latencies, .95),
                        "availability_percent": _percent(successes, len(samples)),
                        "samples": len(samples), "last_seen": latest["ts"],
                        "last_error": latest["error"],
                    }
                )
            endpoints.sort(
                key=lambda item: (not item["reachable"], item["p50_latency_ms"] or 1e12)
            )
            switches = [
                {**dict(row), "success": bool(row["success"])}
                for row in conn.execute(
                    "SELECT * FROM model_switches ORDER BY ts DESC LIMIT 12"
                ).fetchall()
            ]
            errors = [
                dict(row) for row in conn.execute(
                    "SELECT * FROM errors ORDER BY ts DESC LIMIT 12"
                ).fetchall()
            ]
            pet = conn.execute(
                "SELECT COUNT(*) n FROM pet_interactions WHERE ts>=?", (cutoff,)
            ).fetchone()
        healthy = sum(1 for item in endpoints if item["reachable"])
        return {
            "generated_at": time.time(), "window_hours": 24,
            "endpoints": endpoints,
            "summary": {
                "endpoints": len(endpoints), "healthy": healthy,
                "availability_percent": _percent(healthy, len(endpoints)),
                "p50_latency_ms": _quantile(
                    [item["latest_latency_ms"] for item in endpoints
                     if item["reachable"]], .5
                ),
                "switches": len(switches), "errors": len(errors),
                "pet_interactions": int(pet["n"] or 0),
            },
            "switches": switches, "errors": errors,
            "privacy": {
                "prompt_content_stored": False, "tool_arguments_stored": False,
                "secrets_redacted": True, "retention_days": 30,
            },
            "routing": {
                "mode": "manual", "enforced": False,
                "note": "Automatic fallback is not enabled; switches are explicit.",
            },
        }

    def operational_traces(self, limit: int = 100) -> list[Dict[str, Any]]:
        with self._connect() as conn:
            probes = conn.execute(
                "SELECT id,ts,name,base_url,reachable,latency_ms,error "
                "FROM model_probes ORDER BY ts DESC LIMIT ?", (limit,)
            ).fetchall()
            switches = conn.execute(
                "SELECT id,ts,model,base_url,success,latency_ms,error "
                "FROM model_switches ORDER BY ts DESC LIMIT ?", (limit,)
            ).fetchall()
            errors = conn.execute(
                "SELECT id,ts,area,message,model,base_url "
                "FROM errors ORDER BY ts DESC LIMIT ?", (limit,)
            ).fetchall()
        items = []
        for row in probes:
            items.append({
                "trace_id": f"probe:{row['id']}", "kind": "probe",
                "started_at": row["ts"], "ended_at": row["ts"],
                "duration_ms": row["latency_ms"],
                "status": "ok" if row["reachable"] else "error",
                "name": f"Probe {row['name']}", "model": None,
                "base_url": row["base_url"], "message": row["error"],
            })
        for row in switches:
            items.append({
                "trace_id": f"switch:{row['id']}", "kind": "switch",
                "started_at": row["ts"], "ended_at": row["ts"],
                "duration_ms": row["latency_ms"],
                "status": "ok" if row["success"] else "error",
                "name": "Model switch", "model": row["model"],
                "base_url": row["base_url"], "message": row["error"],
            })
        for row in errors:
            items.append({
                "trace_id": f"error:{row['id']}", "kind": "error",
                "started_at": row["ts"], "ended_at": row["ts"],
                "duration_ms": None, "status": "error", "name": row["area"],
                "model": row["model"], "base_url": row["base_url"],
                "message": row["message"],
            })
        return items


def _store() -> _ControlStore:
    return _ControlStore()


def _system_snapshot() -> Dict[str, Any]:
    try:
        import psutil
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(str(get_hermes_home()))
        boot = psutil.boot_time()
        return {
            "cpu_percent": psutil.cpu_percent(interval=.08),
            "cpu_count": psutil.cpu_count(), "memory_percent": memory.percent,
            "memory_used_gb": round(memory.used / 1024**3, 1),
            "memory_total_gb": round(memory.total / 1024**3, 1),
            "disk_percent": disk.percent,
            "disk_used_gb": round(disk.used / 1024**3, 1),
            "disk_total_gb": round(disk.total / 1024**3, 1),
            "uptime_seconds": max(0, int(time.time() - boot)),
        }
    except Exception as exc:
        return {"error": _safe_text(exc)}


def _gpu_snapshot() -> list[Dict[str, Any]]:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return []
    try:
        result = subprocess.run(
            [
                executable,
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            check=False, capture_output=True, text=True, timeout=2,
        )
        if result.returncode:
            return []
        rows = []
        for line in result.stdout.splitlines():
            fields = [field.strip() for field in line.split(",")]
            if len(fields) != 5:
                continue
            used, total = int(fields[2]), int(fields[3])
            rows.append({
                "name": fields[0], "utilization_percent": float(fields[1]),
                "memory_used_mb": used, "memory_total_mb": total,
                "memory_percent": _percent(used, total),
                "temperature_c": float(fields[4]),
            })
        return rows
    except (OSError, ValueError, subprocess.SubprocessError):
        return []


def _active_config() -> Dict[str, Any]:
    try:
        from hermes_cli.config import load_config_readonly
        config = load_config_readonly()
    except Exception:
        config = {}
    model = config.get("model", {}) if isinstance(config, dict) else {}
    model = model if isinstance(model, dict) else {}
    mcp = config.get("mcp_servers", {}) if isinstance(config, dict) else {}
    skills = get_hermes_home() / "skills"
    plugins = get_hermes_home() / "plugins"
    return {
        "provider": model.get("provider"),
        "model": model.get("default") or model.get("model"),
        "base_url": _safe_endpoint(model.get("base_url")),
        "context_length": model.get("context_length"),
        "mcp_count": len(mcp) if isinstance(mcp, (dict, list)) else 0,
        "skill_count": sum(1 for p in skills.iterdir() if p.is_dir())
            if skills.is_dir() else 0,
        "plugin_count": sum(1 for p in plugins.iterdir() if p.is_dir())
            if plugins.is_dir() else 0,
    }


def _overview(*, refresh: bool = False) -> Dict[str, Any]:
    global _CACHE, _CACHE_AT
    now = time.monotonic()
    with _LOCK:
        if not refresh and _CACHE is not None and now - _CACHE_AT < _CACHE_TTL:
            return _CACHE
        endpoints = detect_endpoints(timeout=.9)
        _store().record_probes(endpoints, force=refresh)
        report = doctor_report(endpoints)
        value = {
            "generated_at": time.time(), "ready": report["ready"],
            "platform": {
                "name": report["platform"], "wsl": report["wsl"],
                "python": report["python"],
            },
            "system": _system_snapshot(), "gpus": _gpu_snapshot(),
            "active": _active_config(), "commands": report["commands"],
            "endpoints": report["endpoints"],
        }
        _CACHE, _CACHE_AT = value, now
        return value


def _session_traces(limit: int) -> list[Dict[str, Any]]:
    try:
        from hermes_state import SessionDB
        db = SessionDB(read_only=True)
        try:
            rows = db.list_sessions_rich(
                limit=limit, order_by_last_active=True, compact_rows=True,
                include_children=True, include_archived=True,
            )
        finally:
            db.close()
    except Exception as exc:
        _store().record_error("session-traces", exc)
        return []
    traces = []
    for row in rows:
        started = row.get("started_at")
        ended = row.get("ended_at")
        last_active = row.get("last_active") or ended or started
        reason = str(row.get("end_reason") or "")
        status = "running" if not ended else (
            "error" if any(w in reason.lower() for w in ("error", "fail", "crash"))
            else "ok"
        )
        duration_ms = None
        if started is not None and last_active is not None:
            duration_ms = max(0, round((float(last_active) - float(started)) * 1000, 1))
        traces.append({
            "trace_id": row.get("id"), "kind": "session",
            "started_at": started, "ended_at": ended,
            "duration_ms": duration_ms, "status": status,
            "name": "Hermes session", "model": row.get("model"),
            "provider": row.get("billing_provider"),
            "message_count": row.get("message_count") or 0,
            "tool_call_count": row.get("tool_call_count") or 0,
            "input_tokens": row.get("input_tokens") or 0,
            "output_tokens": row.get("output_tokens") or 0,
            "estimated_cost_usd": row.get("estimated_cost_usd") or 0,
            "end_reason": reason or None,
        })
    return traces


def _trace_detail(trace_id: str) -> Dict[str, Any]:
    if ":" in trace_id:
        for item in _store().operational_traces(300):
            if item["trace_id"] == trace_id:
                return {**item, "steps": [item]}
        raise HTTPException(404, "Trace not found")
    try:
        from hermes_state import SessionDB
        db = SessionDB(read_only=True)
        try:
            session = db.get_session(trace_id)
            if not session:
                raise HTTPException(404, "Trace not found")
            messages = db.get_messages_as_conversation(trace_id)
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as exc:
        _store().record_error("trace-detail", exc)
        raise HTTPException(503, "Session trace is temporarily unavailable") from exc
    steps = []
    for index, message in enumerate(messages):
        role = _safe_text(message.get("role"), 24) or "unknown"
        timestamp = message.get("timestamp")
        calls = message.get("tool_calls") or []
        if isinstance(calls, list) and calls:
            for tool_index, call in enumerate(calls):
                fn = call.get("function", {}) if isinstance(call, dict) else {}
                name = fn.get("name") if isinstance(fn, dict) else None
                steps.append({
                    "span_id": f"{index}:{tool_index}", "kind": "tool",
                    "name": _safe_text(name, 100) or "tool call", "status": "ok",
                    "timestamp": timestamp, "arguments_stored": False,
                })
        else:
            steps.append({
                "span_id": str(index), "kind": role,
                "name": {
                    "user": "User turn", "assistant": "Model response",
                    "tool": "Tool result",
                }.get(role, role),
                "status": "ok", "timestamp": timestamp, "content_stored": False,
            })
    return {
        "trace_id": trace_id, "kind": "session",
        "started_at": session.get("started_at"), "ended_at": session.get("ended_at"),
        "status": "running" if not session.get("ended_at") else "ok",
        "model": session.get("model"), "provider": session.get("billing_provider"),
        "message_count": session.get("message_count") or len(messages),
        "tool_call_count": session.get("tool_call_count")
            or sum(1 for step in steps if step["kind"] == "tool"),
        "input_tokens": session.get("input_tokens") or 0,
        "output_tokens": session.get("output_tokens") or 0,
        "estimated_cost_usd": session.get("estimated_cost_usd") or 0,
        "steps": steps,
        "privacy": {"content_stored": False, "tool_arguments_stored": False},
    }


@router.get("/overview")
def overview(refresh: bool = False):
    return _overview(refresh=refresh)


@router.get("/control-tower")
def control_tower():
    value = _store().dashboard()
    value["active"] = _active_config()
    return value


@router.get("/traces")
def traces(
    limit: int = Query(80, ge=1, le=200),
    kind: str | None = Query(None, pattern="^(session|probe|switch|error)$"),
    status: str | None = Query(None, pattern="^(ok|error|running)$"),
):
    items = _session_traces(limit) + _store().operational_traces(limit)
    if kind:
        items = [item for item in items if item.get("kind") == kind]
    if status:
        items = [item for item in items if item.get("status") == status]
    items.sort(key=lambda item: float(item.get("started_at") or 0), reverse=True)
    items = items[:limit]
    return {
        "traces": items, "count": len(items),
        "privacy": {
            "prompt_content_included": False, "tool_arguments_included": False,
        },
    }


@router.get("/traces/{trace_id}")
def trace_detail(trace_id: str):
    return _trace_detail(trace_id)


@router.post("/pet-interactions")
def pet_interaction(payload: Dict[str, Any]):
    try:
        _store().record_pet(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@router.post("/activate")
def activate(payload: Dict[str, Any]):
    """Activate only a model that a fresh local probe actually reported."""
    requested_url = payload.get("base_url")
    requested_model = payload.get("model")
    previous = _active_config().get("model")
    started = time.perf_counter()
    try:
        context = int(payload.get("context_length", DEFAULT_CONTEXT))
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, "context_length must be an integer") from exc
    if not isinstance(requested_url, str) or not isinstance(requested_model, str):
        raise HTTPException(400, "base_url and model are required")
    requested_url = normalise_base_url(requested_url)
    matches = [
        result for result in detect_endpoints(timeout=1.2)
        if result.reachable
        and normalise_base_url(result.base_url) == requested_url
        and requested_model in result.models
    ]
    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    if not matches:
        message = "The endpoint/model is no longer present in local discovery"
        _store().record_switch(
            previous_model=previous, model=requested_model,
            base_url=requested_url, success=False, latency_ms=latency_ms,
            error=message,
        )
        raise HTTPException(409, message)
    try:
        path = write_model_config(matches[0], requested_model, context)
    except ValueError as exc:
        _store().record_switch(
            previous_model=previous, model=requested_model,
            base_url=requested_url, success=False, latency_ms=latency_ms,
            error=exc,
        )
        raise HTTPException(400, str(exc)) from exc
    _store().record_switch(
        previous_model=previous, model=requested_model,
        base_url=requested_url, success=True, latency_ms=latency_ms,
    )
    global _CACHE_AT
    _CACHE_AT = 0.0
    return {
        "ok": True, "model": requested_model,
        "base_url": _safe_endpoint(requested_url), "config_path": str(path),
        "latency_ms": latency_ms,
    }
