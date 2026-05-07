const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);
import { useHashRoute } from './router.js';

function DatabaseScreen() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) throw new Error("SQL plugin not available");
        const connection = await Database.load("sqlite:test.db");
        await connection.execute("CREATE TABLE IF NOT EXISTS demo (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
        setDb(connection);
        const results = await connection.select("SELECT * FROM demo");
        setItems(results);
      } catch (err) {
        console.error("DB Error:", err);
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  async function addItem() {
    if (!newItem.trim() || !db) return;
    try {
      await db.execute("INSERT INTO demo (name) VALUES (?)", [newItem]);
      const results = await db.select("SELECT * FROM demo");
      setItems(results);
      setNewItem('');
    } catch (err) {
      setError(err.toString());
    }
  }

  if (loading) return html`<div>Loading database...</div>`;
  if (error) return html`<div class="alert alert-danger">Error: ${error}</div>`;

  return html`
    <div class="mt-5">
      <h1>Database Demo</h1>
      <p>This demo uses <code>@tauri-apps/plugin-sql</code> with SQLite.</p>
      
      <div class="input-group mb-3">
        <input type="text" class="form-control" placeholder="Item name" 
               value=${newItem} oninput=${(e) => setNewItem(e.target.value)} />
        <button class="btn btn-primary" onclick=${addItem}>Add Item</button>
      </div>

      <ul class="list-group">
        ${items.map(item => html`
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${item.name}
            <span class="badge bg-secondary rounded-pill">ID: ${item.id}</span>
          </li>
        `)}
      </ul>
      ${items.length === 0 ? html`<p class="text-muted mt-2">No items found in database.</p>` : ''}
    </div>
  `;
}

function TextFileScreen() {
  const [filePath, setFilePath] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);

  async function openFile() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error("Dialog plugin not available");
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Text',
          extensions: ['txt', 'js', 'json', 'rs', 'md', 'html', 'css']
        }]
      });

      if (selected) {
        setFilePath(selected);
        await readFileContent(selected);
      }
    } catch (err) {
      setError(err.toString());
    }
  }

  async function readFileContent(path) {
    try {
      const { readTextFile } = window.__TAURI__.fs || {};
      if (!readTextFile) throw new Error("FS plugin not available");
      const text = await readTextFile(path);
      setContent(text);
      setError(null);
    } catch (err) {
      setError(`Failed to read file: ${err.toString()}`);
    }
  }

  useEffect(() => {
    let unlisten;
    let active = true;

    async function setupWatcher() {
      if (filePath) {
        console.log("Setting up watcher for:", filePath);
        try {
          const { watch } = window.__TAURI__.fs || {};
          if (watch) {
            const u = await watch(filePath, (event) => {
              console.log("File watch event received:", event);
              // Small delay to ensure the file is fully written/unlocked
              setTimeout(() => {
                if (active) readFileContent(filePath);
              }, 100);
            });
            
            if (active) {
              unlisten = u;
              console.log("Watcher established successfully");
            } else {
              u(); // Component unmounted during setup
            }
          } else {
            console.error("FS watch function not available");
          }
        } catch (err) {
          console.error("Watcher error:", err);
        }
      }
    }

    setupWatcher();

    return () => {
      active = false;
      if (typeof unlisten === 'function') {
        console.log("Unwatching:", filePath);
        unlisten();
      }
    };
  }, [filePath]);

  return html`
    <div class="mt-5">
      <h1>Text File Viewer</h1>
      <p>Open a file to watch for changes and display its content.</p>
      
      <div class="mb-3">
        <button class="btn btn-primary" onclick=${openFile}>Open File</button>
      </div>

      ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}

      ${filePath ? html`
        <div class="card shadow-sm">
          <div class="card-header bg-light d-flex justify-content-between align-items-center">
            <span class="text-truncate mr-2"><strong>File:</strong> ${filePath}</span>
            <button class="btn btn-sm btn-outline-secondary" onclick=${() => readFileContent(filePath)}>Reload</button>
          </div>
          <div class="card-body p-0">
            <pre class="m-0 p-3" style="max-height: 500px; overflow: auto; background-color: #f8f9fa;"><code>${content}</code></pre>
          </div>
        </div>
      ` : html`<p class="text-muted">No file selected.</p>`}
    </div>
  `;
}

