# Evoltjs

[English](../README.md) | [中文](README_ZH.md)

当前的AI编码工具解决的是一次性的代码生成问题。然而软件真正的成本在于长期演化：需求变更、架构漂移和无穷无尽的维护工作——这让顶尖工程师沦为了系统的永久“看护员”。  

**EVOLT 正是为了终结这一切而生。**  

EVOLT 是一个让Agent具备自我进化能力的框架，让AI智能体能够**覆盖软件开发全生命周期**——从最初构建，到长期维护，再到持续演进。  

我们不是在打造另一个代码助手。  
我们是在解决**长期软件工程**的核心难题。  

## 🏗️ 核心架构（愿景）

EVOLT 的设计围绕一个自我进化的改进引擎展开，它包含三个层次：

- 🛠️ 工具使用的智能体 - 智能体能够像工程师一样，在真实代码库中执行读、写、测试、重构等操作。
- 💾 持久化经验 - 所有成功的操作与模式被编码为可重用、可组合的知识资产。（规划中）
- 🧠 自我进化 - 智能体的策略与工作流能够通过经验不断自我优化。（规划中）

## ✅ 当前状态

EVOLT 已稳定实现并开源其核心基础：工具使用的智能体。 这意味着你现在就可以构建能够理解、操作真实代码库的AI智能体。

我们正在积极设计与开发 自我进化 与 持久化经验。我们的开发路线完全公开，欢迎查看并参与讨论。

## 🚀 为什么从工具层开始？

我们相信，强大的、可编程的工具使用能力是长期自主演化的基石。在智能体学会“思考如何变得更好”之前，它必须能像人类开发者一样，在真实环境中稳定、可靠地“动手操作”。


## 安装

### 本地开发

对于本地开发，您可以使用 `npm link` 来测试包，特别是在进行代码更改后想要在本地测试修改效果时：

```bash
# 在项目根目录
npm run build
npm link

# 在您想要使用 evoltagent 的项目中
npm link evoltagent
```

### 从 npm 安装（发布后）

```bash
npm install evoltagent
```

## 使用方法

### 基础示例

> ⚠️ **注意**：配置文件 `config.yaml` 使用驼峰命名（例如 `apiKey`、`baseUrl`），这与 Python 版本中使用的下划线命名不同。详细信息请参阅 [LLM_CONFIG.md](config/LLM_CONFIG.md)。

```typescript
import { Agent, ModelResponse, ModelConfig } from "evoltagent";

// 使用 ModelConfig 配置模型
const modelConfig: ModelConfig = {
  provider: "deepseek",
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  contextWindowTokens: 128000,
  maxOutputTokens: 8092,
  temperature: 0.2,
  topP: 0.9,
  stream: true,
};

async function main() {
  const agent = new Agent({
    name: "posy",
    profile: "You are a helpful assistant.",
    tools: ["ThinkTool.execute", "Reply2HumanTool.reply"],
    modelConfig: modelConfig,
  });

  const result = await agent.run("Please introduce yourself");
  console.log("Agent response:", result);
}

main().catch(console.error);
```

### 使用 MCP 工具

首先，您需要设置配置文件。关于 MCP Server 的配置方法，请参阅 [LLM_CONFIG.md](config/LLM_CONFIG.md) 了解详细信息。如果您已配置模型参数，可以使用配置文件中的模型名称来替换上面的 `ModelConfig`。

```typescript
import { Agent, ModelResponse } from "evoltagent";

async function runAgent(userInput: string): Promise<ModelResponse[]> {
  const agent = new Agent({
    name: "posy",
    profile: "You are an assistant capable of operating a browser.",
    mcpServerNames: ["playwright"],
    modelConfig: "deepseek",
    verbose: 2,
  });

  return await agent.run(userInput);
}
```

## 开发

### 构建项目

```bash
npm run build
```

### 运行示例

> ⚠️ **注意**：`examples/agent/` 目录中的文件需要在 `.env` 文件中设置 `BOYUE_API_KEY` 和 `BOYUE_API_URL`。
> 
> ⚠️ **注意**：要使用其他提供商，只需调整 `examples/agent/modelConfig.ts` 中的配置。

```bash
# 基础示例
npx tsx examples/agent/agentDemoWithModelConfig.ts
npx tsx examples/agent/agentDemo.ts

# MCP 工具示例
npx tsx examples/agent/agentWithMCPTools.ts
```

## 导出的模块

### 核心模块
- `Agent` - 主 Agent 类
- `Model` - 模型类
- `Message`、`MessageHistory` - 消息和消息历史管理

### 工具
- `SystemToolStore`、`FunctionCallingStore` - 工具存储
- `ThinkTool` - 思考工具
- `CommandLineTool` - 命令行工具
- `FileEditor` - 文件编辑器
- `Reply2HumanTool` - 回复人类工具
- `TodoListTool` - 待办事项列表工具
- `GitTool` - Git 工具

### 工具注册
- `tools` - 注册工具
- `registerAgentAsTool` - 将 Agent 注册为工具

### 环境
- `BaseEnvironment` - 基础环境
- `CodingEnvironment` - 编程环境

### 配置
- `loadModelConfig` - 加载模型配置
- 其他配置常量和路径


# 🙏 致谢

衷心感谢开源项目 [claude-quickstarts](https://github.com/anthropics/claude-quickstarts)，在该项目的开发过程中提供了重要帮助。
