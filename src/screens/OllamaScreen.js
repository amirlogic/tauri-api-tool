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
