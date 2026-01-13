/**
 * Tests for MessageHistory class
 */

import { MessageHistory } from '../../src/memory/messageHistory';
import { Message } from '../../src/schemas/message';

describe('MessageHistory', () => {
  describe('constructor', () => {
    it('should initialize with system message', () => {
      const history = new MessageHistory('test-model', 'System prompt', 4096);
      
      expect(history.getMessageCount()).toBe(1);
      const messages = history.getMessages();
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('System prompt');
    });

    it('should initialize without system message', () => {
      const history = new MessageHistory('test-model', '', 4096);
      
      expect(history.getMessageCount()).toBe(0);
    });
  });

  describe('addMessage', () => {
    it('should add message with Message instance', () => {
      const history = new MessageHistory('test-model', '', 4096);
      const message = new Message('user', 'Hello');
      
      history.addMessage(message);
      
      expect(history.getMessageCount()).toBe(1);
      expect(history.getMessages()[0]).toBe(message);
    });

    it('should add message with role and content', () => {
      const history = new MessageHistory('test-model', '', 4096);
      
      history.addMessage('user', 'Hello');
      
      expect(history.getMessageCount()).toBe(1);
      const message = history.getMessages()[0];
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
    });

    it('should add multiple messages', () => {
      const history = new MessageHistory('test-model', '', 4096);
      
      history.addMessage('user', 'Hello');
      history.addMessage('assistant', 'Hi there');
      
      expect(history.getMessageCount()).toBe(2);
      const messages = history.getMessages();
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });
  });

  describe('formatForApi', () => {
    it('should format messages for API', () => {
      const history = new MessageHistory('test-model', 'System', 4096);
      history.addMessage('user', 'Hello');
      history.addMessage('assistant', 'Hi');
      
      const apiFormat = history.formatForApi();
      
      expect(apiFormat).toHaveLength(3);
      expect(apiFormat[0]).toEqual({ role: 'system', content: 'System' });
      expect(apiFormat[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(apiFormat[2]).toEqual({ role: 'assistant', content: 'Hi' });
    });
  });

  describe('updateSystem', () => {
    it('should update system prompt', () => {
      const history = new MessageHistory('test-model', 'Old system', 4096);
      history.addMessage('user', 'Hello');
      
      history.updateSystem('New system');
      
      const messages = history.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('New system');
      expect(messages[1].role).toBe('user');
    });

    it('should remove system message when empty', () => {
      const history = new MessageHistory('test-model', 'System', 4096);
      
      history.updateSystem('');
      
      expect(history.getMessageCount()).toBe(0);
    });
  });

  describe('truncate', () => {
    it('should not truncate when within limit', () => {
      const history = new MessageHistory('test-model', 'System', 1000);
      history.addMessage('user', 'Short message');
      
      const beforeCount = history.getMessageCount();
      history.truncate();
      const afterCount = history.getMessageCount();
      
      expect(afterCount).toBe(beforeCount);
    });

    it('should truncate when over limit', () => {
      // Create history with small context window
      const history = new MessageHistory('test-model', 'System', 10);
      
      // Add messages that will exceed the token limit
      history.addMessage('user', 'This is a long message that will exceed the token limit');
      history.addMessage('assistant', 'Another long response');
      
      history.truncate();
      
      // Should keep system message and some recent messages
      const messages = history.getMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
    });
  });

  describe('clear', () => {
    it('should clear all messages except system', () => {
      const history = new MessageHistory('test-model', 'System', 4096);
      history.addMessage('user', 'Hello');
      history.addMessage('assistant', 'Hi');
      
      history.clear();
      
      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
    });

    it('should clear all messages when no system', () => {
      const history = new MessageHistory('test-model', '', 4096);
      history.addMessage('user', 'Hello');
      
      history.clear();
      
      expect(history.getMessageCount()).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should get last message', () => {
      const history = new MessageHistory('test-model', '', 4096);
      history.addMessage('user', 'First');
      history.addMessage('assistant', 'Last');
      
      const lastMessage = history.getLastMessage();
      
      expect(lastMessage?.content).toBe('Last');
    });

    it('should return null for last message when empty', () => {
      const history = new MessageHistory('test-model', '', 4096);
      
      expect(history.getLastMessage()).toBeNull();
    });

    it('should get formatted context usage', () => {
      const history = new MessageHistory('test-model', 'System', 100);
      history.addMessage('user', 'Test message');
      
      const usage = history.formattedContextUsage;
      
      expect(usage).toMatch(/Tokens: \d+\/100 \(\d+\.\d+%\)/);
    });

    it('should convert to string', () => {
      const history = new MessageHistory('test-model', 'System', 4096);
      history.addMessage('user', 'Hello');
      history.addMessage('assistant', 'Hi');
      
      const str = history.toString();
      
      expect(str).toContain('system: System');
      expect(str).toContain('user: Hello');
      expect(str).toContain('assistant: Hi');
    });
  });
});