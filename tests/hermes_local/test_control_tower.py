from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from hermes_local.launcher import ProbeResult


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "plugins"
    / "local-control"
    / "dashboard"
    / "plugin_api.py"
)
SPEC = importlib.util.spec_from_file_location("local_control_plugin_api", MODULE_PATH)
assert SPEC and SPEC.loader
PLUGIN_API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLUGIN_API)


class ControlTowerStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = PLUGIN_API._ControlStore(Path(self.temp.name) / "tower.db")

    def tearDown(self):
        self.temp.cleanup()

    def test_probe_latency_and_availability_are_persisted(self):
        self.store.record_probes(
            [
                ProbeResult(
                    "Ollama",
                    "http://127.0.0.1:11434/v1?api_key=do-not-store",
                    "ollama",
                    "loopback",
                    True,
                    ("gemma3:4b",),
                    latency_ms=12.5,
                )
            ],
            force=True,
        )
        dashboard = self.store.dashboard()
        endpoint = dashboard["endpoints"][0]
        self.assertEqual(endpoint["base_url"], "http://127.0.0.1:11434/v1")
        self.assertEqual(endpoint["p50_latency_ms"], 12.5)
        self.assertEqual(endpoint["p95_latency_ms"], 12.5)
        self.assertEqual(endpoint["availability_percent"], 100.0)

    def test_errors_are_redacted(self):
        self.store.record_error(
            "probe",
            "Authorization: Bearer sk-secretvalue123 password=hunter2",
            base_url="http://user:pass@127.0.0.1:8000/v1?token=abc",
        )
        dashboard = self.store.dashboard()
        error = dashboard["errors"][0]
        self.assertNotIn("secretvalue", error["message"])
        self.assertNotIn("hunter2", error["message"])
        self.assertEqual(error["base_url"], "http://127.0.0.1:8000/v1")

    def test_switch_and_pet_interaction_are_counted(self):
        self.store.record_switch(
            previous_model="old",
            model="new",
            base_url="http://127.0.0.1:8000/v1",
            success=True,
            latency_ms=18.0,
        )
        self.store.record_pet(
            {"action": "coding", "reason": "work", "bond": 104, "energy": -3}
        )
        dashboard = self.store.dashboard()
        self.assertEqual(dashboard["switches"][0]["model"], "new")
        self.assertTrue(dashboard["switches"][0]["success"])
        self.assertEqual(dashboard["summary"]["pet_interactions"], 1)

    def test_operational_trace_does_not_include_secrets_or_payloads(self):
        self.store.record_probes(
            [
                {
                    "name": "vLLM",
                    "base_url": "http://127.0.0.1:8000/v1",
                    "family": "openai",
                    "source": "loopback",
                    "reachable": False,
                    "models": [],
                    "error": "api_key=supersecret",
                    "latency_ms": 55.0,
                }
            ],
            force=True,
        )
        trace = self.store.operational_traces(5)[0]
        self.assertEqual(trace["kind"], "probe")
        self.assertNotIn("supersecret", trace["message"])
        self.assertNotIn("prompt", trace)
        self.assertNotIn("tool_arguments", trace)


if __name__ == "__main__":
    unittest.main()
