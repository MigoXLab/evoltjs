/**
 * evoltagent - TypeScript implementation of the Evolt Agent framework
 *
 * Main entry point for the library
 */

// IMPORTANT: Import tools first to ensure decorator registration happens before Agent export
import './tools';

// Core exports (moved from root to core/)
export { Agent } from './core/agent';
export { Model, ModelResponse } from './core/model';
export { AgentConfig, ToolExecutorProtocol } from './core/agentConfig';

// Schema exports
export { Message, Toolcall, ToolcallState, ToolcallType, Feedback } from './schemas';

// Runtime: Memory exports (moved from memory/ to runtime/memory/)
export { MessageHistory } from './runtime/memory';

// Runtime: Orchestrator exports (renamed from environment/)
export {
    InstructionType,
    BaseOrchestrator,
    CodingOrchestrator,
    ReflexionOrchestrator,
    ReflexionOrchestratorOptions,
    ReflexionResult,
    CriticAgentConfig,
    ActorAgentConfig,
    // Backward-compatible aliases
    BaseEnvironment,
    CodingEnvironment,
} from './runtime/orchestrator';

// Runtime: Environment exports (NEW - for Reflexion)
export { Environment, EnvironmentOptions } from './runtime/environment';

// Runtime: Executors exports
export {
    ToolcallSource,
    GeneratedToolcallProtocol,
    ExecutedToolcallProtocol,
    ExecutorStatus,
    createGeneratedToolcall,
    createExecutedToolcall,
    _executeSingleTool,
    executeToolsSequential,
    executeToolsParallel,
    LocalToolExecutor,
    getCurrentExecutor,
    setCurrentExecutor,
} from './runtime/executors';

// Runtime: State exports
export {
    StateRecordType,
    StateRecord,
    SessionMeta,
    AgentStateStore,
    createStateRecord,
    JsonlAgentStateStore,
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
    persistentState,
    agentAutoRestore,
} from './runtime/state';

// Hooks exports
export { PostProcessor } from './hooks';

// Tool exports
export {
    SystemToolStore,
    FunctionCallingStore,
    UserToolStore,
    tools,
    registerAgentAsTool,
    // Tool classes
    ThinkTool,
    CommandLineTool,
    FileEditor,
    ExtendStateMachineTool,
    ApiTool,
    Reply2HumanTool,
    TodoListTool,
    WriteUIDesignDocument,
    ReflectTool,
    SkillsTool,
    GitTool,
    ImageTool,
    PatchTool,
} from './tools';

// Prompts exports
export { TOOLS_PROMPT, SYSTEM_TOOLS_PROMPT, OUTPUT_FORMAT_PROMPT, REFLECT_OUTPUT_FORMAT_PROMPT } from './prompts';

// Config exports
export { loadModelConfig } from './configs/configLoader';
export * from './configs/constants';
export * from './configs/paths';
export * from './configs/settings';

// Type exports
export * from './types';

// Utility exports
export { deprecated, isSupportedImageFile, readImage, areadImage, ImageContent } from './utils';

// Logger export
export { default as logger } from './utils/logger';