function DirectoryWatcherScreen() {
  const [dirPath, setDirPath] = useState('');
  const [error, setError] = useState(null);
  const [watchedFiles, setWatchedFiles] = useState([]);   // { path, name, checked }
  const [destinations, setDestinations] = useState([]);    // persisted list
  const [selectedDest, setSelectedDest] = useState('');
  const [db, setDb] = useState(null);
  const [moveStatus, setMoveStatus] = useState(null);

  // ── DB: load / persist destination list ──────────────────────────
  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) return;
        const conn = await Database.load("sqlite:test.db");
        await conn.execute(
          "CREATE TABLE IF NOT EXISTS watcher_destinations (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE)"
        );
        setDb(conn);
        const rows = await conn.select("SELECT * FROM watcher_destinations ORDER BY id");
        setDestinations(rows.map(r => r.path));
        if (rows.length > 0) setSelectedDest(rows[0].path);
      } catch (err) {
        console.error("DB init error:", err);
      }
    }
    initDb();
  }, []);

  async function addDestination(path) {
    if (!path || destinations.includes(path)) return;
    try {
      if (db) await db.execute("INSERT OR IGNORE INTO watcher_destinations (path) VALUES (?)", [path]);
      setDestinations(prev => [...prev, path]);
      setSelectedDest(path);
    } catch (err) {
      console.error("Failed to save destination:", err);
    }
  }

  async function removeDestination(path) {
    try {
      if (db) await db.execute("DELETE FROM watcher_destinations WHERE path = ?", [path]);
      setDestinations(prev => prev.filter(d => d !== path));
      setSelectedDest(prev => prev === path ? (destinations[0] || '') : prev);
    } catch (err) {
      console.error("Failed to remove destination:", err);
    }
  }

  async function browseDestination() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error("Dialog plugin not available");
      const selected = await open({ directory: true, multiple: false });
      if (selected) await addDestination(selected);
    } catch (err) {
      setError(err.toString());
    }
  }

  // ── Watch source folder ──────────────────────────────────────────
  async function openDirectory() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error("Dialog plugin not available");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setDirPath(selected);
        setWatchedFiles([]);
        setError(null);
        setMoveStatus(null);
      }
    } catch (err) {
      setError(err.toString());
    }
  }

  useEffect(() => {
    let unlisten;
    let active = true;

    async function setupWatcher() {
      if (dirPath) {
        console.log("Setting up watcher for:", dirPath);
        try {
          const { watch } = window.__TAURI__.fs || {};
          if (watch) {
            const u = await watch(dirPath, (event) => {
              console.log("Directory watch event received:", event);
              if (active && event.paths && event.paths.length) {
                setWatchedFiles(prev => {
                  const updated = [...prev];
                  for (const p of event.paths) {
                    // Extract filename from full path
                    const name = p.replace(/\\/g, '/').split('/').pop();
                    if (name && !updated.find(f => f.path === p)) {
                      updated.push({ path: p, name, checked: false });
                    }
                  }
                  return updated;
                });
              }
            }, { recursive: false });

            if (active) {
              unlisten = u;
              console.log("Directory watcher established successfully");
            } else {
              u();
            }
          } else {
            console.error("FS watch function not available");
          }
        } catch (err) {
          console.error("Watcher error:", err);
        }
      }
    }

    setupWatcher();

    return () => {
      active = false;
      if (typeof unlisten === 'function') {
        console.log("Unwatching:", dirPath);
        unlisten();
      }
    };
  }, [dirPath]);

  // ── Checkbox helpers ─────────────────────────────────────────────
  function toggleFile(index) {
    setWatchedFiles(prev => prev.map((f, i) => i === index ? { ...f, checked: !f.checked } : f));
  }

  function toggleAll(checked) {
    setWatchedFiles(prev => prev.map(f => ({ ...f, checked })));
  }

  const checkedCount = watchedFiles.filter(f => f.checked).length;

  // ── Move checked files ──────────────────────────────────────────
  async function moveChecked() {
    if (!selectedDest) { setError("Select a destination directory first."); return; }
    const toMove = watchedFiles.filter(f => f.checked);
    if (toMove.length === 0) return;

    setMoveStatus(`Moving ${toMove.length} file(s)…`);
    setError(null);

    try {
      const { rename } = window.__TAURI__.fs || {};
      if (!rename) throw new Error("FS plugin not available");

      let moved = 0;
      for (const f of toMove) {
        const dest = selectedDest.replace(/[\\/]$/, '') + '\\' + f.name;
        await rename(f.path, dest);
        moved++;
      }

      // Remove moved files from list
      const movedPaths = new Set(toMove.map(f => f.path));
      setWatchedFiles(prev => prev.filter(f => !movedPaths.has(f.path)));
      setMoveStatus(`Successfully moved ${moved} file(s).`);
    } catch (err) {
      setError(`Move failed: ${err.toString()}`);
      setMoveStatus(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return html`
    <div class="mt-5">
      <h1>Directory Watcher</h1>
      <p>Watch a folder for new files, select them, and move to a destination.</p>

      <!-- Source folder -->
      <div class="mb-3">
        <button class="btn btn-primary" onclick=${openDirectory}>📂 Select Watch Folder</button>
        ${dirPath ? html`<span class="ms-3 text-muted text-truncate" style="font-size:0.9rem;">${dirPath}</span>` : ''}
      </div>

      <!-- Destination selector -->
      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light"><strong>Destination Directory</strong></div>
        <div class="card-body">
          <div class="input-group">
            <select class="form-select" value=${selectedDest}
                    onchange=${(e) => setSelectedDest(e.target.value)}>
              ${destinations.length === 0
                ? html`<option value="" disabled selected>No destinations saved</option>`
                : destinations.map(d => html`<option value=${d} selected=${d === selectedDest}>${d}</option>`)
              }
            </select>
            <button class="btn btn-outline-secondary" onclick=${browseDestination} title="Browse for a new destination">+ Add</button>
          </div>
          ${selectedDest ? html`
            <div class="mt-2 d-flex justify-content-between align-items-center">
              <small class="text-muted text-truncate">${selectedDest}</small>
              <button class="btn btn-sm btn-outline-danger" onclick=${() => removeDestination(selectedDest)}>Remove from list</button>
            </div>
          ` : ''}
        </div>
      </div>

      ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
      ${moveStatus ? html`<div class="alert alert-info">${moveStatus}</div>` : ''}

      <!-- Watched files -->
      ${dirPath ? html`
        <div class="card shadow-sm">
          <div class="card-header bg-light d-flex justify-content-between align-items-center">
            <span><strong>Watched Files</strong> (${watchedFiles.length})</span>
            <div class="d-flex gap-2">
              ${watchedFiles.length > 0 ? html`
                <button class="btn btn-sm btn-outline-secondary" onclick=${() => toggleAll(true)}>Select All</button>
                <button class="btn btn-sm btn-outline-secondary" onclick=${() => toggleAll(false)}>Deselect</button>
              ` : ''}
              <button class="btn btn-sm btn-outline-secondary" onclick=${() => setWatchedFiles([])}>Clear</button>
            </div>
          </div>
          <ul class="list-group list-group-flush" style="max-height: 400px; overflow: auto;">
            ${watchedFiles.length === 0
              ? html`<li class="list-group-item text-muted">No files detected yet. Waiting for changes…</li>`
              : watchedFiles.map((f, i) => html`
                <li class="list-group-item d-flex align-items-center gap-2" key=${f.path}>
                  <input class="form-check-input mt-0" type="checkbox"
                         checked=${f.checked} onchange=${() => toggleFile(i)} />
                  <span class="text-truncate" title=${f.path}>${f.name}</span>
                </li>
              `)
            }
          </ul>
          ${checkedCount > 0 ? html`
            <div class="card-footer d-flex justify-content-between align-items-center">
              <span>${checkedCount} file(s) selected</span>
              <button class="btn btn-success" onclick=${moveChecked} disabled=${!selectedDest}>
                Move to destination →
              </button>
            </div>
          ` : ''}
        </div>
      ` : html`<p class="text-muted">No watch folder selected.</p>`}
    </div>
  `;
}

function FFmpegScreen() {
  const [output, setOutput] = useState('Checking FFmpeg version...');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function checkVersion() {
      try {
        const { Command } = window.__TAURI__.shell || {};
        if (!Command) throw new Error("Shell plugin not available");
        const cmd = await Command.create('ffmpeg', ['-version']);
        const result = await cmd.execute();
        
        if (result.code === 0) {
          setOutput(result.stdout);
        } else {
          setError(`Command failed with code ${result.code}: ${result.stderr}`);
          setOutput(result.stderr);
        }
      } catch (err) {
        setError(`Failed to execute command: ${err.toString()}`);
        setOutput('Error executing ffmpeg');
      }
    }

    checkVersion();
  }, []);

  return html`
    <div class="mt-5">
      <h1>FFmpeg Info</h1>
      <p>This screen checks and displays the installed FFmpeg version.</p>

      ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}

      <div class="form-group mt-3">
        <label for="ffmpeg-output" class="form-label">FFmpeg Version Output:</label>
        <textarea id="ffmpeg-output" class="form-control" rows="15" disabled 
                  style="font-family: monospace; background-color: #f8f9fa;">${output}</textarea>
      </div>
      
      <div class="mt-3">
        <button class="btn btn-outline-secondary" onclick=${() => window.location.reload()}>Refresh</button>
      </div>
    </div>
  `;
}

