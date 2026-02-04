/**
 * JSONL Agent State Store Implementation
 *
 * File-based persistence using JSON Lines format for append-friendly storage.
 *
 * Corresponds to Python's runtime/state/jsonl_store.py
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentStateStore, StateRecord, SessionMeta, StateRecordType } from './store';
import { logger } from '../../utils';

/**
 * JSONL file-based state store implementation
 *
 * Stores records as JSON Lines (one JSON object per line) for efficient
 * append operations. Each session gets its own file named by session_id.
 *
 * File naming: {session_id}.jsonl
 */
export class JsonlAgentStateStore implements AgentStateStore {
    private storageDir: string;
    private maxSessions: number;
    private sessionFileMap: Map<string, string> = new Map();

    /**
     * Create a new JSONL state store
     *
     * @param storageDir - Directory to store JSONL files. Defaults to ~/.evolt/state/
     * @param maxSessions - Maximum number of session files to keep. Older sessions are automatically cleaned up.
     */
    constructor(storageDir?: string, maxSessions: number = 3) {
        this.storageDir = storageDir || path.join(os.homedir(), '.evolt', 'state');
        this.maxSessions = maxSessions;

        // Ensure storage directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        // Load existing session mappings
        this._loadSessionMap();
    }

    /**
     * Load existing session_id to file mappings from disk
     */
    private _loadSessionMap(): void {
        try {
            const files = fs.readdirSync(this.storageDir);
            for (const file of files) {
                if (file.endsWith('.jsonl')) {
                    const sessionId = path.basename(file, '.jsonl');
                    this.sessionFileMap.set(sessionId, path.join(this.storageDir, file));
                }
            }
        } catch (error) {
            logger.warn(`Failed to load session map: ${error}`);
        }
    }

    /**
     * Get existing file path for session or create a new one
     */
    private _getOrCreateFilePath(sessionId: string): string {
        if (this.sessionFileMap.has(sessionId)) {
            return this.sessionFileMap.get(sessionId)!;
        }

        const filePath = path.join(this.storageDir, `${sessionId}.jsonl`);
        this.sessionFileMap.set(sessionId, filePath);
        logger.debug(`Created new session file: ${filePath} for session=${sessionId}`);

        // Cleanup old sessions after new session is created
        this._cleanupOldSessions();

        return filePath;
    }

    /**
     * Cleanup old session files to maintain max_sessions limit
     */
    private _cleanupOldSessions(): number {
        try {
            const files = fs.readdirSync(this.storageDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => path.join(this.storageDir, f));

            // Get files with their latest timestamps
            const filesWithTs: Array<{ path: string; timestamp: number }> = [];
            for (const filePath of files) {
                const timestamp = this._getLatestTimestamp(filePath);
                filesWithTs.push({ path: filePath, timestamp });
            }

            // Sort by timestamp descending (most recent first)
            filesWithTs.sort((a, b) => b.timestamp - a.timestamp);

            // Delete files beyond max_sessions limit
            let deleted = 0;
            for (let i = this.maxSessions; i < filesWithTs.length; i++) {
                const filePath = filesWithTs[i].path;
                try {
                    // Remove from session map
                    const sessionId = path.basename(filePath, '.jsonl');
                    this.sessionFileMap.delete(sessionId);

                    fs.unlinkSync(filePath);
                    deleted++;
                    logger.debug(`Deleted old session file: ${filePath}`);
                } catch (error) {
                    logger.warn(`Failed to delete ${filePath}: ${error}`);
                }
            }

            if (deleted > 0) {
                logger.info(`Cleaned up ${deleted} old session files`);
            }

            return deleted;
        } catch (error) {
            logger.error(`Failed to cleanup old sessions: ${error}`);
            return 0;
        }
    }

    /**
     * Get the latest record timestamp from a session file
     */
    private _getLatestTimestamp(filePath: string): number {
        try {
            if (!fs.existsSync(filePath)) {
                return 0;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());

            if (lines.length === 0) {
                return 0;
            }

            // Parse last line to get timestamp
            const lastLine = lines[lines.length - 1];
            try {
                const record = JSON.parse(lastLine);
                return record.timestamp || 0;
            } catch {
                return 0;
            }
        } catch (error) {
            return 0;
        }
    }

    async append(
        sessionId: string,
        agentName: string,
        record: Omit<StateRecord, 'sessionId' | 'agentName'>
    ): Promise<void> {
        const filePath = this._getOrCreateFilePath(sessionId);

        const fullRecord: StateRecord = {
            sessionId,
            agentName,
            ...record,
        };

        const line = JSON.stringify(fullRecord) + '\n';

        await fs.promises.appendFile(filePath, line, 'utf-8');
        logger.debug(`Appended record to session ${sessionId}: type=${record.type}`);
    }

