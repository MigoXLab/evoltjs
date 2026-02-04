/**
 * Tools prompts and output format templates
 *
 * Converts Python's prompts/tools.py to TypeScript
 */

export const REFLECT_OUTPUT_FORMAT_PROMPT = `**Reflection Prompt: Output Format Error**  
Your output does not follow the required XML format:  
<OutputFormat>  
<ToolName.method_name><arg1_name>value1</arg1_name><arg2_name>value2</arg2_name></ToolName.method_name>  
</OutputFormat>  

Your erroneous output:  
{output_text}  

Please analyze the format discrepancies and re-output, ensuring:  

- Use the correct XML tag structure  
- All tags are properly closed  
- Parameter values are placed within the corresponding tags  

Re-output:  
`;

/**
 * Simplified output format prompt (aligned with Python 0.2.2)
 *
 * This version removes the task classification (Generative/Analytical/Operational)
 * and uses a unified react-style format.
 */
export const OUTPUT_FORMAT_PROMPT = `<OutputFormat>

You should use one tool or multiple tools (depends on your task), follow the format below, replace the <ToolName.method_name> and <args_name> with the actual tool name.

Thought: ...
Action: <ToolName1.method_name1><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName1.method_name1>

**YOUR OUTPUT MUST INCLUDE THE ACTUAL <args_name> AND <args_value>!!!**
**If the task is completed, simply return the completion information like <TaskCompletion>your_completion_information</TaskCompletion>, No any tool call should be included.**
</OutputFormat>
`;

/**
 * Tools prompt template (new name aligned with Python 0.2.2)
 *
 * Placeholders:
 * - {available_tools}: List of available tool names
 * - {desc_of_tools}: Descriptions of available tools
 * - {output_format}: Output format instructions
 */
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

/**
 * System tools prompt template (legacy name, kept for backward compatibility)
 *
 * @deprecated Use TOOLS_PROMPT instead. This is an alias with camelCase placeholders.
 *
 * Placeholders:
 * - {availableSystemTools}: List of available tool names
 * - {descOfSystemTools}: Descriptions of available tools
 * - {outputFormat}: Output format instructions
 */
export const SYSTEM_TOOLS_PROMPT = `
## System Tools And System Tools Call Format

System Tools are represented by a predefined XML-like syntax structure. This structure encapsulates parameter lists within tags such as \`<ToolName.method_name>\`.
By identifying and matching keywords inside these tags, the system automatically parses the target tool name and its corresponding input parameter values to execute subsequent tool calls.

### Available System Tools
{availableSystemTools}

### Description of Available System Tools
{descOfSystemTools}

### System Tools Output Format
{outputFormat}
`;

/**
 * Legacy output format prompt with task classification
 *
 * @deprecated This version includes task classification (Generative/Analytical/Operational)
 * which has been removed in Python 0.2.2. Use OUTPUT_FORMAT_PROMPT instead.
 */
export const OUTPUT_FORMAT_PROMPT_LEGACY = `<System Tools OutputFormat>

We have three types of tasks: Generative Tasks, Analytical Tasks, and Operational Tasks.
You should choose the appropriate task type based on the task description.

#### Generative Tasks Output Format
<Generative Tasks Purpose>Create Something New</Generative Tasks Purpose> 

<Generative Tasks Definition>
These tasks focus on creating new artifacts from scratch, such as text, code, designs, or configurations. 
The model synthesizes information and produces original outputs.
</Generative Tasks Definition>

<Generative Tasks Output Format>
Output a sequence of tool calls in the format below. Replace <ToolName.method_name> and <args_name> with actual tool and parameter names.

You may interleave tool calls with reasoning or explanations as needed:

[Your reasoning or explanation here...]
<ToolName.method_name><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName.method_name>

[Additional thoughts or context...]
<ToolName2.method_name2><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName2.method_name2>
...
</Generative Tasks Output Format>


### Analytical Tasks Output Format
<Analytical Tasks Purpose>Understand, Diagnose & Evaluate Existing Information</Analytical Tasks Purpose> 

<Analytical Tasks Definition>
Analytical tasks focus on understanding, decomposing, diagnosing, and evaluating existing information.
They include requirement analysis, code and system comprehension, quality evaluation, debugging and root-cause analysis, and data or behavioral analysis.
Such tasks produce structured insights and decisions that guide subsequent generative or operational steps.
</Analytical Tasks Definition>

<Analytical Tasks Output Format>
You should fellow the format below, replace the <ToolName.method_name> and <args_name> with the actual name.

Thoughts: ...
ToolCall: <ToolName.method_name><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName.method_name>
// stop ToolCall here, and wait for the Observation of the ToolCall.

</Analytical Tasks Output Format>

### Operational Tasks Output Format

<Operational Tasks Purpose>Act & Operate Tools</Operational Tasks Purpose> 

<Operational Tasks Definition>
These tasks involve performing concrete actions through tools, systems, or commands. 
The focus is on executing operations rather than generating or analyzing content.
</Operational Tasks Definition>

<Operational Tasks Output Format>
You should follow the format below, replace the <ToolName.method_name> and <args_name> with the actual name.

<ToolName.method_name><args_name1>args_value1</args_name1><args_name2>args_value2</args_name2>...</ToolName.method_name>
</Operational Tasks Output Format>

**YOUR OUTPUT MUST INCLUDE THE ACTUAL <args_name> AND <args_value>!!!**
**If the task is completed, simply return the completion information like <TaskCompletion>your_completion_information</TaskCompletion>, No any tool call should be included.**
</System Tools OutputFormat>
`;
