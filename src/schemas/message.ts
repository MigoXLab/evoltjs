/**
 * Message class for conversation history
 *
 * Converts Python's message.py to TypeScript
 */

import * as fs from 'fs';
import { Message as MessageType } from '../types';
import { deprecated } from '../utils/deprecated';
import { ImageContent } from '../utils/readImage';

/**
 * Content types for Vision API
 */
interface TextContent {
    type: 'text';
    text: string;
}

interface ImageUrlContent {
    type: 'image_url';
    image_url: { url: string };
}

type ContentPart = TextContent | ImageUrlContent;

/**
 * Message class representing a single message in conversation
 */
export class Message implements MessageType {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    images?: string | string[];

    // OpenAI vision API format image content
    imagesContent?: ImageContent[];

    // Message tag for wrapping content
    tag?: string;

    // Function calling / OpenAI tool call message information
    isFunctionCall?: boolean;
    toolCallId?: string;
    toolName?: string;

    // Legacy type field (kept for compatibility)
    type?: string;

    constructor(
        role: 'system' | 'user' | 'assistant' | 'tool',
        content: string,
        images?: string | string[],
        type?: string
    ) {
        this.role = role;
        this.content = content;
        this.images = images;
        this.type = type;
        this.imagesContent = [];
        this.tag = '';
        this.isFunctionCall = false;
        this.toolCallId = '';
        this.toolName = '';
    }

    /**
     * Create message from user input
     */
    static fromUserMsg(content: string, images?: string | string[]): Message {
        return new Message('user', content, images);
    }

    /**
     * Create message from assistant response
     */
    static fromAssistantMsg(content: string): Message {
        return new Message('assistant', content);
    }

    /**
     * Create system message
     */
    static fromSystemMsg(content: string): Message {
        return new Message('system', content);
    }

    /**
     * Check if message is truthy based on content
     */
    isTruthy(): boolean {
        if (typeof this.content === 'string') {
            return Boolean(this.content.trim());
        }
        return false;
    }

    /**
     * Format the content with pre/post content and optional tag wrapping
     */
    private _formatForContent(preContent: string = '', postContent: string = ''): string {
        if (this.tag) {
            return `${preContent}<${this.tag}>\n${this.content}\n</${this.tag}>${postContent}`.trim();
        }
        return `${preContent}${this.content}${postContent}`.trim();
    }

    /**
     * Ensure text content is not empty to avoid API errors
     */
    private static _ensureNonEmptyText(text: string): string {
        return text.trim() ? text : ' ';
    }

    /**
     * Format message for OpenAI API
     *
     * This is the recommended method replacing toChatMessage.
     *
     * @param preContent - Content to prepend
     * @param postContent - Content to append
     * @returns Formatted message object for API
     */
    formatForApi(preContent: string = '', postContent: string = ''): Record<string, any> {
        const role = ['user', 'assistant', 'system', 'tool'].includes(this.role) ? this.role : 'user';
        const functionCallingMeta = { tool_call_id: this.toolCallId, name: this.toolName };

        if (!this.imagesContent || this.imagesContent.length === 0) {
            const msg: Record<string, any> = {
                role,
                content: this._formatForContent(preContent, postContent),
            };
            return this.isFunctionCall ? { ...msg, ...functionCallingMeta } : msg;
        }

        let formattedText = this._formatForContent(preContent, postContent);
        // Ensure text content is not empty to avoid API errors
        formattedText = Message._ensureNonEmptyText(formattedText);

        const content: ContentPart[] = [{ type: 'text', text: formattedText }];
        content.push(...this.imagesContent);

        const msg: Record<string, any> = { role, content };
        return this.isFunctionCall ? { ...msg, ...functionCallingMeta } : msg;
    }

    /**
     * Convert to plain object for API calls
     */
    toObject(): any {
        const obj: any = {
            role: this.role,
            content: this.content,
        };

        if (this.images) {
            obj.images = this.images;
        }

        if (this.type) {
            obj.type = this.type;
        }

        if (this.tag) {
            obj.tag = this.tag;
        }

        if (this.imagesContent && this.imagesContent.length > 0) {
            obj.images_content = this.imagesContent;
        }

        if (this.isFunctionCall) {
            obj.is_function_call = this.isFunctionCall;
            obj.tool_call_id = this.toolCallId;
            obj.tool_name = this.toolName;
        }

        return obj;
    }

    /**
     * Convert to dictionary representation
     */
    toDict(): Record<string, any> {
        return {
            role: this.role,
            content: this.content,
            tag: this.tag || '',
            images_content: this.imagesContent || [],
            is_function_call: this.isFunctionCall || false,
            tool_call_id: this.toolCallId || '',
            tool_name: this.toolName || '',
        };
    }

