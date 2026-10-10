/**
 * llmService.js — Unified LLM API client.
 *
 * Provides provider-agnostic chat completion calls with:
 * - Automatic Tauri HTTP vs browser fetch detection
 * - Provider-specific endpoint resolution
 * - Provider-specific header construction
 * - Unified response parsing (OpenAI vs Ollama formats)
 */

import { getApiKey, getApiKeyForModel } from './dbService.js';

// ---------------------------------------------------------------------------
// HTTP Client Wrapper
// ---------------------------------------------------------------------------

/**
 * Unified HTTP fetch that auto-detects Tauri HTTP plugin vs browser fetch.
 * Normalizes the response to a consistent shape.
 *
 * @param {string} url - Request URL
 * @param {object} options - { method, headers, body (plain object) }
 * @returns {Promise<{ status: number, ok: boolean, data: any }>}
 */
export async function httpFetch(url, { method = 'GET', headers = {}, body = null } = {}) {
  const tauriHttp = window.__TAURI__?.http;
  const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;

  const fetchOptions = { method, headers };

  if (body !== null) {
    if (tauriHttp && tauriHttp.Body && tauriHttp.Body.json) {
      fetchOptions.body = tauriHttp.Body.json(body);
    } else {
      fetchOptions.body = JSON.stringify(body);
    }
  }

  const response = await fetchFn(url, fetchOptions);

  const status = response.status;
  const ok = response.ok !== undefined ? response.ok : (status >= 200 && status < 300);
  let data = response.data;

  if (data === undefined && typeof response.text === 'function') {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  } else if (data === undefined && typeof response.json === 'function') {
    data = await response.json();
  }

  return { status, ok, data };
}

function getErrorDetail(data) {
  if (!data) return '';

  const error = data.error ?? data.message ?? data;
  const detail = typeof error === 'string'
    ? error
    : error.message || error.detail || error.details || error.code || JSON.stringify(error);

  return String(detail).trim().slice(0, 600);
}

function getHttpStatusLabel(status) {
  return ({
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    413: 'Payload Too Large',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  })[status] || 'Request Failed';
}

function getHttpStatusGuidance(provider, status) {
  const isOpenRouter = provider === 'openrouter';
  const isOllama = provider === 'ollama';
  const isLMStudio = provider === 'lmstudio' || provider === 'lm-studio';

  if (status === 400) {
    return 'The provider rejected the request. Check the model name and request settings.';
  }
  if (status === 401 || status === 403) {
    return isOpenRouter
      ? 'Check that the API key is valid, enabled, and has available credits.'
      : 'Check the API key configured for this local server, if authentication is enabled.';
  }
  if (status === 404) {
    return isOllama
      ? 'Check the Ollama API URL and confirm this model is installed (for example, run `ollama pull <model>`).'
      : isLMStudio
        ? 'Check the LM Studio host, port, and API prefix, and confirm the selected model is loaded.'
        : 'Check that the selected model is available to your OpenRouter account.';
  }
  if (status === 408 || status === 504) {
    return 'The provider timed out. Try again, or use a smaller prompt or a faster model.';
  }
  if (status === 413) {
    return 'The request is too large. Shorten the conversation or reduce the prompt size.';
  }
  if (status === 429) {
    return isOpenRouter
      ? 'The account or model rate limit was reached, or credits are unavailable. Wait and retry, or check your OpenRouter limits.'
      : 'The provider is rate limiting requests. Wait briefly and try again.';
  }
  if (status >= 500) {
    return 'The provider reported a server-side failure. Check that it is running and retry shortly.';
  }
  return 'Check the provider configuration and try again.';
}

function getNetworkGuidance(provider) {
  if (provider === 'ollama') {
    return 'Confirm Ollama is running and that the configured API URL is correct.';
  }
  if (provider === 'lmstudio' || provider === 'lm-studio') {
    return 'Confirm the LM Studio server is running and that the configured host, port, and API prefix are correct.';
  }
  return 'Check your internet connection and confirm the provider is reachable.';
}

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

/**
 * Resolves the chat completions endpoint URL for a given provider.
 *
 * @param {string} provider - 'openrouter' | 'ollama' | 'lmstudio' | 'lm-studio'
 * @param {object} [options]
 * @param {string} [options.baseUrl] - Override base URL (used by Ollama's URL selector)
 * @returns {string} Full endpoint URL
 */
