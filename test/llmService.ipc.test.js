import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpFetch, chatCompletion } from '../src/services/llmService.js';
import * as dbService from '../src/services/dbService.js';

describe('llmService.js - HTTP & chatCompletion IPC integration', () => {
  beforeEach(() => {
    // Setup default mock for Tauri HTTP
    window.__TAURI__.http = {
      fetch: vi.fn(),
      Body: {
        json: vi.fn((val) => JSON.stringify(val)),
      },
    };
  });

  describe('httpFetch', () => {
    it('uses window.__TAURI__.http.fetch when available', async () => {
      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { test: 'tauri-response' },
      });

      const res = await httpFetch('https://api.test/v1', {
        method: 'POST',
        headers: { 'X-Custom': 'val' },
        body: { query: 'test' },
      });

      expect(res).toEqual({
        status: 200,
        ok: true,
        data: { test: 'tauri-response' },
      });
      expect(window.__TAURI__.http.fetch).toHaveBeenCalledWith('https://api.test/v1', {
        method: 'POST',
        headers: { 'X-Custom': 'val' },
        body: JSON.stringify({ query: 'test' }),
      });
    });

    it('falls back to window.fetch when Tauri HTTP is unavailable', async () => {
      delete window.__TAURI__.http;

      window.fetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ test: 'browser-response' }),
      });

      const res = await httpFetch('https://api.test/v1', {
        method: 'GET',
      });

      expect(res).toEqual({
        status: 200,
        ok: true,
        data: { test: 'browser-response' },
      });
      expect(window.fetch).toHaveBeenCalledWith('https://api.test/v1', {
        method: 'GET',
        headers: {},
      });
    });
  });

  describe('chatCompletion', () => {
    it('executes OpenRouter chat completion with reasoning and explicit apiKey', async () => {
      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Here is the generated answer.',
              },
            },
          ],
        },
      });

      const result = await chatCompletion({
        provider: 'openrouter',
        model: 'deepseek/deepseek-r1',
        messages: [{ role: 'user', content: 'Explain quantum computing.' }],
        systemPrompt: 'Be concise.',
        temperature: 0.7,
        enableReasoning: true,
        apiKey: 'sk-or-explicit-key',
      });

      expect(result).toEqual({
        message: {
          role: 'assistant',
          content: 'Here is the generated answer.',
        },
        status: 200,
      });

      expect(window.__TAURI__.http.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = window.__TAURI__.http.fetch.mock.calls[0];

      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer sk-or-explicit-key');
      expect(options.headers['HTTP-Referer']).toBe('tauri-api-tool');

      const sentBody = JSON.parse(options.body);
      expect(sentBody).toEqual({
        model: 'deepseek/deepseek-r1',
        stream: false,
        temperature: 0.7,
        reasoning: { enabled: true },
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Explain quantum computing.' },
        ],
      });
    });

    it('throws error when OpenRouter has no API key', async () => {
      vi.spyOn(dbService, 'getApiKeyForModel').mockResolvedValueOnce('');

      await expect(
        chatCompletion({
          provider: 'openrouter',
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow("API Key not found in database for this model's provider.");
    });

    it('looks up API key from database when not provided explicitly', async () => {
      vi.spyOn(dbService, 'getApiKeyForModel').mockResolvedValueOnce('sk-from-db-123');

      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: {
          choices: [{ message: { role: 'assistant', content: 'Success' } }],
        },
      });

      await chatCompletion({
        provider: 'openrouter',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(dbService.getApiKeyForModel).toHaveBeenCalledWith('gpt-4o');
      const [, options] = window.__TAURI__.http.fetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer sk-from-db-123');
    });

    it('looks up LM Studio API key using provider name lookup', async () => {
      vi.spyOn(dbService, 'getApiKey').mockImplementation(async (prov) => {
        if (prov === 'lmstudio') return 'sk-lmstudio-key';
        return '';
      });

      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: {
          choices: [{ message: { role: 'assistant', content: 'LM Studio response' } }],
        },
      });

      const res = await chatCompletion({
        provider: 'lmstudio',
        model: 'local-qwen',
        messages: [{ role: 'user', content: 'Ping' }],
      });

      expect(res.message.content).toBe('LM Studio response');
      const [, options] = window.__TAURI__.http.fetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer sk-lmstudio-key');
    });

    it('throws formatted HTTP error when request fails with 4xx/5xx', async () => {
      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        data: null,
      });

      await expect(
        chatCompletion({
          provider: 'openrouter',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
          apiKey: 'invalid-key',
        })
      ).rejects.toThrow('HTTP Error: 401');
    });

    it('throws status error when response fails with 502', async () => {
      window.__TAURI__.http.fetch.mockResolvedValueOnce({
        status: 502,
        ok: false,
        data: null,
      });

      await expect(
        chatCompletion({
          provider: 'ollama',
          model: 'llama3',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('HTTP Error: 502');
    });
  });
});
