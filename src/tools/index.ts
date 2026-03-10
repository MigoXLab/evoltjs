/**
 * Tools module exports
 *
 * IMPORTANT: We must import all tool classes here to trigger their decorator registration
 * This ensures tools are registered to SystemToolStore/FunctionCallingStore before Agent initialization
 */

// Import tool stores first
export { SystemToolStore, FunctionCallingStore, UserToolStore } from './toolStore';

// Export unified decorator
export { tools, registerAgentAsTool } from './toolRegister';

// Also export tool configuration types
export * from './toolConfig';

// Import all tool classes to trigger decorator registration
// These imports MUST happen before any Agent is created
import './think';
import './cmdTool';
import './fileTool';
import './esmTool';
import './apiTool';
import './reply2human';
import './todoList';
import './designUI';
import './reflect';
import './skills';
import './gitTool';
import './imageTool';
import './patchTool';

// Re-export tool classes for external use
export { ThinkTool } from './think';
export { CommandLineTool } from './cmdTool';
export { FileEditor } from './fileTool';
export { ExtendStateMachineTool } from './esmTool';
export { ApiTool } from './apiTool';
export { Reply2HumanTool } from './reply2human';
export { TodoListTool } from './todoList';
export { WriteUIDesignDocument } from './designUI';
export { ReflectTool } from './reflect';
export { SkillsTool } from './skills';
export { GitTool } from './gitTool';
export { ImageTool } from './imageTool';
export { PatchTool } from './patchTool';
