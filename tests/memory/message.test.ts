/**
 * Tests for Message class
 */

import { Message } from '../../src/schemas/message';

describe('Message', () => {
  describe('constructor', () => {
    it('should create message with role and content', () => {
      const message = new Message('user', 'Hello world');
      
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello world');
      expect(message.images).toBeUndefined();
      expect(message.type).toBeUndefined();
    });

    it('should create message with images and type', () => {
      const message = new Message('user', 'Hello', ['image1.jpg', 'image2.jpg'], 'text');
      
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.images).toEqual(['image1.jpg', 'image2.jpg']);
      expect(message.type).toBe('text');
    });
  });

  describe('static methods', () => {
    it('should create user message', () => {
      const message = Message.fromUserMsg('User input');
      
      expect(message.role).toBe('user');
      expect(message.content).toBe('User input');
    });

    it('should create user message with images', () => {
      const message = Message.fromUserMsg('User input', 'image.jpg');
      
      expect(message.role).toBe('user');
      expect(message.content).toBe('User input');
      expect(message.images).toBe('image.jpg');
    });

    it('should create assistant message', () => {
      const message = Message.fromAssistantMsg('Assistant response');
      
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Assistant response');
    });

    it('should create system message', () => {
      const message = Message.fromSystemMsg('System prompt');
      
      expect(message.role).toBe('system');
      expect(message.content).toBe('System prompt');
    });
  });

  describe('toObject', () => {
    it('should convert to plain object', () => {
      const message = new Message('assistant', 'Response text');
      const obj = message.toObject();
      
      expect(obj).toEqual({
        role: 'assistant',
        content: 'Response text'
      });
    });

    it('should include images in object', () => {
      const message = new Message('user', 'Text', ['img1.jpg']);
      const obj = message.toObject();
      
      expect(obj).toEqual({
        role: 'user',
        content: 'Text',
        images: ['img1.jpg']
      });
    });

    it('should include type in object', () => {
      const message = new Message('system', 'Prompt', undefined, 'system');
      const obj = message.toObject();
      
      expect(obj).toEqual({
        role: 'system',
        content: 'Prompt',
        type: 'system'
      });
    });
  });

  describe('utility methods', () => {
    it('should check if message has images', () => {
      const messageWithImages = new Message('user', 'Text', ['img.jpg']);
      const messageWithoutImages = new Message('user', 'Text');
      
      expect(messageWithImages.hasImages()).toBe(true);
      expect(messageWithoutImages.hasImages()).toBe(false);
    });

    it('should get content length', () => {
      const message = new Message('user', 'Hello world');
      
      expect(message.getContentLength()).toBe(11);
    });

    it('should convert to string', () => {
      const message = new Message('assistant', 'Response text');
      
      expect(message.toString()).toBe('assistant: Response text');
    });
  });
});