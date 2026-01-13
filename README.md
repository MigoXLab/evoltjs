# Evoltjs

Evolt is an AI Agent framework with autonomous evolution capability.

## Installation  

### Local Development  

For local development, you can use `npm link` to test the package, especially after making code changes and wanting to test the modified effects locally:  

```bash  
# In the project root directory  
npm run build  
npm link  

# In the project where you want to use evoltagent  
npm link evoltagent  
```  

### Install from npm (After Release)  

```bash  
npm install evoltagent  
```  

## Usage  

### Basic Example  

> ⚠️ **Note**: The configuration file `config.yaml` uses camelCase naming (e.g., `apiKey`, `baseUrl`), which differs from the snake_case used in the Python version. For details, refer to [LLM_CONFIG.md](doc/config/LLM_CONFIG.md).  

```typescript  
import { Agent, ModelResponse, ModelConfig } from "evoltagent";  

// Configure the model using ModelConfig  
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

### Using MCP Tools  

First, you need to set up the configuration file. For the configuration method of the MCP Server, refer to [LLM_CONFIG.md](doc/config/LLM_CONFIG.md) for details. If you have configured model parameters, you can use the model name from the configuration file to replace the `ModelConfig` above.  

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

## Development  

### Build the Project  

```bash  
npm run build  
```  

### Run Examples  

> ⚠️ **Note**: Files in `examples/agent/` require `BOYUE_API_KEY` and `BOYUE_API_URL` to be set in the `.env` file. 
> 
> ⚠️ **Note**: To use another provider, simply adjust the configuration in `examples/agent/modelConfig.ts`.

```bash  
# Basic examples  
npx tsx examples/agent/agentDemoWithModelConfig.ts  
npx tsx examples/agent/agentDemo.ts  

# MCP tools example  
npx tsx examples/agent/agentWithMCPTools.ts  
```  

## Exported Modules  

### Core Modules  
- `Agent` - Main Agent class  
- `Model` - Model class  
- `Message`, `MessageHistory` - Message and message history management  

### Tools  
- `SystemToolStore`, `FunctionCallingStore` - Tool storage  
- `ThinkTool` - Thinking tool  
- `CommandLineTool` - Command line tool  
- `FileEditor` - File editor  
- `Reply2HumanTool` - Reply-to-human tool  
- `TodoListTool` - Todo list tool  
- `GitTool` - Git tool  

### Tool Registration  
- `tools` - Register tools  
- `registerAgentAsTool` - Register Agent as a tool  

### Environments  
- `BaseEnvironment` - Base environment  
- `CodingEnvironment` - Coding environment  

### Configuration  
- `loadModelConfig` - Load model configuration  
- Other configuration constants and paths  


# 🙏 Acknowledgments  

Sincere thanks to the open-source project [claude-quickstarts](https://github.com/anthropics/claude-quickstarts), which provided significant assistance during the development of this project.

