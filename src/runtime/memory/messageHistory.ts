/**
 * Message history management
 *
 * Converts Python's runtime/memory/message_history.py to TypeScript
 */

import { Message } from '../../schemas/message';
import { Message as MessageType } from '../../types';

/**
 * Message history class for managing conversation context
 */
export class MessageHistory {
    private messages: (Message | Record<string, any>)[] = [];
    private systemPrompt: string;
    private model: string;
    private contextWindowTokens: number;
    private currentTokens: number = 0;

    constructor(model: string, system: string, contextWindowTokens: number) {
        this.model = model;
        this.systemPrompt = system;
        this.contextWindowTokens = contextWindowTokens;

        // Add system message if provided
        if (system) {
            const systemMessage = new Message('system', system);
            this.messages.push(systemMessage);
            this.currentTokens += this.estimateTokens(system);
        }
    }

    /**
     * Add a message to history
     */
    addMessage(message: Message): void;
    addMessage(role: 'system' | 'user' | 'assistant' | 'tool', content: string): void;
    addMessage(messageObject: any): void;
    addMessage(arg1: Message | 'system' | 'user' | 'assistant' | 'tool' | any, arg2?: string): void {
        let message: Message | Record<string, any>;

        if (arg1 instanceof Message) {
            message = arg1;
        } else if (typeof arg1 === 'string') {
            // Role + content format
            message = new Message(arg1 as any, arg2!);
        } else if (typeof arg1 === 'object' && arg1 !== null) {
            // Object format (e.g., tool call messages)
            // Store as-is without converting to Message instance
            this.messages.push(arg1);
            const contentStr = arg1.content || JSON.stringify(arg1);
            this.currentTokens += this.estimateTokens(contentStr);
            return;
        } else {
            throw new Error(`Invalid message format: ${arg1}`);
        }

        this.messages.push(message);
        this.currentTokens += this.estimateTokens(message.content);
    }

    /**
     * Get all messages
     */
    getMessages(): (Message | Record<string, any>)[] {
        return [...this.messages];
    }

    /**
     * Get messages formatted for API calls
     * Async version to handle base64 image encoding
     */
    async formatForApi(): Promise<any[]> {
        const results: any[] = [];
        for (const msg of this.messages) {
            if (msg instanceof Message) {
                if (msg.hasImages()) {
                    results.push(await msg.toChatMessage());
                } else {
                    results.push(msg.toObject());
                }
            } else if (typeof msg.toObject === 'function') {
                results.push(msg.toObject());
            } else {
                // Return plain object as is
                results.push(msg);
            }
        }
        return results;
    }

    /**
     * Update system prompt
     */
    updateSystem(system: string): void {
        // Remove existing system message if any
        this.messages = this.messages.filter(msg => {
            if (msg instanceof Message) {
                return msg.role !== 'system';
            }
            return msg.role !== 'system';
        });
        this.currentTokens = 0;

        // Add new system message
        if (system) {
            const systemMessage = new Message('system', system);
            this.messages.unshift(systemMessage);
            this.currentTokens += this.estimateTokens(system);
        }

        // Recalculate tokens for all messages
        for (const message of this.messages) {
            if (message instanceof Message) {
                if (message.role !== 'system') {
                    this.currentTokens += this.estimateTokens(message.content);
                }
            } else {
                const contentStr = message.content || JSON.stringify(message);
                this.currentTokens += this.estimateTokens(contentStr);
            }
        }
    }

