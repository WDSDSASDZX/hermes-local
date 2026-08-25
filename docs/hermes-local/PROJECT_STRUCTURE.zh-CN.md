# Hermes Local 目录说明

本仓库同时包含 Python 智能体核心、命令行、TUI、WebUI、Electron 桌面端、消息网关、文档和测试。顶层的一部分文件看起来分散，但它们是安装入口或公开兼容模块，不能只为视觉整齐而移动。

## 主要源码

- `agent/`：模型调用、会话循环、传输层、验证和桌宠后端。
- `tools/`：智能体工具及工具注册、权限和安全辅助代码。
- `providers/`：供应商抽象。
- `hermes_cli/`：命令行、Web 后端、模型配置和控制塔。
- `hermes_local/`：`hermes-local` 启动器。
- `gateway/`：Telegram、Discord、Slack 等消息平台网关。
- `tui_gateway/`：TUI 与桌面端共用的会话网关。
- `cron/`：定时任务。
- `acp_adapter/`：ACP 适配器。

## 界面

- `apps/desktop/`：Electron GUI。
- `ui-tui/`：终端界面。
- `web/`：WebUI 源码。
- `website/`：项目文档网站。
- `apps/shared/`：桌面端等界面共享代码。

## 工程与资料

- `tests/`、`tests-js/`：Python 与 JavaScript/TypeScript 测试。
- `evals/`：评测代码和研究数据；MCP 研究结果放在 `evals/mcp-research-data/`。
- `scripts/`：安装、构建、发布、诊断和维护脚本。
- `docs/`：设计、使用和项目说明。
- `docker/`、`nix/`、`native/`：部署与原生组件。
- `skills/`、`optional-skills/`、`plugins/`、`optional-mcps/`：扩展能力。

## 必须保留在仓库根目录的文件

- `run_agent.py`、`cli.py`、`hermes_state*.py` 等由 `pyproject.toml` 的 `py-modules` 打包，移动会破坏安装和旧导入。
- `hermes`、`start`、`setup-hermes.sh` 是兼容启动入口。
- `cli-config.yaml.example`、`constraints-termux.txt` 被安装器和测试按固定根路径读取。
- `README*`、`CONTRIBUTING*`、`SECURITY*` 是项目托管平台约定的根级文档。

## 本机生成内容

- `.local-artifacts/profile-backups/`：手工导出的本地配置/会话备份。
- `.local-artifacts/diagnostics/`：诊断截图等临时资料。
- `.venv/`、`node_modules/`、`__pycache__/`、`.pytest_cache/`、`test_durations.json`：依赖或可再生缓存；它们已被忽略，不应提交，也不要为了整理而移动。

整理原则：先确认引用，再移动；源码按职责演进，启动入口保持兼容，本地备份与源码隔离。
