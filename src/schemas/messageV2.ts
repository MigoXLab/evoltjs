/**
 * Message classes for conversation history
 *
 * Base class + 4 role-specific subclasses, aligned with OpenAI Chat Completions API.
 */

import type {
    ChatCompletionMessageParam,
    ChatCompletionAssistantMessageParam,
    ChatCompletionContentPart,
} from 'openai/resources/chat/completions';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Role type derived from OpenAI SDK */
export type MessageRole = ChatCompletionMessageParam['role'];

/** Content type matching OpenAI format: plain string or array of content parts */
export type MessageContent = string | ChatCompletionContentPart[];

/** Base params accepted by all message constructors */
export interface MessageParams {
    content: MessageContent;
    tag?: string;
}

/** Params for AssistantMessage */
export interface AssistantMessageParams extends MessageParams {
    tool_calls?: ChatCompletionAssistantMessageParam['tool_calls'];
}

/** Params for ToolMessage */
export interface ToolMessageParams extends MessageParams {
    tool_call_id: string;
}

/** Union of all concrete message types */
export type AnyMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ------------------------------------------------------------------
// Base class
// ------------------------------------------------------------------

/**
 * Abstract base class representing a single message in conversation.
 *
 * All shared methods live here. Subclasses define `role` and
 * override `getExtraFields()` to expose role-specific fields.
 */
export abstract class Message {
    abstract readonly role: MessageRole;

    content: MessageContent;
    tag: string;

    constructor(params: MessageParams) {
        this.content = params.content;
        this.tag = params.tag ?? '';
    }

    // ------------------------------------------------------------------
    // Content helpers
    // ------------------------------------------------------------------

