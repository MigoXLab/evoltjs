/**
 * Model configuration loader
 *
 * Converts Python's config_loader.py to TypeScript
 */

import { ModelConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { logger } from '../utils';

/**
 * Get config path (same as Python version)
 */
export function getConfigPath(): string {
    return path.join(process.env.HOME || '~', '.evolt', 'config.yaml');
}

/**
 * Load model configuration from YAML file
 */
export function loadModelConfig(modelName?: string): ModelConfig {
    // Use the same config path as Python version: ~/.evolt/config.yaml
    const configPath = process.env.EVOLT_CONFIG_PATH || getConfigPath();

    let configData: any = {};

    try {
        if (fs.existsSync(configPath)) {
            const fileContent = fs.readFileSync(configPath, 'utf8');
            configData = yaml.parse(fileContent);
        } else {
            logger.warn(`Config file not found at ${configPath}, using defaults`);
            // Fallback to default configuration
            configData = getDefaultConfig();
        }
    } catch (error) {
        logger.warn(`Failed to load config from ${configPath}, using defaults:`, error);
        configData = getDefaultConfig();
    }

    // Get model-specific configuration
    const models = configData.models || {};
    const defaultModel = modelName || configData.defaultModel || 'deepseek';

    const modelConfig = models[defaultModel] || models.deepseek || getDefaultModelConfig();

    // Extract params if exists (to match Python version)
    const params = modelConfig.params || {};

    return {
        provider: modelConfig.provider || 'openai',
        model: modelConfig.model || 'gpt-3.5-turbo',
        contextWindowTokens: modelConfig.contextWindowTokens || 4096,
        maxOutputTokens: params.maxCompletionTokens || params.maxTokens || modelConfig.maxOutputTokens || 1024,
        temperature: params.temperature || modelConfig.temperature || 0.7,
        topP: modelConfig.topP || 0.9,
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
        ...modelConfig,
    };
}

/**
 * Get default configuration when no config file is found
 */
function getDefaultConfig(): any {
    return {
        defaultModel: 'deepseek',
        models: {
            deepseek: getDefaultModelConfig(),
            openai: {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                contextWindowTokens: 4096,
                maxOutputTokens: 1024,
                temperature: 0.7,
                topP: 0.9,
            },
            anthropic: {
                provider: 'anthropic',
                model: 'claude-3-sonnet-20240229',
                contextWindowTokens: 200000,
                maxOutputTokens: 4096,
                temperature: 0.7,
                topP: 0.9,
            },
        },
    };
}

/**
 * Get default model configuration for DeepSeek
 */
function getDefaultModelConfig(): any {
    return {
        provider: 'deepseek',
        model: 'deepseek-chat',
        contextWindowTokens: 32768,
        maxOutputTokens: 4096,
        temperature: 0.7,
        topP: 0.9,
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    };
}

/**
 * Convert type names to OpenAI format for function calling
 */
export function convertTypeNameToOpenai(typeName: string): string {
    const typeMap: { [key: string]: string } = {
        str: 'string',
        string: 'string',
        int: 'integer',
        integer: 'integer',
        float: 'number',
        number: 'number',
        bool: 'boolean',
        boolean: 'boolean',
        list: 'array',
        array: 'array',
        dict: 'object',
        object: 'object',
    };

    return typeMap[typeName.toLowerCase()] || 'string';
}
