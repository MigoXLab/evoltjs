/**
 * Message history management
 *
 * Converts Python's runtime/memory/message_history.py to TypeScript
 */

import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { encodingForModel, getEncoding, Tiktoken } from 'js-tiktoken';
import { AnyMessage, MessageContent } from '../../schemas/messageV2';

type PersistRecord = { data?: { message?: ChatCompletionMessageParam } };

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

/**
 * Message history class for managing conversation context
 */
export class MessageHistory {
    private messages: ChatCompletionMessageParam[] = [];
    private model: string;
    private system: string;
    private contextWindowTokens: number;
    private totalTokens = 0;
    private systemTokens = 0;
    private enableCaching: boolean;
    private tokenizer: Tiktoken | null = null;
    // Each assistant response tracks (input_tokens, output_tokens).
    private messageCosts: Array<[number, number]> = [];
    // Tracks accumulated tokens including truncated history.
    private accumulatedTokens = 0;

    constructor(model: string, system: string, contextWindowTokens: number, enableCaching: boolean = true) {
        this.model = model;
        this.system = system;
        this.contextWindowTokens = contextWindowTokens;
        this.enableCaching = enableCaching;
        this.tokenizer = this.createTokenizer();
        this.systemTokens = this.estimateMessageTokens({ role: 'system', content: this.system });
        this.totalTokens = this.systemTokens;
    }

    /**
     * Add a message to history
     */
    addMessage(message: AnyMessage): void {
        this._addMessage(message.formatForApi());
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

            this._addMessage(message as ChatCompletionMessageParam);
        }
    }

    private _addMessage(message: ChatCompletionMessageParam): void {
        this.messages.push(message);
        const messageTokenCount = this.estimateMessageTokens(message);
        this.totalTokens += messageTokenCount;
        if (message.role === 'assistant') {
            this.messageCosts.push([this.totalTokens - messageTokenCount, messageTokenCount]);
        }
    }
    /**
     * Get all messages
     */
    getMessages(): ChatCompletionMessageParam[] {
        return [...this.messages];
    }

    /**
     * Get messages formatted for API calls
     */
    async formatForApi(): Promise<any[]> {
        const history: ChatCompletionMessageParam[] = [];

        for (let i = 0; i < this.messages.length; i++) {
            history.push(
                formatStoredMessageForApi(this.messages[i], {
                    isLastMessage: i === this.messages.length - 1,
                    enableCaching: this.enableCaching,
                    model: this.model,
                })
            );
        }

        return [{ role: 'system', content: this.system }, ...history];
    }

    /**
     * Update system prompt
     */
    updateSystem(system: string): void {
        this.system = system;
        const newSystemTokens = this.estimateMessageTokens({ role: 'system', content: this.system });
        this.totalTokens = this.totalTokens - this.systemTokens + newSystemTokens;
        this.systemTokens = newSystemTokens;
    }

    /**
     * Truncate history to fit context window
     */
    truncate(): void {
        if (this.totalTokens <= this.contextWindowTokens) {
            return;
        }

        const TRUNCATION_NOTICE_TOKENS = 25;
        const TRUNCATION_MESSAGE: ChatCompletionMessageParam = {
            role: 'user',
            content: [{ type: 'text', text: '[Earlier history has been truncated.]' }],
        };

        const removeMessagePair = (): void => {
            this.messages.shift();
            this.messages.shift();

            if (this.messageCosts.length > 0) {
                const [inputTokens, outputTokens] = this.messageCosts.shift()!;
                this.accumulatedTokens += inputTokens + outputTokens;
                this.totalTokens -= inputTokens + outputTokens;
            }
        };

        while (
            this.messageCosts.length > 0 &&
            this.messages.length >= 2 &&
            this.totalTokens > this.contextWindowTokens
        ) {
            removeMessagePair();

            if (this.messages.length > 0 && this.messageCosts.length > 0) {
                const [originalInputTokens, originalOutputTokens] = this.messageCosts[0];
                this.messages[0] = TRUNCATION_MESSAGE;
                this.messageCosts[0] = [TRUNCATION_NOTICE_TOKENS, originalOutputTokens];
                this.totalTokens += TRUNCATION_NOTICE_TOKENS - originalInputTokens;
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
        return this.estimateTokens(messageText);
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
     * Estimate tokens for text (fallback approximation).
     */
    private estimateTokens(text: string): number {
        if (!text) return 1;

        if (this.tokenizer) {
            try {
                return Math.max(1, this.tokenizer.encode(text).length);
            } catch {
                // Fallback below.
            }
        }

        return Math.max(1, Math.ceil(text.length / 4));
    }

    private createTokenizer(): Tiktoken | null {
        const model = this.model.toLowerCase();

        try {
            if (model.includes('gpt')) {
                // 对于所有gpt模型，动态指定模型tokenizer
                if (model.includes('gpt-4o')) return encodingForModel('gpt-4o');
                if (model.includes('gpt-4')) return encodingForModel('gpt-4');
                if (model.includes('gpt-3.5')) return encodingForModel('gpt-3.5-turbo');
                // 默认gpt都用cl100k_base
                return getEncoding('cl100k_base');
            } else {
                // 其他模型默认用cl100k_base
                return getEncoding('cl100k_base');
            }
        } catch {
            return null;
        }
    }

    /**
     * Get context usage details.
     */
    get contextUsage(): Record<string, number> {
        return {
            context_window_tokens: this.contextWindowTokens,
            used_tokens: this.totalTokens,
            used_percentage: (this.totalTokens / this.contextWindowTokens) * 100,
            messages_length: this.messages.length,
            total_used_tokens: this.accumulatedTokens + this.totalTokens,
        };
    }

    /**
     * Get formatted context usage information.
     */
    get formattedContextUsage(): string {
        const totalUsedTokens = this.accumulatedTokens + this.totalTokens;
        return `
Current Context Usage:
- History Messages Length: ${this.messages.length}
- History Used Tokens: ${(this.totalTokens / 1000).toFixed(1)}k
- Used Percentage: ${((this.totalTokens / this.contextWindowTokens) * 100).toFixed(1)}%
- Context Window Tokens: ${Math.round(this.contextWindowTokens / 1000)}k
- History Total Used Tokens: ${(totalUsedTokens / 1000).toFixed(1)}k
`;
    }

    /**
     * Clear message history.
     */
    clear(): void {
        this.messages = [];
        this.messageCosts = [];
        this.accumulatedTokens = 0;
        this.totalTokens = this.systemTokens;
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

    toString(): string {
        return this.messages.map(msg => JSON.stringify(msg)).join('\n');
    }
}
