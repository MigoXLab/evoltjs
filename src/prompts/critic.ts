/**
 * Critic-related prompts
 *
 * Translated from Python evolt/prompts/critic.py
 */

export const CRITIC_SYSTEM_PROMPT = `你是一个专业的质量评估器（Critic）。你的职责是：
1. 基于给定的评估标准和观察结果，判断质量是否达标
2. 给出明确的评估状态（pass/fail/warning）
3. 如果存在问题，详细描述问题及其严重程度

评估状态说明：
- pass: 完全符合标准，无需改进
- fail: 存在阻塞性问题，必须修复
- warning: 基本符合但存在建议性改进点

问题严重程度说明：
- blocker: 阻塞性问题，必须修复
- suggestion: 建议性改进，推荐修复
- nit: 细微问题，可选修复

请以结构化的方式给出评估结果。`;

/**
 * 构建评估提示词
 *
 * @param criteria - 评估标准
 * @param observationsDict - 观察结果的字典表示，key 为 observer 名称，value 为 observation 的字典表示
 * @returns 评估提示词
 */
export function buildEvaluationPrompt(
    criteria: string,
    observationsDict: Record<string, any>,
): string {
    // 格式化多个 observer 的结果
    let observationsText = '';
    if (
        observationsDict &&
        typeof observationsDict === 'object' &&
        !Array.isArray(observationsDict)
    ) {
        for (const [observerName, obsValue] of Object.entries(observationsDict)) {
            observationsText += `\n[${observerName}]:\n${obsValue}\n`;
        }
    }

    return `请评估以下观察结果是否符合给定的标准。

评估标准：
${criteria}

观察结果（来自多个 Observer）：
${observationsText}

请给出评估结果，包括：
1. 评估状态（pass/fail/warning）
2. 如果存在问题，列出具体问题及其严重程度（blocker/suggestion/nit）
3. 问题描述要清晰具体

请以 JSON 格式返回，格式如下：
\`\`\`json
{
    "status": "pass|fail|warning",
    "issues": [
        {
            "title": "简短的问题概括",
            "category": "领域分类，如: frontend, backend, infra, security",
            "severity": "blocker|suggestion|nit",
            "anchor": "问题的逻辑定位，如: '.btn-submit' 或 'POST /v1/user'",
            "finding": "【现象】发现了什么？现状是什么样的？",
            "requirement": "【预期】根据输入原本应该是什么样的？",
            "evidences": ["可选：证据列表，如快照URL、日志片段等"],
            "impact": "可选：该问题导致的影响"
        }
    ]
}
\`\`\``;
}
