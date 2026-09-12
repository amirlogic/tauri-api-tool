import { chatCompletion } from '../services/llmService.js';
import { getModelsForProvider } from '../services/dbService.js';
import ChatWindow from '../components/ChatWindow.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function OllamaScreen({ provider = 'ollama' }) {
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
  }, [baseUrl, provider]);

  async function loadModels() {
    try {
      setError(null);
      const modelNames = await getModelsForProvider(provider);
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
      const { message, status } = await chatCompletion({
        provider: 'ollama',
        model: selectedModel,
        messages: updatedMessages,
        systemPrompt,
        baseUrl
      });

      setStatus(status);

      if (message) {
        setMessages(prev => [...prev, message]);
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setStatus(null);
  }

  return html`
    <div class="mt-5">
      <h1>${provider === 'ollama' ? '🦙 Ollama Chat' : '🖥️ LM Studio Chat'}</h1>
      <p>Chat with ${provider === 'ollama' ? 'Ollama' : 'LM Studio'} models running locally.</p>

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
              ${models.map(m => html`<option value=${m} selected=${m === selectedModel}>${m}</option>`)}
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

      <${ChatWindow}
        messages=${messages}
        loading=${loading}
        userInput=${userInput}
        onSend=${sendMessage}
        onInputChange=${setUserInput}
        onClear=${clearChat}
        status=${status}
        error=${error}
        disabled=${!selectedModel}
        emptyIcon="🦙"
        emptyText="Start chatting..."
      />
    </div>
  `;
}
