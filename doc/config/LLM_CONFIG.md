# LLM 配置文件

在 `~/.evolt/config.yaml` 中，LLM 配置文件用于指定大模型的相关参数，如模型名称、API 密钥、最大令牌数等。

> ⚠️ **注意**：配置文件 `config.yaml` 使用 camelCase 命名（如 `apiKey`, `baseUrl`），与 Python 版本的 snake_case 不同。

## 模型配置

```yaml
models:
    qwen3:
        model: "qwen3:32b"
        provider: "ollama"
        contextWindowTokens: 32768     # 最大输入token
        baseUrl: "http://localhost:11434"
        params:
            temperature: 0.0
            maxCompletionTokens: 8092
            stream: true
        pricing:
            inputCostPer1mTokenUsd: 0.005
            outputCostPer1mTokenUsd: 0.015

    gpt-4o-mini:
        model: "gpt-4o-mini"
        provider: "openai"
        contextWindowTokens: 128000     # 最大输入token
        apiKey: "YOUR_API_KEY"
        baseUrl: "http://35.220.164.252:3888/v1/"
        params:
            temperature: 0.0
            maxTokens: 8092                # 最大输出token
            stream: true
        pricing:
            inputCostPer1mTokenUsd: 0.005
            outputCostPer1mTokenUsd: 0.015

    deepseek:
        model: deepseek-chat
        provider: "deepseek"
        contextWindowTokens: 128000     # 最大输入token
        # 可选：API Key 与 Base URL（如使用私有网关）
        apiKey: "YOUR_API_KEY"
        baseUrl: "https://api.deepseek.com/v1"
        # 可选：模型参数，最终会合并到 Model.modelConfig
        params:
            temperature: 0.2
            maxCompletionTokens: 8092
            stream: true
        # 可选：价格表，单位为"每 1M tokens 的美元价格"
        pricing:
            inputCostPer1mTokenUsd: 0.28
            outputCostPer1mTokenUsd: 0.42
```

## 添加MCP Server

```yaml
mcpServers:
  playwright:
    command: "npx"
    args:
      - -y
      - "@playwright/mcp@latest"
```