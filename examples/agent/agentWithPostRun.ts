/**
 * Example: Agent with post-processor
 *
 * Demonstrates using a post-processor to transform agent output.
 * The post-processor extracts JSON from the agent's response and parses it.
 */

import { Agent } from '../../src';
import { deepseekModelConfig } from './modelConfig';
/**
 * Post-processor that extracts and parses JSON from markdown code blocks
 */
async function parseJson(response: string): Promise<Record<string, any>> {
    const match = response.match(/```json\n(.*?)\n```/s);
    if (match && match[1]) {
        return JSON.parse(match[1]);
    }
    return {};
}

async function runAgent(userInput: string): Promise<Record<string, any>> {
    const agent = new Agent({
        name: 'posy',
        profile: 'You are a helpful assistant.',
        tools: [],
        modelConfig: deepseekModelConfig,
        postProcessor: parseJson,
    });

    return (await agent.run(userInput)) as Record<string, any>;
}

async function main() {
    const userInput = `
    请生成一个JSON对象，包含name和age两个字段，name为John，age为30; 输出格式如下:
    <TaskCompletion>
    我将结果返回给你:
    \`\`\`json
    {"name": "John", "age": 30}
    \`\`\`
    </TaskCompletion>
    `;

    try {
        const result = await runAgent(userInput);
        console.log(`返回结果是: ${JSON.stringify(result)}`);
        console.log(`返回结果类型是: ${typeof result}`);

        // Validate result
        if (JSON.stringify(result) !== JSON.stringify({ name: 'John', age: 30 })) {
            throw new Error('返回结果不正确');
        }

        console.log('✓ Test passed!');
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { runAgent, parseJson };

// 脚本执行方式：npx tsx examples/agent/agentWithPostRun.ts
