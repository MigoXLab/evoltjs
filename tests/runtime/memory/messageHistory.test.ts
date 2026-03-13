import { MessageHistory } from '../../../src/runtime/memory/messageHistory';
import { UserMessage, AssistantMessage } from '../../../src/schemas/message';
import * as costUtils from '../../../src/utils/cost';

async function addPairsUntilTruncate(history: MessageHistory, maxPairs = 30, textSize = 200): Promise<void> {
  for (let i = 0; i < maxPairs; i++) {
    history.addMessage(new UserMessage({ content: `Question ${i}: ${'x'.repeat(textSize)}` }));
    history.addMessage(new AssistantMessage({ content: `Answer ${i}: ${'y'.repeat(textSize)}` }));
    if (history.contextUsage.used_tokens > history.contextUsage.context_window_tokens) {
      return;
    }
  }
  throw new Error('Failed to exceed context window');
}

describe('MessageHistory Test', () => {
  test('add message and calculate tokens', () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    history.addMessage(new UserMessage({ content: 'Hello!' }));
    history.addMessage(new AssistantMessage({ content: 'Hi there!' }));
    expect(history.getMessageCount()).toBe(2);
    expect(history.getMessageCosts()).toHaveLength(1);

    expect(history.contextUsage.total_used_tokens).toBeGreaterThanOrEqual(history.contextUsage.used_tokens);
  });

  test('cost accumulation after truncation', async () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    await addPairsUntilTruncate(history, 30, 200);

    const messages_before_truncate = history.getMessageCount();
    const costs_before_truncate = history.getMessageCosts().length;
    const usage_before = history.contextUsage;
    const tokens_before = usage_before.total_used_tokens;

    expect(messages_before_truncate).toBeGreaterThan(0);
    expect(costs_before_truncate).toBeGreaterThan(0);
    expect(tokens_before).toBeGreaterThan(0);

    history.truncate();

    const messages_after_truncate = history.getMessageCount();
    const costs_after_truncate = history.getMessageCosts().length;
    const usage_after = history.contextUsage;
    const tokens_after = usage_after.total_used_tokens;

    expect(messages_after_truncate).toBeLessThan(messages_before_truncate);
    expect(costs_after_truncate).toBeLessThanOrEqual(costs_before_truncate);
    expect(tokens_after).toBeGreaterThanOrEqual(tokens_before);
    expect(tokens_after).toBeGreaterThan(usage_after.used_tokens);
  });

  test('multiple truncations', async () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    const accumulated_history: number[] = [];
    for (let i = 0; i < 10; i++) {
      await addPairsUntilTruncate(history, 30, 200);
      history.truncate();
      accumulated_history.push(history.contextUsage.total_used_tokens);
      if (i > 0) {
        expect(accumulated_history[i]).toBeGreaterThan(accumulated_history[i - 1]);
      }
    }
  });

  test('clear resets accumulated counters', async () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    await addPairsUntilTruncate(history, 30, 200);
    history.truncate();
    expect(history.contextUsage.total_used_tokens).toBeGreaterThan(0);

    history.clear();
    expect(history.getMessageCount()).toBe(0);
    expect(history.contextUsage.used_tokens).toBeGreaterThan(0);
    expect(history.contextUsage.total_used_tokens).toBe(0);
  });

  test('formatted context usage shows accumulated tokens', async () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    await addPairsUntilTruncate(history, 30, 200);
    history.truncate();
    expect(history.formattedContextUsage).toContain('History Total Used Tokens:');
    expect(history.formattedContextUsage).toContain('History Used Tokens:');
    expect(history.formattedContextUsage).toContain('History Messages Length:');
    expect(history.formattedContextUsage).toContain('History Total Used Tokens:');
  });

  test('truncate preserves recent messages', async () => {
    const LIMIT = 200;
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: LIMIT, enableCaching: false });
    await addPairsUntilTruncate(history, 30, 200);
    const messages_before = history.getMessageCount();
    const tokens_before = history.contextUsage.used_tokens;
    const last_message_before = history.getMessages()[history.getMessages().length - 1];

    history.truncate();

    const messages_after = history.getMessageCount();
    const tokens_after = history.contextUsage.used_tokens;
    const last_message_after = history.getMessages()[history.getMessages().length - 1];


    expect(tokens_before).toBeGreaterThan(LIMIT);
    expect(messages_after).toBeLessThan(messages_before);
    expect(tokens_after).toBeLessThan(tokens_before);

    expect(messages_after).toBeGreaterThan(0);
    expect(tokens_after).toBeGreaterThan(0);
    expect(last_message_after).toEqual(last_message_before);
  });

  test('truncate uses current message tokens not cost inputs', () => {
    const estimateSpy = jest.spyOn(costUtils, 'estimateTokens').mockImplementation(({ text }) => {
      if (text.includes('role:system') && text.includes('content:System.')) return 10;
      if (text.includes('role:user') && text.includes('content:u1')) return 10;
      if (text.includes('role:assistant') && text.includes('content:a1')) return 10;
      if (text.includes('role:user') && text.includes('content:u2 ')) return 200;
      if (text.includes('role:assistant') && text.includes('content:a2')) return 10;
      if (text.includes('role:user') && text.includes('content:[Earlier history has been truncated.]')) return 25;
      return 1;
    });

    try {
      const history = new MessageHistory({
        model: 'claude-3-5-sonnet-20241022',
        system: 'System.',
        contextWindowTokens: 100,
        enableCaching: false,
      });

      history.addMessage(new UserMessage({ content: 'u1' }));
      history.addMessage(new AssistantMessage({ content: 'a1' }));
      history.addMessage(new UserMessage({ content: `u2 ${'x'.repeat(600)}` }));
      history.addMessage(new AssistantMessage({ content: 'a2' }));

      expect(history.contextUsage.used_tokens).toBe(240);
      expect(history.contextUsage.used_tokens).toBeGreaterThan(history.contextUsage.context_window_tokens);

      history.truncate();

      expect(history.contextUsage.used_tokens).toBe(45);
    } finally {
      estimateSpy.mockRestore();
    }
  });

  test('initialization', () => {
    const history = new MessageHistory({
      model: 'claude-3-5-sonnet-20241022',
      system: 'Test system prompt.',
      contextWindowTokens: 128000,
      enableCaching: false,
    });
    expect(history.getMessageCount()).toBe(0);
  });

  test('add user message', () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    history.addMessage(new UserMessage({ content: 'Hello!' }));
    expect(history.getMessageCount()).toBe(1);
    expect(history.getMessages()[0].role).toBe('user');
    expect(history.getMessages()[0].content).toBe('Hello!');
  });

  test('add assistant message creates cost record', () => {
    const history = new MessageHistory({ model: 'claude-3-5-sonnet-20241022', system: 'System.', contextWindowTokens: 200, enableCaching: false });
    history.addMessage(new UserMessage({ content: 'Hello!' }));
    history.addMessage(new AssistantMessage({ content: 'Hi there!' }));
    expect(history.getMessageCount()).toBe(2);
    expect(history.getMessageCosts()).toHaveLength(1);
    expect(history.getMessageCosts()[0][0]).toBeGreaterThan(0);
    expect(history.getMessageCosts()[0][1]).toBeGreaterThan(0);
  });
});