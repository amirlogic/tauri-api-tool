import { chatCompletion } from '../services/llmService.js';
import { getModelsForProvider, getModelsForProviders, getDistinctProviders, getConnection, ensureTables } from '../services/dbService.js';
import ChatWindow from '../components/ChatWindow.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function GitScreen() {
  // Repository state
  const [folderPath, setFolderPath] = useState(() => localStorage.getItem('git_repo_path') || '');
  const [gitStatusOutput, setGitStatusOutput] = useState('');
  const [gitLogOutput, setGitLogOutput] = useState('');
  const [showGitContext, setShowGitContext] = useState(false);
  const [activeGitTab, setActiveGitTab] = useState('status'); // 'status' | 'log'

  // LLM & Provider states
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are an expert Git assistant. Help the user manage and understand their local git repository, write commit messages, troubleshoot git issues, and execute correct git workflows.'
  );

  // Chat & Execution states
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingDb, setLoadingDb] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  // Load providers and models from DB on mount
  useEffect(() => {
    loadDatabaseInfo();
  }, []);

  // Save selected repo path to localStorage
  useEffect(() => {
    if (folderPath) {
      localStorage.setItem('git_repo_path', folderPath);
    }
  }, [folderPath]);

  // Load models whenever provider changes
  useEffect(() => {
    if (selectedProvider) {
      loadModelsForProvider(selectedProvider);
    }
  }, [selectedProvider]);

  async function loadDatabaseInfo() {
    setLoadingDb(true);
    setError(null);
    try {
      const conn = await getConnection();
      await ensureTables(conn);

      const dbProviders = await getDistinctProviders();
      const providerSet = new Set(['openrouter', 'ollama', 'lmstudio', ...dbProviders]);
      const providerList = Array.from(providerSet);
      setProviders(providerList);

      if (providerList.length > 0) {
        const initial = providerList.includes('openrouter') ? 'openrouter' : providerList[0];
        setSelectedProvider(initial);
      }
    } catch (err) {
      console.error('Error loading DB info in GitScreen:', err);
      setProviders(['openrouter', 'ollama', 'lmstudio']);
      setSelectedProvider('openrouter');
    } finally {
      setLoadingDb(false);
    }
  }

  async function loadModelsForProvider(prov) {
    try {
      let modelList = [];
      if (prov === 'lmstudio' || prov === 'lm-studio') {
        modelList = await getModelsForProviders(['lmstudio', 'lm-studio']);
      } else {
        modelList = await getModelsForProvider(prov);
      }

      setModels(modelList);
      if (modelList.length > 0) {
        setSelectedModel(modelList[0]);
      } else {
        setSelectedModel('');
      }
    } catch (err) {
      console.error('Error loading models for provider:', err);
      setModels([]);
      setSelectedModel('');
    }
  }

  async function handleSelectFolder() {
    try {
      const dialog = window.__TAURI__?.dialog;
      if (!dialog) throw new Error('Tauri Dialog plugin not available.');

      const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository Folder'
      });

      if (selected) {
        setFolderPath(selected);
        setError(null);
        // Pre-fetch git status & log
        fetchGitInfo(selected);
      }
    } catch (err) {
      setError(`Folder selection failed: ${err.message}`);
    }
  }

  async function runGitCommand(repoPath, args) {
    const Command = window.__TAURI__?.shell?.Command;
    if (!Command) throw new Error('Tauri Shell plugin not available.');

    const fullArgs = ['-C', repoPath, ...args];
    try {
      const res = await Command.create('git', fullArgs).execute();
      return res;
    } catch (err) {
      try {
        const res = await Command.create('git.exe', fullArgs).execute();
        return res;
      } catch (err2) {
        throw new Error(`Git command failed: ${err.message || err}`);
      }
    }
  }

  async function fetchGitInfo(repoPath) {
    if (!repoPath) return { statusText: '', logText: '' };
    try {
      const statusRes = await runGitCommand(repoPath, ['status']);
      const statusText = statusRes.stdout || statusRes.stderr || 'No output from git status';
      setGitStatusOutput(statusText);

      const logRes = await runGitCommand(repoPath, ['log', '-n', '10', '--stat']);
      const logText = logRes.stdout || logRes.stderr || 'No output from git log';
      setGitLogOutput(logText);

      return { statusText, logText, statusRes, logRes };
    } catch (err) {
      const errorMsg = `Error running git: ${err.message}`;
      setGitStatusOutput(errorMsg);
      setGitLogOutput(errorMsg);
      return { statusText: errorMsg, logText: errorMsg };
    }
  }

  async function handleSubmit() {
    if (!folderPath.trim()) {
      setError('Please select a local repository folder first.');
      return;
    }
    if (!selectedProvider) {
      setError('Please select an LLM provider.');
      return;
    }
    if (!selectedModel) {
      setError('Please select or specify an LLM model.');
      return;
    }
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);

    const userPromptText = prompt.trim();
    const userMsg = { role: 'user', content: userPromptText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setPrompt('');

    try {
      // 1. Perform git status and git log
      setLoadingStep('Running git status and git log...');
      const { statusText, logText, statusRes } = await fetchGitInfo(folderPath.trim());

      if (statusRes && statusRes.code !== 0 && statusText.toLowerCase().includes('not a git repository')) {
        setError(`Warning: "${folderPath}" does not appear to be a valid Git repository.`);
      }

      // 2. Build contextual prompt with Git information
      const gitContextBlock = `=== Local Git Repository Context ===
Folder Path: ${folderPath.trim()}

--- [git status] ---
${statusText}

--- [git log (latest 10 commits)] ---
${logText}
====================================`;

      const fullSystemPrompt = `${systemPrompt.trim()}

${gitContextBlock}

Please use the Git repository status and log context provided above to give specific, accurate, and actionable recommendations or explanations.`;

      // 3. Send request to LLM API provider
      setLoadingStep(`Sending request to ${selectedProvider.toUpperCase()} (${selectedModel})...`);
      const { message, status: respStatus } = await chatCompletion({
        provider: selectedProvider,
        model: selectedModel,
        messages: updatedMessages,
        systemPrompt: fullSystemPrompt
      });

      setStatus(respStatus);
      setMessages(prev => [...prev, message]);
    } catch (err) {
      setError(`Error: ${err.message}`);
      // Remove the last pending user message on error so user can retry
      setMessages(updatedMessages.slice(0, -1));
      setPrompt(userPromptText);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  function handleQuickPrompt(template) {
    setPrompt(template);
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setStatus(null);
  }

  return html`
    <div class="mt-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 class="fw-bold mb-1">🌿 Git AI Assistant</h2>
          <p class="text-muted small mb-0">Get intelligent assistance for your local Git repository with real-time status and commit history context.</p>
        </div>
      </div>

      ${error ? html`
        <div class="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <strong>Notice:</strong> ${error}
          <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
        </div>
      ` : ''}

      <!-- Configuration Card -->
      <div class="card shadow-sm mb-4 border-0 bg-light">
        <div class="card-body">
          <div class="row g-3">
            <!-- Folder Selector -->
            <div class="col-md-6">
              <label class="form-label small fw-bold">📁 Git Repository Folder</label>
              <div class="input-group input-group-sm">
                <input type="text" class="form-control font-monospace"
                       value=${folderPath}
                       oninput=${(e) => setFolderPath(e.target.value)}
                       placeholder="Select or enter local git repository path..."
                       disabled=${loading} />
                <button class="btn btn-outline-secondary" onclick=${handleSelectFolder} disabled=${loading}>
                  Browse...
                </button>
                <button class="btn btn-outline-primary" onclick=${() => fetchGitInfo(folderPath)} disabled=${loading || !folderPath} title="Refresh Git Status & Log">
                  🔄
                </button>
              </div>
              <div class="form-text small">Select the root directory of your local git repository.</div>
            </div>

            <!-- Provider Selector -->
            <div class="col-md-3">
              <label class="form-label small fw-bold">🤖 Provider</label>
              <select class="form-select form-select-sm"
                      value=${selectedProvider}
                      onchange=${(e) => setSelectedProvider(e.target.value)}
                      disabled=${loading || loadingDb}>
                ${providers.map(p => html`
                  <option value=${p} selected=${p === selectedProvider}>${p.toUpperCase()}</option>
                `)}
              </select>
              <div class="form-text small">LLM provider logic from database.</div>
            </div>

            <!-- Model Selector -->
            <div class="col-md-3">
              <label class="form-label small fw-bold">🧠 Model</label>
              <div class="input-group input-group-sm">
                ${models.length > 0 ? html`
                  <select class="form-select form-select-sm"
                          value=${selectedModel}
                          onchange=${(e) => setSelectedModel(e.target.value)}
                          disabled=${loading}>
                    ${models.map(m => html`
                      <option value=${m} selected=${m === selectedModel}>${m}</option>
                    `)}
                  </select>
                ` : html`
                  <input type="text" class="form-control form-control-sm"
                         value=${selectedModel}
                         oninput=${(e) => setSelectedModel(e.target.value)}
                         placeholder="Model identifier (e.g. gpt-4o)"
                         disabled=${loading} />
                `}
                <button class="btn btn-outline-secondary" onclick=${() => loadModelsForProvider(selectedProvider)} disabled=${loading} title="Reload models">
                  🔄
                </button>
              </div>
              <div class="form-text small">Configured models for ${selectedProvider}.</div>
            </div>
          </div>

          <!-- Collapsible Git Context Preview -->
          <div class="mt-3 pt-2 border-top">
            <div class="d-flex justify-content-between align-items-center">
              <button class="btn btn-link btn-sm text-decoration-none p-0 fw-bold"
                      onclick=${() => setShowGitContext(!showGitContext)}>
                ${showGitContext ? '▼ Hide Captured Git Context' : '▶ View Captured Git Context (Status & Log)'}
              </button>
              ${folderPath ? html`
                <span class="badge bg-secondary font-monospace small">${folderPath}</span>
              ` : ''}
            </div>

            ${showGitContext ? html`
              <div class="mt-3">
                <ul class="nav nav-tabs nav-tabs-sm mb-2">
                  <li class="nav-item">
                    <button class="nav-link btn-sm ${activeGitTab === 'status' ? 'active fw-bold' : ''}"
                            onclick=${() => setActiveGitTab('status')}>
                      git status
                    </button>
                  </li>
                  <li class="nav-item">
                    <button class="nav-link btn-sm ${activeGitTab === 'log' ? 'active fw-bold' : ''}"
                            onclick=${() => setActiveGitTab('log')}>
                      git log (last 10)
                    </button>
                  </li>
                </ul>
                <pre class="bg-dark text-light p-3 rounded font-monospace small mb-0"
                     style="max-height: 200px; overflow-y: auto; font-size: 0.8rem; white-space: pre-wrap;">
                  ${activeGitTab === 'status' 
                    ? (gitStatusOutput || 'Click "🔄" or submit a prompt to fetch git status.') 
                    : (gitLogOutput || 'Click "🔄" or submit a prompt to fetch git log.')}
                </pre>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Quick Prompt Suggestions -->
      <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <span class="small fw-bold text-muted me-1">Quick Prompts:</span>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                onclick=${() => handleQuickPrompt('What is the current status of my repository and what should I do next?')}>
          📊 Status Summary
        </button>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                onclick=${() => handleQuickPrompt('Generate a clean, conventional commit message for my staged/unstaged changes.')}>
          ✍️ Write Commit Message
        </button>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                onclick=${() => handleQuickPrompt('Explain the recent commits in simple terms.')}>
          📜 Explain Recent Commits
        </button>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                onclick=${() => handleQuickPrompt('How do I safely discard uncommitted changes or unstage files?')}>
          🧹 Reset / Unstage Guide
        </button>
      </div>

      <!-- Prompt Input & Submission Box -->
      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body p-3">
          <label class="form-label small fw-bold">Prompt</label>
          <textarea class="form-control mb-3" rows="3"
                    value=${prompt}
                    oninput=${(e) => setPrompt(e.target.value)}
                    onkeydown=${(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Ask anything about your git repository (e.g. 'Review my changes and suggest a commit message', 'How do I undo the last commit?'). Press Ctrl+Enter or click Submit."
                    disabled=${loading}></textarea>

          <div class="d-flex justify-content-between align-items-center">
            <span class="text-muted small">
              ${loading ? html`
                <span class="spinner-border spinner-border-sm text-primary me-2"></span>
                <strong>${loadingStep || 'Processing...'}</strong>
              ` : 'Git status and log will automatically be attached to context on submit.'}
            </span>

            <button class="btn btn-primary px-4 fw-bold shadow-sm"
                    onclick=${handleSubmit}
                    disabled=${loading || !prompt.trim() || !folderPath.trim() || !selectedModel}>
              ${loading ? html`
                <span class="spinner-border spinner-border-sm me-2"></span> Submitting...
              ` : '🚀 Submit Prompt'}
            </button>
          </div>
        </div>
      </div>

      <!-- Conversation Window -->
      <${ChatWindow}
        messages=${messages}
        loading=${loading}
        userInput=${prompt}
        onSend=${handleSubmit}
        onInputChange=${setPrompt}
        onClear=${clearChat}
        status=${status}
        error=${error}
        disabled=${!selectedModel || !folderPath.trim()}
        emptyIcon="🌿"
        emptyText="No conversation yet. Choose a Git folder, enter your prompt above, and click Submit."
        loadingText=${loadingStep || 'Analyzing repository & generating answer...'}
      />
    </div>
  `;
}
