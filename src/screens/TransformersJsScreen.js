import { httpFetch, parseAssistantResponse } from '../services/llmService.js';
import ChatWindow from '../components/ChatWindow.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

const DEFAULT_PORT = '3000';

export default function TransformersJsScreen() {
  const [port, setPort] = useState(() => localStorage.getItem('transformersjs_port') || DEFAULT_PORT);
  const [model, setModel] = useState('lfm3');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const portNumber = Number(port);
  const validPort = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const endpoint = validPort
    ? `http://127.0.0.1:${portNumber}/v1/chat/completions`
    : '';

  useEffect(() => {
    localStorage.setItem('transformersjs_port', port);
  }, [port]);

  async function sendMessage() {
    const userText = userInput.trim();
    const modelName = model.trim();
    if (!userText || !modelName || loading) return;

    if (!validPort) {
      setError('Enter a port number between 1 and 65535.');
      return;
    }

    const updatedMessages = [...messages, { role: 'user', content: userText }];
    const requestMessages = systemPrompt.trim()
      ? [{ role: 'system', content: systemPrompt.trim() }, ...updatedMessages]
      : updatedMessages;

    setLoading(true);
    setError(null);
    setStatus(null);
    setMessages(updatedMessages);
    setUserInput('');

    try {
      const response = await httpFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          model: modelName,
          messages: requestMessages,
          max_tokens: 512
        }
      });

      setStatus(response.status);
      if (!response.ok) {
        const apiError = response.data?.error;
        const detail = (typeof apiError === 'object' && apiError !== null
          ? apiError.message || apiError.detail || JSON.stringify(apiError)
          : apiError)
          || response.data?.message
          || `HTTP ${response.status}`;
        throw new Error(`Transformers.js request failed: ${detail}`);
      }

      const message = parseAssistantResponse(response.data, 'transformersjs');
      if (!message.content.trim()) {
        throw new Error('The server returned an empty assistant response.');
      }
      setMessages(previous => [...previous, message]);
    } catch (err) {
      setMessages(messages);
      setUserInput(userText);
      setError(err.message || String(err));
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
      <h1>Transformers.js</h1>
      <p class="text-muted">Chat with a Transformers.js model served by your local HTTP API.</p>

      <div class="card shadow-sm border-0 mb-4 bg-light">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-bold" for="transformersjs-port">Server port</label>
              <input id="transformersjs-port" type="number" class="form-control font-monospace"
                     min="1" max="65535" step="1" value=${port}
                     oninput=${(event) => setPort(event.target.value)}
                     disabled=${loading} />
              ${port && !validPort ? html`
                <div class="form-text text-danger">Enter a port number between 1 and 65535.</div>
              ` : ''}
            </div>
            <div class="col-md-8">
              <label class="form-label fw-bold" for="transformersjs-model">Model</label>
              <input id="transformersjs-model" type="text" class="form-control font-monospace"
                     value=${model} oninput=${(event) => setModel(event.target.value)}
                     disabled=${loading} />
            </div>
          </div>
          <div class="mt-2 small text-muted">
            API endpoint: <code>${endpoint || 'http://127.0.0.1:<port>/v1/chat/completions'}</code>
          </div>
        </div>
      </div>

      <div class="mb-4">
        <label class="form-label fw-bold" for="transformersjs-system-prompt">System prompt</label>
        <textarea id="transformersjs-system-prompt" class="form-control" rows="2"
                  value=${systemPrompt}
                  oninput=${(event) => setSystemPrompt(event.target.value)}
                  disabled=${loading}
                  placeholder="System instruction for the model..."></textarea>
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
        disabled=${!validPort || !model.trim()}
        emptyIcon="🤖"
        emptyText="Start chatting with Transformers.js..."
        loadingText="Transformers.js is generating a response..."
      />
    </div>
  `;
}
