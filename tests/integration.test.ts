/**
 * Integration tests for evoltagent
 *
 * Tests the complete system functionality
 */

import { Agent } from "../src/agent";
import { BaseEnvironment } from "../src/environment";
import { ThinkTool, FileEditor, CommandLineTool } from "../src/tools";
import { SystemToolStore } from "../src/tools";

describe("evoltagent Integration Tests", () => {
  test("should register all system tools", () => {
    const toolNames = SystemToolStore.getToolNames();
    expect(toolNames.length).toBeGreaterThan(0);
    console.log("Registered tools:", toolNames);
  });

  test("should create agent instance", () => {
    const agent = new Agent({
      name: "test-agent",
      profile: "Test agent for integration testing",
    });

    expect(agent.name).toBe("test-agent");
    expect(agent.getProfile()).toBe("Test agent for integration testing");
  });

  test("should create environment with agents", () => {
    const agents = [
      new Agent({ name: "agent1", profile: "Agent 1" }),
      new Agent({ name: "agent2", profile: "Agent 2" }),
    ];

    const environment = new BaseEnvironment(agents, {});
    expect(environment.agents.length).toBe(2);
  });

  test("should process instructions correctly", () => {
    const agents = [
      new Agent({ name: "agent1", profile: "Agent 1" }),
      new Agent({ name: "agent2", profile: "Agent 2" }),
    ];

    const environment = new BaseEnvironment(agents, {});

    // Test single agent instruction
    const [type1, instruction1] = environment.postProcessInstruction("hello", [
      "agent1",
    ]);
    expect(type1).toBe("valid");
    expect(instruction1).toBe("hello@agent1");

    // Test quit instruction
    const [type2, instruction2] = environment.postProcessInstruction("/q", [
      "agent1",
      "agent2",
    ]);
    expect(type2).toBe("quit");

    // Test send to all instruction
    const [type3, instruction3] = environment.postProcessInstruction(
      "hello@all",
      ["agent1", "agent2"]
    );
    expect(type3).toBe("send_to_all");
  });

  test("should create tool instances", () => {
    const thinkTool = new ThinkTool();
    const fileEditor = new FileEditor();
    const cmdTool = new CommandLineTool();

    expect(thinkTool).toBeDefined();
    expect(fileEditor).toBeDefined();
    expect(cmdTool).toBeDefined();
  });

  test("should have agent name and system properties accessible", () => {
    const agent = new Agent({
      name: "test-agent",
      profile: "Test agent",
      system: "Custom system message",
    });

    expect(agent.name).toBe("test-agent");
    expect(agent.system).toBe("Custom system message");
  });
});

describe("Tool Functionality Tests", () => {
  test("ThinkTool should execute correctly", async () => {
    const thinkTool = new ThinkTool();
    const result = await thinkTool.execute("Test thought");
    expect(result).toBe("Thinking complete!");
  });

  test("FileEditor should handle basic operations", async () => {
    const fileEditor = new FileEditor();
    const testContent = "Hello, World!";

    // Note: File operations would require proper test setup with temp directories
    // For now, we just test that the instance can be created
    expect(fileEditor).toBeDefined();
  });
});
