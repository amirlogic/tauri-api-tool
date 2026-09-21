import { chatCompletion } from '../services/llmService.js';
import { getModelsForProvider, getModelsForProviders, getDistinctProviders, getConnection, ensureTables } from '../services/dbService.js';
import ChatWindow from '../components/ChatWindow.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

/**
 * Split command line by && or ; while respecting quotes
 */
function splitChainedCommands(commandString) {
  if (!commandString) return [];
  const parts = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < commandString.length; i++) {
    const ch = commandString[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;

    if (!inDouble && !inSingle && ch === '&' && commandString[i + 1] === '&') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++; // skip next &
      continue;
    }
    if (!inDouble && !inSingle && ch === ';') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Tokenize a command line into arguments preserving quoted strings
 */
function tokenizeCommandLine(cmdLine) {
  if (!cmdLine) return [];
  const tokens = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  for (let i = 0; i < cmdLine.length; i++) {
    const ch = cmdLine[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (/\s/.test(ch) && !inDouble && !inSingle) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Extract git commands from LLM response markdown text
 */
function parseGitCommandsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const rawCommands = [];

  function processCandidate(cmd) {
    if (!cmd) return;
    let clean = cmd.trim();
    // Remove enclosing backticks or quotes around the whole command if present
    if ((clean.startsWith('"') && clean.endsWith('"')) ||
        (clean.startsWith("'") && clean.endsWith("'")) ||
        (clean.startsWith('`') && clean.endsWith('`'))) {
      clean = clean.slice(1, -1).trim();
    }
    // Strip leading list bullets: e.g. "1. ", "- ", "* "
    clean = clean.replace(/^(\d+\.|\*|-)\s+/, '').trim();
    // Strip leading prompt symbols: $, #, >, %
    clean = clean.replace(/^[$#>%\s]+/, '').trim();

    // Check if candidate contains chained commands: git add . && git commit
    const subCommands = splitChainedCommands(clean);
    for (const sub of subCommands) {
      let subClean = sub.trim().replace(/^[$#>%\s]+/, '').trim();
      if (/^git(\.exe)?(\s+.*)?$/i.test(subClean)) {
        rawCommands.push(subClean);
      }
    }
  }

  // 1. Code blocks: ```bash ... ``` or ~~~sh ... ~~~
  const codeBlockRegex = /(?:```|~~~)(?:bash|sh|shell|zsh|git|cmd|powershell)?\s*\n([\s\S]*?)\n(?:```|~~~)/gi;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lines = match[1].split(/\r?\n/);
    for (const line of lines) {
      processCandidate(line);
    }
  }

  // 2. Inline code: `git ...`
  const inlineCodeRegex = /`([^`\n]+)`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    processCandidate(match[1]);
  }

  // 3. Regular lines starting with git or $ git
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^([$#>%\s]*)\s*git(\.exe)?\s+/i.test(trimmed)) {
      processCandidate(trimmed);
    }
  }

  // Deduplicate while preserving sequence order
  const unique = [];
  const seen = new Set();
  for (const cmd of rawCommands) {
    if (!seen.has(cmd)) {
      seen.add(cmd);
      unique.push(cmd);
    }
  }
  return unique;
}

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
    'You are an expert Git assistant. Help the user manage and understand their local git repository, write commit messages, troubleshoot git issues, and provide exact, actionable git shell commands.'
  );

  // Chat states
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingDb, setLoadingDb] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  // Shell execution & parsed commands states
  const [manualCommand, setManualCommand] = useState('');
  const [executingCommand, setExecutingCommand] = useState(false);
  const [runningCommandId, setRunningCommandId] = useState(null);
  const [parsedCommands, setParsedCommands] = useState([]);
  const [consoleOutput, setConsoleOutput] = useState(null);
  const [autoRefreshContext, setAutoRefreshContext] = useState(true);
  const [copySuccessId, setCopySuccessId] = useState(null);

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

  async function executeSingleGitCommand(commandStr) {
    if (!folderPath.trim()) {
      throw new Error('Please select a local git repository folder first.');
    }

    const tokens = tokenizeCommandLine(commandStr);
    if (tokens.length === 0) {
      throw new Error('Empty command.');
    }

    let args = tokens;
    if (tokens[0].toLowerCase() === 'git' || tokens[0].toLowerCase() === 'git.exe') {
      args = tokens.slice(1);
    }

    return await runGitCommand(folderPath.trim(), args);
  }

  async function executeCommandString(fullCommandStr, commandId = null) {
    if (!fullCommandStr || !fullCommandStr.trim()) return;

    if (!folderPath.trim()) {
      setError('Please select a local git repository folder first.');
      return;
    }

    setExecutingCommand(true);
    if (commandId) {
      setRunningCommandId(commandId);
      setParsedCommands(prev => prev.map(cmd => cmd.id === commandId ? { ...cmd, status: 'running' } : cmd));
    }

    const parts = splitChainedCommands(fullCommandStr);
    let combinedStdout = '';
    let combinedStderr = '';
    let lastCode = 0;
    let failed = false;

    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        const res = await executeSingleGitCommand(part);
        if (res.stdout) {
          combinedStdout += (combinedStdout ? '\n' : '') + res.stdout;
        }
        if (res.stderr) {
          combinedStderr += (combinedStderr ? '\n' : '') + res.stderr;
        }
        lastCode = res.code ?? 0;

        if (lastCode !== 0) {
          failed = true;
          break;
        }
      }

      const outputData = {
        command: fullCommandStr.startsWith('git ') ? fullCommandStr : `git ${fullCommandStr}`,
        code: lastCode,
        stdout: combinedStdout,
        stderr: combinedStderr,
        timestamp: new Date().toLocaleTimeString()
      };
      setConsoleOutput(outputData);

      if (commandId) {
        setParsedCommands(prev => prev.map(item => {
          if (item.id === commandId) {
            return {
              ...item,
              status: failed ? 'failed' : 'success',
              output: outputData
            };
          }
          return item;
        }));
      }

      if (!failed && autoRefreshContext) {
        fetchGitInfo(folderPath.trim());
      }
    } catch (err) {
      const errOutput = {
        command: fullCommandStr.startsWith('git ') ? fullCommandStr : `git ${fullCommandStr}`,
        code: 1,
        stdout: combinedStdout,
        stderr: (combinedStderr ? combinedStderr + '\n' : '') + (err.message || String(err)),
        timestamp: new Date().toLocaleTimeString()
      };
      setConsoleOutput(errOutput);

      if (commandId) {
        setParsedCommands(prev => prev.map(item => {
          if (item.id === commandId) {
            return { ...item, status: 'failed', output: errOutput };
          }
          return item;
        }));
      }
    } finally {
      setExecutingCommand(false);
      setRunningCommandId(null);
    }
  }

  async function handleRunAllParsedCommands() {
    if (executingCommand || parsedCommands.length === 0 || !folderPath.trim()) return;

    setExecutingCommand(true);
    try {
      for (const item of parsedCommands) {
        setRunningCommandId(item.id);
        setParsedCommands(prev => prev.map(cmd => cmd.id === item.id ? { ...cmd, status: 'running' } : cmd));

        let res;
        let failed = false;
        try {
          const parts = splitChainedCommands(item.command);
          let combinedStdout = '';
          let combinedStderr = '';
          let lastCode = 0;

          for (const part of parts) {
            if (!part.trim()) continue;
            const stepRes = await executeSingleGitCommand(part.trim());
            if (stepRes.stdout) combinedStdout += (combinedStdout ? '\n' : '') + stepRes.stdout;
            if (stepRes.stderr) combinedStderr += (combinedStderr ? '\n' : '') + stepRes.stderr;
            lastCode = stepRes.code ?? 0;
            if (lastCode !== 0) {
              failed = true;
              break;
            }
          }

          res = {
            command: item.command,
            code: lastCode,
            stdout: combinedStdout,
            stderr: combinedStderr,
            timestamp: new Date().toLocaleTimeString()
          };
        } catch (err) {
          failed = true;
          res = {
            command: item.command,
            code: 1,
            stdout: '',
            stderr: err.message || String(err),
            timestamp: new Date().toLocaleTimeString()
          };
        }

        setConsoleOutput(res);
        setParsedCommands(prev => prev.map(cmd => cmd.id === item.id ? {
          ...cmd,
          status: failed ? 'failed' : 'success',
          output: res
        } : cmd));

        if (failed) {
          break; // Stop execution on error
        }
      }

      if (autoRefreshContext) {
        fetchGitInfo(folderPath.trim());
      }
    } finally {
      setExecutingCommand(false);
      setRunningCommandId(null);
    }
  }

  function handleManualSubmit(e) {
    if (e) e.preventDefault();
    if (!manualCommand.trim() || executingCommand) return;
    executeCommandString(manualCommand.trim());
  }

  function handleQuickChip(cmd) {
    setManualCommand(cmd);
    executeCommandString(cmd);
  }

  async function handleCopyCommand(cmdText, id) {
    try {
      await navigator.clipboard.writeText(cmdText);
      setCopySuccessId(id);
      setTimeout(() => setCopySuccessId(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  }

  function handleLoadCommand(cmdText) {
    let clean = cmdText.trim();
    if (clean.toLowerCase().startsWith('git ')) {
      clean = clean.substring(4).trim();
    }
    setManualCommand(clean);
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

Please use the Git repository status and log context provided above to give specific, accurate, and actionable recommendations or explanations. Whenever suggesting commands, format them in code blocks or inline code starting with git.`;

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

      // 4. Parse git commands from LLM response
      const detected = parseGitCommandsFromText(message.content);
      if (detected.length > 0) {
        const commandItems = detected.map((cmd, idx) => ({
          id: `cmd_${Date.now()}_${idx}`,
          command: cmd,
          status: 'idle',
          output: null
        }));
        setParsedCommands(commandItems);
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
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
    setParsedCommands([]);
    setConsoleOutput(null);
    setError(null);
    setStatus(null);
  }

  return html`
    <div class="mt-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 class="fw-bold mb-1">🌿 Git AI Assistant</h2>
          <p class="text-muted small mb-0">Get intelligent assistance for your local Git repository, execute commands, and inspect real-time outputs.</p>
        </div>
      </div>

      ${error ? html`
        <div class="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <strong>Notice:</strong> ${error}
          <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
        </div>
      ` : ''}

      <!-- Configuration Card -->
      <div class="card shadow-sm mb-3 border-0 bg-light">
        <div class="card-body py-3">
          <div class="row g-3">
            <!-- Folder Selector -->
            <div class="col-md-6">
              <label class="form-label small fw-bold">📁 Git Repository Folder</label>
              <div class="input-group input-group-sm">
                <input type="text" class="form-control font-monospace"
                       value=${folderPath}
                       oninput=${(e) => setFolderPath(e.target.value)}
                       placeholder="Select or enter local git repository path..."
                       disabled=${loading || executingCommand} />
                <button class="btn btn-outline-secondary" onclick=${handleSelectFolder} disabled=${loading || executingCommand}>
                  Browse...
                </button>
                <button class="btn btn-outline-primary" onclick=${() => fetchGitInfo(folderPath)} disabled=${loading || !folderPath} title="Refresh Git Status & Log">
                  🔄
                </button>
              </div>
              <div class="form-text small">Target repository directory for shell execution and context.</div>
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
              <div class="form-text small">Configured LLM provider.</div>
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
              <div class="form-text small">Model for ${selectedProvider}.</div>
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
                     style="max-height: 180px; overflow-y: auto; font-size: 0.8rem; white-space: pre-wrap;">
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

      <!-- Two-Column Area: Left = Chat, Right = Shell Execution & Output -->
      <div class="row g-3">
        <!-- Left Column: Chat Window -->
        <div class="col-lg-6 col-12">
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
            emptyText="No conversation yet. Choose a Git folder, enter your prompt below, and click Send."
            loadingText=${loadingStep || 'Analyzing repository & generating answer...'}
            height="660px"
          />
        </div>

        <!-- Right Column: Git Shell Execution & Output -->
        <div class="col-lg-6 col-12">
          <div class="card shadow-sm mb-4 border-0" style="height: 660px; display: flex; flex-direction: column;">
            
            <!-- Card Header -->
            <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
              <div class="d-flex align-items-center gap-2 text-truncate" style="max-width: 75%;">
                <h5 class="mb-0 fw-bold fs-6">⚡ Git Shell & Commands</h5>
                ${folderPath ? html`
                  <span class="badge bg-secondary font-monospace text-truncate small" style="max-width: 200px;" title=${folderPath}>
                    ${folderPath}
                  </span>
                ` : html`
                  <span class="badge bg-warning text-dark small">No folder selected</span>
                `}
              </div>
              ${executingCommand ? html`
                <span class="badge bg-primary d-flex align-items-center gap-1">
                  <span class="spinner-border spinner-border-sm" style="width: 0.7rem; height: 0.7rem;"></span>
                  Executing...
                </span>
              ` : ''}
            </div>

            <!-- Card Body -->
            <div class="card-body p-3 overflow-auto" style="flex-grow: 1; display: flex; flex-direction: column; gap: 14px; background-color: #fafafa;">

              <!-- 1. Manual Shell Command Input -->
              <div>
                <label class="form-label small fw-bold mb-1 d-flex justify-content-between">
                  <span>💻 Shell Command Input</span>
                  <span class="text-muted fw-normal small">Execute in repository</span>
                </label>
                <form onsubmit=${handleManualSubmit} class="input-group input-group-sm">
                  <span class="input-group-text font-monospace bg-white fw-bold">git</span>
                  <input type="text" class="form-control font-monospace"
                         value=${manualCommand}
                         oninput=${(e) => setManualCommand(e.target.value)}
                         placeholder="status -s, add ., commit -m 'feat: ...', diff, log -5..."
                         disabled=${executingCommand || !folderPath.trim()} />
                  <button class="btn btn-primary fw-bold px-3" type="submit"
                          disabled=${executingCommand || !manualCommand.trim() || !folderPath.trim()}>
                    ${executingCommand && !runningCommandId ? html`
                      <span class="spinner-border spinner-border-sm me-1"></span>
                    ` : '▶ Run'}
                  </button>
                </form>

                <!-- Quick Command Chips -->
                <div class="d-flex flex-wrap gap-1 mt-2">
                  <span class="small text-muted me-1 align-self-center" style="font-size: 0.75rem;">Quick:</span>
                  ${['status -s', 'diff', 'log -n 5 --oneline', 'branch -a', 'stash list'].map(cmd => html`
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2 font-monospace"
                            style="font-size: 0.75rem;"
                            onclick=${() => handleQuickChip(cmd)}
                            disabled=${executingCommand || !folderPath.trim()}>
                      git ${cmd}
                    </button>
                  `)}
                </div>
              </div>

              <!-- 2. Parsed Git Commands from LLM -->
              <div class="border rounded p-2 bg-white shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div class="d-flex align-items-center gap-2">
                    <span class="small fw-bold">🤖 Commands from Assistant</span>
                    <span class="badge ${parsedCommands.length > 0 ? 'bg-primary' : 'bg-light text-muted border'}">
                      ${parsedCommands.length}
                    </span>
                  </div>
                  <div class="d-flex gap-1">
                    ${parsedCommands.length > 1 ? html`
                      <button class="btn btn-sm btn-outline-success py-0 px-2"
                              onclick=${handleRunAllParsedCommands}
                              disabled=${executingCommand || !folderPath.trim()}
                              title="Execute all commands sequentially one by one">
                        ▶ Run All
                      </button>
                    ` : ''}
                    ${parsedCommands.length > 0 ? html`
                      <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                              onclick=${() => setParsedCommands([])}
                              disabled=${executingCommand}
                              title="Clear parsed command list">
                        Clear
                      </button>
                    ` : ''}
                  </div>
                </div>

                ${parsedCommands.length === 0 ? html`
                  <div class="text-center py-3 text-muted small bg-light rounded">
                    <div>💡</div>
                    <span>Git commands recommended by the AI in chat will be detected here to execute one by one.</span>
                  </div>
                ` : html`
                  <div class="d-flex flex-column gap-2" style="max-height: 180px; overflow-y: auto;">
                    ${parsedCommands.map(item => html`
                      <div class="d-flex align-items-center justify-content-between p-2 rounded border bg-light" key=${item.id}>
                        <div class="me-2 text-truncate" style="flex: 1;">
                          <code class="text-dark fw-bold small text-break">${item.command}</code>
                        </div>
                        <div class="d-flex align-items-center gap-1 flex-shrink-0">
                          ${item.status === 'running' ? html`
                            <span class="badge bg-primary d-flex align-items-center gap-1 py-1">
                              <span class="spinner-border spinner-border-sm" style="width: 0.65rem; height: 0.65rem;"></span>
                              Running
                            </span>
                          ` : item.status === 'success' ? html`
                            <span class="badge bg-success py-1">✓ Exit 0</span>
                          ` : item.status === 'failed' ? html`
                            <span class="badge bg-danger py-1">✗ Failed</span>
                          ` : html`
                            <span class="badge bg-secondary py-1">Ready</span>
                          `}

                          <button class="btn btn-sm btn-primary py-0 px-2 fw-bold"
                                  onclick=${() => executeCommandString(item.command, item.id)}
                                  disabled=${executingCommand || !folderPath.trim()}
                                  title="Execute this command">
                            ▶ Run
                          </button>
                          <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                                  onclick=${() => handleLoadCommand(item.command)}
                                  title="Load into command input to edit">
                            ✏️
                          </button>
                          <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                                  onclick=${() => handleCopyCommand(item.command, item.id)}
                                  title="Copy command">
                            ${copySuccessId === item.id ? '✓' : '📋'}
                          </button>
                        </div>
                      </div>
                    `)}
                  </div>
                `}
              </div>

              <!-- 3. Terminal Output Display -->
              <div class="border rounded bg-dark text-light p-2 d-flex flex-column" style="flex-grow: 1; min-height: 190px;">
                <div class="d-flex justify-content-between align-items-center pb-2 mb-2 border-bottom border-secondary small">
                  <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold font-monospace">🖥️ Console Output</span>
                    ${consoleOutput ? html`
                      <span class="badge ${consoleOutput.code === 0 ? 'bg-success' : 'bg-danger'}">
                        Exit ${consoleOutput.code ?? 0}
                      </span>
                      <span class="text-secondary" style="font-size: 0.75rem;">${consoleOutput.timestamp}</span>
                    ` : html`
                      <span class="badge bg-secondary">Idle</span>
                    `}
                  </div>
                  ${consoleOutput ? html`
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1 text-light" style="font-size: 0.75rem;"
                            onclick=${() => setConsoleOutput(null)}>
                      Clear
                    </button>
                  ` : ''}
                </div>

                <div class="font-monospace small overflow-auto p-1" style="flex-grow: 1; max-height: 220px; font-size: 0.8rem; line-height: 1.4;">
                  ${consoleOutput ? html`
                    <div class="mb-2 text-info fw-bold">$ ${consoleOutput.command}</div>
                    ${consoleOutput.stdout ? html`
                      <div class="text-success" style="white-space: pre-wrap;">${consoleOutput.stdout}</div>
                    ` : ''}
                    ${consoleOutput.stderr ? html`
                      <div class="text-warning" style="white-space: pre-wrap;">${consoleOutput.stderr}</div>
                    ` : ''}
                    ${!consoleOutput.stdout && !consoleOutput.stderr ? html`
                      <div class="text-secondary fst-italic">Command finished with no output.</div>
                    ` : ''}
                  ` : html`
                    <div class="text-secondary text-center py-4 fst-italic">
                      Console ready. Run a git command to inspect its output here.
                    </div>
                  `}
                </div>
              </div>

            </div>

            <!-- Card Footer -->
            <div class="card-footer bg-light py-2 px-3 d-flex justify-content-between align-items-center small">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="autoRefreshCheck"
                       checked=${autoRefreshContext}
                       onchange=${(e) => setAutoRefreshContext(e.target.checked)} />
                <label class="form-check-label text-muted" for="autoRefreshCheck" style="font-size: 0.8rem;">
                  Auto-refresh status on success
                </label>
              </div>
              <button class="btn btn-outline-secondary btn-sm py-0 px-2"
                      onclick=${() => fetchGitInfo(folderPath.trim())}
                      disabled=${!folderPath.trim() || loading || executingCommand}
                      title="Refresh Git Status & Log">
                🔄 Refresh Context
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;
}
