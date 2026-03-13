/**
 * Cost calculation utilities
 *
 * Converts Python's utils/cost.py to TypeScript
 */

import { encodingForModel, getEncoding, Tiktoken } from 'js-tiktoken';
import { LRUCache } from 'lru-cache';

const tokenizerCache = new LRUCache<string, Tiktoken | false>({ max: 128 });
const tokenCountCache = new LRUCache<string, number>({ max: 20000 });

export function estimateTokens({ text, model }: { text: string, model: string }): number {
    if (!text) return 1;
    const cacheKey = `${model.toLowerCase()}\u0000${text}`;
    const cachedTokenCount = tokenCountCache.get(cacheKey);
    if (typeof cachedTokenCount === 'number') {
        return cachedTokenCount;
    }

    const tokenizer = getTokenizer(model);
    let tokenCount: number;
    if (tokenizer) {
        try {
            tokenCount = Math.max(1, tokenizer.encode(text).length);
        } catch {
            tokenCount = Math.max(1, Math.ceil(text.length / 4));
        }
    } else {
        tokenCount = Math.max(1, Math.ceil(text.length / 4));
    }
    tokenCountCache.set(cacheKey, tokenCount);
    return tokenCount;
}

function getTokenizer(model: string): Tiktoken | null {
    const normalizedModel = model.toLowerCase();
    const cachedTokenizer = tokenizerCache.get(normalizedModel);
    if (typeof cachedTokenizer !== 'undefined') {
        return cachedTokenizer === false ? null : cachedTokenizer;
    }

    const tokenizer = createTokenizer(normalizedModel);
    tokenizerCache.set(normalizedModel, tokenizer ?? false);
    return tokenizer;
}

function createTokenizer(model: string): Tiktoken | null {
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
