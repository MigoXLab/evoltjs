/**
 * Agent Demo - Simple agent demonstration
 *
 * Converts Python's agent_demo.py to TypeScript
 */

import { Agent } from '../../src/agent';
import { deepseekModelConfig } from './modelConfig';
import { logger } from '../../src/utils';

/**
 * Run agent with user input
 */
async function runAgent(userInput: string): Promise<string> {
    const agent = new Agent({
        name: 'posy',
        profile: 'You are a helpful assistant.',
        tools: ['ThinkTool.execute', 'Reply2HumanTool.reply'],
        modelConfig: deepseekModelConfig,
        verbose: 1, // Enable verbose mode to see debug logs
    });

    return await agent.run(userInput);
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const userInput = '请介绍你自己';
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

// 脚本执行方式：npx tsx examples/agent/agentDemo.ts
