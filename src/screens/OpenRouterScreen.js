const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function OpenRouterScreen() {
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [responseLoading, setResponseLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [enableReasoning, setEnableReasoning] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  async function loadModels() {
    try {
      setLoading(true);
      setError(null);
      const Database = window.__TAURI__.sql;
      if (!Database) throw new Error('SQL plugin not available');
      const conn = await Database.load('sqlite:test.db');
      
      const rows = await conn.select("SELECT * FROM models WHERE provider = 'openrouter'");
      const modelNames = rows.map(m => m.model_name);
      
      setModels(modelNames);
      if (modelNames.length > 0 && !model) {
        setModel(modelNames[0]);
      }
    } catch (err) {
      setError(`Failed to load models from database: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const chatWin = document.getElementById('chat-window');
    if (chatWin) {
      chatWin.scrollTop = chatWin.scrollHeight;
    }
  }, [messages, responseLoading]);

  async function sendMessage() {
    if (!userInput.trim() || !model) return;

    setResponseLoading(true);
    setError(null);
    setStatus(null);

    const userMsg = { role: 'user', content: userInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setUserInput('');

    try {
      const Database = window.__TAURI__.sql;
      let dbApiKey = '';
      if (Database) {
        const conn = await Database.load('sqlite:test.db');
        const modelRows = await conn.select("SELECT provider FROM models WHERE model_name = ? LIMIT 1", [model]);
        if (modelRows && modelRows.length > 0) {
          const provider = modelRows[0].provider;
          const keyRows = await conn.select("SELECT api_key FROM apikeys WHERE provider = ? LIMIT 1", [provider]);
          if (keyRows && keyRows.length > 0) {
            dbApiKey = keyRows[0].api_key;
          }
        }
      }

      if (!dbApiKey) {
        throw new Error('API Key not found in database for this model\'s provider.');
      }

      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
      ];

      const payload = {
        model: model,
        messages: payloadMessages,
      };

      if (enableReasoning) {
        payload.reasoning = { enabled: true };
      }

      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;

      const bodyData = (tauriHttp && tauriHttp.Body && tauriHttp.Body.json) 
          ? tauriHttp.Body.json(payload) 
          : JSON.stringify(payload);

      const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${dbApiKey}`,
          'HTTP-Referer': 'tauri-api-tool',
          'Content-Type': 'application/json',
        },
        body: bodyData,
      });

      setStatus(response.status);

      if (!response.ok && response.status) {
        throw new Error(`API Error: ${response.status} ${response.statusText || ''}`);
      }

      const data = typeof response.json === 'function' ? await response.json() : response.data;
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const assistantMsg = data.choices[0].message;
        setMessages(prev => [...prev, assistantMsg]);
      } else if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      } else {
        throw new Error('Unexpected API response format');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
      setMessages(updatedMessages.slice(0, -1));
    } finally {
      setResponseLoading(false);
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

  function clearChat() {
    setMessages([]);
    setError(null);
    setStatus(null);
  }

  return html`
    <div class="mt-5">
      <h1>🚀 OpenRouter</h1>
      <p>Chat with OpenRouter models using database keys.</p>

      <div class="row g-3 mb-4">
        <div class="col-md-6 d-flex align-items-center">
          <div class="form-check form-switch mt-4">
            <input class="form-check-input" type="checkbox" role="switch" id="reasoningSwitch"
                   checked=${enableReasoning} onchange=${(e) => setEnableReasoning(e.target.checked)}
                   disabled=${responseLoading} />
            <label class="form-check-label fw-bold ms-2" for="reasoningSwitch">Enable Reasoning API</label>
          </div>
        </div>
        
        <div class="col-md-6">
          <label class="form-label fw-bold">Model</label>
          <div class="input-group">
            <select class="form-select" value=${model}
                    onchange=${(e) => setModel(e.target.value)}
                    disabled=${responseLoading || models.length === 0}>
              ${models.length === 0 
                ? html`<option value="">No models in DB</option>`
                : models.map(m => html`<option value=${m} selected=${m === model}>${m}</option>`)
              }
            </select>
            <button class="btn btn-outline-secondary" onclick=${loadModels} 
                    disabled=${loading}>
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

      <div class="card shadow-sm mb-4 border-0" style="height: 500px; display: flex; flex-direction: column;">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <h5 class="mb-0">Conversation</h5>
            ${status ? html`<span class="badge ${status === 200 ? 'bg-success' : 'bg-danger'}">HTTP ${status}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick=${clearChat} disabled=${responseLoading}>
            Clear
          </button>
        </div>
        
        <div class="card-body overflow-auto p-3" id="chat-window" style="flex-grow: 1; background-color: #f8f9fa;">
          ${messages.length === 0 ? html`
            <div class="h-100 d-flex flex-column justify-content-center align-items-center text-muted">
              <span style="font-size: 3rem;">💬</span>
              <p>Start a conversation...</p>
            </div>
          ` : messages.map(msg => html`
            <div class="mb-3 d-flex flex-column ${msg.role === 'user' ? 'align-items-end' : 'align-items-start'}">
              <div style="max-width: 80%; padding: 10px 15px; border-radius: 12px; 
                          background: ${msg.role === 'user' ? '#007bff' : '#e9ecef'};
                          color: ${msg.role === 'user' ? 'white' : '#000'};">
                <div style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.4;">
                  ${msg.content}
                </div>
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
                      disabled=${responseLoading || !model}></textarea>
            <button class="btn btn-primary" onclick=${sendMessage}
                    disabled=${responseLoading || !userInput.trim() || !model}>
              Send
            </button>
          </div>
          ${error ? html`<div class="alert alert-danger mt-2 mb-0 py-2 px-3">${error}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}