    isTruthy(): boolean {
        if (typeof this.content === 'string') {
            return Boolean(this.content.trim());
        }
        if (Array.isArray(this.content)) {
            for (const part of this.content) {
                if (part.type === 'text' && Boolean(part.text.trim())) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Format content with optional tag wrapping and pre/post content.
     * Handles both string and ContentPart[] formats.
     */
    protected formatContent(
        content: MessageContent,
        tag: string = '',
        preContent: string = '',
        postContent: string = '',
    ): MessageContent {
        if (typeof content === 'string') {
            content = content.trim() || ' '; // ensure non-empty
            return tag
                ? `${preContent}<${tag}>\n${content}\n</${tag}>${postContent}`.trim()
                : `${preContent}\n${content}\n${postContent}`.trim();
        }

        // content is ContentPart[]
        const result: ChatCompletionContentPart[] = [];
        if (preContent) {
            result.push({ type: 'text', text: preContent });
        }
        for (const block of content) {
            result.push(block);
        }
        if (postContent) {
            result.push({ type: 'text', text: postContent });
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Extension hook for subclass-specific fields
    // ------------------------------------------------------------------

    /**
     * Return role-specific fields (e.g. tool_call_id, tool_calls).
     * Base returns empty — subclasses override as needed.
     */
    protected getExtraFields(): Record<string, any> {
        return {};
    }

    // ------------------------------------------------------------------
    // API formatting
    // ------------------------------------------------------------------

    /**
     * Create a new message of the same type with pre/post context wrapped around the content.
     */
    withContext(preContent: string = '', postContent: string = ''): Message {
        const content = this.formatContent(this.content, this.tag, preContent, postContent);
        const Ctor = this.constructor as new (params: any) => Message;
        return new Ctor({ content, tag: this.tag, ...this.getExtraFields() });
    }

    /** Format message for OpenAI Chat Completions API. */
    formatForApi(preContent: string = '', postContent: string = ''): ChatCompletionMessageParam {
        const msg = this.withContext(preContent, postContent);
        return {
            role: msg.role,
            content: msg.content,
            ...msg.getExtraFields(),
        } as ChatCompletionMessageParam;
    }

    // ------------------------------------------------------------------
    // Serialisation
    // ------------------------------------------------------------------

    /** Convert to a plain object (POJO), stripping methods and empty keys. */
    toObject(): Record<string, any> {
        return {
            role: this.role,
            content: this.content,
            tag: this.tag,
            ...this.getExtraFields(),
        };
    }

    toString(): string {
        const parts: string[] = [`role=${this.role}`];

        if (typeof this.content === 'string') {
            const truncated =
                this.content.length > 100
                    ? this.content.slice(0, 100) + '...'
                    : this.content;
            parts.push(`content=${truncated}`);
        } else if (Array.isArray(this.content)) {
            for (const item of this.content) {
                if (item instanceof Object) {
                    if (item.type === 'text') {
                        const truncated =
                            item.text.length > 100
                                ? item.text.slice(0, 100) + '...'
                                : item.text;
                        parts.push(`content=${truncated}`);
                    } else if (item.type === 'image_url') {
                        const url = item.image_url.url;
                        const truncated = url.length > 100
                            ? url.slice(0, 100) + '...(truncated)'
                            : url;
                        parts.push(`image_url=${truncated}`);
                    }
                } else {
                    parts.push(`content=${item}`);
                }
            }
        }

        if (this.tag) parts.push(`tag=${this.tag}`);

        return `Message(${parts.join(', ')})`;
    }

    // ------------------------------------------------------------------
    // Merge & Clone
    // ------------------------------------------------------------------

    /** Merge two messages of the same role into one. */
    merge(other: Message): Message {
        if (this.role !== other.role) {
            throw new Error('Messages must have the same role to merge');
        }

        let content: MessageContent;
        const selfContent = this.content;
        const otherContent = other.content;

        if (typeof selfContent === 'string' && typeof otherContent === 'string') {
            if (this.tag !== other.tag) {
                content =
                    (this.formatContent(selfContent, this.tag) as string)
                    + '\n'
                    + (this.formatContent(otherContent, other.tag) as string);
            } else {
                content = this.formatContent(
                    selfContent + '\n' + otherContent,
                    this.tag,
                ) as string;
            }
        } else if (typeof selfContent === 'string' && Array.isArray(otherContent)) {
            content = [
                { type: 'text' as const, text: this.formatContent(selfContent, this.tag) as string },
                ...otherContent,
            ];
        } else if (Array.isArray(selfContent) && typeof otherContent === 'string') {
            content = [
                ...selfContent,
                { type: 'text' as const, text: this.formatContent(otherContent, other.tag) as string },
            ];
        } else {
            // both are ContentPart[]
            content = [
                ...(selfContent as ChatCompletionContentPart[]),
                ...(otherContent as ChatCompletionContentPart[]),
            ];
        }

        const Ctor = this.constructor as new (params: any) => Message;
        return new Ctor({
            content,
            tag: this.tag !== other.tag ? '' : this.tag,
            ...this.getExtraFields(),
        });
    }
}

// ------------------------------------------------------------------
// Subclasses
// ------------------------------------------------------------------

export class SystemMessage extends Message {
    readonly role = 'system' as const;
}

export class UserMessage extends Message {
    readonly role = 'user' as const;
}

export class AssistantMessage extends Message {
    readonly role = 'assistant' as const;
    tool_calls?: ChatCompletionAssistantMessageParam['tool_calls'];

    constructor(params: AssistantMessageParams) {
        super(params);
        this.tool_calls = params.tool_calls;
    }

    protected override getExtraFields() {
        return this.tool_calls?.length ? { tool_calls: this.tool_calls } : {};
    }
}

export class ToolMessage extends Message {
    readonly role = 'tool' as const;
    tool_call_id: string;
    tool_name: string;

    constructor(params: ToolMessageParams & { tool_name: string }) {
        super(params);
        this.tool_call_id = params.tool_call_id;
        this.tool_name = params.tool_name;
    }

    protected override getExtraFields() {
        return { tool_call_id: this.tool_call_id, tool_name: this.tool_name };
    }
}
