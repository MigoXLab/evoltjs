/**
 * Message history management
 *
 * Converts Python's runtime/memory/message_history.py to TypeScript
 */

import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { AnyMessage, MessageContent } from '../../schemas/message';
import { LRUCache } from 'lru-cache';
import { cloneDeep } from 'lodash';
import { estimateTokens } from '@/utils/cost';

type PersistRecord = { data?: { message?: ChatCompletionMessageParam } };
type ContextUsage = {
    /** Maximum number of tokens available in the model context window. */
    context_window_tokens: number;
    /** Tokens currently occupied by messages in active history. */
    used_tokens: number;
    /** Ratio of used tokens to context window, expressed as a percentage. */
    used_percentage: number;
    /** Number of messages currently stored in history. */
    messages_length: number;
    /** Cumulative LLM call tokens (sum of assistant turns input+output). */
    total_used_tokens: number;
};

// ------------------------------------------------------------------
// Pure formatting helpers for history-level processing
// ------------------------------------------------------------------

function normalizeMessageContentForApi(content: MessageContent): MessageContent {
    const defaultContent = ' ';
    if (typeof content === 'string') {
        return content.trim() ? content : defaultContent;
    }
    return content.map((block: ChatCompletionContentPart) => {
        if (block.type === 'text') {
            return { ...block, text: block.text.trim() ? block.text : defaultContent };
        }
        return block;
    });
}


function reduceImagesToHistoryText(content: MessageContent): MessageContent {
    if (!Array.isArray(content)) {
        return content;
    }

    const textBlocks = content.filter(
        (block: ChatCompletionContentPart) => block.type === 'text'
    ) as ChatCompletionContentPartText[];
    const imageBlocks = content.filter(
        (block: ChatCompletionContentPart) => block.type === 'image_url'
    ) as ChatCompletionContentPartImage[];

    if (imageBlocks.length === 0) {
        return content;
    }

    const removalNote = '[Image removed from history to avoid API errors]';
    const textContent = textBlocks.map(block => String(block.text || '')).join(' ').trim();
    return textContent ? `${textContent} [Note: image removed from history to avoid API errors]` : removalNote;
}

function formatStoredMessageForApi(
    rawMessage: ChatCompletionMessageParam,
    options: {
        isLastMessage: boolean;
        enableCaching: boolean;
        model: string;
    }
): ChatCompletionMessageParam {
    const { isLastMessage, enableCaching, model } = options;
    const msgCopy: ChatCompletionMessageParam = { ...rawMessage };

    if (Array.isArray(msgCopy.content)) {
        msgCopy.content = isLastMessage
            ? normalizeMessageContentForApi(msgCopy.content as MessageContent)
            : reduceImagesToHistoryText(msgCopy.content as MessageContent);
    } else {
        msgCopy.content = normalizeMessageContentForApi((msgCopy.content ?? '') as MessageContent);
    }

    if (
        isLastMessage &&
        enableCaching &&
        model.toLowerCase().startsWith('claude') &&
        Array.isArray(msgCopy.content)
    ) {
        msgCopy.content = (msgCopy.content as any[]).map((block: any) => ({
            ...block,
            cache_control: { type: 'ephemeral' },
        }));
    }

    return msgCopy;
}

const formattedMessageCache = new LRUCache<string, ChatCompletionMessageParam>({
    max: 5000,
});

function getFormattedMessageCacheKey(
    rawMessage: ChatCompletionMessageParam,
    options: {
        isLastMessage: boolean;
        enableCaching: boolean;
        model: string;
    }
): string {
    return `${options.model}|${options.enableCaching ? 1 : 0}|${options.isLastMessage ? 1 : 0}|${JSON.stringify(rawMessage)}`;
}

function formatStoredMessageForApiCached(
    rawMessage: ChatCompletionMessageParam,
    options: {
        isLastMessage: boolean;
        enableCaching: boolean;
        model: string;
    }
): ChatCompletionMessageParam {
    const cacheKey = getFormattedMessageCacheKey(rawMessage, options);
    const cachedMessage = formattedMessageCache.get(cacheKey);
    if (cachedMessage) {
        return cachedMessage;
    }
    const formattedMessage = formatStoredMessageForApi(rawMessage, options);
    formattedMessageCache.set(cacheKey, formattedMessage);
    return formattedMessage;
}

/**
 * Message history class for managing conversation context
 */
export class MessageHistory {
    private messages: ChatCompletionMessageParam[] = [];
    private model: string;
    private systemMessage: ChatCompletionMessageParam;
    private contextWindowTokens: number;
    private enableCaching: boolean;
    // Each assistant response tracks (input_tokens, output_tokens).
    private assistantMessageCosts: Array<[number, number]> = [];
    private _truncationMessage: ChatCompletionMessageParam = {
        role: 'user',
        content: [{ type: 'text', text: '[Earlier history has been truncated.]' }],
    };

    constructor({ model, system, contextWindowTokens, enableCaching = true }: { model: string, system: string, contextWindowTokens: number, enableCaching?: boolean }) {
        this.model = model;
        this.systemMessage = { role: 'system', content: system };
        this.contextWindowTokens = contextWindowTokens;
        this.enableCaching = enableCaching;
    }

    /**
     * Add a message to history
     */
    addMessage(message: AnyMessage): void {
        const formattedMessage = message.formatForApi();
        this.messages.push(formattedMessage);
        const { messageTokens, totalTokens } = this.buildFormattedSnapshot();
        const lastMessageTokenCount = messageTokens[messageTokens.length - 1];

        if (formattedMessage.role === 'assistant') {
            this.assistantMessageCosts.push([
                totalTokens - lastMessageTokenCount,
                lastMessageTokenCount,
            ]);
        }
    }

