const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function OpenRouterScreen() {
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
