/**
 * Example: Agent with image input
 *
 * Demonstrates how to send image data to an agent for analysis.
 * The agent can describe the content of an image using vision-capable models.
 */

import { Agent } from '../../src';
import { gpt4oMiniModelConfig } from './modelConfig';

async function runAgent(instruction: string, image: string): Promise<string> {
    const agent = new Agent({
        name: 'posy',
        profile: 'You are a helpful assistant.',
        tools: [],
        modelConfig: gpt4oMiniModelConfig,
    });

    return await agent.run(instruction, image);
}

async function main() {
    const instruction = '请描述图片内容';
    const imagePath = 'examples/agent/example4chatimage.png';

    try {
        const result = await runAgent(instruction, imagePath);
        console.log('Result:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { runAgent };

// 脚本执行方式：npx tsx examples/agent/agentChatImage.ts
