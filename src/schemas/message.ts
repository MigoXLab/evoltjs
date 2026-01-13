/**
 * Message class for conversation history
 *
 * Converts Python's message.py to TypeScript
 */

import * as fs from 'fs';
import { Message as MessageType } from '../types';

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
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string | string[];
    type?: string;

    constructor(role: 'system' | 'user' | 'assistant', content: string, images?: string | string[], type?: string) {
        this.role = role;
        this.content = content;
        this.images = images;
        this.type = type;
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

        return obj;
    }

    /**
     * Check if message contains images
     */
    hasImages(): boolean {
        return !!this.images && (Array.isArray(this.images) ? this.images.length > 0 : true);
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
        return `${this.role}: ${this.content}`;
    }

    /**
     * Convert to OpenAI Vision API format with base64-encoded images
     * This method handles:
     * - HTTP/HTTPS URLs: Downloads and converts to base64
     * - Local file paths: Reads file and converts to base64
     * - Already base64 strings: Passes through
     */
    async toChatMessage(): Promise<Record<string, any>> {
        const role = this.role;

        if (!this.hasImages()) {
            return { role, content: this.content };
        }

        const content: ContentPart[] = [{ type: 'text', text: this.content }];
        const imageArray = Array.isArray(this.images) ? this.images : [this.images!];

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
