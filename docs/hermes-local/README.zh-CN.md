# Hermes Local：本地优先复刻版

本项目直接以 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的 MIT 源码为核心，不重写 Agent 运行时。官方已有的工具调用、MCP、ACP、技能、长期记忆、子智能体、定时任务、消息网关、Web Dashboard 与 Electron Desktop 均保留。

派生版新增两层：

1. `hermes-local`：自动发现本地推理服务，安全写入 Hermes 原生配置并启动 WebUI。
2. `模型控制塔 + 运行追踪中心`：Dashboard 内集中展示模型健康、P50/P95 延迟、可用率、切换历史、Agent 会话与工具步骤。

## 新增能力

- 自动探测 Ollama、LM Studio、vLLM、llama.cpp、LocalAI、SGLang。
- WSL2 同时探测 Linux 回环地址与 Windows 主机网关/Nameserver 地址。
- 使用 Ollama 原生 `/api/tags` 或 OpenAI 兼容 `/v1/models` 自动列出模型。
- 并发探测、JSON 输出、依赖和端点诊断。
- 原子更新现有 `~/.hermes/config.yaml`，不另造配置系统。
- 一条命令配置本地模型并启动官方 WebUI；默认只绑定 `127.0.0.1`。
- 模型控制塔每 15 秒刷新轻量状态；手动探测会记录每个端点的实际延迟。
- 内置可拖拽桌宠“赫米”：147 个本地动画与 147 条独立梗对白；状态保存在浏览器，互动历史通过 Python 接口保存到 SQLite。
- 模型切换接口只接受刚刚由本机探测到的端点和模型，避免把 Dashboard 变成任意 URL 写入器。

## 安装

需要 Python 3.11–3.13。推荐使用 `uv`，并把虚拟环境放在源码目录之外：

```bash
cd ~/hermes-local
uv venv ~/.hermes/venvs/hermes-local --python 3.11
source ~/.hermes/venvs/hermes-local/bin/activate
uv pip install -e ".[web]"
```

Dashboard 首次启动需要 Node.js/npm 构建前端。官方启动逻辑会在缺少构建产物时自动构建。

## 使用

```bash
# 已准备好的工作区：从任意目录一行启动，不需要 source 或 cd
~/hermes-local/start

# 不自动打开浏览器
~/hermes-local/start --no-open

# 修改过 web/ 源码时才需要显式重建前端
~/hermes-local/start --rebuild-ui

# 查看检测结果
~/hermes-local/start detect

# 完整诊断，也可加 --json
~/hermes-local/start doctor

# 首次切换到本地模型
~/hermes-local/start configure

# 指定服务和模型
~/hermes-local/start configure \
  --endpoint http://127.0.0.1:11434 \
  --model qwen3:30b \
  --context-length 65536

# 激活虚拟环境后也可以直接运行；无参数即启动 Dashboard
hermes-local
```

访问 <http://127.0.0.1:9119>，导航栏里的 `模型控制塔` 即新增工作台。

桌宠素材来自 MIT 许可的 `abderrahimghazali/clawd-pet` 固定快照。动画、动作目录和许可证全部随项目本地提供，不会请求外部 CDN。单击桌宠可互动，拖拽可移动；默契度与电量保存在浏览器，互动动作同时写入本地控制塔数据库。运行 `python scripts/generate_pet_reactions.py` 可从已固定的 SVG 重新生成并检查动作对白目录。

如需局域网访问，可传 `--host 0.0.0.0`。Hermes 会强制启用 Dashboard 认证门禁，请按官方文档配置用户名/密码或 OAuth，切勿裸露到公网。

## 控制塔与追踪数据

- 控制塔数据库：`~/.hermes/plugin-data/local-control/control-tower.db`。
- 保存最近 30 天的模型探测、延迟、模型切换、脱敏错误和桌宠互动元数据，使用 SQLite WAL。
- Agent 会话追踪直接只读 Hermes 原生 `~/.hermes/state.db`，不复制会话正文。
- 追踪接口默认不返回提示词、回复正文、工具参数或工具结果，只显示角色、工具名、Tokens、成本和状态。
- 模型切换会先重新探测目标端点；当前是人工切换模式，自动故障转移尚未启用。

## Ollama 注意事项

Hermes 的工具工作流要求至少 64K 上下文。只在 `config.yaml` 声明 64K 不会改变 Ollama 实际加载窗口，启动 Ollama 时也要设置：

```bash
OLLAMA_CONTEXT_LENGTH=65536 ollama serve
```

用 `ollama ps` 检查 `CONTEXT` 列。模型还必须支持工具调用；小参数量或纯文本模型即使能聊天，也可能无法可靠完成多步 Agent 任务。

## 平台

- macOS：本机 Ollama、LM Studio、llama.cpp。
- Linux：本机或同机模型服务；生产部署可继续用官方 Docker/systemd 文档。
- Windows：推荐 WSL2 运行 Hermes；启动器会额外探测 Windows 主机地址。Windows 侧模型服务必须允许 WSL 网卡访问，必要时绑定 `0.0.0.0` 并添加防火墙规则。

## 测试

```bash
python -m unittest discover -s tests/hermes_local -v
python -m compileall hermes_local plugins/local-control/dashboard/plugin_api.py
```

## 上游与许可

核心源码版权与 MIT 许可见 [LICENSE](../../LICENSE)。派生说明与参考项目见 [THIRD_PARTY.md](../../THIRD_PARTY.md)。同步上游时应保留 Nous Research 的版权、贡献者历史与许可证。
