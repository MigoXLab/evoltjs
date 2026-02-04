/**
 * Agent State Store Protocol and Record Model
 *
 * Defines the interface for agent state persistence backends.
 *
 * Corresponds to Python's runtime/state/store.py
 */

/**
 * Record type for state persistence
 */
export type StateRecordType = 'message' | 'tool_call' | 'instruction' | 'system' | 'completion';

/**
 * A single state record for persistence
 */
export interface StateRecord {
    /**
     * Session identifier
     */
    sessionId: string;

    /**
     * Agent name
     */
    agentName: string;

    /**
     * Unix timestamp when the record was created
     */
    timestamp: number;

    /**
     * Record type
     */
    type: StateRecordType;

    /**
     * The actual payload data (serialized message or toolcall)
     */
    data: Record<string, any>;
}

/**
 * Session metadata information
 */
export interface SessionMeta {
    /**
     * Session identifier
     */
    sessionId: string;

    /**
     * Session creation timestamp (Unix timestamp)
     */
    timestamp: number;

    /**
     * First instruction content for display (optional)
     */
    firstInstruction?: string;

    /**
     * List of agent names that have records in this session
     */
    agents: string[];
}

/**
 * Protocol interface for agent state persistence backends
 *
 * All implementations must provide async append, getAll, and clear methods.
 * The sessionId + agentName combination uniquely identifies a record set.
 */
export interface AgentStateStore {
    /**
     * Append a single state record
     *
     * @param sessionId - Session identifier
     * @param agentName - Agent name
     * @param record - Record data containing type, data, and timestamp
     */
    append(sessionId: string, agentName: string, record: Omit<StateRecord, 'sessionId' | 'agentName'>): Promise<void>;

    /**
     * Get all records for a session/agent combination
     *
     * @param sessionId - Session identifier
     * @param agentName - Agent name
     * @returns List of StateRecord objects ordered by timestamp
     */
    getAll(sessionId: string, agentName: string): Promise<StateRecord[]>;

    /**
     * Clear all records for a session/agent combination
     *
     * @param sessionId - Session identifier
     * @param agentName - Agent name
     */
    clear(sessionId: string, agentName: string): Promise<void>;

    /**
     * Export records to a JSON file
     *
     * @param sessionId - Session identifier
     * @param agentName - Agent name
     * @param filename - Output file path
     */
    exportJson(sessionId: string, agentName: string, filename: string): void;

    /**
     * Import records from a JSON file
     *
     * @param filename - Input file path
     */
    importJson(filename: string): void;

    /**
     * Delete the last n records for a session/agent combination
     *
     * Records are ordered by timestamp, and the last n records
     * (most recent) will be deleted.
     *
     * @param sessionId - Session identifier
     * @param agentName - Agent name
     * @param n - Number of records to delete from the end
     * @returns Number of records actually deleted
     */
    deleteLastN(sessionId: string, agentName: string, n: number): Promise<number>;

    /**
     * Check if a session exists (regardless of agent)
     *
     * This method checks if any records exist for the given sessionId,
     * without filtering by agentName. Useful for distinguishing between
     * "session does not exist" and "session exists but agent has no records".
     *
     * @param sessionId - Session identifier
     * @returns True if any records exist for this sessionId, False otherwise
     */
    sessionExists(sessionId: string): Promise<boolean>;

    /**
     * List all available sessions
     *
     * @returns List of SessionMeta objects containing session metadata
     */
    listSessions(): SessionMeta[];

    /**
     * Get list of agent names that have records in a session
     *
     * @param sessionId - Session identifier
     * @returns List of unique agent names in this session
     */
    getAgentsInSession(sessionId: string): Promise<string[]>;
}

/**
 * Create a StateRecord from data
 */
export function createStateRecord(
    sessionId: string,
    agentName: string,
    type: StateRecordType,
    data: Record<string, any>
): StateRecord {
    return {
        sessionId,
        agentName,
        timestamp: Date.now() / 1000,
        type,
        data,
    };
}
