import { Model, ModelAchatResult } from '../../src/core/model';
import { AssistantMessage } from '../../src/schemas/message';
import { logger } from '../../src/utils';

describe('Model Test', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function emptyMessage(): AssistantMessage {
    return new AssistantMessage({
      content: ' ',
      agent_tool_calls: [{ tool_name: 'TaskCompletion', tool_arguments: {}, tool_call_id: '1', source: 'chat' }],
    });
  }

  function validMessage(text = 'Hello world'): AssistantMessage {
    return new AssistantMessage({ content: text });
  }

  describe('isValidAchatResult', () => {
    test('whitespace + TaskCompletion is invalid', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 });
      const isValid = (model as any).isValidAchatResult({ assistantMessage: emptyMessage(), parsingFailedToolMessages: [] });
      expect(isValid).toBe(false);
    });

    test('meaningful content is valid', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 });
      const isValid = (model as any).isValidAchatResult({ assistantMessage: validMessage(), parsingFailedToolMessages: [] });
      expect(isValid).toBe(true);
    });

    test('native tool calls is valid', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 });
      const isValid = (model as any).isValidAchatResult({
        assistantMessage: new AssistantMessage({
          content: '',
          tool_calls: [{ type: 'function', id: '1', function: { name: 'foo', arguments: '{}' } }],
        }), parsingFailedToolMessages: []
      });
      expect(isValid).toBe(true);
    });

    test('real agent tool call is valid', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 });
      const isValid = (model as any).isValidAchatResult({
        assistantMessage: new AssistantMessage({
          content: '',
          agent_tool_calls: [{ tool_name: 'CommandLineTool.execute', tool_arguments: {}, tool_call_id: '1', source: 'chat' }],
        }),
        parsingFailedToolMessages: []
      });
      expect(isValid).toBe(true);
    });

    test('only task completion without content is invalid', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 });
      const isValid = (model as any).isValidAchatResult({
        assistantMessage: new AssistantMessage({
          content: '',
          agent_tool_calls: [{ tool_name: 'TaskCompletion', tool_arguments: {}, tool_call_id: '1', source: 'chat' }],
        }),
        parsingFailedToolMessages: []
      });
      expect(isValid).toBe(false);
    });
  });

  describe('_callWithRetry', () => {
    test('no retry on valid response', async () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 }, 3);
      const handler = jest.fn<Promise<ModelAchatResult>, []>().mockResolvedValue({
        assistantMessage: validMessage(),
        parsingFailedToolMessages: [],
      });

      const result = await (model as any)._callWithRetry(handler);

      expect(result.assistantMessage.content).toBe('Hello world');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('retries on empty and then succeeds', async () => {
      jest.useFakeTimers();
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 }, 3);
      const handler = jest
        .fn<Promise<ModelAchatResult>, []>()
        .mockResolvedValueOnce({ assistantMessage: emptyMessage(), parsingFailedToolMessages: [] })
        .mockResolvedValueOnce({ assistantMessage: emptyMessage(), parsingFailedToolMessages: [] })
        .mockResolvedValueOnce({ assistantMessage: validMessage('ok'), parsingFailedToolMessages: [] });
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => { });
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => { });

      const promise = (model as any)._callWithRetry(handler);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.assistantMessage.content).toBe('ok');
      expect(handler).toHaveBeenCalledTimes(3);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls[0][0]).toContain('attempt 1/3');
      expect(warnSpy.mock.calls[1][0]).toContain('attempt 2/3');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    test('exhausts retries and logs error', async () => {
      jest.useFakeTimers();
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 }, 2);
      const handler = jest
        .fn<Promise<ModelAchatResult>, []>()
        .mockResolvedValue({ assistantMessage: emptyMessage(), parsingFailedToolMessages: [] });
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => { });
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => { });

      const promise = (model as any)._callWithRetry(handler);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.assistantMessage.content).toBe(' ');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('attempt 1/2');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('after 2 attempts');
    });

    test('max retries respected', async () => {
      jest.useFakeTimers();
      for (const n of [1, 2, 5]) {
        const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 }, n);
        const handler = jest
          .fn<Promise<ModelAchatResult>, []>()
          .mockResolvedValue({ assistantMessage: emptyMessage(), parsingFailedToolMessages: [] });

        const promise = (model as any)._callWithRetry(handler);
        await jest.runAllTimersAsync();
        const result = await promise;

        expect(result.assistantMessage.content).toBe(' ');
        expect(handler).toHaveBeenCalledTimes(n);
      }
    });
  });

  describe('modelConfigToDict', () => {
    test('excludes non-api fields', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768, temperature: 0.7 }, 3);
      const config = model.getConfig();
      expect(config).toHaveProperty('temperature');
      expect(config).not.toHaveProperty('maxEmptyRetries');
    });

    test('filters none values', () => {
      const model = new Model({ model: 'deepseek-chat', provider: 'deepseek', apiKey: '', baseUrl: '', contextWindowTokens: 32768 }, 3);
      const config = model.getConfig();
      expect(config).not.toHaveProperty('temperature');
      expect(config).not.toHaveProperty('topP');
    });
  });
});
