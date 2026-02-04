/**
 * evoltagent - TypeScript implementation of the Evolt Agent framework
 *
 * Main entry point for the library
 */

// IMPORTANT: Import tools first to ensure decorator registration happens before Agent export
import './tools';

export { Agent } from './core/agent';
export { Model } from './core/model';
export { Message, Toolcall, ToolcallState, ToolcallType } from './schemas';
export { MessageHistory } from './memory/messageHistory';

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

// Environment exports
export { BaseEnvironment, CodingEnvironment } from './environment';

// Config exports
export { loadModelConfig } from './configs/configLoader';
export * from './configs/constants';
export * from './configs/paths';
export * from './configs/settings';

// Type exports
export * from './types';

// Logger export
export { default as logger } from './utils/logger';
