/**
 * Toolcall class and types
 *
 * Extracted from src/utils/toolUtil.ts to mirror Python evolt/schemas/toolcall.py
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils';

/**
 * Toolcall execution state
 */
export type ToolcallState = 'pending' | 'running' | 'success' | 'failed';

/**
 * Toolcall type
 */
export type ToolcallType = 'system' | 'user' | 'TaskCompletion';

/**
 * Toolcall class representing a single tool call
 */
export class Toolcall {
    name: string;
    input: Record<string, any>;
    isExtractedSuccess: boolean;
    failedExtractedReason?: string;
    executedState: ToolcallState;
    executedContent?: string;
    toolCallId: string;
    type: ToolcallType;
    rawContentFromLlm?: string;

    constructor(config: {
        name: string;
        input?: Record<string, any>;
        isExtractedSuccess?: boolean;
        failedExtractedReason?: string;
        executedState?: ToolcallState;
        executedContent?: string;
        toolCallId?: string;
        type?: ToolcallType;
        rawContentFromLlm?: string;
    }) {
        this.name = config.name;
        this.input = config.input || {};
        this.isExtractedSuccess = config.isExtractedSuccess ?? true;
        this.failedExtractedReason = config.failedExtractedReason;
        this.executedState = config.executedState || 'pending';
        this.executedContent = config.executedContent;
        this.toolCallId = config.toolCallId || randomUUID();
        this.type = config.type || 'system';
        this.rawContentFromLlm = config.rawContentFromLlm;
    }

    /**
     * Toolcall extraction result description
     */
    extractedResult(): string | Record<string, any> | Record<string, any>[] {
        // TaskCompletion
        if (this.type === 'TaskCompletion') {
            return this.rawContentFromLlm || '';
        }

        // User Toolcall
        if (this.type === 'user') {
            if (!this.isExtractedSuccess) {
                return [
                    {
                        role: 'assistant',
                        tool_calls: [
                            {
                                id: `user_tool_${this.toolCallId}`,
                                type: 'function',
                                function: {
                                    name: this.name,
                                    arguments: this.rawContentFromLlm,
                                },
                            },
                        ],
                    },
                    {
                        role: 'tool',
                        tool_call_id: `user_tool_${this.toolCallId}`,
                        name: this.name,
                        content: this.failedExtractedReason || 'Unknown reason',
                    },
                ];
            }
            logger.debug(`User Toolcall: ${this.name}(${JSON.stringify(this.input)})`);

            return {
                role: 'assistant',
                tool_calls: [
                    {
                        id: `user_tool_${this.toolCallId}`,
                        type: 'function',
                        function: {
                            name: this.name,
                            arguments: JSON.stringify(this.input),
                        },
                    },
                ],
            };
        }

        // System Toolcall
        // Failed extraction
        if (!this.isExtractedSuccess) {
            return `Toolcall ${this.name} failed to extract: ${this.failedExtractedReason || 'Unknown reason'}`;
        }

        // Successful extraction, return XML format
        if (this.name) {
            const inputStr = Object.entries(this.input)
                .map(([k, v]) => `<${k}>${v}</${k}>`)
                .join('');
            return `<${this.name}>${inputStr}</${this.name}>`;
        }

        return `Invalid Toolcall: name ${this.name}, arguments ${JSON.stringify(this.input)}.`;
    }

    /**
     * Toolcall execution result: Feedback to LLM
     */
    executedResult(): string | Record<string, any> {
        // TaskCompletion
        if (this.type === 'TaskCompletion') {
            return 'The task has been completed.';
        }

        // User Toolcall execution result
        if (this.type === 'user') {
            if (!this.isExtractedSuccess) {
                return '';
            }

            return {
                role: 'tool',
                tool_call_id: this.toolCallId, // Use the original tool_call_id without prefix
                name: this.name,
                content: (this.executedContent || 'No execution result found.').trim(),
            };
        }

        // Special tools that don't use observation format
        if (this.name.startsWith('ThinkTool.execute') || this.name.startsWith('TodoListTool.write')) {
            return (this.executedContent || 'No thinking result found.').trim();
        }

        // Other tools: use observation format
        let toolcallDescription = '';
        let observation = '';

        if (this.name.startsWith('FileEditor.write')) {
            toolcallDescription = `FileEditor.write(${this.input.path})`;
        } else {
            toolcallDescription = `${this.name}(${JSON.stringify(this.input)})`;
        }

        observation += `Executed content: ${(this.executedContent || 'None').trim()}\n`;

        // Simplified observation format - you might want to import actual prompt templates
        return `Toolcall: ${toolcallDescription}\nObservation: ${observation}`;
    }
}
