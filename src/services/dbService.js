/**
 * dbService.js — Centralized SQLite database access layer.
 * 
 * Provides a single source of truth for:
 * - Database connection management
 * - Table schema DDL (models, apikeys)
 * - API key lookups
 * - Model queries by provider
 * - Provider discovery
 */

const DB_PATH = 'sqlite:test.db';

let _connPromise = null;

/**
 * Returns a cached SQLite connection to the app database.
 * @returns {Promise<object>} SQLite connection
 */
export async function getConnection() {
  if (_connPromise) return _connPromise;

  const Database = window.__TAURI__?.sql;
  if (!Database) throw new Error('Tauri SQL plugin not available.');

  _connPromise = Database.load(DB_PATH);
  return _connPromise;
}

/**
 * Ensures the models and apikeys tables exist.
 * Call this once during app/screen initialization.
 * @param {object} [conn] Optional existing connection; fetches one if omitted.
 */
export async function ensureTables(conn) {
  if (!conn) conn = await getConnection();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS apikeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Fetches the API key for a given provider name.
 * @param {string} provider - Provider name (e.g. 'openrouter', 'ollama', 'lmstudio')
 * @returns {Promise<string>} The API key, or empty string if not found.
 */
export async function getApiKey(provider) {
  try {
    const conn = await getConnection();
    const rows = await conn.select(
      'SELECT api_key FROM apikeys WHERE LOWER(provider) = ? LIMIT 1',
      [provider.toLowerCase()]
    );
    return (rows && rows.length > 0) ? rows[0].api_key : '';
  } catch {
    return '';
  }
}

/**
 * Looks up a model's provider, then fetches the API key for that provider.
 * This is the two-step query previously duplicated across all chat screens.
 * @param {string} modelName - The model identifier
 * @returns {Promise<string>} The API key, or empty string if not found.
 */
export async function getApiKeyForModel(modelName) {
  try {
    const conn = await getConnection();
    const modelRows = await conn.select(
      'SELECT provider FROM models WHERE model_name = ? LIMIT 1',
      [modelName]
    );
    if (modelRows && modelRows.length > 0) {
      const provider = modelRows[0].provider;
      const keyRows = await conn.select(
        'SELECT api_key FROM apikeys WHERE provider = ? LIMIT 1',
        [provider]
      );
      return (keyRows && keyRows.length > 0) ? keyRows[0].api_key : '';
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Fetches model names for a given provider.
 * @param {string} provider - Provider name
 * @returns {Promise<string[]>} Array of model name strings.
 */
export async function getModelsForProvider(provider) {
  try {
    const conn = await getConnection();
    const rows = await conn.select(
      'SELECT model_name FROM models WHERE LOWER(provider) = ?',
      [provider.toLowerCase()]
    );
    return rows.map(r => r.model_name);
  } catch {
    return [];
  }
}

/**
 * Fetches model names matching any of the given provider names.
 * Useful for LM Studio which uses both 'lmstudio' and 'lm-studio'.
 * @param {string[]} providers - Array of provider name variants
 * @returns {Promise<string[]>} Array of model name strings.
 */
export async function getModelsForProviders(providers) {
  try {
    const conn = await getConnection();
    const placeholders = providers.map(() => 'LOWER(provider) = ?').join(' OR ');
    const rows = await conn.select(
      `SELECT model_name FROM models WHERE ${placeholders}`,
      providers.map(p => p.toLowerCase())
    );
    return rows.map(r => r.model_name);
  } catch {
    return [];
  }
}

/**
 * Returns all distinct provider names from both models and apikeys tables.
 * @returns {Promise<string[]>} Array of unique provider strings.
 */
export async function getDistinctProviders() {
  try {
    const conn = await getConnection();
    const modelRows = await conn.select('SELECT DISTINCT provider FROM models');
    const keyRows = await conn.select('SELECT DISTINCT provider FROM apikeys');

    const providerSet = new Set();
    modelRows.forEach(r => { if (r.provider) providerSet.add(r.provider.toLowerCase()); });
    keyRows.forEach(r => { if (r.provider) providerSet.add(r.provider.toLowerCase()); });
    return Array.from(providerSet);
  } catch {
    return [];
  }
}