function EJSScreen() {
  const [compositions, setCompositions] = useState([]);
  const [form, setForm] = useState({
    id: '',
    component: '',
    durif: 300,
    fps: 30,
    width: 1920,
    height: 1080
  });
  const [error, setError] = useState(null);

  function handleInputChange(e) {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  }

  function addComposition() {
    if (!form.id || !form.component) {
      setError("ID and Component are required.");
      return;
    }
    setCompositions(prev => [...prev, { ...form }]);
    setForm({ id: '', component: '', durif: 300, fps: 30, width: 1920, height: 1080 });
    setError(null);
  }

  function removeComposition(index) {
    setCompositions(prev => prev.filter((_, i) => i !== index));
  }

  async function generateAndSave() {
    try {
      const { writeTextFile } = window.__TAURI__.fs || {};
      const { save } = window.__TAURI__.dialog || {};

      if (!save || !writeTextFile) {
        throw new Error("Tauri FS or Dialog plugin not available");
      }

      // Fetch the template from the frontend server
      const res = await fetch('/templates/Root.tsx.ejs');
      if (!res.ok) throw new Error("Failed to load template");
      const templateContent = await res.text();

      // Render with EJS
      if (!window.ejs) throw new Error("EJS is not loaded in window");
      const output = window.ejs.render(templateContent, { compositions });

      // Prompt save
      const savePath = await save({
        filters: [{ name: 'TypeScript React', extensions: ['tsx'] }],
        defaultPath: 'Root.tsx'
      });

      if (savePath) {
        await writeTextFile(savePath, output);
        alert('File saved successfully!');
      }

    } catch (err) {
      setError(err.toString());
    }
  }

  return html`
    <div class="mt-5">
      <h1>EJS Template Generator</h1>
      <p>Add compositions and generate a Remotion Root.tsx</p>

      ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}

      <div class="card mb-4 shadow-sm">
        <div class="card-body">
          <h5 class="card-title">Add Composition</h5>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Composition ID</label>
              <input type="text" class="form-control" name="id" value=${form.id} oninput=${handleInputChange} placeholder="MyComp" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Component Name</label>
              <input type="text" class="form-control" name="component" value=${form.component} oninput=${handleInputChange} placeholder="MyComponent" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Duration (frames)</label>
              <input type="number" class="form-control" name="durif" value=${form.durif} oninput=${handleInputChange} />
            </div>
            <div class="col-md-3">
              <label class="form-label">FPS</label>
              <input type="number" class="form-control" name="fps" value=${form.fps} oninput=${handleInputChange} />
            </div>
            <div class="col-md-3">
              <label class="form-label">Width</label>
              <input type="number" class="form-control" name="width" value=${form.width} oninput=${handleInputChange} />
            </div>
            <div class="col-md-3">
              <label class="form-label">Height</label>
              <input type="number" class="form-control" name="height" value=${form.height} oninput=${handleInputChange} />
            </div>
            <div class="col-12 mt-3">
              <button class="btn btn-primary" onclick=${addComposition}>Add Composition</button>
            </div>
          </div>
        </div>
      </div>

      <h4>Compositions</h4>
      ${compositions.length === 0 ? html`<p class="text-muted">No compositions added yet.</p>` : html`
        <ul class="list-group mb-4">
          ${compositions.map((c, i) => html`
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <strong>${c.id}</strong> (${c.component}) - ${c.width}x${c.height} @ ${c.fps}fps, ${c.durif} frames
              </div>
              <button class="btn btn-sm btn-danger" onclick=${() => removeComposition(i)}>Remove</button>
            </li>
          `)}
        </ul>
      `}

      <button class="btn btn-success" disabled=${compositions.length === 0} onclick=${generateAndSave}>
        Generate Root.tsx
      </button>
    </div>
  `;
}