    async getAll(sessionId: string, agentName: string): Promise<StateRecord[]> {
        const filePath = this.sessionFileMap.get(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());
            const records: StateRecord[] = [];

            for (const line of lines) {
                try {
                    const record = JSON.parse(line) as StateRecord;
                    if (record.agentName === agentName) {
                        records.push(record);
                    }
                } catch {
                    logger.warn(`Failed to parse record line: ${line}`);
                }
            }

            // Sort by timestamp
            records.sort((a, b) => a.timestamp - b.timestamp);

            return records;
        } catch (error) {
            logger.error(`Failed to read session file: ${error}`);
            return [];
        }
    }

    async clear(sessionId: string, agentName: string): Promise<void> {
        const filePath = this.sessionFileMap.get(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return;
        }

        try {
            // Read all records
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());

            // Keep only records from other agents
            const remainingLines: string[] = [];
            for (const line of lines) {
                try {
                    const record = JSON.parse(line) as StateRecord;
                    if (record.agentName !== agentName) {
                        remainingLines.push(line);
                    }
                } catch {
                    // Keep unparseable lines
                    remainingLines.push(line);
                }
            }

            // Rewrite file
            await fs.promises.writeFile(filePath, remainingLines.join('\n') + '\n', 'utf-8');
            logger.debug(`Cleared records for agent ${agentName} in session ${sessionId}`);
        } catch (error) {
            logger.error(`Failed to clear records: ${error}`);
        }
    }

    exportJson(sessionId: string, agentName: string, filename: string): void {
        // Sync wrapper for async operation
        const filePath = this.sessionFileMap.get(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            fs.writeFileSync(filename, '[]', 'utf-8');
            return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.trim());
        const records: StateRecord[] = [];

        for (const line of lines) {
            try {
                const record = JSON.parse(line) as StateRecord;
                if (record.agentName === agentName) {
                    records.push(record);
                }
            } catch {
                // Skip unparseable lines
            }
        }

        fs.writeFileSync(filename, JSON.stringify(records, null, 2), 'utf-8');
        logger.info(`Exported ${records.length} records to ${filename}`);
    }

    importJson(filename: string): void {
        if (!fs.existsSync(filename)) {
            logger.warn(`Import file not found: ${filename}`);
            return;
        }

        const content = fs.readFileSync(filename, 'utf-8');
        const records = JSON.parse(content) as StateRecord[];

        // Group by sessionId
        const bySession = new Map<string, StateRecord[]>();
        for (const record of records) {
            if (!bySession.has(record.sessionId)) {
                bySession.set(record.sessionId, []);
            }
            bySession.get(record.sessionId)!.push(record);
        }

        // Write to files
        for (const [sessionId, sessionRecords] of bySession) {
            const filePath = this._getOrCreateFilePath(sessionId);
            const lines = sessionRecords.map(r => JSON.stringify(r));
            fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
        }

        logger.info(`Imported ${records.length} records from ${filename}`);
    }

    async deleteLastN(sessionId: string, agentName: string, n: number): Promise<number> {
        const filePath = this.sessionFileMap.get(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return 0;
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());

            // Parse and filter records
            const agentRecordIndices: number[] = [];
            const parsedRecords: Array<{ line: string; record: StateRecord | null }> = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                try {
                    const record = JSON.parse(line) as StateRecord;
                    parsedRecords.push({ line, record });
                    if (record.agentName === agentName) {
                        agentRecordIndices.push(i);
                    }
                } catch {
                    parsedRecords.push({ line, record: null });
                }
            }

            // Determine which records to delete
            const indicesToDelete = new Set(agentRecordIndices.slice(-n));
            const deleted = indicesToDelete.size;

            // Keep records not in deletion set
            const remainingLines = parsedRecords
                .filter((_, i) => !indicesToDelete.has(i))
                .map(r => r.line);

            // Rewrite file
            await fs.promises.writeFile(filePath, remainingLines.join('\n') + '\n', 'utf-8');
            logger.debug(`Deleted ${deleted} records for agent ${agentName} in session ${sessionId}`);

            return deleted;
        } catch (error) {
            logger.error(`Failed to delete records: ${error}`);
            return 0;
        }
    }

    async sessionExists(sessionId: string): Promise<boolean> {
        const filePath = this.sessionFileMap.get(sessionId);
        return filePath !== undefined && fs.existsSync(filePath);
    }

    listSessions(): SessionMeta[] {
        const sessions: SessionMeta[] = [];

        for (const [sessionId, filePath] of this.sessionFileMap) {
            if (!fs.existsSync(filePath)) {
                continue;
            }

            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.trim().split('\n').filter(l => l.trim());

                if (lines.length === 0) {
                    continue;
                }

                // Get first instruction and agents
                let firstInstruction: string | undefined;
                const agents = new Set<string>();
                let timestamp = 0;

                for (const line of lines) {
                    try {
                        const record = JSON.parse(line) as StateRecord;
                        agents.add(record.agentName);

                        if (timestamp === 0) {
                            timestamp = record.timestamp;
                        }

                        if (!firstInstruction && record.type === 'instruction') {
                            firstInstruction = record.data.content?.slice(0, 100);
                        }
                    } catch {
                        // Skip unparseable lines
                    }
                }

                sessions.push({
                    sessionId,
                    timestamp,
                    firstInstruction,
                    agents: Array.from(agents),
                });
            } catch (error) {
                logger.warn(`Failed to read session file ${filePath}: ${error}`);
            }
        }

        // Sort by timestamp descending
        sessions.sort((a, b) => b.timestamp - a.timestamp);

        return sessions;
    }

    async getAgentsInSession(sessionId: string): Promise<string[]> {
        const filePath = this.sessionFileMap.get(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());
            const agents = new Set<string>();

            for (const line of lines) {
                try {
                    const record = JSON.parse(line) as StateRecord;
                    agents.add(record.agentName);
                } catch {
                    // Skip unparseable lines
                }
            }

            return Array.from(agents);
        } catch (error) {
            logger.error(`Failed to read session file: ${error}`);
            return [];
        }
    }
}
