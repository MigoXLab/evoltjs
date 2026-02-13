/**
 * Reflection-related prompts
 *
 * Translated from Python evolt/prompts/reflection.py
 */

export const CRITIC_SYSTEM_PROMPT =
    'You will be given a {task_type} implementation and a series of {feedback_type}. Your goal is to write a few sentences to explain why your implementation is wrong as indicated by the {feedback_type}. You will need this as a hint when you try again later. Only provide the few sentence description in your answer, not the implementation.\n\n-----';

export const ACTOR_SYSTEM_PROMPT =
    'You will be given your past {task_type} implementation, a series of {feedback_type}, and a hint to change the implementation appropriately. Write your full implementation.';