    /**
     * Check if message contains images
     */
    hasImages(): boolean {
        return (
            (!!this.images && (Array.isArray(this.images) ? this.images.length > 0 : true)) ||
            (!!this.imagesContent && this.imagesContent.length > 0)
        );
    }

    /**
     * Get message content length
     */
    getContentLength(): number {
        return this.content.length;
    }

    /**
     * Convert to string representation
     */
    toString(): string {
        const parts: string[] = [];

        parts.push(`role=${this.role}`);
        if (this.content) {
            const truncatedContent = this.content.length > 100 ? this.content.slice(0, 100) + '...' : this.content;
            parts.push(`content=${truncatedContent}`);
        }
        if (this.tag) {
            parts.push(`tag=${this.tag}`);
        }

        // Handle images_content, only show file paths
        if (this.imagesContent && this.imagesContent.length > 0) {
            const imagePaths: string[] = [];
            for (const img of this.imagesContent) {
                if (img && img.image_url && img.image_url.url) {
                    const url = img.image_url.url;
                    if (!url.startsWith('data:')) {
                        imagePaths.push(url);
                    }
                }
            }
            if (imagePaths.length > 0) {
                parts.push(`images_paths=[${imagePaths.join(', ')}]`);
            }
        }

        return `Message(${parts.join(', ')})`;
    }

    /**
     * Merge two messages into one
     *
     * @param other - Message to merge with
     * @returns New merged Message
     */
    merge(other: Message): Message {
        if (this.role !== other.role) {
            throw new Error('Messages must have the same role to merge');
        }
        if (this.isFunctionCall !== other.isFunctionCall) {
            throw new Error('Messages must have the same isFunctionCall to merge');
        }
        if (this.toolCallId !== other.toolCallId) {
            throw new Error('Messages must have the same toolCallId to merge');
        }
        if (this.toolName !== other.toolName) {
            throw new Error('Messages must have the same toolName to merge');
        }

        let selfContent = this.content;
        let otherContent = other.content;
        let resultTag = this.tag;

        // If tags are different, wrap content with tags and clear tags
        if (this.tag !== other.tag) {
            selfContent = this.tag ? `<${this.tag}>\n${this.content}\n</${this.tag}>` : this.content;
            otherContent = other.tag ? `<${other.tag}>\n${other.content}\n</${other.tag}>` : other.content;
            resultTag = '';
        }

        const merged = new Message(this.role, `${selfContent}\n${otherContent}`);
        merged.tag = resultTag;
        merged.imagesContent = [...(this.imagesContent || []), ...(other.imagesContent || [])];
        merged.isFunctionCall = this.isFunctionCall;
        merged.toolCallId = this.toolCallId;
        merged.toolName = this.toolName;

        return merged;
    }

    /**
     * Convert to OpenAI Vision API format with base64-encoded images
     *
     * @deprecated Use formatForApi instead. Will be removed in 0.2.2.
     *
     * This method handles:
     * - HTTP/HTTPS URLs: Downloads and converts to base64
     * - Local file paths: Reads file and converts to base64
     * - Already base64 strings: Passes through
     */
    @deprecated({ version: '0.2.2', replacement: 'formatForApi' })
    async toChatMessage(): Promise<Record<string, any>> {
        const role = this.role;

        if (!this.hasImages()) {
            return { role, content: this.content };
        }

        const content: ContentPart[] = [{ type: 'text', text: this.content }];

        // Handle legacy images field
        if (this.images) {
            const imageArray = Array.isArray(this.images) ? this.images : [this.images];

            for (const img of imageArray) {
                let base64Data: string;

                if (img.startsWith('http://') || img.startsWith('https://')) {
                    base64Data = await this.encodeHttpImage(img);
                } else if (fs.existsSync(img)) {
                    base64Data = await this.encodeLocalFile(img);
                } else {
                    // Assume already base64
                    base64Data = img;
                }

                const mimeType = this.getMimeType(img);
                content.push({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${base64Data}` },
                });
            }
        }

        // Handle imagesContent field
        if (this.imagesContent && this.imagesContent.length > 0) {
            content.push(...this.imagesContent);
        }

        return { role, content };
    }

    /**
     * Get MIME type from file path or URL
     */
    private getMimeType(path: string): string {
        const ext = path.toLowerCase().split('.').pop();
        const mimeTypes: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
        };
        return mimeTypes[ext || ''] || 'image/jpeg';
    }

    /**
     * Encode local file to base64
     */
    private async encodeLocalFile(filePath: string): Promise<string> {
        const fileBuffer = await fs.promises.readFile(filePath);
        return fileBuffer.toString('base64');
    }

    /**
     * Fetch and encode HTTP image to base64
     */
    private async encodeHttpImage(url: string): Promise<string> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
    }
}
