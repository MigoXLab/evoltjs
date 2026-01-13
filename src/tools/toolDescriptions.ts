/**
 * Tool descriptions mapping
 *
 * Since JSDoc comments are stripped at runtime in TypeScript,
 * we need to maintain a separate mapping of tool descriptions
 */

export const TOOL_DESCRIPTIONS: Record<string, string> = {
    'ThinkTool.execute': `Use the tool to think about something when complex reasoning.

Args:
    thought (str): The thought to think about.

Returns:
    str: The complete thought result.

Examples:
    Good example:
    <ThinkTool.execute><thought> your thought here </thought></ThinkTool.execute>

    Bad example:
    <ThinkTool.execute>{"thought":"your thought here"}</ThinkTool.execute>`,

    'CommandLineTool.execute': `在后台执行bash命令（不阻塞返回结果）。

Args:
    command (str): 要执行的bash命令
    cwd (Optional[str]): 工作目录，如果为None则使用当前目录
    env (Optional[Dict[str, str]]): 环境变量字典，如果为None则使用当前环境

Returns:
    str: 后台进程启动信息，包含进程ID和PID`,

    'CommandLineTool.list': `列出所有后台进程。

Returns:
    str: 所有后台进程的信息`,

    'CommandLineTool.stop': `停止指定的后台进程。

Args:
    pid (str): 要停止的进程ID

Returns:
    str: 停止进程的结果信息`,

    'CommandLineTool.cleanup': `清理所有后台进程。

Returns:
    str: 清理结果信息`,

    'FileEditor.read': `Read content from a file.

Args:
    path (str): File path to read

Returns:
    str: File content or error message`,

    'FileEditor.write': `Write content to a file.

Args:
    path (str): File path, must include workspace directory
    content (str): Content to write

Returns:
    str: Natural language description of operation result`,

    'FileEditor.find': `Search for a pattern in a file.

Args:
    path (str): File path to search in
    pattern (str): Pattern to search for

Returns:
    str: Search results`,

    'FileEditor.find_and_replace': `Find and replace text in a file.

Args:
    path (str): File path
    find (str): Text to find
    replace (str): Text to replace with

Returns:
    str: Operation result`,

    'FileEditor.insert': `Insert text at a specific location in a file.

Args:
    path (str): File path
    line (int): Line number to insert at
    content (str): Content to insert

Returns:
    str: Operation result`,

    'ExtendStateMachineTool.write_esm': `Write extend state machine configuration to YAML file.

Args:
    path (str): Output file path
    content (str): YAML content

Returns:
    str: Operation result`,

    'ApiTool.write': `Write API definition file.

Args:
    path (str): Output file path
    content (str): API definition content

Returns:
    str: Operation result`,

    'ApiTool.generate_golang_files_from_api': `Generate Go files from API definition.

Args:
    api_file (str): API definition file path

Returns:
    str: Generation result`,

    'Reply2HumanTool.reply': `Reply to human with a message.

Args:
    message (str): Message to send to human

Returns:
    str: Confirmation message`,

    'TodoListTool.write': `Write or update a todo list.

Args:
    content (str): Todo list content

Returns:
    str: Operation result`,

    'WriteUIDesignDocument.write': `Write UI design document.

Args:
    path (str): Output file path
    content (str): Design document content

Returns:
    str: Operation result`,

    'ReflectTool.reflect': `Reflect on previous actions and outcomes.

Args:
    context (str): Context to reflect on

Returns:
    str: Reflection result`,

    'SkillsTool.read_skill_description': `Read description of a specific skill.

Args:
    skill_name (str): Name of the skill

Returns:
    str: Skill description`,

    'SkillsTool.list_skills': `List all available skills.

Returns:
    str: List of skill names`,
};
