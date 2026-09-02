const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function ImageMagickScreen() {
  // Input image & output image states
  const [selectedFile, setSelectedFile] = useState('');
  const [outputFile, setOutputFile] = useState('');
  const [inputPreviewUrl, setInputPreviewUrl] = useState(null);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState(null);
  const [activeTab, setActiveTab] = useState('input'); // 'input' | 'output'

  // LLM & Database states
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generatedCommand, setGeneratedCommand] = useState('');

  // UI & Execution states
  const [loadingDb, setLoadingDb] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [executionOutput, setExecutionOutput] = useState(null);

  // Load database providers and models on mount
  useEffect(() => {
    loadDatabaseInfo();
  }, []);

  // Update output file path when selected input file changes
  useEffect(() => {
    if (selectedFile) {
      const defaultOut = generateDefaultOutputPath(selectedFile);
      setOutputFile(defaultOut);
      loadPreview(selectedFile, 'input');
    } else {
      setOutputFile('');
      setInputPreviewUrl(null);
    }
  }, [selectedFile]);

  // Load models whenever selected provider changes
  useEffect(() => {
    if (selectedProvider) {
      loadModelsForProvider(selectedProvider);
    }
  }, [selectedProvider]);

  function generateDefaultOutputPath(inputPath) {
    if (!inputPath) return '';
    const lastDot = inputPath.lastIndexOf('.');
    if (lastDot === -1) return `${inputPath}_modified`;
    return `${inputPath.substring(0, lastDot)}_modified${inputPath.substring(lastDot)}`;
  }

  async function loadDatabaseInfo() {
    setLoadingDb(true);
    setError(null);
    try {
      const Database = window.__TAURI__?.sql;
      if (!Database) {
        throw new Error('Tauri SQL plugin not available.');
      }
      const conn = await Database.load('sqlite:test.db');
      
      // Ensure tables exist
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS models (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          provider TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS apikeys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT '',
          api_key TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      const modelRows = await conn.select('SELECT DISTINCT provider FROM models');
      const keyRows = await conn.select('SELECT DISTINCT provider FROM apikeys');

      const providerSet = new Set(['openrouter', 'ollama', 'lmstudio']);
      modelRows.forEach(r => { if (r.provider) providerSet.add(r.provider.toLowerCase()); });
      keyRows.forEach(r => { if (r.provider) providerSet.add(r.provider.toLowerCase()); });

      const providerList = Array.from(providerSet);
      setProviders(providerList);
      
      if (providerList.length > 0) {
        const initialProvider = providerList.includes('openrouter') ? 'openrouter' : providerList[0];
        setSelectedProvider(initialProvider);
      }
    } catch (err) {
      console.error('Error loading DB info:', err);
      setError(`Database error: ${err.message}`);
      setProviders(['openrouter', 'ollama', 'lmstudio']);
      setSelectedProvider('openrouter');
    } finally {
      setLoadingDb(false);
    }
  }

  async function loadModelsForProvider(prov) {
    try {
      const Database = window.__TAURI__?.sql;
      let modelList = [];
      if (Database) {
        const conn = await Database.load('sqlite:test.db');
        const rows = await conn.select('SELECT model_name FROM models WHERE LOWER(provider) = ?', [prov.toLowerCase()]);
        modelList = rows.map(r => r.model_name);
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

  async function loadPreview(filePath, target = 'input') {
    if (!filePath) return;
    try {
      const fs = window.__TAURI__?.fs;
      if (!fs) return;
      const fileExists = await fs.exists(filePath);
      if (!fileExists) return;

      const bytes = await fs.readFile(filePath);
      const ext = filePath.split('.').pop().toLowerCase();
      const mimeMap = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp'
      };
      const mimeType = mimeMap[ext] || 'image/png';
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);

      if (target === 'input') {
        if (inputPreviewUrl) URL.revokeObjectURL(inputPreviewUrl);
        setInputPreviewUrl(url);
      } else {
        if (outputPreviewUrl) URL.revokeObjectURL(outputPreviewUrl);
        setOutputPreviewUrl(url);
        setActiveTab('output');
      }
    } catch (err) {
      console.error(`Failed to load ${target} preview:`, err);
    }
  }

  async function handleOpenFile() {
    try {
      const dialog = window.__TAURI__?.dialog;
      if (!dialog) throw new Error('Tauri Dialog plugin not available.');

      const result = await dialog.open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'tiff']
        }]
      });

      if (result) {
        setSelectedFile(result);
        setError(null);
        setSuccessMsg(null);
        setExecutionOutput(null);
      }
    } catch (err) {
      setError(`Error opening file: ${err.message}`);
    }
  }

  async function handleGenerateCommand() {
    if (!prompt.trim()) {
      setError('Please enter a prompt describing the image modification.');
      return;
    }
    if (!selectedProvider) {
      setError('Please select an LLM provider.');
      return;
    }
    if (!selectedModel) {
      setError('Please select a model from database or enter model name.');
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    setExecutionOutput(null);

    try {
      const Database = window.__TAURI__?.sql;
      let apiKey = '';
      if (Database) {
        const conn = await Database.load('sqlite:test.db');
        const keyRows = await conn.select('SELECT api_key FROM apikeys WHERE LOWER(provider) = ? LIMIT 1', [selectedProvider.toLowerCase()]);
        if (keyRows && keyRows.length > 0) {
          apiKey = keyRows[0].api_key;
        }
      }

      const inPath = selectedFile || 'input.jpg';
      const outPath = outputFile || generateDefaultOutputPath(inPath) || 'output.jpg';

      const systemInstruction = `You are an expert ImageMagick v7 CLI tool assistant.
Generate precise ImageMagick v7 shell commands (using 'magick') to achieve the requested image edits.

Input File: "${inPath}"
Output File: "${outPath}"

Strict Rules:
1. Always start the command with 'magick' (ImageMagick v7 syntax).
2. Use valid ImageMagick v7 command options.
3. Keep exact file paths provided above. Enclose file paths in double quotes.
4. Return ONLY the raw shell command inside a ```bash code block. Do NOT include explanations outside the code block.`;

      const userMessageContent = `Requested edit: ${prompt}`;

      const payloadMessages = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userMessageContent }
      ];

      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;

      let apiUrl = '';
      const headers = { 'Content-Type': 'application/json' };

      const provLower = selectedProvider.toLowerCase();
      if (provLower === 'openrouter') {
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'tauri-api-tool';
      } else if (provLower === 'ollama') {
        apiUrl = 'http://localhost:11434/api/chat';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      } else if (provLower === 'lmstudio' || provLower === 'lm-studio') {
        const host = localStorage.getItem('lmstudio_host') || 'http://localhost';
        const port = localStorage.getItem('lmstudio_port') || '1234';
        const prefix = localStorage.getItem('lmstudio_prefix') || '/v1';
        apiUrl = `${host.replace(/\/+$/, '')}:${port}${prefix.startsWith('/') ? prefix : '/' + prefix}/chat/completions`;
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const payloadObj = {
        model: selectedModel,
        messages: payloadMessages,
        stream: false
      };

      const bodyData = (tauriHttp && tauriHttp.Body && tauriHttp.Body.json)
        ? tauriHttp.Body.json(payloadObj)
        : JSON.stringify(payloadObj);

      const response = await fetchFn(apiUrl, {
        method: 'POST',
        headers,
        body: bodyData
      });

      if (!response.ok && response.status) {
        throw new Error(`API HTTP Error: ${response.status} ${response.statusText || ''}`);
      }

      const data = typeof response.json === 'function' ? await response.json() : response.data;
      let llmText = '';

      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        llmText = data.choices[0].message.content;
      } else if (data && data.message) {
        llmText = typeof data.message === 'string' ? data.message : (data.message.content || '');
      } else if (data && data.error) {
        throw new Error(typeof data.error === 'object' ? data.error.message : data.error);
      } else {
        throw new Error('Unexpected response format from LLM API.');
      }

      // Extract command from response
      const extractedCmd = extractCommandText(llmText);
      setGeneratedCommand(extractedCmd);
      setSuccessMsg('ImageMagick command generated successfully.');
    } catch (err) {
      setError(`Generation failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  function extractCommandText(rawText) {
    if (!rawText) return '';
    let text = rawText.trim();
    // Look for markdown code blocks ```bash ... ```
    const codeBlockMatch = text.match(/```(?:bash|sh|cmd)?\s*\n?([\s\S]*?)\n?```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }
    return text;
  }

  function parseCommandTokens(cmdStr) {
    let cleanStr = cmdStr.trim().replace(/^```(bash|sh|cmd)?\n?/, '').replace(/\n?```$/, '').trim();
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const tokens = [];
    let match;
    while ((match = regex.exec(cleanStr)) !== null) {
      if (match[1] !== undefined) {
        tokens.push(match[1]);
      } else if (match[2] !== undefined) {
        tokens.push(match[2]);
      } else {
        tokens.push(match[0]);
      }
    }

    if (tokens.length === 0) return { bin: 'magick', args: [] };

    let bin = tokens[0];
    let args = tokens.slice(1);

    if (bin.toLowerCase() === 'magick' || bin.toLowerCase() === 'magick.exe') {
      return { bin: bin.toLowerCase(), args };
    }
    return { bin: 'magick', args: tokens };
  }

  async function handleExecuteCommand() {
    if (!generatedCommand.trim()) {
      setError('No command to execute.');
      return;
    }

    setExecuting(true);
    setError(null);
    setSuccessMsg(null);
    setExecutionOutput(null);

    try {
      const Command = window.__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell plugin not available.');

      const { bin, args } = parseCommandTokens(generatedCommand);

      let cmdres;
      try {
        cmdres = await Command.create(bin, args).execute();
      } catch (firstErr) {
        // Fallback to magick.exe if binary was 'magick'
        if (bin === 'magick') {
          cmdres = await Command.create('magick.exe', args).execute();
        } else {
          throw firstErr;
        }
      }

      setExecutionOutput(cmdres);

      if (cmdres.code === 0) {
        setSuccessMsg('ImageMagick command executed successfully!');
        if (outputFile) {
          await loadPreview(outputFile, 'output');
        }
      } else {
        setError(`Command failed with code ${cmdres.code}: ${cmdres.stderr || cmdres.stdout || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Execution error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  }

  return html`
    <div class="mt-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 class="fw-bold mb-1">🖼️ ImageMagick AI Assistant</h2>
          <p class="text-muted small mb-0">Transform images using natural language prompts translated to ImageMagick v7 commands.</p>
        </div>
      </div>

      ${error ? html`
        <div class="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <strong>Error:</strong> ${error}
          <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
        </div>
      ` : ''}

      ${successMsg ? html`
        <div class="alert alert-success alert-dismissible fade show mb-3" role="alert">
          ${successMsg}
          <button type="button" class="btn-close" onclick=${() => setSuccessMsg(null)}></button>
        </div>
      ` : ''}

      <div class="row g-4">
        <!-- Left Column: 2/3 width (col-md-8) -->
        <div class="col-md-8">
          <div class="card shadow-sm mb-4">
            <div class="card-header bg-light fw-bold d-flex justify-content-between align-items-center">
              <span>📁 Image Input & Preview</span>
              <button class="btn btn-primary btn-sm px-3" onclick=${handleOpenFile}>
                Open Image...
              </button>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label class="form-label small text-muted fw-bold">Source File Path</label>
                <div class="input-group input-group-sm">
                  <input type="text" class="form-control font-monospace" readonly
                         value=${selectedFile || ''}
                         placeholder="Select an image file..." />
                  <button class="btn btn-outline-secondary" onclick=${handleOpenFile}>Browse</button>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label small text-muted fw-bold">Output File Path</label>
                <input type="text" class="form-control form-control-sm font-monospace"
                       value=${outputFile}
                       oninput=${(e) => setOutputFile(e.target.value)}
                       placeholder="Target output path for modified image..." />
              </div>

              <!-- Tab Navigation for Original vs Modified Image -->
              <ul class="nav nav-tabs mb-3" id="imageTabs">
                <li class="nav-item">
                  <button class="nav-link ${activeTab === 'input' ? 'active fw-bold' : ''}"
                          onclick=${() => setActiveTab('input')}>
                    Original Image ${inputPreviewUrl ? '✓' : ''}
                  </button>
                </li>
                <li class="nav-item">
                  <button class="nav-link ${activeTab === 'output' ? 'active fw-bold' : ''}"
                          onclick=${() => setActiveTab('output')}>
                    Modified Output ${outputPreviewUrl ? '✨' : ''}
                  </button>
                </li>
              </ul>

              <!-- Image Display Container -->
              <div class="p-3 bg-light rounded text-center border" style="min-height: 380px; display: flex; align-items: center; justify-content: center;">
                ${activeTab === 'input' ? html`
                  ${inputPreviewUrl ? html`
                    <img src=${inputPreviewUrl} alt="Original Image"
                         class="img-fluid rounded shadow-sm"
                         style="max-height: 480px; object-fit: contain;" />
                  ` : html`
                    <div class="text-muted py-5">
                      <div style="font-size: 3rem;">🖼️</div>
                      <p class="mb-0">No source image loaded.</p>
                      <small>Click "Open Image..." to choose an image to edit.</small>
                    </div>
                  `}
                ` : html`
                  ${outputPreviewUrl ? html`
                    <img src=${outputPreviewUrl} alt="Modified Image"
                         class="img-fluid rounded shadow-sm"
                         style="max-height: 480px; object-fit: contain;" />
                  ` : html`
                    <div class="text-muted py-5">
                      <div style="font-size: 3rem;">⚡</div>
                      <p class="mb-0">No output image generated yet.</p>
                      <small>Generate and execute an ImageMagick command to view results here.</small>
                    </div>
                  `}
                `}
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: 1/3 width (col-md-4) -->
        <div class="col-md-4">
          <div class="card shadow-sm mb-4">
            <div class="card-header bg-light fw-bold">
              🤖 LLM & Command Config
            </div>
            <div class="card-body">
              <!-- LLM Provider Selector -->
              <div class="mb-3">
                <label class="form-label small fw-bold">LLM Provider</label>
                <select class="form-select form-select-sm"
                        value=${selectedProvider}
                        onchange=${(e) => setSelectedProvider(e.target.value)}
                        disabled=${generating || loadingDb}>
                  ${providers.map(p => html`
                    <option value=${p} selected=${p === selectedProvider}>${p.toUpperCase()}</option>
                  `)}
                </select>
                <div class="form-text small">Providers loaded from database.</div>
              </div>

              <!-- Model Selector from Database -->
              <div class="mb-3">
                <label class="form-label small fw-bold">Model (Database)</label>
                ${models.length > 0 ? html`
                  <select class="form-select form-select-sm"
                          value=${selectedModel}
                          onchange=${(e) => setSelectedModel(e.target.value)}
                          disabled=${generating}>
                    ${models.map(m => html`
                      <option value=${m} selected=${m === selectedModel}>${m}</option>
                    `)}
                  </select>
                ` : html`
                  <input type="text" class="form-control form-control-sm"
                         value=${selectedModel}
                         oninput=${(e) => setSelectedModel(e.target.value)}
                         placeholder="Enter model name (e.g. gpt-4o)"
                         disabled=${generating} />
                `}
                <div class="form-text small">Stored models in SQLite for selected provider.</div>
              </div>

              <!-- Prompt Input Textarea -->
              <div class="mb-3">
                <label class="form-label small fw-bold">Modification Prompt</label>
                <textarea class="form-control form-control-sm" rows="4"
                          placeholder="Describe your edit (e.g., 'Resize to 600x600, convert to grayscale, add 10px black border')..."
                          value=${prompt}
                          oninput=${(e) => setPrompt(e.target.value)}
                          disabled=${generating}></textarea>
              </div>

              <button class="btn btn-primary w-100 mb-3"
                      onclick=${handleGenerateCommand}
                      disabled=${generating || !prompt.trim() || !selectedFile}>
                ${generating ? html`<span class="spinner-border spinner-border-sm me-2"></span>Generating...` : '⚡ Generate Command'}
              </button>

              <hr />

              <!-- Generated Shell Commands -->
              <div class="mb-3">
                <label class="form-label small fw-bold d-flex justify-content-between align-items-center">
                  <span>Generated Command (ImageMagick v7)</span>
                  <span class="badge bg-secondary font-monospace">magick</span>
                </label>
                <textarea class="form-control font-monospace form-control-sm bg-dark text-light"
                          rows="4"
                          style="font-size: 0.85rem;"
                          value=${generatedCommand}
                          oninput=${(e) => setGeneratedCommand(e.target.value)}
                          placeholder="Generated magick command will appear here..."
                          disabled=${executing}></textarea>
              </div>

              <button class="btn btn-success w-100"
                      onclick=${handleExecuteCommand}
                      disabled=${executing || !generatedCommand.trim()}>
                ${executing ? html`<span class="spinner-border spinner-border-sm me-2"></span>Review & Execute`}
              </button>
            </div>
          </div>

          <!-- Execution Output Card -->
          ${executionOutput ? html`
            <div class="card shadow-sm border-0 bg-light">
              <div class="card-header bg-dark text-white py-2 small fw-bold d-flex justify-content-between">
                <span>Console Output</span>
                <span class="badge ${executionOutput.code === 0 ? 'bg-success' : 'bg-danger'}">Exit Code ${executionOutput.code}</span>
              </div>
              <div class="card-body p-2 font-monospace small" style="max-height: 180px; overflow-y: auto; font-size: 0.75rem;">
                ${executionOutput.stdout ? html`<div class="text-success">${executionOutput.stdout}</div>` : ''}
                ${executionOutput.stderr ? html`<div class="text-danger">${executionOutput.stderr}</div>` : ''}
                ${!executionOutput.stdout && !executionOutput.stderr ? html`<div class="text-muted">Completed with no output text.</div>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}
