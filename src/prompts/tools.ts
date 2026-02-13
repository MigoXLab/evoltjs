/**
 * Tool-related prompts
 *
 * Translated from Python evolt/prompts/tools.py
 */

export const OUTPUT_FORMAT_PROMPT = `<OutputFormat>

You should use one tool or multiple tools (depends on your task), follow the format below, replace the <ToolName.method_name> and <args_name> with the actual tool name.

Thought: ...
Action: <ToolName1.method_name1><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName1.method_name1>

**YOUR OUTPUT MUST INCLUDE THE ACTUAL <args_name> AND <args_value>!!!**
**If the task is completed, simply return the completion information like <TaskCompletion>your_completion_information</TaskCompletion>, No any tool call should be included.**
</OutputFormat>
`;

export const TOOLS_PROMPT = `
## Tools And Tool Calls Format

Tools are represented by a predefined XML-like syntax structure. This structure encapsulates parameter lists within tags such as \`<ToolName.method_name>\`. 
By identifying and matching keywords inside these tags, the system automatically parses the target tool name and its corresponding input parameter values to execute subsequent tool calls.

### Available Tools
{available_tools}

### Description of Available Tools
{desc_of_tools}

### Output Format
{output_format}
`;