export function getProviderEndpoint(provider, options = {}) {
  const prov = provider.toLowerCase();

  if (prov === 'openrouter') {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  if (prov === 'ollama') {
    const base = options.baseUrl || 'http://localhost:11434/api';
    return `${base.replace(/\/+$/, '')}/chat`;
  }

  if (prov === 'lmstudio' || prov === 'lm-studio') {
    if (options.baseUrl) {
      return `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    }
    // Build from localStorage (same keys LMStudioScreen uses)
    const host = (localStorage.getItem('lmstudio_host') || 'http://localhost').replace(/\/+$/, '');
    const port = (localStorage.getItem('lmstudio_port') || '1234').trim();
    const prefix = (localStorage.getItem('lmstudio_prefix') || '/v1').trim().replace(/\/+$/, '');
    const prefixWithSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
    const base = port ? `${host}:${port}${prefixWithSlash}` : `${host}${prefixWithSlash}`;
    return `${base}/chat/completions`;
  }

  // Unknown provider: default to OpenRouter
  return 'https://openrouter.ai/api/v1/chat/completions';
}

/**
 * Builds provider-specific HTTP headers.
 *
 * @param {string} provider
 * @param {string} apiKey
 * @returns {object} Headers object
 */
export function getProviderHeaders(provider, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  const prov = provider.toLowerCase();

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (prov === 'openrouter') {
    headers['HTTP-Referer'] = 'tauri-api-tool';
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parses the LLM API response data into a normalized assistant message.
 * Handles both OpenAI format (choices[0].message) and Ollama format (data.message).
 *
 * @param {object} data - Raw response data
 * @param {string} provider - Provider name for format detection
 * @returns {{ role: string, content: string }} Normalized message object
 * @throws {Error} If response contains an error or unexpected format
 */
export function parseAssistantResponse(data, provider) {
  if (!data) {
    throw new Error('Empty response from LLM API.');
  }

  // Check for error responses first
  if (data.error) {
    const errMsg = typeof data.error === 'object'
      ? (data.error.message || JSON.stringify(data.error))
      : data.error;
    throw new Error(errMsg);
  }

  // OpenAI format: choices[0].message
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const msg = data.choices[0].message;
    return { role: msg.role || 'assistant', content: msg.content || '' };
  }

  // Ollama format: data.message (object with role + content)
  if (data.message) {
    if (typeof data.message === 'string') {
      return { role: 'assistant', content: data.message };
    }
    return {
      role: data.message.role || 'assistant',
      content: data.message.content || ''
    };
  }

  throw new Error('Unexpected response format from LLM API.');
}

// ---------------------------------------------------------------------------
// Chat Completion
// ---------------------------------------------------------------------------

/**
 * Sends a chat completion request to any supported LLM provider.
 *
 * @param {object} params
 * @param {string} params.provider - 'openrouter' | 'ollama' | 'lmstudio' | 'lm-studio'
 * @param {string} params.model - Model identifier
 * @param {Array<{ role: string, content: string }>} params.messages - Chat history (user + assistant messages, no system)
 * @param {string} [params.systemPrompt] - System prompt (prepended automatically)
 * @param {number} [params.temperature] - Temperature (only sent if provided)
 * @param {boolean} [params.enableReasoning] - Enable reasoning API (OpenRouter-specific)
 * @param {string} [params.baseUrl] - Override base URL for the provider
 * @param {string} [params.apiKey] - Explicit API key (skips DB lookup if provided)
 * @returns {Promise<{ message: { role: string, content: string }, status: number }>}
 */
export async function chatCompletion({
  provider,
  model,
  messages,
  systemPrompt,
  temperature,
  enableReasoning = false,
  baseUrl,
  apiKey
}) {
  const prov = provider.toLowerCase();

  // Resolve API key: use explicit key, or look up from DB
  if (apiKey === undefined || apiKey === null) {
    try {
      if (prov === 'lmstudio' || prov === 'lm-studio') {
        // LM Studio: look up directly by provider (key is optional)
        apiKey = await getApiKey('lmstudio');
        if (!apiKey) apiKey = await getApiKey('lm-studio');
      } else {
        // Other providers: look up by model's provider mapping
        apiKey = await getApiKeyForModel(model);
      }
    } catch (error) {
      throw new Error(
        `Could not retrieve the saved API key for ${provider} from the app database. ` +
        `Check that the database is available and the key is configured. Details: ${error.message || error}`
      );
    }
  }

  // Build endpoint and headers
  const endpoint = getProviderEndpoint(prov, { baseUrl });
  const headers = getProviderHeaders(prov, apiKey);

  // Build payload messages (prepend system prompt)
  const payloadMessages = [];
  if (systemPrompt) {
    payloadMessages.push({ role: 'system', content: systemPrompt });
  }
  payloadMessages.push(...messages);

  // Build request payload
  const payload = {
    model,
    messages: payloadMessages,
    stream: false
  };

  if (temperature !== undefined && temperature !== null) {
    payload.temperature = parseFloat(temperature) || 0.7;
  }

  if (enableReasoning && prov === 'openrouter') {
    payload.reasoning = { enabled: true };
  }

  // Require API key for OpenRouter
  if (prov === 'openrouter' && !apiKey) {
    throw new Error(
      `No API key is configured for OpenRouter model "${model}". ` +
      'Add an OpenRouter key in API Keys and make sure this model is mapped to the OpenRouter provider.'
    );
  }

  // Send request
  let response;
  try {
    response = await httpFetch(endpoint, {
      method: 'POST',
      headers,
      body: payload
    });
  } catch (error) {
    throw new Error(
      `${provider} could not be reached at ${endpoint}. ${getNetworkGuidance(prov)} ` +
      `Connection details: ${error.message || error}`
    );
  }

  const { status, ok, data } = response;
  if (!ok) {
    const detail = getErrorDetail(data);
    throw new Error(
      `${provider} request failed: HTTP Error: ${status} ${getHttpStatusLabel(status)} at ${endpoint}. ` +
      `${getHttpStatusGuidance(prov, status)}${detail ? ` Provider detail: ${detail}` : ''}`
    );
  }

  // Parse response
  let message;
  try {
    message = parseAssistantResponse(data, prov);
  } catch (error) {
    const detail = getErrorDetail(data);
    throw new Error(
      `${provider} returned an unusable response (HTTP ${status}) from ${endpoint}. ` +
      `${detail ? `Provider detail: ${detail}` : error.message} ` +
      'Check that the selected model supports chat completions and that the provider endpoint is correct.'
    );
  }

  if (typeof message.content !== 'string' || !message.content.trim()) {
    throw new Error(
      `${provider} returned an empty assistant message for model "${model}" (HTTP ${status}). ` +
      'Try a different model or check whether this model requires special chat or reasoning settings.'
    );
  }

  return { message, status };
}
