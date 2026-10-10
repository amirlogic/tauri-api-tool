import { chatCompletion } from '../services/llmService.js';
import { getModelsForProvider } from '../services/dbService.js';
import ChatWindow from '../components/ChatWindow.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function HuggingFaceScreen() {
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [providerPolicy, setProviderPolicy] = useState('cheapest');
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [responseLoading, setResponseLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');

  useEffect(() => {
    loadModels();
  }, []);

  async function loadModels() {
    try {
      setLoadingModels(true);
      setError(null);
      const modelNames = await getModelsForProvider('huggingface');
      setModels(modelNames);
      if (modelNames.length > 0 && !modelNames.includes(model)) {
        setModel(modelNames[0]);
      } else if (modelNames.length === 0) {
        setModel('');
      }
    } catch (err) {
      setError(`Failed to load models from database: ${err.message}`);
    } finally {
      setLoadingModels(false);
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
      const result = await chatCompletion({
        provider: 'huggingface',
        model,
        messages: updatedMessages,
        systemPrompt,
        inferenceProviderPolicy: providerPolicy
      });

      setStatus(result.status);
      setMessages(prev => [...prev, result.message]);
    } catch (err) {
      setError(err.message || String(err));
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
      <h1>🤗 HuggingFace</h1>
      <p>Chat with Hugging Face Inference Providers using a saved Hugging Face token.</p>

      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <label class="form-label fw-bold">Model</label>
          <div class="input-group">
            <select class="form-select" value=${model}
                    onchange=${(e) => setModel(e.target.value)}
                    disabled=${responseLoading || models.length === 0}>
              ${models.length === 0
                ? html`<option value="">No Hugging Face models in database</option>`
                : models.map(name => html`<option value=${name} selected=${name === model}>${name}</option>`)
              }
            </select>
            <button class="btn btn-outline-secondary" onclick=${loadModels}
                    disabled=${loadingModels || responseLoading}>
              ${loadingModels ? html`<span class="spinner-border spinner-border-sm"></span>` : '🔄'}
            </button>
          </div>
        </div>

        <div class="col-md-6">
          <label class="form-label fw-bold">Inference Provider Policy</label>
          <select class="form-select" value=${providerPolicy}
                  onchange=${(e) => setProviderPolicy(e.target.value)}
                  disabled=${responseLoading}>
            <option value="cheapest">Cheapest (recommended)</option>
            <option value="fastest">Fastest</option>
            <option value="preferred">Preferred providers</option>
          </select>
          <div class="form-text">Cheapest selects the lowest-priced available provider per output token.</div>
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
        emptyIcon="🤗"
        emptyText="Start chatting with Hugging Face..."
      />

      ${models.length === 0 ? html`
        <div class="alert alert-info">
          Add a model in Models with provider <code>huggingface</code>, and add a token in API Keys
          with provider <code>huggingface</code>. The token needs Inference Providers permission.
        </div>
      ` : ''}
    </div>
  `;
}
