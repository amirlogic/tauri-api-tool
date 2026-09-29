import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConnection,
  resetConnection,
  ensureTables,
  getApiKey,
  getApiKeyForModel,
  getModelsForProvider,
  getModelsForProviders,
  getDistinctProviders,
} from '../src/services/dbService.js';

describe('dbService.js - SQLite IPC integration', () => {
  let mockConn;

  beforeEach(() => {
    resetConnection();
    mockConn = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
      select: vi.fn().mockResolvedValue([]),
    };
    window.__TAURI__.sql = {
      load: vi.fn().mockResolvedValue(mockConn),
    };
  });

  describe('getConnection', () => {
    it('throws error when Tauri SQL plugin is missing', async () => {
      window.__TAURI__.sql = undefined;
      await expect(getConnection()).rejects.toThrow(
        'Tauri SQL plugin not available.'
      );
    });

    it('loads the database connection and caches it', async () => {
      const conn1 = await getConnection();
      const conn2 = await getConnection();

      expect(conn1).toBe(mockConn);
      expect(conn2).toBe(mockConn);
      expect(window.__TAURI__.sql.load).toHaveBeenCalledTimes(1);
    });

    it('loads a new connection after resetConnection is called', async () => {
      await getConnection();
      expect(window.__TAURI__.sql.load).toHaveBeenCalledTimes(1);

      resetConnection();

      await getConnection();
      expect(window.__TAURI__.sql.load).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureTables', () => {
    it('creates models and apikeys tables if not exists', async () => {
      await ensureTables();
      expect(mockConn.execute).toHaveBeenCalledTimes(2);
      expect(mockConn.execute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS models');
      expect(mockConn.execute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS apikeys');
    });

    it('uses the provided connection if passed as argument', async () => {
      const customConn = {
        execute: vi.fn().mockResolvedValue({}),
      };
      await ensureTables(customConn);
      expect(customConn.execute).toHaveBeenCalledTimes(2);
      expect(mockConn.execute).not.toHaveBeenCalled();
    });
  });

  describe('getApiKey', () => {
    it('returns the API key for a provider', async () => {
      mockConn.select.mockResolvedValueOnce([{ api_key: 'sk-openrouter-secret' }]);

      const key = await getApiKey('OpenRouter');
      expect(key).toBe('sk-openrouter-secret');
      expect(mockConn.select).toHaveBeenCalledWith(
        'SELECT api_key FROM apikeys WHERE LOWER(provider) = ? LIMIT 1',
        ['openrouter']
      );
    });

    it('returns empty string when key is not found', async () => {
      mockConn.select.mockResolvedValueOnce([]);

      const key = await getApiKey('nonexistent');
      expect(key).toBe('');
    });

    it('returns empty string if database query throws', async () => {
      mockConn.select.mockRejectedValueOnce(new Error('DB read error'));

      const key = await getApiKey('openrouter');
      expect(key).toBe('');
    });
  });

  describe('getApiKeyForModel', () => {
    it('returns API key via two-step lookup (model -> provider -> api_key)', async () => {
      // 1st call: find provider for model
      mockConn.select.mockResolvedValueOnce([{ provider: 'openrouter' }]);
      // 2nd call: find api key for provider
      mockConn.select.mockResolvedValueOnce([{ api_key: 'sk-model-key-123' }]);

      const key = await getApiKeyForModel('anthropic/claude-3-haiku');
      expect(key).toBe('sk-model-key-123');

      expect(mockConn.select).toHaveBeenNthCalledWith(
        1,
        'SELECT provider FROM models WHERE model_name = ? LIMIT 1',
        ['anthropic/claude-3-haiku']
      );
      expect(mockConn.select).toHaveBeenNthCalledWith(
        2,
        'SELECT api_key FROM apikeys WHERE provider = ? LIMIT 1',
        ['openrouter']
      );
    });

    it('returns empty string if model is not registered', async () => {
      mockConn.select.mockResolvedValueOnce([]);

      const key = await getApiKeyForModel('unknown-model');
      expect(key).toBe('');
      expect(mockConn.select).toHaveBeenCalledTimes(1);
    });

    it('returns empty string if provider has no API key registered', async () => {
      mockConn.select.mockResolvedValueOnce([{ provider: 'local-ollama' }]);
      mockConn.select.mockResolvedValueOnce([]);

      const key = await getApiKeyForModel('llama3');
      expect(key).toBe('');
    });
  });

  describe('getModelsForProvider', () => {
    it('returns list of model names for given provider', async () => {
      mockConn.select.mockResolvedValueOnce([
        { model_name: 'llama3:8b' },
        { model_name: 'mistral:latest' },
      ]);

      const models = await getModelsForProvider('Ollama');
      expect(models).toEqual(['llama3:8b', 'mistral:latest']);
      expect(mockConn.select).toHaveBeenCalledWith(
        'SELECT model_name FROM models WHERE LOWER(provider) = ?',
        ['ollama']
      );
    });

    it('returns empty array on DB error', async () => {
      mockConn.select.mockRejectedValueOnce(new Error('Query error'));

      const models = await getModelsForProvider('ollama');
      expect(models).toEqual([]);
    });
  });

  describe('getModelsForProviders', () => {
    it('constructs query with placeholders for multiple providers', async () => {
      mockConn.select.mockResolvedValueOnce([
        { model_name: 'lmstudio-model-1' },
        { model_name: 'lmstudio-model-2' },
      ]);

      const models = await getModelsForProviders(['lmstudio', 'lm-studio']);
      expect(models).toEqual(['lmstudio-model-1', 'lmstudio-model-2']);
      expect(mockConn.select).toHaveBeenCalledWith(
        'SELECT model_name FROM models WHERE LOWER(provider) = ? OR LOWER(provider) = ?',
        ['lmstudio', 'lm-studio']
      );
    });
  });

  describe('getDistinctProviders', () => {
    it('combines and deduplicates providers from both models and apikeys tables', async () => {
      mockConn.select.mockResolvedValueOnce([
        { provider: 'OpenRouter' },
        { provider: 'Ollama' },
      ]);
      mockConn.select.mockResolvedValueOnce([
        { provider: 'openrouter' },
        { provider: 'LMStudio' },
      ]);

      const providers = await getDistinctProviders();
      expect(providers.sort()).toEqual(['lmstudio', 'ollama', 'openrouter'].sort());
    });
  });
});
