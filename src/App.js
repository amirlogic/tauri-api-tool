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
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [events, setEvents] = useState([]);

  async function openDirectory() {
    try {
      const { open } = window.__TAURI__.dialog || {};
      if (!open) throw new Error("Dialog plugin not available");
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (selected) {
        setDirPath(selected);
        await readDirectoryContent(selected);
        setEvents([]);
      }
    } catch (err) {
      setError(err.toString());
    }
  }

  async function readDirectoryContent(path) {
    try {
      const { readDir } = window.__TAURI__.fs || {};
      if (!readDir) throw new Error("FS plugin not available");
      const entries = await readDir(path);
      setFiles(entries);
      setError(null);
    } catch (err) {
      setError(`Failed to read directory: ${err.toString()}`);
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
              if (active) {
                setEvents(prev => [{ 
                  time: new Date().toLocaleTimeString(), 
                  type: typeof event.type === 'object' ? JSON.stringify(event.type) : String(event.type),
                  paths: event.paths || []
                }, ...prev].slice(0, 50));
                
                // Small delay to ensure fs operations complete
                setTimeout(() => {
                  if (active) readDirectoryContent(dirPath);
                }, 100);
              }
            }, { recursive: true });
            
            if (active) {
              unlisten = u;
              console.log("Directory watcher established successfully");
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
        console.log("Unwatching:", dirPath);
        unlisten();
      }
    };
  }, [dirPath]);

  return html`
    <div class="mt-5">
      <h1>Directory Watcher</h1>
      <p>Open a directory to watch for changes and list its contents.</p>
      
      <div class="mb-3">
        <button class="btn btn-primary" onclick=${openDirectory}>Open Directory</button>
      </div>

      ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}

      ${dirPath ? html`
        <div class="row">
          <div class="col-md-6">
            <div class="card shadow-sm mb-3">
              <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <span class="text-truncate mr-2"><strong>Directory:</strong> ${dirPath}</span>
                <button class="btn btn-sm btn-outline-secondary" onclick=${() => readDirectoryContent(dirPath)}>Reload</button>
              </div>
              <ul class="list-group list-group-flush" style="max-height: 400px; overflow: auto;">
                ${files.length === 0 ? html`<li class="list-group-item text-muted">Empty directory</li>` : ''}
                ${files.map(f => html`
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${f.name}
                    <span class="badge bg-secondary rounded-pill">${f.isDirectory ? 'Dir' : 'File'}</span>
                  </li>
                `)}
              </ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card shadow-sm">
              <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <span><strong>Events (last 50):</strong></span>
                <button class="btn btn-sm btn-outline-secondary" onclick=${() => setEvents([])}>Clear</button>
              </div>
              <div class="card-body p-0">
                <ul class="list-group list-group-flush" style="max-height: 400px; overflow: auto;">
                  ${events.length === 0 ? html`<li class="list-group-item text-muted">No events yet</li>` : ''}
                  ${events.map((e, i) => html`
                    <li class="list-group-item" key=${i}>
                      <div class="d-flex w-100 justify-content-between">
                        <small class="text-muted">${e.time}</small>
                        <small><strong>${e.type}</strong></small>
                      </div>
                      <div class="text-break" style="font-size: 0.85em;">
                        ${e.paths && e.paths.length ? e.paths.join(', ') : JSON.stringify(e)}
                      </div>
                    </li>
                  `)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ` : html`<p class="text-muted">No directory selected.</p>`}
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