function GitScreen() {
  const [dirPath, setDirPath] = useState('');
  const [branch, setBranch] = useState(null);
  const [gitStatus, setGitStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function selectFolder() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error('Dialog plugin not available');
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setDirPath(selected);
        setBranch(null);
        setGitStatus(null);
        setError(null);
        await runGitCommands(selected);
      }
    } catch (err) {
      setError(err.toString());
    }
  }

  async function runGitCommands(cwd) {
    setLoading(true);
    setError(null);
    try {
      const { Command } = window.__TAURI__.shell || {};
      if (!Command) throw new Error('Shell plugin not available');

      // git rev-parse --abbrev-ref HEAD  → current branch name
      const branchCmd = await Command.create('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
      const branchResult = await branchCmd.execute();
      if (branchResult.code !== 0) {
        throw new Error(branchResult.stderr || 'git branch check failed');
      }
      setBranch(branchResult.stdout.trim());

      // git status
      const statusCmd = await Command.create('git', ['status'], { cwd });
      const statusResult = await statusCmd.execute();
      if (statusResult.code !== 0) {
        throw new Error(statusResult.stderr || 'git status failed');
      }
      setGitStatus(statusResult.stdout);
    } catch (err) {
      setError(err.toString());
      setBranch(null);
      setGitStatus(null);
    } finally {
      setLoading(false);
    }
  }

  const branchBadgeClass = branch
    ? (branch === 'main' || branch === 'master' ? 'bg-success' : 'bg-primary')
    : 'bg-secondary';

  return html`
    <div class="mt-5">
      <h1>Git Inspector</h1>
      <p>Select a folder to inspect its current branch and working-tree status.</p>

      <div class="mb-4">
        <button class="btn btn-primary" onclick=${selectFolder} disabled=${loading}>
          ${loading ? 'Running…' : '📁 Select Folder'}
        </button>
        ${dirPath ? html`
          <button class="btn btn-outline-secondary ms-2" onclick=${() => runGitCommands(dirPath)} disabled=${loading}>
            🔄 Refresh
          </button>
        ` : ''}
      </div>

      ${error ? html`<div class="alert alert-danger"><strong>Error:</strong> ${error}</div>` : ''}

      ${dirPath ? html`
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-light d-flex align-items-center gap-2">
            <span class="text-truncate"><strong>Folder:</strong> ${dirPath}</span>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <h5 class="card-title mb-2">Current Branch</h5>
              ${branch
                ? html`<span class="badge ${branchBadgeClass} fs-6 px-3 py-2">🌿 ${branch}</span>`
                : html`<span class="text-muted">—</span>`
              }
            </div>

            <div>
              <h5 class="card-title mb-2">Git Status</h5>
              ${gitStatus
                ? html`<pre class="bg-dark text-light p-3 rounded" style="max-height:400px;overflow:auto;font-size:0.85rem;">${gitStatus}</pre>`
                : html`<span class="text-muted">—</span>`
              }
            </div>
          </div>
        </div>
      ` : html`<p class="text-muted">No folder selected.</p>`}
    </div>
  `;
}

