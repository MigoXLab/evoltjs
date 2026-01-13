/**
 * Cost calculation utilities
 *
 * Converts Python's utils/cost.py to TypeScript
 */

import { Message } from '../types';

/**
 * Message cost information
 */
export class MessageCost {
    modelName: string;
    role: string;
    tokens: number = 0;
    costUsd: number = 0.0;

    constructor(modelName: string, role: string, tokens: number = 0) {
        this.modelName = modelName;
        this.role = role;
        this.tokens = tokens;
        this._recalculate();
    }

    /**
     * Recalculate cost based on current fields
     */
    private _recalculate(): void {
        const model = this.modelName;
        const tokens = this.tokens;
        const role = this.role;

        if (!model || !role) {
            this.costUsd = 0.0;
            return;
        }

        try {
            // Simplified cost calculation - in a real implementation, you would use
            // a proper token counting library and cost calculation
            const costPerToken = this._getCostPerToken(model);
            this.costUsd = tokens * costPerToken;
        } catch {
            // Fallback for unrecognized models or calculation errors
            this.tokens = 0;
            this.costUsd = 0.0;
        }
    }

    /**
     * Get cost per token for a given model
     * This is a simplified implementation - in production you would use
     * a proper cost calculation library
     */
    private _getCostPerToken(model: string): number {
        // Simplified cost mapping - these are example values
        const costMap: Record<string, number> = {
            'gpt-4': 0.03 / 1000, // $0.03 per 1K tokens
            'gpt-3.5-turbo': 0.002 / 1000, // $0.002 per 1K tokens
            'claude-3-opus': 0.015 / 1000, // $0.015 per 1K tokens
            'claude-3-sonnet': 0.003 / 1000, // $0.003 per 1K tokens
            'claude-3-haiku': 0.00025 / 1000, // $0.00025 per 1K tokens
        };

        // Find the best matching model
        for (const [key, value] of Object.entries(costMap)) {
            if (model.includes(key)) {
                return value;
            }
        }

        // Default cost for unknown models
        return 0.001 / 1000; // $0.001 per 1K tokens
    }

    /**
     * Set tokens from messages and calculate cost
     */
    setTokensFromMessages(messages: Message[]): void {
        try {
            const tokens = this._countTokensFromMessages(messages);
            this.tokens = tokens;
            this.role = 'user';
            this._recalculate();
        } catch {
            this.tokens = 0; // Fallback
        }
    }

    /**
     * Set output from text and calculate cost
     */
    setOutputFromText(text: string): void {
        try {
            const tokens = this._countTokensFromText(text);
            this.tokens = tokens;
            this.role = 'assistant';
            this._recalculate();
        } catch {
            this.tokens = 0; // Fallback
        }
    }

    /**
     * Simplified token counting from messages
     * In production, you would use a proper token counting library
     */
    private _countTokensFromMessages(messages: Message[]): number {
        // Simplified token counting - approximate based on character count
        let totalTokens = 0;
        for (const message of messages) {
            totalTokens += this._countTokensFromText(message.content);
        }
        return totalTokens;
    }

    /**
     * Simplified token counting from text
     * In production, you would use a proper token counting library
     */
    private _countTokensFromText(text: string): number {
        // Simplified approximation: ~4 characters per token for English text
        // This is a rough estimate - use a proper tokenizer for accurate counts
        return Math.ceil((text || '').length / 4);
    }
}
