/**
 * Agent File Tools Demo - Demonstrates FileEditor tool usage
 *
 * This example shows how an agent can read, write, and manipulate files
 */

import { Agent } from '../../src/agent';
import { anthropicModelConfig, deepseekModelConfig } from './modelConfig';
import { logger } from '../../src/utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import { gpt5ModelConfig } from './modelConfig';

/**
 * Run agent with file operations
 */
async function runFileAgent(userInput: string): Promise<string> {
    const agent = new Agent({
        name: 'FileAssistant',
        profile: 'You are a helpful file management assistant. You can read, write, search, and modify files.',
        tools: [
            'ThinkTool.execute',
            'FileEditor.read',
            'FileEditor.write',
            'FileEditor.find',
            'FileEditor.find_and_replace',
            'FileEditor.insert',
        ],
        modelConfig: gpt5ModelConfig,
        verbose: 1,
    });

    return await agent.run(userInput);
}

/**
 * Setup test files
 */
async function setupTestFiles(): Promise<void> {
    const testDir = path.join(__dirname, 'test_workspace');
    await fs.mkdir(testDir, { recursive: true });

    // Create a sample file
    const sampleContent = `# Sample Document

This is a test file for demonstrating file operations.

## Features
- File reading
- File writing
- Content search
- Find and replace

Status: draft
Version: 1.0.0
`;

    await fs.writeFile(path.join(testDir, 'sample.md'), sampleContent);
    logger.info(`Created test file at: ${testDir}/sample.md`);
}

/**
 * Cleanup test files
 */
async function cleanup(): Promise<void> {
    const testDir = path.join(__dirname, 'test_workspace');
    try {
        await fs.rm(testDir, { recursive: true, force: true });
        logger.info('Cleaned up test workspace');
    } catch (error) {
        logger.warn('Cleanup failed:', error);
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    try {
        // Setup test environment
        await setupTestFiles();
        const testFile = path.join(__dirname, 'test_workspace', 'sample.md');

        // Example 1: Read file
        logger.info('\n=== Example 1: Read File ===');
        let result = await runFileAgent(`Read the file at ${testFile} and tell me what it contains.`);
        logger.info(`Agent response: ${result}`);

        // Example 2: Find content
        logger.info('\n=== Example 2: Find Content ===');
        result = await runFileAgent(`Search for the word "Status" in ${testFile} and tell me what line it's on.`);
        logger.info(`Agent response: ${result}`);

        // Example 3: Find and replace
        logger.info('\n=== Example 3: Find and Replace ===');
        result = await runFileAgent(`In the file ${testFile}, replace "draft" with "published".`);
        logger.info(`Agent response: ${result}`);

        // Example 4: Insert content
        logger.info('\n=== Example 4: Insert Content ===');
        result = await runFileAgent(`Add a new line "Author: AI Assistant" at the end of ${testFile}.`);
        logger.info(`Agent response: ${result}`);

        // Cleanup
        await cleanup();
    } catch (error) {
        logger.error('Error running file agent demo:', error);
        await cleanup();
    }
}

// Run the demo if this file is executed directly
if (require.main === module) {
    main().catch(logger.error);
}

export { runFileAgent };

// 脚本执行方式：npx tsx examples/agent/agentFileTools.ts
