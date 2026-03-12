import { Agent } from '../../src/core/agent';
import { AssistantMessage, ToolMessage } from '../../src/schemas/message';
import { ModelAchatResult } from '../../src/core/model';

const taskCompleteResult = {
  assistantMessage: new AssistantMessage({
    content: [
      { type: 'text', text: '<TaskCompletion>Done.</TaskCompletion>' },
    ],
    agent_tool_calls: [
      { tool_name: 'TaskCompletion', tool_arguments: {}, tool_call_id: 'done', source: 'chat' },
    ],
  }),
  parsingFailedToolMessages: [],
}

describe('Agent Test', () => {
  test('initialization', () => {
    const agent = new Agent({ name: 'TestAgent', profile: 'A test agent for demonstration', tools: ['ThinkTool.execute'], verbose: true });
    expect(agent.name).toBe('TestAgent');
    expect(agent.getProfile()).toBe('A test agent for demonstration');
    expect(agent.getTools()).toContain('ThinkTool.execute');
  });

  test(
    'multiple tool calls in one turn',
    async () => {
      const agent = new Agent({
        name: 'test_agent',
        profile: 'You are a test agent.',
        tools: ['ThinkTool.execute', 'CommandLineTool.execute'],
        observeTimeout: 6,
      });

      const mockAchat = jest
        .fn<Promise<ModelAchatResult>, []>()
        .mockResolvedValueOnce({
          assistantMessage: new AssistantMessage({
            content: [
              {
                type: 'text',
                text: `some thoughts ...
                <CommandLineTool.execute><command>echo 1</command></CommandLineTool.execute>
                <CommandLineTool.execute><command>sleep 7 && echo 2</command></CommandLineTool.execute>
                <CommandLineTool.execute><command>echo 3</command></CommandLineTool.execute>
              `,
              },
            ],
            agent_tool_calls: [
              { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo 1' }, tool_call_id: 'tc1', source: 'chat' },
              { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'sleep 7 && echo 2' }, tool_call_id: 'tc2', source: 'chat' },
              { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo 3' }, tool_call_id: 'tc3', source: 'chat' },
            ],
          }),
          parsingFailedToolMessages: [],
        })
        .mockResolvedValueOnce({
          assistantMessage: new AssistantMessage({
            content: [
              {
                type: 'text',
                text: `
                  some thoughts ...
                  <CommandLineTool.execute><command>sleep 3</command></CommandLineTool.execute>
              `,
              }
            ],
            agent_tool_calls: [
              { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'sleep 3' }, tool_call_id: 'tc4', source: 'chat' },
            ],
          }),
          parsingFailedToolMessages: [],
        })
        .mockResolvedValueOnce(taskCompleteResult);

      // Assign mockAchat using a type-safe cast due to Agent's private model property
      (agent as any).model = { achat: mockAchat };
      const submitSpy = jest.spyOn(agent.executor!, 'submitAndExecute');
      const observeSpy = jest.spyOn(agent.executor!, 'observe');


      const result = await agent.run('Run echo 1, 2, 3.');
      expect(typeof result).toBe('string');

      expect(mockAchat).toHaveBeenCalledTimes(3);

      expect(submitSpy).toHaveBeenCalledTimes(2);
      expect(observeSpy).toHaveBeenCalledTimes(2);
      expect(agent.executor?.status().totalSubmitted).toBe(4);
      expect(agent.executor?.status().totalObserved).toBe(4);

      expect(agent.chatHistoryMessage.getMessageCount()).toBe(9);
      expect(agent.chatHistoryMessage.getMessages()[0].role).toBe('user');
      // @ts-ignore
      expect(agent.chatHistoryMessage.getMessages()[0].content?.[0]?.text).toBe('Run echo 1, 2, 3.');

      expect(agent.chatHistoryMessage.getMessages()[1].role).toBe('assistant');
      // @ts-ignore
      const msg1Text = agent.chatHistoryMessage.getMessages()[1].content?.[0]?.text;
      expect(msg1Text).toContain('some thoughts ...');
      expect(msg1Text).toContain('<CommandLineTool.execute><command>echo 1</command></CommandLineTool.execute>');
      expect(msg1Text).toContain('<CommandLineTool.execute><command>sleep 7 && echo 2</command></CommandLineTool.execute>');
      expect(msg1Text).toContain('<CommandLineTool.execute><command>echo 3</command></CommandLineTool.execute>');

      expect(agent.chatHistoryMessage.getMessages()[2].role).toBe('user');
      expect(agent.chatHistoryMessage.getMessages()[2].content).toContain('COMMAND: echo 1');
      expect(agent.chatHistoryMessage.getMessages()[3].role).toBe('user');
      expect(agent.chatHistoryMessage.getMessages()[3].content).toContain('COMMAND: sleep 7 && echo 2');
      expect(agent.chatHistoryMessage.getMessages()[4].role).toBe('user');
      expect(agent.chatHistoryMessage.getMessages()[4].content).toContain('COMMAND: echo 3');

      expect(agent.chatHistoryMessage.getMessages()[5].role).toBe('assistant');
      // @ts-ignore
      const msg5Text = agent.chatHistoryMessage.getMessages()[5].content?.[0]?.text;
      expect(msg5Text).toContain('some thoughts ...');
      expect(msg5Text).toContain('<CommandLineTool.execute><command>sleep 3</command></CommandLineTool.execute>');

      expect(agent.chatHistoryMessage.getMessages()[6].role).toBe('user');
      expect(agent.chatHistoryMessage.getMessages()[6].content).toContain('COMMAND: sleep 7 && echo 2');
      expect(agent.chatHistoryMessage.getMessages()[6].content).toContain('EXIT CODE: 0');

      expect(agent.chatHistoryMessage.getMessages()[7].role).toBe('user');
      expect(agent.chatHistoryMessage.getMessages()[7].content).toContain('COMMAND: sleep 3');
      expect(agent.chatHistoryMessage.getMessages()[7].content).toContain('EXIT CODE: 0');

      expect(agent.chatHistoryMessage.getMessages()[8].role).toBe('assistant');
      // @ts-ignore
      expect(agent.chatHistoryMessage.getMessages()[8].content?.[0]?.text).toContain('<TaskCompletion>Done.</TaskCompletion>');
    },
    11000,
  );

  test('adds parsing failed message when no executable toolcall', async () => {
    const agent = new Agent({
      name: 'test_agent',
      profile: 'You are a test agent.',
      tools: ['ThinkTool.execute', 'CommandLineTool.execute'],
    });

    const failMsg = new ToolMessage({
      content: 'toolcall extraction failed warning',
      tag: 'ToolcallExtractionFailed',
      tool_call_id: 'x1',
      tool_name: 'CommandLineTool.execute',
      source: 'chat',
      status: 'failed',
    });

    const mockAchat = jest
      .fn<Promise<ModelAchatResult>, []>()
      .mockResolvedValueOnce({
        assistantMessage: new AssistantMessage({
          content: [
            {
              type: 'text',
              text: `
                some thoughts ...
                <CommandLineTool.execute><command>echo with-warning</command></CommandLineTool.execute>
              `,
            }
          ],
          agent_tool_calls: [
            { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo with-warning' }, tool_call_id: 'x1', source: 'chat' },
          ],
        }),
        parsingFailedToolMessages: [failMsg],
      })
      .mockResolvedValueOnce(taskCompleteResult);
    (agent as any).model = { achat: mockAchat };
    const submitSpy = jest.spyOn(agent.executor!, 'submitAndExecute');
    const observeSpy = jest.spyOn(agent.executor!, 'observe');

    const result = await agent.run('Run command with warning.');
    expect(typeof result).toBe('string');
    expect(mockAchat).toHaveBeenCalledTimes(2);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(agent.executor?.status().totalSubmitted).toBe(1);
    expect(agent.executor?.status().totalObserved).toBe(1);

    expect(agent.chatHistoryMessage.getMessageCount()).toBe(5);
    expect(agent.chatHistoryMessage.getMessages()[0].role).toBe('user');
    // @ts-ignore
    expect(agent.chatHistoryMessage.getMessages()[0].content?.[0]?.text).toBe('Run command with warning.');

    expect(agent.chatHistoryMessage.getMessages()[1].role).toBe('assistant');
    // @ts-ignore
    const msg1Text = agent.chatHistoryMessage.getMessages()[1].content?.[0]?.text;
    expect(msg1Text).toContain('some thoughts ...');
    expect(msg1Text).toContain('<CommandLineTool.execute><command>echo with-warning</command></CommandLineTool.execute>');

    expect(agent.chatHistoryMessage.getMessages()[2].role).toBe('user');
    expect(agent.chatHistoryMessage.getMessages()[2].content).toContain('toolcall extraction failed warning');

    expect(agent.chatHistoryMessage.getMessages()[3].role).toBe('user');
    expect(agent.chatHistoryMessage.getMessages()[3].content).toContain('COMMAND: echo with-warning');

    expect(agent.chatHistoryMessage.getMessages()[4].role).toBe('assistant');
    // @ts-ignore
    expect(agent.chatHistoryMessage.getMessages()[4].content?.[0]?.text).toContain('<TaskCompletion>Done.</TaskCompletion>');
  });

  test('adds extraction failed message when no executable toolcall', async () => {
    const agent = new Agent({
      name: 'test_agent',
      profile: 'You are a test agent.',
      tools: ['ThinkTool.execute', 'CommandLineTool.execute'],
      observeTimeout: 6,
    });

    const failMsg = new ToolMessage({
      content: 'toolcall extraction failed without executable toolcall',
      tag: 'ToolcallExtractionFailed',
      tool_call_id: 'x-noexec',
      tool_name: 'CommandLineTool.execute',
      source: 'chat',
      status: 'failed',
    });

    const mockAchat = jest
      .fn<Promise<ModelAchatResult>, []>()
      .mockResolvedValueOnce({
        assistantMessage: new AssistantMessage({
          content: [
            {
              type: 'text',
              text: 'toolcall parse failed but no executable toolcall',
            }
          ],
          agent_tool_calls: [],
        }),
        parsingFailedToolMessages: [failMsg],
      })
      .mockResolvedValueOnce(taskCompleteResult);

    (agent as any).model = { achat: mockAchat };
    const submitSpy = jest.spyOn(agent.executor!, 'submitAndExecute');
    const observeSpy = jest.spyOn(agent.executor!, 'observe');

    const result = await agent.run('Run command without executable toolcall.');
    expect(typeof result).toBe('string');
    expect(mockAchat).toHaveBeenCalledTimes(2);
    expect(submitSpy).toHaveBeenCalledTimes(0);
    expect(observeSpy).toHaveBeenCalledTimes(0);
    expect(agent.executor?.status().totalSubmitted).toBe(0);
    expect(agent.executor?.status().totalObserved).toBe(0);

    const userMsgs = agent.chatHistoryMessage.getMessages().filter(msg => msg.role === 'user');
    const userMsgsContent = JSON.stringify(userMsgs);
    expect(userMsgsContent).toContain('toolcall extraction failed without executable toolcall');
    // 1 initial instruction + 1 extraction-failed warning message
    expect(userMsgs.length).toBe(2);
  });
});
