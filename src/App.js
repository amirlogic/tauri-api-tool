const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);
import { useHashRoute } from './router.js';

function DatabaseScreen() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) throw new Error("SQL plugin not available");
        const connection = await Database.load("sqlite:test.db");
        await connection.execute("CREATE TABLE IF NOT EXISTS demo (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
        setDb(connection);
        const results = await connection.select("SELECT * FROM demo");
        setItems(results);
      } catch (err) {
        console.error("DB Error:", err);
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  async function addItem() {
    if (!newItem.trim() || !db) return;
    try {
      await db.execute("INSERT INTO demo (name) VALUES (?)", [newItem]);
      const results = await db.select("SELECT * FROM demo");
      setItems(results);
      setNewItem('');
    } catch (err) {
      setError(err.toString());
    }
  }

  if (loading) return html`<div>Loading database...</div>`;
  if (error) return html`<div class="alert alert-danger">Error: ${error}</div>`;

  return html`
    <div class="mt-5">
      <h1>Database Demo</h1>
      <p>This demo uses <code>@tauri-apps/plugin-sql</code> with SQLite.</p>
      
      <div class="input-group mb-3">
        <input type="text" class="form-control" placeholder="Item name" 
               value=${newItem} oninput=${(e) => setNewItem(e.target.value)} />
        <button class="btn btn-primary" onclick=${addItem}>Add Item</button>
      </div>

      <ul class="list-group">
        ${items.map(item => html`
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${item.name}
            <span class="badge bg-secondary rounded-pill">ID: ${item.id}</span>
          </li>
        `)}
      </ul>
      ${items.length === 0 ? html`<p class="text-muted mt-2">No items found in database.</p>` : ''}
    </div>
  `;
}

