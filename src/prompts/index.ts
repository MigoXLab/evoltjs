/**
 * Prompts module exports
 *
 * Translated from Python evolt/prompts/
 */
export { OUTPUT_FORMAT_PROMPT, TOOLS_PROMPT } from './tools';
export {
    CRITIC_SYSTEM_PROMPT as REFLECTION_CRITIC_SYSTEM_PROMPT,
    ACTOR_SYSTEM_PROMPT,
} from './reflection';
export { OUTPUT2REFINE_PROMPT } from './output2refine';
export { OBSERVATION_FORMAT_PROMPT } from './observation';
export { CRITIC_SYSTEM_PROMPT, buildEvaluationPrompt } from './critic';
