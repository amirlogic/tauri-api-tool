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