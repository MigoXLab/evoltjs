/**
 * State module exports
 *
 * Contains agent state persistence and session management.
 */

export {
    StateRecordType,
    StateRecord,
    SessionMeta,
    AgentStateStore,
    createStateRecord,
} from './store';

export { JsonlAgentStateStore } from './jsonlStore';

export {
    useSessionId,
    getOrCreateSessionId,
    getSessionId,
    isNewSession,
    resetSessionId,
    shouldSkipExecutorRestore,
    enableStateStore,
    getGlobalStore,
    isPersistenceEnabled,
    setAgentName,
    getAgentName,
    resetAgentName,
} from './context';

export { persistentState, agentAutoRestore } from './decorator';
