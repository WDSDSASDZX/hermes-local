"""WSL regression tests for the packaged Hermes Desktop launcher."""

from __future__ import annotations

import argparse
import subprocess
from unittest.mock import patch

import pytest

from hermes_cli import main as cli_main


def test_wsl_packaged_launch_uses_userns_without_sudo(tmp_path, monkeypatch):
    root = tmp_path / "hermes-agent"
    desktop_dir = root / "apps" / "desktop"
    desktop_dir.mkdir(parents=True)
    (desktop_dir / "package.json").write_text("{}", encoding="utf-8")
    packaged = desktop_dir / "release" / "linux-unpacked" / "Hermes"
    packaged.parent.mkdir(parents=True)
    packaged.write_text("", encoding="utf-8")
    monkeypatch.setattr(cli_main, "PROJECT_ROOT", root)

    args = argparse.Namespace(
        build_only=False,
        cwd=None,
        fake_boot=False,
        force_build=False,
        hermes_root=None,
        ignore_existing=False,
        skip_build=True,
        source=False,
    )
    launch_ok = subprocess.CompletedProcess([str(packaged), "--disable-setuid-sandbox"], 0)

    with (
        patch("hermes_cli.main._desktop_packaged_executable", return_value=packaged),
        patch("hermes_cli.main._desktop_launch_options", return_value=([], "auto", "auto")),
        patch("hermes_cli.main._desktop_linux_wsl_uses_userns_sandbox", return_value=True),
        patch("hermes_cli.main._desktop_linux_sandbox_fixup") as sandbox_fixup,
        patch("hermes_cli.main._register_linux_desktop_entry"),
        patch("hermes_cli.main.subprocess.run", return_value=launch_ok) as run,
        pytest.raises(SystemExit) as exc,
    ):
        cli_main.cmd_gui(args)

    assert exc.value.code == 0
    sandbox_fixup.assert_not_called()
    assert run.call_args.args[0] == [str(packaged), "--disable-setuid-sandbox"]
