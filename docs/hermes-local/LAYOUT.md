# Hermes Local layout

This checkout keeps the upstream Hermes source tree intact and places local
additions at extension boundaries:

| Path | Purpose | Keep? |
| --- | --- | --- |
| `agent/`, `gateway/`, `tools/`, `skills/`, `hermes_cli/` | Upstream agent runtime and CLI | Yes |
| `hermes_local/` | Local endpoint discovery and fast Dashboard launcher | Yes |
| `plugins/local-control/` | Hermes Garden, telemetry, model switcher, and pet | Yes |
| `config-presets/` | Secret-free local/cloud provider examples | Yes |
| `scripts/generate_pet_reactions.py` | Rebuild the vendored pet reaction catalog | Yes |
| `tests/hermes_local/` | Tests for local additions | Yes |
| `docs/hermes-local/` | Local derivative documentation | Yes |
| `hermes_cli/web_dist/` | Prebuilt Dashboard used by the fast launcher | Keep as a runtime cache |
| `node_modules/`, `web/node_modules/`, `ui-tui/node_modules/` | Frontend development dependencies | No; recreate only for `--rebuild-ui` |
| `__pycache__/`, `.web_ui_build.lock`, `log.txt` | Generated runtime/build residue | No |

## Commands

```bash
# Fast path: prepared venv + prebuilt Dashboard
~/hermes-local/start

# Force dependency check and frontend rebuild after editing web/
~/hermes-local/start --rebuild-ui

# Diagnostics and local model setup
~/hermes-local/start doctor
~/hermes-local/start configure
```

The fast path still validates that `hermes_cli/web_dist/index.html` exists.
If the prebuilt UI is missing, upstream Hermes performs one recovery build.
