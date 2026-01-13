/**
 * Context management for ToolcallManager
 * Separated to avoid circular dependencies
 */

import { AsyncLocalStorage } from 'async_hooks';

// Use generic type to avoid circular dependency with ToolcallManager
export const toolcallManagerContext = new AsyncLocalStorage<any>();

/**
 * Get current ToolcallManager instance
 */
export function getCurrentManager(): any | null {
    return toolcallManagerContext.getStore() || null;
}

/**
 * Run function within ToolcallManager context
 */
export function runWithManager<T>(manager: any, fn: () => Promise<T>): Promise<T> {
    return toolcallManagerContext.run(manager, fn);
}
