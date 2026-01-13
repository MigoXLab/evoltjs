/**
 * Example: Sub-agents for parallel calculations
 *
 * Demonstrates coordinating multiple sub-agents to perform calculations in parallel,
 * then aggregating their results. This showcases:
 * - Creating multiple specialized sub-agents
 * - Delegating tasks to different sub-agents
 * - Aggregating results from multiple sub-agents
 */

import { Agent } from '../../../src';
import { deepseekModelConfig } from '../modelConfig';

async function main() {
    // Sub-agent 1: Calculator for first operation
    const subAgent1 = new Agent({
        name: 'sub_agent1',
        profile: '对给定的两个数进行求和',
        tools: [],
        modelConfig: deepseekModelConfig,
        verbose: true,
    });

    // Sub-agent 2: Calculator for second operation
    const subAgent2 = new Agent({
        name: 'sub_agent2',
        profile: '对给定的两个数进行求和',
        tools: [],
        modelConfig: deepseekModelConfig,
        verbose: true,
    });

    // Leader agent: Coordinates sub-agents and aggregates results
    const leaderAgent = new Agent({
        name: 'leader_agent',
        profile: '主Agent，汇总子Agent的输出，并求和',
        tools: [],
        subAgents: [subAgent1, subAgent2],
        modelConfig: deepseekModelConfig,
        verbose: true,
    });

    const instruction = '让sub_agent1计算1+1.1，让sub_agent2计算2+2.2，然后汇总sub_agent1和sub_agent2的输出，并求和';

    try {
        const result = await leaderAgent.run(instruction);
        console.log('Final result:', result);

        // Validate that the result contains the expected sum
        if (!result.includes('6.3')) {
            throw new Error(`Expected result to contain "6.3", but got: ${result}`);
        }

        console.log('✓ Test passed! Result contains expected sum.');
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { main };
