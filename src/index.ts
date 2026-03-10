/**
 * evoltagent - TypeScript implementation of the Evolt Agent framework
 *
 * Main entry point for the library
 */

// IMPORTANT: Import tools first to ensure decorator registration happens before Agent export
import './tools';

export { Agent } from './core/agent';
export { Model } from './core/model';
export { AgentConfig } from './core/agentConfig';

// Schema exports
export { AnyMessage, AssistantMessage, ToolMessage, UserMessage } from './schemas/message';

// Runtime: Memory exports (moved from memory/ to runtime/memory/)
export { MessageHistory } from './runtime/memory';

// Runtime: Executors exports
export {
    LocalToolExecutor,
    getCurrentExecutor,
    setCurrentExecutor,
    ToolExecutorProtocol,
    ExecutorStatus,
} from './runtime/executors';

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
} from './tools';

// Orchestrator exports
export { BaseOrchestrator, CodingOrchestrator } from './runtime/orchestrator';

// Config exports
export { loadModelConfig } from './configs/configLoader';
export * from './configs/constants';
export * from './configs/paths';
export * from './configs/settings';

// Type exports
export * from './types';

// Logger export
export { default as logger } from './utils/logger';
