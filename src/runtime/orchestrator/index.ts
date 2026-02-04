/**
 * Orchestrator module exports
 *
 * Contains multi-agent coordination:
 * - BaseOrchestrator: Base class for multi-agent orchestration (was BaseEnvironment)
 * - CodingOrchestrator: Orchestrator for coding tasks (was CodingEnvironment)
 * - ReflexionOrchestrator: Self-improvement loop orchestrator
 */

export { InstructionType, BaseOrchestrator, BaseEnvironment } from './base';
export { CodingOrchestrator, CodingEnvironment } from './coding';
// export {
//     ReflexionOrchestrator,
//     ReflexionOrchestratorOptions,
//     ReflexionResult,
//     CriticAgentConfig,
//     ActorAgentConfig,
// } from '../../reflexion/orchestrator';   // TODO: Implement ReflexionOrchestrator
