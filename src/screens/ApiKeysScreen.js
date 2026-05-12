const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function ApiKeysScreen() {
  const [keys, setKeys] = useState([]);
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [form, setForm] = useState({ name: '', provider: '', api_key: '' });
  const [editingId, setEditingId] = useState(null);
  const [revealedIds, setRevealedIds] = useState([]);

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
              <input type="text" class="form-control" name="provider" placeholder="e.g. openai"
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

      <div class="card shadow-sm">
        <div class="card-header bg-light">
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
                          <button class="btn btn-sm btn-link p-0 ms-2" onclick=${() => toggleReveal(row.id)}>
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
