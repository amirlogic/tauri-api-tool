const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function LMStudioScreen() {
  const [host, setHost] = useState(() => localStorage.getItem('lmstudio_host') || 'http://localhost');
  const [port, setPort] = useState(() => localStorage.getItem('lmstudio_port') || '1234');
  const [apiPrefix, setApiPrefix] = useState(() => localStorage.getItem('lmstudio_prefix') || '/v1');
  
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  // Server status states
  const [serverState, setServerState] = useState('checking'); // 'checking' | 'running' | 'stopped' | 'starting' | 'error'
  const [serverDetails, setServerDetails] = useState('');
  const [startingServer, setStartingServer] = useState(false);

  const getBaseUrl = () => {
    const cleanHost = (host || 'http://localhost').replace(/\/+$/, '');
    const cleanPort = (port || '').trim();
    const cleanPrefix = (apiPrefix || '/v1').trim().replace(/\/+$/, '');
    const prefixWithSlash = cleanPrefix.startsWith('/') ? cleanPrefix : `/${cleanPrefix}`;
    
    if (cleanPort) {
      return `${cleanHost}:${cleanPort}${prefixWithSlash}`;
    }
    return `${cleanHost}${prefixWithSlash}`;
  };

  useEffect(() => {
    localStorage.setItem('lmstudio_host', host);
  }, [host]);

  useEffect(() => {
    localStorage.setItem('lmstudio_port', port);
  }, [port]);

  useEffect(() => {
    localStorage.setItem('lmstudio_prefix', apiPrefix);
  }, [apiPrefix]);

  useEffect(() => {
    checkServerStatus();
    loadModels();
  }, [host, port, apiPrefix]);

  useEffect(() => {
    const chatWin = document.getElementById('chat-window');
    if (chatWin) {
      chatWin.scrollTop = chatWin.scrollHeight;
    }
  }, [messages, loading]);

  async function checkServerStatus() {
    setServerState('checking');
    setServerDetails('');

    const Command = window.__TAURI__?.shell?.Command;
    let cliChecked = false;

    // 1. Try lms server status --json via CLI
    if (Command) {
      try {
        let cmd = Command.create('lms', ['server', 'status', '--json']);
        let output;
        try {
          output = await cmd.execute();
        } catch (e1) {
          // Fallback to lms status --json if available
          cmd = Command.create('lms', ['status', '--json']);
          output = await cmd.execute();
        }

        if (output && output.code === 0 && output.stdout) {
          cliChecked = true;
          try {
            const parsed = JSON.parse(output.stdout.trim());
            const isRunning = parsed.status === 'ON' || parsed.status === 'running' || parsed.running === true || parsed.isOnline === true;
            if (isRunning) {
              setServerState('running');
              setServerDetails(parsed.port ? `Port ${parsed.port}` : 'Server active');
            } else {
              setServerState('stopped');
              setServerDetails('Server stopped');
            }
          } catch (jsonErr) {
            // Raw text output handling
            if (output.stdout.toLowerCase().includes('running') || output.stdout.toLowerCase().includes('on')) {
              setServerState('running');
              setServerDetails(output.stdout.trim());
            } else {
              setServerState('stopped');
              setServerDetails(output.stdout.trim());
            }
          }
        }
      } catch (cliErr) {
        // CLI command execution error or lms not in PATH
      }
    }

    // 2. Fallback to HTTP endpoint check if CLI check didn't produce result
    if (!cliChecked) {
      try {
        const baseUrl = getBaseUrl();
        const tauriHttp = window.__TAURI__?.http;
        const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
        
        const response = await fetchFn(`${baseUrl}/models`, { method: 'GET' });
        if (response) {
          setServerState('running');
          setServerDetails(`HTTP Endpoint reachable (${response.status})`);
        } else {
          setServerState('stopped');
          setServerDetails('Endpoint not responding');
        }
      } catch (httpErr) {
        setServerState('stopped');
        setServerDetails('Server offline or port unreachable');
      }
    }
  }

  async function startServer() {
    setStartingServer(true);
    setServerState('starting');
    setError(null);

    const Command = window.__TAURI__?.shell?.Command;
    if (!Command) {
      setError('Tauri shell API unavailable. Cannot launch server command.');
      setStartingServer(false);
      setServerState('stopped');
      return;
    }

    try {
      const args = port ? ['server', 'start', '--port', String(port)] : ['server', 'start'];
      const cmd = Command.create('lms', args);
      
      // Spawn or execute command
      const output = await cmd.execute();
      if (output && output.code !== 0 && output.stderr) {
        throw new Error(output.stderr);
      }

      // Wait brief moment for server to initialize
      setTimeout(async () => {
        await checkServerStatus();
        await loadModels();
        setStartingServer(false);
      }, 3000);
    } catch (err) {
      setError(`Failed to start LM Studio server: ${err.message || err}`);
      setServerState('error');
      setStartingServer(false);
    }
  }

  async function loadModels() {
    setFetchingModels(true);
    setError(null);
    let loadedModels = [];

    const baseUrl = getBaseUrl();

    // 1. Try to fetch live models from LM Studio GET /v1/models
    try {
      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
      
      const response = await fetchFn(`${baseUrl}/models`, { method: 'GET' });
      if (response.ok) {
        const data = typeof response.json === 'function' ? await response.json() : response.data;
        if (data && Array.isArray(data.data)) {
          loadedModels = data.data.map(m => m.id || m.name || String(m));
        }
      }
    } catch (e) {
      // Live fetch failed, fallback to DB
    }

    // 2. Query stored models from SQLite DB
    try {
      const Database = window.__TAURI__?.sql;
      if (Database) {
        const conn = await Database.load('sqlite:test.db');
        const rows = await conn.select("SELECT * FROM models WHERE provider = 'lmstudio' OR provider = 'lm-studio'");
        const dbModelNames = rows.map(m => m.model_name);
        
        dbModelNames.forEach(name => {
          if (!loadedModels.includes(name)) {
            loadedModels.push(name);
          }
        });
      }
    } catch (dbErr) {
      // Ignore DB load errors if DB table is empty/not present
    }

    setModels(loadedModels);
    if (loadedModels.length > 0) {
      if (!selectedModel || !loadedModels.includes(selectedModel)) {
        setSelectedModel(loadedModels[0]);
      }
    }
    setFetchingModels(false);
  }

  async function sendMessage() {
    if (!userInput.trim() || !selectedModel) return;

    setLoading(true);
    setError(null);
    setStatus(null);

    const userMsg = { role: 'user', content: userInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setUserInput('');

    try {
      const Database = window.__TAURI__?.sql;
      let apiKey = '';
      if (Database) {
        try {
          const conn = await Database.load('sqlite:test.db');
          const keyRows = await conn.select("SELECT api_key FROM apikeys WHERE provider = 'lmstudio' OR provider = 'lm-studio' LIMIT 1");
          if (keyRows && keyRows.length > 0) {
            apiKey = keyRows[0].api_key;
          }
        } catch (dbErr) {
          // No api key requirement for default local LM Studio
        }
      }

      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
      
      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
      ];

      const payloadObj = {
        model: selectedModel,
        messages: payloadMessages,
        temperature: parseFloat(temperature) || 0.7,
        stream: false
      };

      const bodyData = (tauriHttp && tauriHttp.Body && tauriHttp.Body.json) 
          ? tauriHttp.Body.json(payloadObj) 
          : JSON.stringify(payloadObj);

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const baseUrl = getBaseUrl();
      const response = await fetchFn(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: bodyData
      });

      setStatus(response.status);

      if (!response.ok && response.status) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText || ''}`);
      }

      const data = typeof response.json === 'function' ? await response.json() : response.data;

      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        setMessages(prev => [...prev, data.choices[0].message]);
      } else if (data && data.message) {
        // Fallback for non-standard or alternative response wrapper
        const msgObj = typeof data.message === 'string' ? { role: 'assistant', content: data.message } : data.message;
        setMessages(prev => [...prev, msgObj]);
      } else if (data && data.error) {
        const errStr = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
        throw new Error(errStr);
      } else {
        throw new Error('Unexpected response structure from LM Studio API.');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportToMarkdown(content) {
    try {
      const dialog = window.__TAURI__?.dialog;
      const fs = window.__TAURI__?.fs;
      if (!dialog || !fs) throw new Error('Tauri APIs are not available.');
      
      const filePath = await dialog.save({
        title: 'Save Markdown',
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }]
      });
      
      if (filePath) {
        await fs.writeTextFile(filePath, content);
      }
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    }
  }

  const baseUrl = getBaseUrl();

  return html`
    <div class="mt-5">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <h1 class="mb-0">🖥️ LM Studio Chat</h1>
        <span class="badge bg-secondary font-monospace">${baseUrl}</span>
      </div>
      <p class="text-muted">Chat with local models using LM Studio's OpenAI-compatible REST API.</p>

      <div class="card shadow-sm border-0 mb-4 bg-light">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="fw-bold mb-0">⚙️ Server & Port Configuration</h6>
            
            <div class="d-flex align-items-center gap-2">
              <span class="small fw-bold me-1">Server Status:</span>
              ${serverState === 'running' ? html`
                <span class="badge bg-success p-2">🟢 Server Online ${serverDetails ? `(${serverDetails})` : ''}</span>
              ` : serverState === 'starting' ? html`
                <span class="badge bg-warning text-dark p-2">
                  <span class="spinner-border spinner-border-sm me-1"></span> Starting Server...
                </span>
              ` : serverState === 'checking' ? html`
                <span class="badge bg-secondary p-2">
                  <span class="spinner-border spinner-border-sm me-1"></span> Checking Status...
                </span>
              ` : html`
                <span class="badge bg-danger p-2">🔴 Server Offline</span>
              `}

              <button class="btn btn-sm btn-outline-secondary" onclick=${checkServerStatus} disabled=${serverState === 'checking' || startingServer} title="Refresh Server Status">
                🔄 Status
              </button>

              ${(serverState === 'stopped' || serverState === 'error') ? html`
                <button class="btn btn-sm btn-primary" onclick=${startServer} disabled=${startingServer}>
                  🚀 Start LM Studio Server
                </button>
              ` : ''}
            </div>
          </div>

          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label small fw-bold">Host / Protocol</label>
              <input type="text" class="form-control" value=${host} 
                     oninput=${(e) => setHost(e.target.value)} 
                     placeholder="http://localhost" />
            </div>

            <div class="col-md-3">
              <label class="form-label small fw-bold">Port Number</label>
              <input type="number" class="form-control font-monospace" value=${port} 
                     oninput=${(e) => setPort(e.target.value)} 
                     placeholder="1234" />
            </div>

            <div class="col-md-4">
              <label class="form-label small fw-bold">API Prefix</label>
              <input type="text" class="form-control" value=${apiPrefix} 
                     oninput=${(e) => setApiPrefix(e.target.value)} 
                     placeholder="/v1" />
            </div>
          </div>
          <div class="mt-2 text-muted small">
            Endpoint target: <code>${baseUrl}/chat/completions</code>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <label class="form-label fw-bold">Model Identifier</label>
          <div class="input-group">
            ${models.length > 0 ? html`
              <select class="form-select" value=${selectedModel}
                      onchange=${(e) => setSelectedModel(e.target.value)}>
                ${models.map(m => html`<option value=${m} selected=${m === selectedModel}>${m}</option>`)}
              </select>
            ` : html`
              <input type="text" class="form-control" value=${selectedModel}
                     oninput=${(e) => setSelectedModel(e.target.value)}
                     placeholder="e.g. local-model or llama-3" />
            `}
            <button class="btn btn-outline-secondary" onclick=${loadModels} disabled=${fetchingModels} title="Refresh / Fetch Live Models">
              ${fetchingModels ? html`<span class="spinner-border spinner-border-sm"></span>` : '🔄'}
            </button>
          </div>
          <div class="form-text small">Select from detected live models or type model ID manually.</div>
        </div>

        <div class="col-md-6">
          <label class="form-label fw-bold">Temperature: ${temperature}</label>
          <input type="range" class="form-range" min="0" max="2" step="0.1"
                 value=${temperature} oninput=${(e) => setTemperature(e.target.value)} />
        </div>
      </div>

      <div class="mb-4">
        <label class="form-label fw-bold">System Prompt</label>
        <textarea class="form-control" rows="2" 
                  value=${systemPrompt} 
                  oninput=${(e) => setSystemPrompt(e.target.value)}
                  placeholder="System instruction for LM Studio..."></textarea>
      </div>

      <div class="card shadow-sm border-0" style="height: 500px; display: flex; flex-direction: column;">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <h5 class="mb-0">Chat</h5>
            ${status ? html`<span class="badge ${status === 200 ? 'bg-success' : 'bg-danger'}">HTTP ${status}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-outline-secondary" onclick=${() => { setMessages([]); setError(null); setStatus(null); }}>Clear</button>
        </div>
        
        <div class="card-body overflow-auto p-3" id="chat-window" style="flex-grow: 1; background-color: #f8f9fa;">
          ${messages.length === 0 ? html`
            <div class="h-100 d-flex flex-column justify-content-center align-items-center text-muted">
              <span style="font-size: 3rem;">🖥️</span>
              <p>Start chatting with LM Studio...</p>
            </div>
          ` : messages.map(msg => html`
            <div class="mb-3 d-flex flex-column ${msg.role === 'user' ? 'align-items-end' : 'align-items-start'}">
              <div style="max-width: 80%; padding: 10px 15px; border-radius: 12px; 
                          background: ${msg.role === 'user' ? '#007bff' : '#e9ecef'};
                          color: ${msg.role === 'user' ? 'white' : '#000'};
                          white-space: pre-wrap; word-wrap: break-word; line-height: 1.4;">
                ${msg.content}
              </div>
              ${msg.role !== 'user' ? html`
                <div class="mt-1 ms-2">
                  <a href="#" class="text-decoration-none small text-muted" 
                     onclick=${(e) => { e.preventDefault(); exportToMarkdown(msg.content); }}>
                    export to markdown
                  </a>
                </div>
              ` : ''}
            </div>
          `)}
          ${loading ? html`
            <div class="mb-3 d-flex justify-content-start">
              <div style="padding: 10px 15px; border-radius: 12px; background: #e9ecef;">
                <span class="spinner-border spinner-border-sm text-primary"></span>
                <span class="ms-2">LM Studio is thinking...</span>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="card-footer bg-white p-3 border-top">
          <div class="input-group">
            <textarea class="form-control" placeholder="Type message..." rows="1"
                      style="resize: none;"
                      value=${userInput}
                      oninput=${(e) => setUserInput(e.target.value)}
                      onkeydown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      disabled=${loading}></textarea>
            <button class="btn btn-primary" onclick=${sendMessage}
                    disabled=${loading || !userInput.trim() || !selectedModel}>Send</button>
          </div>
          ${error ? html`<div class="alert alert-danger mt-2 mb-0 py-2 px-3">${error}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}
