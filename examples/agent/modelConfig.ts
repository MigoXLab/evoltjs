/***
 *  Must set BOYUE_API_KEY and BOYUE_API_URL in .env file
*/

import * as dotenv from 'dotenv';

import { ModelConfig } from '../../src/types';

dotenv.config();

export const deepseekModelConfig: ModelConfig = {
    provider: 'openai',
    model: 'deepseek-chat',
    apiKey: process.env.BOYUE_API_KEY || '',
    baseUrl: process.env.BOYUE_API_URL || '',
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
};

export const anthropicModelConfig: ModelConfig = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.BOYUE_API_KEY || '',
    baseUrl: process.env.BOYUE_API_URL || '',
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
};

export const gpt4oMiniModelConfig: ModelConfig = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.BOYUE_API_KEY || '',
    baseUrl: process.env.BOYUE_API_URL || '',
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
};

export const gpt5ModelConfig: ModelConfig = {
    provider: 'openai',
    model: 'gpt-5',
    apiKey: process.env.BOYUE_API_KEY || '',
    baseUrl: process.env.BOYUE_API_URL || '',
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
};
