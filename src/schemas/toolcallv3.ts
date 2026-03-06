// class AgentToolcall(BaseModel):
//     tool_name: str
//     tool_arguments: dict[str, Any] = Field(default_factory=dict)
//     tool_call_id: Optional[str] = Field(default_factory=lambda: "ct_" + str(uuid.uuid4()))
//     source: Literal["chat", "function_call"] = Field(default="chat")


export interface AgentToolcall {
  tool_name: string;
  tool_arguments: Record<string, any>;
  tool_call_id: string;
  source: "chat" | "function_call";
}