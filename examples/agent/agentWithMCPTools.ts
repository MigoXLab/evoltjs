/**
 * Agent with MCP Tools - Agent demonstration with MCP tools
 *
 * Converts Python's agent_with_mcp_tools.py to TypeScript
 */

import * as dotenv from 'dotenv';

import { Agent } from '../../src/agent';
import { ModelConfig, ModelResponse } from '../../src/types';
import { logger } from '../../src/utils';

const deepseekModelConfig: ModelConfig = {
    provider: 'openai',
    model: 'deepseek-chat',
    apiKey: process.env.BOYUE_API_KEY || '',
    baseUrl: process.env.BOYUE_API_URL || '',
    contextWindowTokens: 128000,
};

dotenv.config();

/**
 * Run agent with MCP tools
 */
async function runAgent(userInput: string): Promise<ModelResponse[]> {
    // playwright_server = {
    //   "command": "npx",
    //   "url": "http://localhost:8931/sse",
    //   "args": ["-y", "@playwright/mcp@latest"],
    // }
    // TODO: 因为是全网页内容塞到上下文中，Token消耗较大，37.5k tokens左右，需要优化

    const agent = new Agent({
        name: 'posy',
        profile: '你是一个可以操作浏览器的助手.',
        mcpServerNames: ['playwright'],
        modelConfig: deepseekModelConfig,
        verbose: 2,
        useFunctionCalling: true,
    });

    return await agent.run(userInput);
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const userInput = '打开浏览器，打开百度网页，搜索上海今天天气';
    logger.info(`User input: ${userInput}`);

    try {
        const result = await runAgent(userInput);
        logger.info(`Agent response: ${result}`);
    } catch (error) {
        logger.error('Error running agent:', error);
    }
}

// Run the demo if this file is executed directly
if (require.main === module) {
    main().catch(logger.error);
}

export { runAgent };
// 脚本执行方式：npx tsx examples/agent/agentWithMCPTools.ts