function HttpScreen() {
  const [url, setUrl] = useState('http://localhost:3000');
  const [statusCode, setStatusCode] = useState(null);
  const [pageTitle, setPageTitle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function checkServer() {
    const targetUrl = url.trim();
    if (!targetUrl) return;

    setLoading(true);
    setError(null);
    setStatusCode(null);
    setPageTitle(null);
    try {
      // Prefer Tauri http plugin (bypasses CORS), fall back to standard fetch
      const tauriHttp = window.__TAURI__?.http;
      const fetchFn = tauriHttp ? tauriHttp.fetch : window.fetch;

      const res = await fetchFn(targetUrl, { method: 'GET' });
      setStatusCode(res.status);

      // Read body and extract <title>
      const body = await res.text();
      const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      setPageTitle(match ? match[1].trim() : '(no title found)');
    } catch (err) {
      setError(`Failed to connect: ${err.toString()}`);
    } finally {
      setLoading(false);
    }
  }

  function statusBadgeClass(code) {
    if (!code) return 'bg-secondary';
    if (code >= 200 && code < 300) return 'bg-success';
    if (code >= 300 && code < 400) return 'bg-info';
    if (code >= 400 && code < 500) return 'bg-warning text-dark';
    return 'bg-danger';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') checkServer();
  }

  return html`
    <div class="mt-5">
      <h1>HTTP Checker</h1>
      <p>Enter a URL to check whether the server is reachable, view its status code and page title.</p>

      <div class="input-group mb-4">
        <input type="text" class="form-control" placeholder="http://localhost:3000"
               value=${url} oninput=${(e) => setUrl(e.target.value)}
               onkeydown=${handleKeyDown} />
        <button class="btn btn-primary" onclick=${checkServer} disabled=${loading}>
          ${loading ? 'Checking…' : 'Check'}
        </button>
      </div>

      ${error ? html`<div class="alert alert-danger"><strong>Error:</strong> ${error}</div>` : ''}

      ${statusCode !== null ? html`
        <div class="card shadow-sm mb-4">
          <div class="card-body">
            <div class="d-flex align-items-center gap-3 mb-3">
              <h5 class="card-title mb-0">Status Code</h5>
              <span class="badge ${statusBadgeClass(statusCode)} fs-6 px-3 py-2">${statusCode}</span>
            </div>

            <div>
              <h5 class="card-title mb-2">Page Title</h5>
              <p class="fs-5 mb-0">${pageTitle}</p>
            </div>
          </div>
        </div>
      ` : (!loading && !error ? html`<p class="text-muted">Press <strong>Check</strong> to send a request.</p>` : '')}
    </div>
  `;
}

function App() {
  const [route, navigate] = useHashRoute();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail === 'increment-counter') {
        setCount((c) => c + 1);
      } else if (event?.detail?.startsWith('navigate-')) {
        const targetRoute = event.detail.replace('navigate-', '');
        navigate(targetRoute);
      }
    };

    window.addEventListener('tauri-menu-command', handler);
    return () => window.removeEventListener('tauri-menu-command', handler);
  }, [navigate]);

  const routeMap = {
    home: () => html`
      <div class="text-center mt-5">
        <h1>Home Page</h1>
        <p>Welcome to the Preact Demo with Routing!</p>
        <div class="mt-4">
          <h3>Counter Example</h3>
          <p>Count: ${count}</p>
          <button class="btn btn-primary" onclick=${() => setCount(count + 1)}>
            Increment
          </button>
        </div>
      </div>
    `,
    about: () => html`
      <div class="mt-5">
        <h1>About Page</h1>
        <p>This is a boilerplate for Tauri v2 with Preact and HTM.</p>
        <p>It now features a simple hash-based router similar to the one in tauri2 project.</p>
      </div>
    `,
    settings: () => html`
      <div class="mt-5">
        <h1>Settings</h1>
        <p>Configure your application here.</p>
        <div class="card p-3 shadow-sm">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="darkModeSwitch" />
            <label class="form-check-label" for="darkModeSwitch">Dark Mode (Demo only)</label>
          </div>
        </div>
      </div>
    `,
    database: () => html`<${DatabaseScreen} />`,
    textfile: () => html`<${TextFileScreen} />`,
    ffmpeg: () => html`<${FFmpegScreen} />`,
    ejs: () => html`<${EJSScreen} />`,
    dirwatcher: () => html`<${DirectoryWatcherScreen} />`,
    http: () => html`<${HttpScreen} />`,
    git: () => html`<${GitScreen} />`,
    'not-found': () => html`
      <div class="text-center mt-5">
        <h1>404 - Not Found</h1>
        <p>The path <code>${route.path}</code> does not exist.</p>
        <button class="btn btn-secondary" onclick=${() => navigate('home')}>
          Go Home
        </button>
      </div>
    `
  };

  const routeBody = (routeMap[route.name] || routeMap['not-found'])();

  return html`
    <div>
      <nav class="navbar navbar-expand-lg bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand" href="#" onclick=${(e) => { e.preventDefault(); navigate('home'); }}>
            Tauri App
          </a>
          
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav me-auto">
              <li class="nav-item">
                <a class="nav-link ${route.name === 'home' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('home'); }}>Home</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'about' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('about'); }}>About</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'settings' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('settings'); }}>Settings</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'database' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('database'); }}>Database</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'textfile' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('textfile'); }}>Text File</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'ffmpeg' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('ffmpeg'); }}>FFMPEG</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'ejs' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('ejs'); }}>EJS</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'dirwatcher' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('dirwatcher'); }}>Dir Watcher</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'http' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('http'); }}>HTTP</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'git' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('git'); }}>Git</a>
              </li>
            </ul>
            <span id="opened-file" class="navbar-text">
              Current Route: ${route.name}
            </span>
          </div>
        </div>
      </nav>

      <main class="container-fluid">
        <div class="container">
          ${routeBody}
        </div>
        <div id="image" class="min-vh-50">
        </div>
      </main>
    </div>
  `;
}

export default App;