    /**
     * Truncate history to fit context window
     * Preserves tool call chains: assistant(with tool_calls) → tool messages
     */
    truncate(): void {
        if (this.currentTokens <= this.contextWindowTokens) {
            return;
        }

        // Find system message
        let systemMessageIndex = -1;
        for (let i = 0; i < this.messages.length; i++) {
            const msg = this.messages[i];
            if ((msg instanceof Message && msg.role === 'system') || msg.role === 'system') {
                systemMessageIndex = i;
                break;
            }
        }

        const systemMessage = systemMessageIndex >= 0 ? this.messages[systemMessageIndex] : null;
        const otherMessages = this.messages.filter((msg, index) => index !== systemMessageIndex);

        // Build a map of tool_call_id -> assistant message index for dependency tracking
        const toolCallDependencies = new Map<string, number>();
        for (let i = 0; i < otherMessages.length; i++) {
            const msg = otherMessages[i];
            const role = msg instanceof Message ? msg.role : msg.role;

            // Track assistant messages with tool_calls (only plain objects have tool_calls)
            if (role === 'assistant' && !(msg instanceof Message)) {
                const toolCalls = (msg as any).tool_calls;
                if (toolCalls && Array.isArray(toolCalls)) {
                    for (const tc of toolCalls) {
                        if (tc.id) {
                            toolCallDependencies.set(tc.id, i);
                        }
                    }
                }
            }
        }

        // Mark messages that should be kept together (assistant + its tool responses)
        const mustKeepIndices = new Set<number>();
        for (let i = 0; i < otherMessages.length; i++) {
            const msg = otherMessages[i];
            const role = msg instanceof Message ? msg.role : msg.role;

            // If this is a tool message, mark both it and its assistant message
            if (role === 'tool' && !(msg instanceof Message)) {
                const toolCallId = (msg as any).tool_call_id;
                if (toolCallId) {
                    const assistantIndex = toolCallDependencies.get(toolCallId);
                    if (assistantIndex !== undefined) {
                        mustKeepIndices.add(assistantIndex);
                        mustKeepIndices.add(i);
                    }
                }
            }
        }

        // Remove oldest messages while respecting dependencies
        let i = 0;
        while (this.currentTokens > this.contextWindowTokens && i < otherMessages.length) {
            // Skip if this message must be kept (part of a tool call chain)
            if (mustKeepIndices.has(i)) {
                i++;
                continue;
            }

            // Check if removing this message would break a tool call chain
            const msg = otherMessages[i];
            const role = msg instanceof Message ? msg.role : msg.role;

            // If it's an assistant with tool_calls, check if any tool messages depend on it
            let hasDependentToolMessages = false;
            if (role === 'assistant' && !(msg instanceof Message)) {
                const toolCalls = (msg as any).tool_calls;
                if (toolCalls && Array.isArray(toolCalls)) {
                    for (const tc of toolCalls) {
                        if (tc.id) {
                            // Check if there's a tool message with this tool_call_id after this position
                            for (let j = i + 1; j < otherMessages.length; j++) {
                                const laterMsg = otherMessages[j];
                                const laterRole = laterMsg instanceof Message ? laterMsg.role : laterMsg.role;
                                if (laterRole === 'tool' && !(laterMsg instanceof Message)) {
                                    const laterToolCallId = (laterMsg as any).tool_call_id;
                                    if (laterToolCallId === tc.id) {
                                        hasDependentToolMessages = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (hasDependentToolMessages) {
                // Can't remove this, skip it
                i++;
                continue;
            }

            // Safe to remove
            const removed = otherMessages.splice(i, 1)[0];
            if (removed) {
                let contentStr = '';
                if (removed instanceof Message) {
                    contentStr = removed.content;
                } else {
                    contentStr = removed.content || JSON.stringify(removed);
                }
                this.currentTokens -= this.estimateTokens(contentStr);

                // Update mustKeepIndices for remaining messages
                const newMustKeepIndices = new Set<number>();
                for (const idx of mustKeepIndices) {
                    if (idx > i) {
                        newMustKeepIndices.add(idx - 1);
                    } else if (idx < i) {
                        newMustKeepIndices.add(idx);
                    }
                }
                mustKeepIndices.clear();
                for (const idx of newMustKeepIndices) {
                    mustKeepIndices.add(idx);
                }
            }
            // Don't increment i since we removed an element
        }

        // Rebuild messages array
        this.messages = [];
        if (systemMessage) {
            this.messages.push(systemMessage);
        }
        this.messages.push(...otherMessages);
    }

    /**
     * Clear all messages except system
     */
    clear(): void {
        let systemMessage: Message | Record<string, any> | undefined;

        for (const msg of this.messages) {
            if ((msg instanceof Message && msg.role === 'system') || msg.role === 'system') {
                systemMessage = msg;
                break;
            }
        }

        this.messages = systemMessage ? [systemMessage] : [];

        if (systemMessage) {
            if (systemMessage instanceof Message) {
                this.currentTokens = this.estimateTokens(systemMessage.content);
            } else {
                this.currentTokens = this.estimateTokens(systemMessage.content || JSON.stringify(systemMessage));
            }
        } else {
            this.currentTokens = 0;
        }
    }

    /**
     * Get the last message
     */
    getLastMessage(): Message | Record<string, any> | null {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }

    /**
     * Get message count
     */
    getMessageCount(): number {
        return this.messages.length;
    }

    /**
     * Get formatted context usage information
     */
    get formattedContextUsage(): string {
        const usagePercent = (this.currentTokens / this.contextWindowTokens) * 100;
        return `Tokens: ${this.currentTokens}/${this.contextWindowTokens} (${usagePercent.toFixed(1)}%)`;
    }

    /**
     * Estimate tokens for text (simplified implementation)
     */
    private estimateTokens(text: string): number {
        // Simple estimation: ~4 characters per token for English text
        // In production, you might want to use a proper tokenizer
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    /**
     * Get conversation as string
     */
    toString(): string {
        return this.messages
            .map(msg => {
                if (msg instanceof Message) {
                    return msg.toString();
                }
                return JSON.stringify(msg);
            })
            .join('\n');
    }
}
