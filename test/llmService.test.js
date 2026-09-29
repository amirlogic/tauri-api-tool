import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProviderEndpoint,
  getProviderHeaders,
  parseAssistantResponse,
} from '../src/services/llmService.js';

describe('llmService.js - Pure functions', () => {
  describe('getProviderEndpoint', () => {
    it('returns OpenRouter endpoint', () => {
      expect(getProviderEndpoint('openrouter')).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
      expect(getProviderEndpoint('OpenRouter')).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
    });

    it('returns default Ollama endpoint', () => {
      expect(getProviderEndpoint('ollama')).toBe('http://localhost:11434/api/chat');
    });

    it('returns custom Ollama endpoint when baseUrl is provided', () => {
      expect(
        getProviderEndpoint('ollama', { baseUrl: 'http://192.168.1.100:11434/api/' })
      ).toBe('http://192.168.1.100:11434/api/chat');
    });

    it('returns LM Studio endpoint with custom baseUrl override', () => {
      expect(
        getProviderEndpoint('lmstudio', { baseUrl: 'http://custom-host:8080/v1' })
      ).toBe('http://custom-host:8080/v1/chat/completions');
      expect(
        getProviderEndpoint('lm-studio', { baseUrl: 'http://custom-host:8080/v1/' })
      ).toBe('http://custom-host:8080/v1/chat/completions');
    });

    it('builds LM Studio endpoint from localStorage config', () => {
      localStorage.setItem('lmstudio_host', 'http://127.0.0.1');
      localStorage.setItem('lmstudio_port', '1234');
      localStorage.setItem('lmstudio_prefix', '/v1');

      expect(getProviderEndpoint('lmstudio')).toBe(
        'http://127.0.0.1:1234/v1/chat/completions'
      );
    });

    it('handles LM Studio prefix without leading slash', () => {
      localStorage.setItem('lmstudio_host', 'http://localhost');
      localStorage.setItem('lmstudio_port', '5000');
      localStorage.setItem('lmstudio_prefix', 'api/v1');

      expect(getProviderEndpoint('lmstudio')).toBe(
        'http://localhost:5000/api/v1/chat/completions'
      );
    });

    it('falls back to OpenRouter for unknown providers', () => {
      expect(getProviderEndpoint('unknown-provider')).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
    });
  });

  describe('getProviderHeaders', () => {
    it('sets Content-Type for all requests', () => {
      const headers = getProviderHeaders('ollama');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('sets Bearer token when apiKey is provided', () => {
      const headers = getProviderHeaders('openrouter', 'sk-test-12345');
      expect(headers['Authorization']).toBe('Bearer sk-test-12345');
    });

    it('sets HTTP-Referer for openrouter provider', () => {
      const headers = getProviderHeaders('openrouter', 'sk-test-12345');
      expect(headers['HTTP-Referer']).toBe('tauri-api-tool');
    });

    it('does not set HTTP-Referer for other providers', () => {
      const headers = getProviderHeaders('lmstudio', 'sk-test');
      expect(headers['HTTP-Referer']).toBeUndefined();
    });
  });

  describe('parseAssistantResponse', () => {
    it('throws error when response data is falsy', () => {
      expect(() => parseAssistantResponse(null, 'openrouter')).toThrow(
        'Empty response from LLM API.'
      );
    });

    it('throws API error if response contains data.error (object)', () => {
      const errorData = {
        error: {
          message: 'Rate limit exceeded',
        },
      };
      expect(() => parseAssistantResponse(errorData, 'openrouter')).toThrow(
        'Rate limit exceeded'
      );
    });

    it('throws API error if response contains data.error (string)', () => {
      const errorData = { error: 'Invalid API key' };
      expect(() => parseAssistantResponse(errorData, 'openrouter')).toThrow(
        'Invalid API key'
      );
    });

    it('parses standard OpenAI/OpenRouter format', () => {
      const data = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello, this is a response from the AI.',
            },
          },
        ],
      };
      const result = parseAssistantResponse(data, 'openrouter');
      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello, this is a response from the AI.',
      });
    });

    it('parses Ollama format with message object', () => {
      const data = {
        message: {
          role: 'assistant',
          content: 'Ollama local response',
        },
      };
      const result = parseAssistantResponse(data, 'ollama');
      expect(result).toEqual({
        role: 'assistant',
        content: 'Ollama local response',
      });
    });

    it('parses Ollama format with string message', () => {
      const data = {
        message: 'Simple text reply',
      };
      const result = parseAssistantResponse(data, 'ollama');
      expect(result).toEqual({
        role: 'assistant',
        content: 'Simple text reply',
      });
    });

    it('throws error on unexpected response format', () => {
      const data = { unexpected_field: 123 };
      expect(() => parseAssistantResponse(data, 'openrouter')).toThrow(
        'Unexpected response format from LLM API.'
      );
    });
  });
});
