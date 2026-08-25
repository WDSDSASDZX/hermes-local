"""Tests for the top-level `./hermes` launcher script."""

import builtins
import os
import runpy
import sys
import types
from pathlib import Path

import pytest


def test_launcher_delegates_to_argparse_entrypoint(monkeypatch):
    """`./hermes` should use `hermes_cli.main`, not the legacy Fire wrapper."""
    launcher_path = Path(__file__).resolve().parents[2] / "hermes"
    called = []

    fake_main_module = types.ModuleType("hermes_cli.main")

    def fake_main():
        called.append("hermes_cli.main")

    fake_main_module.main = fake_main
    monkeypatch.setitem(sys.modules, "hermes_cli.main", fake_main_module)

    fake_cli_module = types.ModuleType("cli")

    def legacy_cli_main(*args, **kwargs):
        raise AssertionError("launcher should not import cli.main")

    fake_cli_module.main = legacy_cli_main
    monkeypatch.setitem(sys.modules, "cli", fake_cli_module)

    fake_fire_module = types.ModuleType("fire")

    def legacy_fire(*args, **kwargs):
        raise AssertionError("launcher should not invoke fire.Fire")

    fake_fire_module.Fire = legacy_fire
    monkeypatch.setitem(sys.modules, "fire", fake_fire_module)

    monkeypatch.setattr(sys, "argv", [str(launcher_path), "gateway", "status"])

    runpy.run_path(str(launcher_path), run_name="__main__")

    assert called == ["hermes_cli.main"]


def test_launcher_restarts_with_managed_venv_when_dependencies_are_missing(
    monkeypatch, tmp_path
):
    """A source checkout should recover when invoked through system Python."""
    launcher_path = Path(__file__).resolve().parents[2] / "hermes"
    managed_python = tmp_path / "managed" / "bin" / "python"
    managed_python.parent.mkdir(parents=True)
    managed_python.symlink_to(sys.executable)

    original_import = builtins.__import__

    def fail_main_import(name, *args, **kwargs):
        if name == "hermes_cli.main":
            error = ModuleNotFoundError("No module named 'dotenv'")
            error.name = "dotenv"
            raise error
        return original_import(name, *args, **kwargs)

    exec_call = {}

    def fake_execv(executable, argv):
        exec_call["executable"] = executable
        exec_call["argv"] = argv
        raise SystemExit(97)

    monkeypatch.setenv("HERMES_LOCAL_VENV", str(managed_python.parent.parent))
    monkeypatch.setattr(builtins, "__import__", fail_main_import)
    monkeypatch.setattr(os, "execv", fake_execv)
    monkeypatch.setattr(sys, "argv", [str(launcher_path), "--help"])

    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(str(launcher_path), run_name="__main__")

    assert exc_info.value.code == 97
    assert exec_call == {
        "executable": str(managed_python),
        "argv": [str(managed_python), str(launcher_path), "--help"],
    }
