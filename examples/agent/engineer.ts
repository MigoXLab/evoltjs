/**
 * Engineer - Coding orchestrator demonstration
 *
 * Converts Python's engineer.py to TypeScript
 */

import { Agent } from '../../src/core/agent';
import { deepseekModelConfig } from './modelConfig';
import { logger } from '../../src/utils';
import { CodingOrchestrator } from '../../src/runtime/orchestrator/coding';

const instructions = `
<instructions>
    1. 设计核心功能: 核心功能保存为 core_function.md 文件.
    2. 在生成对应的业务逻辑代码之前, 先思考一下业务逻辑代码的实现方式, 并实现对应的业务逻辑代码.
    3. 需要通过pnpm build构建项目, 以及通过 pnpm run dev 启动项目. 请确保项目能够正常运行.
</instructions>
`;

// Create agent
const agent = new Agent({
    name: 'posy',
    profile: '你是一个优秀的开发工程师. 擅长使用工具完成任务',
    system: instructions,
    tools: ['ThinkTool.execute', 'CommandLineTool.execute', 'FileEditor.write'],
    modelConfig: deepseekModelConfig,
});

// Create coding orchestrator (non-interactive mode for goal execution)
const orchestrator = new CodingOrchestrator({
    agents: [agent],
    alwaysWaitHumanInput: false,
});

/**
 * Run the orchestrator with a goal (non-interactive)
 */
async function runWithGoal(goal: string): Promise<void> {
    try {
        await orchestrator.run(goal);
    } catch (error) {
        logger.error('Error running engineer orchestrator:', error);
    }
}

/**
 * Run the orchestrator in interactive mode
 */
async function run(): Promise<void> {
    try {
        const interactiveOrchestrator = new CodingOrchestrator({
            agents: [agent],
            alwaysWaitHumanInput: true,
        });
        await interactiveOrchestrator.run();
    } catch (error) {
        logger.error('Error running engineer orchestrator:', error);
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    logger.info('Starting engineer orchestrator...');

    const goal = 'Goal: 为图片OCR网页前端项目，生成完整的 React 代码，包括上传、识别模拟、结果展示与下载功能.';
    logger.info(goal);

    // Use runWithGoal for automatic execution
    await runWithGoal(goal);
}

// Run the demo if this file is executed directly
if (require.main === module) {
    main().catch(logger.error);
}

export { run, runWithGoal, agent, orchestrator };

// 脚本执行方式：npx tsx examples/agent/engineer.ts
