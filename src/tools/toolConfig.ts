/**
 * Tool configuration types
 * TypeScript-native way to define tool descriptions
 */

/**
 * Tool parameter configuration
 */
export interface ToolParam {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
}

/**
 * Tool return configuration
 */
export interface ToolReturn {
    type: string;
    description: string;
}

/**
 * Tool method configuration
 */
export interface ToolMethodConfig {
    description: string;
    params?: ToolParam[];
    returns?: ToolReturn;
    examples?: string[];
}

/**
 * Complete tool configuration
 * Key is the method name (e.g., 'execute')
 */
export type ToolConfig = Record<string, ToolMethodConfig>;
