from __future__ import annotations

import json
import threading
import unittest
from argparse import Namespace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from hermes_local.launcher import (
    EndpointCandidate,
    build_candidates,
    detect_endpoints,
    main,
    model_ids,
    normalise_base_url,
    probe_endpoint,
    _run_dashboard,
)


class _ModelHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/tags":
            payload = {"models": [{"name": "qwen3:8b"}, {"name": "devstral:24b"}]}
        elif self.path == "/v1/models":
            payload = {"data": [{"id": "local-model"}]}
        else:
            self.send_error(404)
            return
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


class LauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _ModelHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_normalise_rejects_non_http(self):
        with self.assertRaises(ValueError):
            normalise_base_url("file:///tmp/models")

    def test_model_ids_understands_openai_and_ollama(self):
        self.assertEqual(model_ids({"data": [{"id": "a"}, {"id": "a"}]}), ("a",))
        self.assertEqual(model_ids({"models": [{"name": "b"}]}), ("b",))

    def test_ollama_native_probe_returns_openai_base(self):
        port = self.server.server_address[1]
        result = probe_endpoint(
            EndpointCandidate("Ollama", f"http://127.0.0.1:{port}", "ollama")
        )
        self.assertTrue(result.reachable)
        self.assertEqual(result.base_url, f"http://127.0.0.1:{port}/v1")
        self.assertEqual(result.models, ("qwen3:8b", "devstral:24b"))
        self.assertIsInstance(result.latency_ms, float)
        self.assertGreaterEqual(result.latency_ms, 0)
        self.assertEqual(result.to_dict()["latency_ms"], result.latency_ms)

    def test_openai_probe(self):
        port = self.server.server_address[1]
        result = probe_endpoint(
            EndpointCandidate("Test", f"http://127.0.0.1:{port}", "openai")
        )
        self.assertTrue(result.reachable)
        self.assertEqual(result.models, ("local-model",))
        self.assertIsNotNone(result.latency_ms)

    def test_concurrent_detection_preserves_order(self):
        port = self.server.server_address[1]
        candidates = [
            EndpointCandidate("OpenAI", f"http://127.0.0.1:{port}", "openai"),
            EndpointCandidate("Ollama", f"http://127.0.0.1:{port}", "ollama"),
        ]
        results = detect_endpoints(candidates, timeout=1)
        self.assertEqual([item.name for item in results], ["OpenAI", "Ollama"])
        self.assertTrue(all(item.reachable for item in results))

    @mock.patch("hermes_local.launcher.configured_endpoint", return_value="http://127.0.0.1:11434/v1")
    @mock.patch("hermes_local.launcher.wsl_host_ips", return_value=[])
    def test_candidates_deduplicate_configured_ollama(self, _hosts, _configured):
        candidates = build_candidates()
        ollama = [item for item in candidates if item.family == "ollama"]
        self.assertEqual(len(ollama), 1)
        self.assertEqual(ollama[0].source, "config")


    @mock.patch("hermes_local.launcher._run_dashboard", return_value=0)
    def test_no_arguments_launches_dashboard_without_changing_model(self, launch):
        self.assertEqual(main([]), 0)
        args = launch.call_args.args[0]
        self.assertEqual(args.command, "dashboard")
        self.assertTrue(args.keep_model)

    @mock.patch("hermes_local.launcher.subprocess.call", return_value=0)
    @mock.patch("hermes_local.launcher.command_locations")
    def test_dashboard_uses_prebuilt_ui_and_node_path(self, locations, call):
        locations.return_value = {
            "hermes": "/venv/bin/hermes",
            "node": "/nvm/bin/node",
            "npm": "/nvm/bin/npm",
        }
        args = Namespace(
            keep_model=True,
            host="127.0.0.1",
            port=9119,
            no_open=True,
            rebuild_ui=False,
        )
        self.assertEqual(_run_dashboard(args), 0)
        command = call.call_args.args[0]
        self.assertIn("--skip-build", command)
        self.assertIn("--no-open", command)
        self.assertTrue(call.call_args.kwargs["env"]["PATH"].startswith("/nvm/bin"))


if __name__ == "__main__":
    unittest.main()
