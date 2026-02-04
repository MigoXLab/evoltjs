/**
 * Persistence Context Management
 *
 * Provides:
 * - Process-level session_id management (shared across all agents)
 * - Agent name tracking (per async context)
 * - Global store management for single-store-per-process pattern
 *
 * Corresponds to Python's runtime/state/context.py
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentStateStore } from './store';
import { JsonlAgentStateStore } from './jsonlStore';

// ---- Process-level Session ID Management ----
// A single session_id shared across all agents in the process.
// This ensures all agents in one run share the same session.

let _sessionId: string | null = null;
let _sessionIdExplicit: boolean = false;  // Whether session_id was explicitly set
let _skipExecutorRestore: boolean = false;  // Whether to skip executor restore

/**
 * Use a specific session_id for restoring a historical session.
 *
 * @param sessionId - The session ID to restore from.
 * @param options.skipExecutorRestore - If true, skip restoring executor state (tool calls).
 *
 * @throws Error if session_id has already been set
 */
export function useSessionId(sessionId: string, options?: { skipExecutorRestore?: boolean }): void {
    if (_sessionId !== null) {
        throw new Error(
            `Session ID already set to '${_sessionId}'. ` +
            `Cannot change to '${sessionId}'. Call resetSessionId() first.`
        );
    }

    _sessionId = sessionId;
    _sessionIdExplicit = true;
    _skipExecutorRestore = options?.skipExecutorRestore ?? false;
}

/**
 * Get current session_id, or auto-create one if not set.
 *
 * The same session_id is shared across the entire process runtime.
 * Auto-created sessions will not attempt to restore.
 */
export function getOrCreateSessionId(): string {
    if (_sessionId === null) {
        _sessionId = uuidv4();
        _sessionIdExplicit = false;  // auto-generated
    }
    return _sessionId;
}

/**
 * Get current session_id, or null if not set (will not auto-create).
 */
export function getSessionId(): string | null {
    return _sessionId;
}

/**
 * Check if this is a new session (auto-created, no restore needed).
 */
export function isNewSession(): boolean {
    return !_sessionIdExplicit;
}

/**
 * Reset session_id (for testing or when starting a new session).
 */
export function resetSessionId(): void {
    _sessionId = null;
    _sessionIdExplicit = false;
    _skipExecutorRestore = false;
}

/**
 * Check if executor restore should be skipped during session recovery.
 */
export function shouldSkipExecutorRestore(): boolean {
    return _skipExecutorRestore;
}

// ---- Global Store Management ----
// A single store instance shared across all agents in the process.

let _globalStore: AgentStateStore | null = null;

/**
 * Enable the global state store for persistence.
 *
 * Call this once at application startup to set up persistence.
 * All agents will automatically use this store.
 *
 * @param store - A pre-configured store instance. If not provided, creates a default JSONL store.
 * @param options.backend - Store backend type: "jsonl". Used if store is null.
 * @param options.storageDir - Directory for state storage. Defaults to ~/.evolt/state.
 * @returns The configured global store instance.
 */
export function enableStateStore(
    store?: AgentStateStore | null,
    options?: { backend?: 'jsonl'; storageDir?: string }
): AgentStateStore | null {
    if (store !== undefined) {
        _globalStore = store;
    } else if (options?.backend === 'jsonl' || !options?.backend) {
        _globalStore = new JsonlAgentStateStore(options?.storageDir);
    } else {
        _globalStore = null;
    }

    return _globalStore;
}

/**
 * Get the global persistence store.
 *
 * @returns The global store instance, or null if not configured.
 */
export function getGlobalStore(): AgentStateStore | null {
    return _globalStore;
}

/**
 * Check if persistence is enabled globally.
 *
 * @returns True if a global store is configured.
 */
export function isPersistenceEnabled(): boolean {
    return _globalStore !== null;
}

// ---- Agent Name Context ----
// Tracks the current agent name. Since Node.js doesn't have native ContextVars like Python,
// we use a simple process-level variable. For proper async context tracking, consider
// using AsyncLocalStorage from 'async_hooks'.

let _agentName: string | null = null;

/**
 * Set the current agent name.
 *
 * @param agentName - Agent name to set
 */
export function setAgentName(agentName: string): void {
    _agentName = agentName;
}

/**
 * Get the current agent name.
 *
 * @returns Current agent name, or null if not set
 */
export function getAgentName(): string | null {
    return _agentName;
}

/**
 * Reset the agent name.
 */
export function resetAgentName(): void {
    _agentName = null;
}
