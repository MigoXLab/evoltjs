export interface AgentToolcall {
  tool_name: string;
  tool_arguments: Record<string, any>;
  tool_call_id: string;
  source: "chat" | "function_call";
}