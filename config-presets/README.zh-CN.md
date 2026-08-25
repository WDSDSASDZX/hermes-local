# 常见模型配置模板

Hermes 已内置常见云服务商，不需要为每家手写 URL。把所需密钥放进 `~/.hermes/.env`，然后运行 `hermes model` 或在 Dashboard 的 Models/Keys 页面选择即可。

| 服务商 | provider ID | 密钥变量 |
|---|---|---|
| OpenAI API | `openai` | `OPENAI_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` |
| Moonshot/Kimi | `kimi-coding` | `KIMI_API_KEY` |
| MiniMax | `minimax` | `MINIMAX_API_KEY` |
| Z.AI/GLM | `zai` | `ZAI_API_KEY` |

文件说明：

- `api-keys.env.example`：常见密钥变量清单。只复制你要用的行，真实密钥不得提交到 Git。
- `providers.local.yaml`：Ollama、LM Studio、vLLM、llama.cpp、LocalAI、SGLang 和公司自建网关模板。默认全部禁用，启用实际运行的一个即可。
- `fallback.example.yaml`：主模型、故障切换链和辅助模型的模板。模型 ID 故意保留占位符，避免上游模型改名后默默选错。

推荐操作：

```bash
# 1. 创建/编辑密钥文件（权限应为 600）
hermes config env-path

# 2. 让官方向导发现已配置服务商及其模型
hermes model

# 3. 配置降级链
hermes fallback

# 4. 检查配置与连接
hermes config check
hermes doctor
```

本地服务可直接运行 `hermes-local detect` 和 `hermes-local configure`，无需复制模板。WSL2 访问 Windows 上的模型服务时，请把模板中的 `127.0.0.1` 换成 `hermes-local detect --all` 报告的 `wsl-host` 地址；若使用 mirrored networking，`127.0.0.1` 通常即可。
