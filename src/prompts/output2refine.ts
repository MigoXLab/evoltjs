/**
 * Output-to-refine prompts
 *
 * Translated from Python evolt/prompts/output2refine.py
 */

// TODO: 框架设计占位，后续实现并补充测试验证
export const OUTPUT2REFINE_PROMPT = `
You are a helpful assistant that helps to refine the output.

The output is:
{output}

The judgement of the output is:
{judgement}

Please refine the output based on the feedback.
`;