function OpenRouterScreen() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [responseLoading, setResponseLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');

  async function fetchModels() {
    if (!apiKey.trim()) {
      setError('Please enter your OpenRouter API key first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'tauri-api-tool',
        },
      });

      if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
      
      const data = await response.json();
      const modelList = data.data.map(m => m.id).sort();
      setModels(modelList);
      if (modelList.length > 0 && !modelList.includes(model)) {
        setModel(modelList[0]);
      }
    } catch (err) {
      setError(`Error fetching models: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!userInput.trim() || !model || !apiKey.trim()) return;

    setResponseLoading(true);
    setError(null);

    const userMsg = { role: 'user', content: userInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setUserInput('');

    try {
      const payload = {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...updatedMessages
        ],
        temperature: 0.7,
        top_p: 1,
        top_k: 0,
        repetition_penalty: 1,
        min_p: 0,
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'tauri-api-tool',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const assistantMsg = data.choices[0].message;
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        throw new Error('Unexpected API response format');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
      // Remove the user message since we failed to get a response
      setMessages(updatedMessages.slice(0, -1));
    } finally {
      setResponseLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return html`
    <div class="mt-5">
      <h1>🚀 OpenRouter</h1>
      <p>Chat with OpenRouter models using your API key.</p>

      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <label class="form-label fw-bold">API Key</label>
          <input type="password" class="form-control" placeholder="sk-or-..."
                 value=${apiKey} oninput=${(e) => setApiKey(e.target.value)}
                 disabled=${responseLoading} />
          <small class="text-muted">Get your key from openrouter.ai</small>
        </div>
        
        <div class="col-md-6">
          <label class="form-label fw-bold">Model</label>
          <div class="input-group">
            <select class="form-select" value=${model}
                    onchange=${(e) => setModel(e.target.value)}
                    disabled=${responseLoading || models.length === 0}>
              ${models.length === 0 
                ? html`<option value="gpt-3.5-turbo">gpt-3.5-turbo (default)</option>`
                : models.map(m => html`<option value=${m} selected=${m === model}>${m}</option>`)
              }
            </select>
            <button class="btn btn-outline-secondary" onclick=${fetchModels} 
                    disabled=${loading || !apiKey.trim()}>
              ${loading ? html`<span class="spinner-border spinner-border-sm"></span>` : '🔄'}
            </button>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-12">
          <label class="form-label fw-bold">System Prompt</label>
          <textarea class="form-control" rows="2" 
                    value=${systemPrompt} 
                    oninput=${(e) => setSystemPrompt(e.target.value)}
                    disabled=${responseLoading}
                    placeholder="System instruction for the AI..."></textarea>
        </div>
      </div>

      <!-- Chat window -->
      <div class="card shadow-sm mb-4 border-0" style="height: 500px; display: flex; flex-direction: column;">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Conversation</h5>
          <button class="btn btn-sm btn-outline-danger" onclick=${clearChat} disabled=${responseLoading}>
            Clear
          </button>
        </div>
        
        <div class="card-body overflow-auto p-3" style="flex-grow: 1; background-color: #f8f9fa;">
          ${messages.length === 0 ? html`
            <div class="h-100 d-flex flex-column justify-content-center align-items-center text-muted">
              <span style="font-size: 3rem;">💬</span>
              <p>Start a conversation...</p>
            </div>
          ` : messages.map(msg => html`
            <div class="mb-3 d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}">
              <div style="max-width: 80%; padding: 10px 15px; border-radius: 12px; 
                          background: ${msg.role === 'user' ? '#007bff' : '#e9ecef'};
                          color: ${msg.role === 'user' ? 'white' : '#000'};">
                <div style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.4;">
                  ${msg.content}
                </div>
              </div>
            </div>
          `)}
          ${responseLoading ? html`
            <div class="mb-3 d-flex justify-content-start">
              <div style="padding: 10px 15px; border-radius: 12px; background: #e9ecef;">
                <span class="spinner-border spinner-border-sm text-primary"></span>
                <span class="ms-2">Thinking...</span>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="card-footer bg-white border-top p-3">
          <div class="input-group">
            <textarea class="form-control" placeholder="Type your message..." rows="1"
                      style="resize: none;"
                      value=${userInput}
                      oninput=${(e) => setUserInput(e.target.value)}
                      onkeydown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      disabled=${responseLoading || !model || !apiKey.trim()}></textarea>
            <button class="btn btn-primary" onclick=${sendMessage}
                    disabled=${responseLoading || !userInput.trim() || !model || !apiKey.trim()}>
              Send
            </button>
          </div>
          ${error ? html`<div class="alert alert-danger mt-2 mb-0 py-2 px-3">${error}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function ApiKeysScreen() {
  const [keys, setKeys] = useState([]);
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [form, setForm] = useState({ name: '', provider: '', api_key: '' });
  const [editingId, setEditingId] = useState(null);
  const [revealedIds, setRevealedIds] = useState([]);

  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) throw new Error('SQL plugin not available');
        const conn = await Database.load('sqlite:test.db');
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS apikeys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT '',
            api_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        setDb(conn);
        await loadKeys(conn);
      } catch (err) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  async function loadKeys(conn) {
    const rows = await (conn || db).select('SELECT * FROM apikeys ORDER BY id DESC');
    setKeys(rows);
  }

  async function handleSubmit() {
    const { name, provider, api_key } = form;
    if (!name.trim() || !api_key.trim()) {
      setError('Name and API Key are required.');
      return;
    }
    try {
      setError(null);
      if (editingId !== null) {
        await db.execute(
          'UPDATE apikeys SET name = ?, provider = ?, api_key = ? WHERE id = ?',
          [name.trim(), provider.trim(), api_key.trim(), editingId]
        );
        setSuccessMsg('API key updated.');
      } else {
        await db.execute(
          'INSERT INTO apikeys (name, provider, api_key) VALUES (?, ?, ?)',
          [name.trim(), provider.trim(), api_key.trim()]
        );
        setSuccessMsg('API key saved.');
      }
      setForm({ name: '', provider: '', api_key: '' });
      setEditingId(null);
      await loadKeys();
    } catch (err) {
      setError(err.toString());
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ name: row.name, provider: row.provider, api_key: row.api_key });
    setError(null);
    setSuccessMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: '', provider: '', api_key: '' });
  }

  async function deleteKey(id) {
    try {
      await db.execute('DELETE FROM apikeys WHERE id = ?', [id]);
      if (editingId === id) cancelEdit();
      setSuccessMsg('API key deleted.');
      await loadKeys();
    } catch (err) {
      setError(err.toString());
    }
  }

  function maskKey(key) {
    if (!key || key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  }

  function toggleReveal(id) {
    setRevealedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleInput(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  if (loading) return html`<div class="mt-5"><p>Loading database…</p></div>`;

  return html`
    <div class="mt-5">
      <h1>API Keys</h1>
      <p>Manage API keys for LLM providers and other services.</p>

      ${error ? html`<div class="alert alert-danger alert-dismissible">
        ${error}
        <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
      </div>` : ''}
      ${successMsg ? html`<div class="alert alert-success alert-dismissible">
        ${successMsg}
        <button type="button" class="btn-close" onclick=${() => setSuccessMsg(null)}></button>
      </div>` : ''}

      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light">
          <strong>${editingId !== null ? '✏️ Edit API Key' : '➕ Add API Key'}</strong>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Name</label>
              <input type="text" class="form-control" name="name" placeholder="e.g. My OpenAI Key"
                     value=${form.name} oninput=${handleInput} />
            </div>
            <div class="col-md-3">
              <label class="form-label">Provider</label>
              <input type="text" class="form-control" name="provider" placeholder="e.g. openai"
                     value=${form.provider} oninput=${handleInput} />
            </div>
            <div class="col-md-5">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control font-monospace" name="api_key"
                     placeholder="sk-…"
                     value=${form.api_key} oninput=${handleInput} />
            </div>
            <div class="col-12 d-flex gap-2">
              <button class="btn btn-primary" onclick=${handleSubmit}
                      disabled=${!form.name.trim() || !form.api_key.trim()}>
                ${editingId !== null ? 'Update' : 'Save'}
              </button>
              ${editingId !== null ? html`
                <button class="btn btn-outline-secondary" onclick=${cancelEdit}>Cancel</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="card shadow-sm">
        <div class="card-header bg-light">
          <strong>Stored Keys (${keys.length})</strong>
        </div>
        ${keys.length === 0
      ? html`<div class="card-body"><p class="text-muted mb-0">No API keys stored yet.</p></div>`
      : html`
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>API Key</th>
                    <th>Created</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${keys.map(row => {
        const revealed = revealedIds.includes(row.id);
        return html`
                      <tr key=${row.id} class=${editingId === row.id ? 'table-active' : ''}>
                        <td>${row.name}</td>
                        <td><span class="badge bg-secondary">${row.provider || '—'}</span></td>
                        <td class="font-monospace">
                          ${revealed ? row.api_key : maskKey(row.api_key)}
                          <button class="btn btn-sm btn-link p-0 ms-2" onclick=${() => toggleReveal(row.id)}>
                            ${revealed ? '🙈' : '👁️'}
                          </button>
                        </td>
                        <td><small class="text-muted">${row.created_at}</small></td>
                        <td class="text-end">
                          <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick=${() => startEdit(row)}>Edit</button>
                            <button class="btn btn-outline-danger" onclick=${() => deleteKey(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    `;
      })}
                </tbody>
              </table>
            </div>
          `
    }
      </div>
    </div>
  `;
}

function OllamaScreen() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/api');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadModels();
  }, [baseUrl]);

  useEffect(() => {
    const chatWin = document.getElementById('chat-window');
    if (chatWin) {
      chatWin.scrollTop = chatWin.scrollHeight;
    }
  }, [messages, loading]);

  async function loadModels() {
    try {
      setError(null);
      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
      
      const response = await fetchFn(`${baseUrl}/tags`);
      const data = tauriHttp ? response.data : await response.json();

      if (data && data.models) {
        const modelNames = data.models.map(m => m.name);
        setModels(modelNames);
        if (modelNames.length > 0 && !selectedModel) {
          setSelectedModel(modelNames[0]);
        }
      }
    } catch (err) {
      setError(`Failed to connect to Ollama at ${baseUrl}`);
    }
  }

  async function sendMessage() {
    if (!userInput.trim() || !selectedModel) return;

    setLoading(true);
    setError(null);

    const userMsg = { role: 'user', content: userInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setUserInput('');

    try {
      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
      
      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
      ];

      const response = await fetchFn(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: tauriHttp ? {
          model: selectedModel,
          messages: payloadMessages,
          stream: false
        } : JSON.stringify({
          model: selectedModel,
          messages: payloadMessages,
          stream: false
        })
      });

      const data = tauriHttp ? response.data : await response.json();

      if (data && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return html`
    <div class="mt-5">
      <h1>🦙 Ollama Chat</h1>
      <p>Chat with Ollama models running locally.</p>

      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <label class="form-label fw-bold">Ollama API URL</label>
          <input type="text" class="form-control" placeholder="http://localhost:11434/api"
                 value=${baseUrl} oninput=${(e) => setBaseUrl(e.target.value)} />
        </div>
        
        <div class="col-md-6">
          <label class="form-label fw-bold">Model</label>
          <div class="input-group">
            <select class="form-select" value=${selectedModel}
                    onchange=${(e) => setSelectedModel(e.target.value)}>
              ${models.map(m => html`<option value=${m}>${m}</option>`)}
            </select>
            <button class="btn btn-outline-secondary" onclick=${loadModels}>🔄</button>
          </div>
        </div>
      </div>

      <div class="mb-4">
        <label class="form-label fw-bold">System Prompt</label>
        <textarea class="form-control" rows="2" 
                  value=${systemPrompt} 
                  oninput=${(e) => setSystemPrompt(e.target.value)}
                  placeholder="System instruction..."></textarea>
      </div>

      <div class="card shadow-sm border-0" style="height: 500px; display: flex; flex-direction: column;">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Chat</h5>
          <button class="btn btn-sm btn-outline-secondary" onclick=${() => setMessages([])}>Clear</button>
        </div>
        
        <div class="card-body overflow-auto p-3" id="chat-window" style="flex-grow: 1;">
          ${messages.length === 0 ? html`
            <div class="text-muted text-center">Start chatting...</div>
          ` : messages.map(msg => html`
            <div class="mb-3 d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}">
              <div style="max-width: 80%; padding: 10px 15px; border-radius: 12px; 
                          background: ${msg.role === 'user' ? '#007bff' : '#e9ecef'};
                          color: ${msg.role === 'user' ? 'white' : '#000'};
                          white-space: pre-wrap; word-wrap: break-word;">
                ${msg.content}
              </div>
            </div>
          `)}
          ${loading ? html`<div class="text-muted">Thinking...</div>` : ''}
        </div>

        <div class="card-footer bg-white p-3">
          <div class="input-group">
            <textarea class="form-control" placeholder="Type message..." rows="1"
                      style="resize: none;"
                      value=${userInput}
                      oninput=${(e) => setUserInput(e.target.value)}
                      onkeydown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      disabled=${loading}></textarea>
            <button class="btn btn-primary" onclick=${sendMessage}
                    disabled=${loading || !userInput.trim()}>Send</button>
          </div>
          ${error ? html`<div class="alert alert-danger mt-2 mb-0 py-2 px-3">${error}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function App() {
  const [route, navigate] = useHashRoute();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail === 'increment-counter') {
        setCount((c) => c + 1);
      } else if (event?.detail?.startsWith('navigate-')) {
        const targetRoute = event.detail.replace('navigate-', '');
        navigate(targetRoute);
      }
    };

    window.addEventListener('tauri-menu-command', handler);
    return () => window.removeEventListener('tauri-menu-command', handler);
  }, [navigate]);

  const routeMap = {
    home: () => html`
      <div class="text-center mt-5">
        <h1>Home Page</h1>
        <p>Welcome to the Tauri API Tool!</p>
        <div class="mt-4">
          <h3>Counter Example</h3>
          <p>Count: ${count}</p>
          <button class="btn btn-primary" onclick=${() => setCount(count + 1)}>
            Increment
          </button>
        </div>
      </div>
    `,
    database: () => html`<${DatabaseScreen} />`,
    openrouter: () => html`<${OpenRouterScreen} />`,
    ollama: () => html`<${OllamaScreen} />`,
    lmstudio: () => html`<${OllamaScreen} />`,
    'api-keys': () => html`<${ApiKeysScreen} />`,
    'not-found': () => html`
      <div class="text-center mt-5">
        <h1>404 - Not Found</h1>
        <p>The path <code>${route.path}</code> does not exist.</p>
        <button class="btn btn-secondary" onclick=${() => navigate('home')}>
          Go Home
        </button>
      </div>
    `
  };

  const routeBody = (routeMap[route.name] || routeMap['not-found'])();

  return html`
    <div>
      <nav class="navbar navbar-expand-lg bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand" href="#" onclick=${(e) => { e.preventDefault(); navigate('home'); }}>
            TMA
          </a>
          
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav me-auto">
              <li class="nav-item">
                <a class="nav-link ${route.name === 'database' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('database'); }}>Database</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'openrouter' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('openrouter'); }}>OpenRouter</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'ollama' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('ollama'); }}>Ollama</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'lmstudio' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('lmstudio'); }}>LM Studio</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'api-keys' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('api-keys'); }}>API Keys</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <main class="container-fluid">
        <div class="container">
          ${routeBody}
        </div>
        <div id="image" class="min-vh-50"></div>
      </main>
    </div>
  `;
}

export default App;