    /**
     * Restore messages from persisted records without re-persisting.
     */
    restoreMessages(records: PersistRecord[]): void {
        for (const record of records) {
            const message = record?.data?.message;
            if (!message) {
                continue;
            }

            this.messages.push(message as ChatCompletionMessageParam);
        }
    }

    /**
     * Get all messages
     */
    getMessages(): ChatCompletionMessageParam[] {
        return cloneDeep(this.messages);
    }

    formatForApi(): ChatCompletionMessageParam[] {
        return this.buildFormattedSnapshot().formattedMessages;
    }

    /**
     * Update system prompt
     */
    updateSystem(system: string): void {
        this.systemMessage = { role: 'system', content: system };
    }

    /**
     * Truncate history to fit context window
     */
    truncate(): void {
        if (this.buildFormattedSnapshot().totalTokens <= this.contextWindowTokens) {
            return;
        }

        while (
            this.messages.length >= 2 &&
            this.buildFormattedSnapshot().totalTokens > this.contextWindowTokens
        ) {
            this.messages.shift();
            this.messages.shift();

            if (this.messages.length > 0) {
                this.messages[0] = this._truncationMessage;
            }
        }
    }

    /**
     * Convert content to text for token estimation.
     */
    private contentToText(content: ChatCompletionMessageParam['content']): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            const textParts: string[] = [];
            for (const block of content) {
                if (block && typeof block === 'object' && block.type === 'text') {
                    textParts.push(String(block.text || ''));
                } else {
                    textParts.push(JSON.stringify(block));
                }
            }
            return textParts.join(' ');
        }

        return typeof content === 'undefined' ? '' : JSON.stringify(content);
    }

    /**
     * Estimate tokens for a single message.
     */
    private estimateMessageTokens(message: ChatCompletionMessageParam): number {
        const messageText = this.messageToCountableText(message);
        return estimateTokens({ text: messageText, model: this.model });
    }

    /**
     * Convert a full message into token-countable text.
     * Mirrors Python's token_counter(messages=[message]) semantics more closely
     * than counting content alone.
     */
    private messageToCountableText(message: ChatCompletionMessageParam): string {
        const parts: string[] = [`role:${message.role}`];

        if ('content' in message) {
            parts.push(`content:${this.contentToText(message.content)}`);
        }

        if ('tool_calls' in message && Array.isArray(message.tool_calls)) {
            for (const toolCall of message.tool_calls) {
                if ('function' in toolCall) {
                    parts.push(`tool:${toolCall.function.name}`);
                    parts.push(`args:${toolCall.function.arguments}`);
                }
            }
        }

        if ('tool_call_id' in message && typeof message.tool_call_id === 'string') {
            parts.push(`tool_call_id:${message.tool_call_id}`);
        }

        if ('name' in message && typeof message.name === 'string') {
            parts.push(`name:${message.name}`);
        }

        return parts.join('\n');
    }

    /**
     * Get context usage details.
     */
    get contextUsage(): ContextUsage {
        const { totalTokens } = this.buildFormattedSnapshot();
        return {
            context_window_tokens: this.contextWindowTokens,
            used_tokens: totalTokens,
            used_percentage: (totalTokens / this.contextWindowTokens) * 100,
            messages_length: this.messages.length,
            total_used_tokens: this.assistantMessageCosts.reduce((acc, [inputTokens, outputTokens]) => acc + inputTokens + outputTokens, 0),
        };
    }

    /**
     * Get formatted context usage information.
     */
    get formattedContextUsage(): string {
        const contextUsage = this.contextUsage;
        return `
            Current Context Usage:
            - History Messages Length: ${contextUsage.messages_length}
            - History Used Tokens: ${(contextUsage.used_tokens / 1000).toFixed(1)}k
            - Used Percentage: ${((contextUsage.used_tokens / contextUsage.context_window_tokens) * 100).toFixed(1)}%
            - Context Window Tokens: ${Math.round(contextUsage.context_window_tokens / 1000)}k
            - History Total Used Tokens: ${(contextUsage.total_used_tokens / 1000).toFixed(1)}k
        `;
    }

    /**
     * Clear message history.
     */
    clear(): void {
        this.messages = [];
        this.assistantMessageCosts = [];
    }

    reset(messages: ChatCompletionMessageParam[]): void {
        this.clear();
        messages.forEach(message => this.messages.push(message));
    }

    /**
     * Get the last message.
     */
    getLastMessage(): ChatCompletionMessageParam | null {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }

    /**
     * Get message count.
     */
    getMessageCount(): number {
        return this.messages.length;
    }

    getMessageCosts(): Array<[number, number]> {
        return [...this.assistantMessageCosts];
    }

    toString(): string {
        return this.messages.map(msg => JSON.stringify(msg)).join('\n');
    }

    private buildFormattedSnapshot(): { formattedMessages: ChatCompletionMessageParam[]; messageTokens: number[]; totalTokens: number } {
        const history: ChatCompletionMessageParam[] = [];
        for (let i = 0; i < this.messages.length; i++) {
            history.push(
                formatStoredMessageForApiCached(this.messages[i], {
                    isLastMessage: i === this.messages.length - 1,
                    enableCaching: this.enableCaching,
                    model: this.model,
                })
            );
        }

        const formattedMessages = [this.systemMessage, ...history];
        const messageTokens = formattedMessages.map(message => this.estimateMessageTokens(message));
        const totalTokens = messageTokens.reduce((acc, token) => acc + token, 0);
        return { formattedMessages, messageTokens, totalTokens };
    }
}
