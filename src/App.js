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
  const [files, setFiles] = useState([]);          // { code, staged, path }
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // string label while a secondary action runs
  const [error, setError] = useState(null);
  const [actionResult, setActionResult] = useState(null);   // { type: 'success'|'danger', text }
  const [branches, setBranches] = useState([]);             // { name, current, remote }
  const [newBranchName, setNewBranchName] = useState('');
  const [checkoutNew, setCheckoutNew] = useState(true);

  // ── helpers ────────────────────────────────────────────────────────
  function clearActionResult() { setActionResult(null); }

  async function gitExec(args, cwd) {
    const { Command } = window.__TAURI__.shell || {};
    if (!Command) throw new Error('Shell plugin not available');
    const cmd = await Command.create('git', args, { cwd });
    const res = await cmd.execute();
    if (res.code !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
    return res.stdout;
  }

  // Parse "git status --porcelain" into structured file entries
  function parsePorcelain(raw) {
    return raw
      .split('\n')
      .filter(l => l.length >= 4)
      .map(line => {
        const x = line[0]; // index (staging area) status
        const y = line[1]; // work-tree status
        const filePath = line.substring(3);
        const staged = (x !== ' ' && x !== '?');
        return { code: `${x}${y}`, staged, path: filePath };
      });
  }

  // Parse "git branch -a" into structured branch entries
  function parseBranches(raw) {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('->'))   // skip HEAD pointer lines
      .map(l => {
        const current = l.startsWith('* ');
        const name = l.replace(/^\*?\s+/, '');
        const remote = name.startsWith('remotes/');
        return { name: remote ? name.replace(/^remotes\//, '') : name, current, remote };
      });
  }

  // ── core refresh ───────────────────────────────────────────────────
  async function runGitCommands(cwd) {
    setLoading(true);
    setError(null);
    try {
      // Branch
      const branchOut = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
      setBranch(branchOut.trim());

      // Full status (human-readable)
      const statusOut = await gitExec(['status'], cwd);
      setGitStatus(statusOut);

      // Porcelain status (machine-readable)
      const porcelainOut = await gitExec(['status', '--porcelain'], cwd);
      setFiles(parsePorcelain(porcelainOut));

      // All branches
      const branchListOut = await gitExec(['branch', '-a'], cwd);
      setBranches(parseBranches(branchListOut));
    } catch (err) {
      setError(err.toString());
      setBranch(null);
      setGitStatus(null);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectFolder() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error('Dialog plugin not available');
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setDirPath(selected);
        setBranch(null);
        setGitStatus(null);
        setFiles([]);
        setBranches([]);
        setError(null);
        setActionResult(null);
        setCommitMsg('');
        setNewBranchName('');
        await runGitCommands(selected);
      }
    } catch (err) {
      setError(err.toString());
    }
  }

  // ── branch management ──────────────────────────────────────────────
  async function doCreateBranch() {
    const name = newBranchName.trim();
    if (!name) { setActionResult({ type: 'danger', text: 'Branch name is required.' }); return; }
    try {
      setActionLoading(`Creating branch '${name}'`);
      if (checkoutNew) {
        await gitExec(['checkout', '-b', name], dirPath);
      } else {
        await gitExec(['branch', name], dirPath);
      }
      setNewBranchName('');
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: `Branch '${name}' created${checkoutNew ? ' and checked out' : ''}.` });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  async function doSwitchBranch(name) {
    if (name === branch) return;
    try {
      setActionLoading(`Switching to '${name}'`);
      await gitExec(['checkout', name], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: `Switched to branch '${name}'.` });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  // ── stage / unstage ────────────────────────────────────────────────
  async function stageFile(filePath) {
    try {
      setActionLoading(`Staging ${filePath}`);
      await gitExec(['add', '--', filePath], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: `Staged: ${filePath}` });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  async function unstageFile(filePath) {
    try {
      setActionLoading(`Unstaging ${filePath}`);
      await gitExec(['reset', 'HEAD', '--', filePath], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: `Unstaged: ${filePath}` });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  async function stageAll() {
    try {
      setActionLoading('Staging all files');
      await gitExec(['add', '-A'], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: 'All files staged.' });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  async function unstageAll() {
    try {
      setActionLoading('Unstaging all files');
      await gitExec(['reset', 'HEAD'], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: 'All files unstaged.' });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  // ── commit ─────────────────────────────────────────────────────────
  async function doCommit() {
    const msg = commitMsg.trim();
    if (!msg) { setActionResult({ type: 'danger', text: 'Commit message is required.' }); return; }
    try {
      setActionLoading('Committing');
      const out = await gitExec(['commit', '-m', msg], dirPath);
      setCommitMsg('');
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: out.split('\n')[0] || 'Commit successful.' });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  // ── push / pull ────────────────────────────────────────────────────
  async function doPush() {
    try {
      setActionLoading('Pushing');
      const out = await gitExec(['push'], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: out || 'Push completed.' });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  async function doPull() {
    try {
      setActionLoading('Pulling');
      const out = await gitExec(['pull'], dirPath);
      await runGitCommands(dirPath);
      setActionResult({ type: 'success', text: out || 'Pull completed.' });
    } catch (err) {
      setActionResult({ type: 'danger', text: err.toString() });
    } finally { setActionLoading(null); }
  }

  // ── derived data ───────────────────────────────────────────────────
  const branchBadgeClass = branch
    ? (branch === 'main' || branch === 'master' ? 'bg-success' : 'bg-primary')
    : 'bg-secondary';

  const stagedFiles = files.filter(f => f.staged);
  const unstagedFiles = files.filter(f => !f.staged);
  const hasStagedFiles = stagedFiles.length > 0;
  const busy = loading || actionLoading !== null;

  // ── status code colour helper ──────────────────────────────────────
  function codeBadge(code) {
    const c = code.trim();
    if (c.startsWith('?')) return 'bg-secondary';      // untracked
    if (c.startsWith('M') || c.endsWith('M')) return 'bg-warning text-dark'; // modified
    if (c.startsWith('A')) return 'bg-success';         // added
    if (c.startsWith('D') || c.endsWith('D')) return 'bg-danger';           // deleted
    if (c.startsWith('R')) return 'bg-info';            // renamed
    return 'bg-secondary';
  }

  // ── render ─────────────────────────────────────────────────────────
  return html`
    <div class="mt-5">
      <h1>Git Inspector</h1>
      <p>Select a folder to inspect its current branch, stage/unstage changes, commit, push and pull.</p>

      <!-- Toolbar -->
      <div class="mb-4 d-flex flex-wrap gap-2 align-items-center">
        <button class="btn btn-primary" onclick=${selectFolder} disabled=${busy}>
          ${loading ? 'Running…' : '📁 Select Folder'}
        </button>
        ${dirPath ? html`
          <button class="btn btn-outline-secondary" onclick=${() => runGitCommands(dirPath)} disabled=${busy}>
            🔄 Refresh
          </button>
          <button class="btn btn-outline-info" onclick=${doPull} disabled=${busy}>
            ⬇ Pull
          </button>
          <button class="btn btn-outline-success" onclick=${doPush} disabled=${busy}>
            ⬆ Push
          </button>
        ` : ''}
        ${actionLoading ? html`<span class="text-muted fst-italic ms-2">⏳ ${actionLoading}…</span>` : ''}
      </div>

      <!-- Alerts -->
      ${error ? html`<div class="alert alert-danger alert-dismissible">
        <strong>Error:</strong> ${error}
        <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
      </div>` : ''}
      ${actionResult ? html`<div class="alert alert-${actionResult.type} alert-dismissible" style="white-space:pre-wrap;">
        ${actionResult.text}
        <button type="button" class="btn-close" onclick=${clearActionResult}></button>
      </div>` : ''}

      ${dirPath ? html`
        <!-- Branch & Folder info -->
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-light d-flex align-items-center gap-2">
            <span class="text-truncate"><strong>Folder:</strong> ${dirPath}</span>
            ${branch
        ? html`<span class="badge ${branchBadgeClass} ms-auto px-3 py-2">🌿 ${branch}</span>`
        : ''}
          </div>
        </div>

        <!-- Branches card -->
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-light d-flex justify-content-between align-items-center">
            <strong>Branches (${branches.filter(b => !b.remote).length} local)</strong>
          </div>

          <!-- Create new branch -->
          <div class="card-body border-bottom pb-3">
            <div class="input-group">
              <input type="text" class="form-control" placeholder="New branch name…"
                     value=${newBranchName} oninput=${(e) => setNewBranchName(e.target.value)}
                     onkeydown=${(e) => { if (e.key === 'Enter') doCreateBranch(); }} />
              <div class="input-group-text p-0 border-0 bg-transparent">
                <div class="form-check form-switch mx-2 mb-0" title="Check out new branch immediately">
                  <input class="form-check-input" type="checkbox" id="checkoutNewSwitch"
                         checked=${checkoutNew} onchange=${(e) => setCheckoutNew(e.target.checked)} />
                  <label class="form-check-label small" for="checkoutNewSwitch">Checkout</label>
                </div>
              </div>
              <button class="btn btn-outline-primary" onclick=${doCreateBranch}
                      disabled=${busy || !newBranchName.trim()}>
                + Create
              </button>
            </div>
          </div>

          <!-- Local branches list -->
          <ul class="list-group list-group-flush" style="max-height:220px;overflow:auto;">
            ${branches.filter(b => !b.remote).length === 0
        ? html`<li class="list-group-item text-muted">No local branches found.</li>`
        : branches.filter(b => !b.remote).map(b => html`
                <li class="list-group-item d-flex justify-content-between align-items-center py-1" key=${b.name}>
                  <div class="d-flex align-items-center gap-2">
                    ${b.current
            ? html`<span class="badge bg-success">current</span>`
            : html`<span class="badge bg-light text-muted border">local</span>`}
                    <span class=${b.current ? 'fw-semibold' : ''}>${b.name}</span>
                  </div>
                  ${!b.current ? html`
                    <button class="btn btn-sm btn-outline-secondary" onclick=${() => doSwitchBranch(b.name)} disabled=${busy}>
                      Switch
                    </button>
                  ` : html`<span class="text-success">✓ active</span>`}
                </li>
              `)
      }
          </ul>

          <!-- Remote branches (collapsed) -->
          ${branches.filter(b => b.remote).length > 0 ? html`
            <div class="card-footer bg-light">
              <details>
                <summary class="text-muted small" style="cursor:pointer;">
                  Remote branches (${branches.filter(b => b.remote).length})
                </summary>
                <ul class="list-group list-group-flush mt-2">
                  ${branches.filter(b => b.remote).map(b => html`
                    <li class="list-group-item d-flex justify-content-between align-items-center py-1 bg-transparent" key=${b.name}>
                      <span class="text-muted font-monospace small">${b.name}</span>
                    </li>
                  `)}
                </ul>
              </details>
            </div>
          ` : ''}
        </div>

        <!-- Files card: staged vs unstaged -->
        ${files.length > 0 ? html`
          <div class="card shadow-sm mb-3">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
              <strong>Changed Files (${files.length})</strong>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-success" onclick=${stageAll} disabled=${busy || unstagedFiles.length === 0}>Stage All</button>
                <button class="btn btn-sm btn-outline-warning" onclick=${unstageAll} disabled=${busy || stagedFiles.length === 0}>Unstage All</button>
              </div>
            </div>

            <!-- Staged section -->
            ${stagedFiles.length > 0 ? html`
              <div class="px-3 pt-3 pb-1"><h6 class="text-success mb-1">✅ Staged</h6></div>
              <ul class="list-group list-group-flush">
                ${stagedFiles.map(f => html`
                  <li class="list-group-item d-flex justify-content-between align-items-center py-1" key=${'s-' + f.path}>
                    <div class="d-flex align-items-center gap-2 text-truncate">
                      <span class="badge ${codeBadge(f.code)} font-monospace" style="min-width:2rem;text-align:center;">${f.code}</span>
                      <span class="text-truncate" title=${f.path}>${f.path}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-warning" onclick=${() => unstageFile(f.path)} disabled=${busy}>Unstage</button>
                  </li>
                `)}
              </ul>
            ` : ''}

            <!-- Unstaged section -->
            ${unstagedFiles.length > 0 ? html`
              <div class="px-3 pt-3 pb-1"><h6 class="text-danger mb-1">📝 Unstaged / Untracked</h6></div>
              <ul class="list-group list-group-flush">
                ${unstagedFiles.map(f => html`
                  <li class="list-group-item d-flex justify-content-between align-items-center py-1" key=${'u-' + f.path}>
                    <div class="d-flex align-items-center gap-2 text-truncate">
                      <span class="badge ${codeBadge(f.code)} font-monospace" style="min-width:2rem;text-align:center;">${f.code}</span>
                      <span class="text-truncate" title=${f.path}>${f.path}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-success" onclick=${() => stageFile(f.path)} disabled=${busy}>Stage</button>
                  </li>
                `)}
              </ul>
            ` : ''}
          </div>
        ` : ''}

        <!-- Commit section -->
        ${hasStagedFiles ? html`
          <div class="card shadow-sm mb-3">
            <div class="card-header bg-light"><strong>Commit</strong></div>
            <div class="card-body">
              <div class="input-group">
                <input type="text" class="form-control" placeholder="Commit message…"
                       value=${commitMsg} oninput=${(e) => setCommitMsg(e.target.value)}
                       onkeydown=${(e) => { if (e.key === 'Enter') doCommit(); }} />
                <button class="btn btn-success" onclick=${doCommit} disabled=${busy || !commitMsg.trim()}>
                  ✔ Commit
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Raw status -->
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-light"><strong>Git Status (raw)</strong></div>
          <div class="card-body p-0">
            ${gitStatus
        ? html`<pre class="bg-dark text-light p-3 m-0 rounded-bottom" style="max-height:300px;overflow:auto;font-size:0.85rem;">${gitStatus}</pre>`
        : html`<p class="text-muted p-3 m-0">—</p>`
      }
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

function ApiKeysScreen() {
  const [keys, setKeys] = useState([]);
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form state for add / edit
  const [form, setForm] = useState({ name: '', provider: '', api_key: '' });
  const [editingId, setEditingId] = useState(null);   // null = adding, number = editing
  const [revealedIds, setRevealedIds] = useState([]); // which keys are shown unmasked

  // ── DB init ────────────────────────────────────────────────────────
  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) throw new Error('SQL plugin not available');
        const conn = await Database.load('sqlite:test.db');
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS apikeys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT '',
            api_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        setDb(conn);
        await loadKeys(conn);
      } catch (err) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  async function loadKeys(conn) {
    const rows = await (conn || db).select('SELECT * FROM apikeys ORDER BY id DESC');
    setKeys(rows);
  }

  // ── CRUD ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const { name, provider, api_key } = form;
    if (!name.trim() || !api_key.trim()) {
      setError('Name and API Key are required.');
      return;
    }
    try {
      setError(null);
      if (editingId !== null) {
        await db.execute(
          'UPDATE apikeys SET name = ?, provider = ?, api_key = ? WHERE id = ?',
          [name.trim(), provider.trim(), api_key.trim(), editingId]
        );
        setSuccessMsg('API key updated.');
      } else {
        await db.execute(
          'INSERT INTO apikeys (name, provider, api_key) VALUES (?, ?, ?)',
          [name.trim(), provider.trim(), api_key.trim()]
        );
        setSuccessMsg('API key saved.');
      }
      setForm({ name: '', provider: '', api_key: '' });
      setEditingId(null);
      await loadKeys();
    } catch (err) {
      setError(err.toString());
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ name: row.name, provider: row.provider, api_key: row.api_key });
    setError(null);
    setSuccessMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: '', provider: '', api_key: '' });
  }

  async function deleteKey(id) {
    try {
      await db.execute('DELETE FROM apikeys WHERE id = ?', [id]);
      if (editingId === id) cancelEdit();
      setSuccessMsg('API key deleted.');
      await loadKeys();
    } catch (err) {
      setError(err.toString());
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────
  function maskKey(key) {
    if (!key || key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  }

  function toggleReveal(id) {
    setRevealedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleInput(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  // ── render ──────────────────────────────────────────────────────────
  if (loading) return html`<div class="mt-5"><p>Loading database…</p></div>`;

  return html`
    <div class="mt-5">
      <h1>API Keys</h1>
      <p>Manage API keys for LLM providers and other services.</p>

      ${error ? html`<div class="alert alert-danger alert-dismissible">
        ${error}
        <button type="button" class="btn-close" onclick=${() => setError(null)}></button>
      </div>` : ''}
      ${successMsg ? html`<div class="alert alert-success alert-dismissible">
        ${successMsg}
        <button type="button" class="btn-close" onclick=${() => setSuccessMsg(null)}></button>
      </div>` : ''}

      <!-- Add / Edit form -->
      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light">
          <strong>${editingId !== null ? '✏️ Edit API Key' : '➕ Add API Key'}</strong>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Name</label>
              <input type="text" class="form-control" name="name" placeholder="e.g. My OpenAI Key"
                     value=${form.name} oninput=${handleInput} />
            </div>
            <div class="col-md-3">
              <label class="form-label">Provider</label>
              <input type="text" class="form-control" name="provider" placeholder="e.g. openai, ollama"
                     value=${form.provider} oninput=${handleInput} />
            </div>
            <div class="col-md-5">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control font-monospace" name="api_key"
                     placeholder="sk-…"
                     value=${form.api_key} oninput=${handleInput} />
            </div>
            <div class="col-12 d-flex gap-2">
              <button class="btn btn-primary" onclick=${handleSubmit}
                      disabled=${!form.name.trim() || !form.api_key.trim()}>
                ${editingId !== null ? 'Update' : 'Save'}
              </button>
              ${editingId !== null ? html`
                <button class="btn btn-outline-secondary" onclick=${cancelEdit}>Cancel</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Keys list -->
      <div class="card shadow-sm">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <strong>Stored Keys (${keys.length})</strong>
        </div>
        ${keys.length === 0
      ? html`<div class="card-body"><p class="text-muted mb-0">No API keys stored yet.</p></div>`
      : html`
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>API Key</th>
                    <th>Created</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${keys.map(row => {
        const revealed = revealedIds.includes(row.id);
        return html`
                      <tr key=${row.id} class=${editingId === row.id ? 'table-active' : ''}>
                        <td>${row.name}</td>
                        <td><span class="badge bg-secondary">${row.provider || '—'}</span></td>
                        <td class="font-monospace">
                          ${revealed ? row.api_key : maskKey(row.api_key)}
                          <button class="btn btn-sm btn-link p-0 ms-2" onclick=${() => toggleReveal(row.id)}
                                  title=${revealed ? 'Hide' : 'Reveal'}>
                            ${revealed ? '🙈' : '👁️'}
                          </button>
                        </td>
                        <td><small class="text-muted">${row.created_at}</small></td>
                        <td class="text-end">
                          <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick=${() => startEdit(row)}>Edit</button>
                            <button class="btn btn-outline-danger" onclick=${() => deleteKey(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    `;
      })}
                </tbody>
              </table>
            </div>
          `
    }
      </div>
    </div>
  `;
}

function LLMScreen({ provider: initialProvider }) {
  const [provider, setProvider] = useState(initialProvider || 'ollama');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  // Provider presets (mockup data)
  const providers = {
    ollama: {
      label: 'Ollama',
      icon: '🦙',
      defaultEndpoint: 'http://localhost:11434/api/generate',
      models: ['llama3', 'llama3:70b', 'mistral', 'codellama', 'gemma:7b', 'phi3', 'qwen2'],
    },
    lmstudio: {
      label: 'LM Studio',
      icon: '🧪',
      defaultEndpoint: 'http://localhost:1234/v1/chat/completions',
      models: ['lmstudio-community/Meta-Llama-3', 'TheBloke/Mistral-7B', 'microsoft/Phi-3-mini', 'NousResearch/Hermes-2'],
    },
  };

  // When provider changes, update defaults
  useEffect(() => {
    const p = providers[provider];
    if (p) {
      setEndpoint(p.defaultEndpoint);
      setModel(p.models[0] || '');
    }
  }, [provider]);

  // Initialise on mount
  useEffect(() => {
    const p = providers[initialProvider] || providers.ollama;
    setEndpoint(p.defaultEndpoint);
    setModel(p.models[0] || '');
  }, []);

  const current = providers[provider] || providers.ollama;
  const providerKeys = Object.keys(providers);

  async function handleSend() {
    // Mockup – just echo back a placeholder
    setLoading(true);
    setResponse('');
    setTimeout(() => {
      setResponse(
        `[Mockup response]\n\nProvider: ${current.label}\nModel: ${model}\nEndpoint: ${endpoint}\nTemperature: ${temperature}\nMax tokens: ${maxTokens}\n\nSystem: ${systemPrompt || '(none)'}\nUser: ${userPrompt}\n\n--- This is a placeholder. Wiring to real API coming soon. ---`
      );
      setLoading(false);
    }, 800);
  }

  return html`
    <div class="mt-5">
      <h1>LLM Query</h1>
      <p>Send prompts to a local LLM API. <span class="badge bg-warning text-dark">Mockup</span></p>

      <!-- Provider tabs -->
      <ul class="nav nav-tabs mb-4">
        ${providerKeys.map(key => {
    const p = providers[key];
    return html`
            <li class="nav-item" key=${key}>
              <button class="nav-link ${provider === key ? 'active' : ''}"
                      onclick=${() => setProvider(key)}>
                ${p.icon} ${p.label}
              </button>
            </li>
          `;
  })}
      </ul>

      <!-- Settings card -->
      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light d-flex align-items-center gap-2">
          <strong>${current.icon} ${current.label} Settings</strong>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <!-- Endpoint -->
            <div class="col-md-8">
              <label class="form-label">API Endpoint</label>
              <input type="text" class="form-control font-monospace" value=${endpoint}
                     oninput=${(e) => setEndpoint(e.target.value)} />
            </div>
            <!-- Model -->
            <div class="col-md-4">
              <label class="form-label">Model</label>
              <select class="form-select" value=${model}
                      onchange=${(e) => setModel(e.target.value)}>
                ${current.models.map(m => html`
                  <option value=${m} selected=${m === model}>${m}</option>
                `)}
              </select>
            </div>
            <!-- Temperature -->
            <div class="col-md-6">
              <label class="form-label">Temperature: <strong>${temperature}</strong></label>
              <input type="range" class="form-range" min="0" max="2" step="0.05"
                     value=${temperature}
                     oninput=${(e) => setTemperature(parseFloat(e.target.value))} />
            </div>
            <!-- Max tokens -->
            <div class="col-md-6">
              <label class="form-label">Max Tokens: <strong>${maxTokens}</strong></label>
              <input type="range" class="form-range" min="64" max="8192" step="64"
                     value=${maxTokens}
                     oninput=${(e) => setMaxTokens(parseInt(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      <!-- Prompts -->
      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light"><strong>Prompt</strong></div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">System Prompt <span class="text-muted">(optional)</span></label>
            <textarea class="form-control" rows="2" placeholder="You are a helpful assistant…"
                      value=${systemPrompt}
                      oninput=${(e) => setSystemPrompt(e.target.value)}></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">User Prompt</label>
            <textarea class="form-control" rows="4" placeholder="Ask something…"
                      value=${userPrompt}
                      oninput=${(e) => setUserPrompt(e.target.value)}></textarea>
          </div>
          <button class="btn btn-primary" onclick=${handleSend}
                  disabled=${loading || !userPrompt.trim()}>
            ${loading ? '⏳ Generating…' : '▶ Send'}
          </button>
        </div>
      </div>

      <!-- Response -->
      <div class="card shadow-sm mb-4">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <strong>Response</strong>
          ${response ? html`<button class="btn btn-sm btn-outline-secondary"
                                    onclick=${() => setResponse('')}>Clear</button>` : ''}
        </div>
        <div class="card-body p-0">
          ${response
      ? html`<pre class="bg-dark text-light p-3 m-0 rounded-bottom"
                        style="max-height:400px;overflow:auto;white-space:pre-wrap;font-size:0.85rem;">${response}</pre>`
      : html`<p class="text-muted p-3 m-0">Response will appear here after sending a prompt.</p>`
    }
        </div>
      </div>
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
    ollama: () => html`<${LLMScreen} provider="ollama" />`,
    lmstudio: () => html`<${LLMScreen} provider="lmstudio" />`,
    'api-keys': () => html`<${ApiKeysScreen} />`,
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
            TMA
          </a>
          
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav me-auto">
    
              <li class="nav-item">
                <a class="nav-link ${route.name === 'database' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('database'); }}>Database</a>
              </li>
              
              <li class="nav-item">
                <a class="nav-link ${route.name === 'ffmpeg' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('ffmpeg'); }}>FFMPEG</a>
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
              <li class="nav-item">
                <a class="nav-link ${route.name === 'ollama' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('ollama'); }}>Ollama</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'lmstudio' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('lmstudio'); }}>LM Studio</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'api-keys' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('api-keys'); }}>API Keys</a>
              </li>
            </ul>
            
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
