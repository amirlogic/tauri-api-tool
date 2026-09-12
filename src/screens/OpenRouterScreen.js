import { chatCompletion } from '../services/llmService.js';
import { getModelsForProvider } from '../services/dbService.js';
import ChatWindow from '../components/ChatWindow.js';

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
      const modelNames = await getModelsForProvider('openrouter');
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
      const { message, status } = await chatCompletion({
        provider: 'openrouter',
        model,
        messages: updatedMessages,
        systemPrompt,
        enableReasoning
      });

      setStatus(status);
      setMessages(prev => [...prev, message]);
    } catch (err) {
      setError(`Error: ${err.message}`);
      setMessages(updatedMessages.slice(0, -1));
    } finally {
      setResponseLoading(false);
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

      <${ChatWindow}
        messages=${messages}
        loading=${responseLoading}
        userInput=${userInput}
        onSend=${sendMessage}
        onInputChange=${setUserInput}
        onClear=${clearChat}
        status=${status}
        error=${error}
        disabled=${!model}
      />
    </div>
  `;
}
