/**
 * Application constants
 *
 * Converts Python's constants.py to TypeScript
 */

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    MODEL: 'deepseek',
    PROVIDER: 'deepseek',
    CONTEXT_WINDOW: 32768,
    MAX_OUTPUT_TOKENS: 4096,
    TEMPERATURE: 0.7,
    TOP_P: 0.9,
};

/**
 * Tool-related constants
 */
export const TOOL_CONSTANTS = {
    SYSTEM_TOOL_PREFIX: 'SystemTool.',
    USER_TOOL_PREFIX: 'UserTool.',
    AGENT_TOOL_PREFIX: 'Agent.',
    MCP_TOOL_PREFIX: 'MCP.',
};

/**
 * Message role constants
 */
export const MESSAGE_ROLES = {
    SYSTEM: 'system',
    USER: 'user',
    ASSISTANT: 'assistant',
} as const;

/**
 * Tool call types
 */
export const TOOL_CALL_TYPES = {
    SYSTEM: 'system',
    USER: 'user',
} as const;

/**
 * Environment variables
 */
export const ENV_VARS = {
    EVOLT_CONFIG_PATH: 'EVOLT_CONFIG_PATH',
    DEEPSEEK_API_KEY: 'DEEPSEEK_API_KEY',
    DEEPSEEK_BASE_URL: 'DEEPSEEK_BASE_URL',
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
    CONFIG_LOAD_FAILED: 'Failed to load configuration',
    MODEL_NOT_FOUND: 'Model configuration not found',
    TOOL_NOT_REGISTERED: 'Tool not registered in tool store',
    INVALID_MESSAGE_FORMAT: 'Invalid message format',
    TOOL_EXECUTION_FAILED: 'Tool execution failed',
};

/**
 * Logging levels
 */
export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
} as const;
