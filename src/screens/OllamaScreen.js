const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function OllamaScreen() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/api');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

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
      const Database = window.__TAURI__.sql;
      if (!Database) throw new Error('SQL plugin not available');
      const conn = await Database.load('sqlite:test.db');
      
      const rows = await conn.select("SELECT * FROM models");
      const modelNames = rows.map(m => m.model_name);
      
      setModels(modelNames);
      if (modelNames.length > 0 && !selectedModel) {
        setSelectedModel(modelNames[0]);
      }
    } catch (err) {
      setError(`Failed to load models from database: ${err.message}`);
    }
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
      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;
      
      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
      ];

      const payloadObj = {
        model: selectedModel,
        messages: payloadMessages,
        stream: false
      };

      const bodyData = (tauriHttp && tauriHttp.Body && tauriHttp.Body.json) 
          ? tauriHttp.Body.json(payloadObj) 
          : JSON.stringify(payloadObj);

      const response = await fetchFn(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyData
      });

      setStatus(response.status);

      if (!response.ok && response.status) {
         throw new Error(`HTTP Error: ${response.status} ${response.statusText || ''}`);
      }

      const data = typeof response.json === 'function' ? await response.json() : response.data;

      if (data && data.message) {
        setMessages(prev => [...prev, data.message]);
      } else if (data && data.error) {
        throw new Error(data.error);
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
          <label class="form-label fw-bold">Ollama API Environment</label>
          <select class="form-select" value=${baseUrl} onchange=${(e) => setBaseUrl(e.target.value)}>
            <option value="http://localhost:11434/api">Localhost (http://localhost:11434/api)</option>
            <option value="https://ollama.com/api">Ollama.com (https://ollama.com/api)</option>
          </select>
        </div>
        
        <div class="col-md-6">
          <label class="form-label fw-bold">Model</label>
          <div class="input-group">
            <select class="form-select" value=${selectedModel}
                    onchange=${(e) => setSelectedModel(e.target.value)}>
              ${models.map(m => html`<option value=${m}>${m}</option>`) }
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
          <div class="d-flex align-items-center gap-2">
            <h5 class="mb-0">Chat</h5>
            ${status ? html`<span class="badge ${status === 200 ? 'bg-success' : 'bg-danger'}">HTTP ${status}</span>` : ''}
          </div>
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
