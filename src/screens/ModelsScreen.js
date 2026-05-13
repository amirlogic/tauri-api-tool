const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

export default function ModelsScreen() {
  const [models, setModels] = useState([]);
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [form, setForm] = useState({ model_name: '', provider: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    async function initDb() {
      try {
        const Database = window.__TAURI__.sql;
        if (!Database) throw new Error('SQL plugin not available');
        const conn = await Database.load('sqlite:test.db');
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        setDb(conn);
        await loadModels(conn);
      } catch (err) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
    initDb();
  }, []);

  async function loadModels(conn) {
    const rows = await (conn || db).select('SELECT * FROM models ORDER BY id DESC');
    setModels(rows);
  }

  async function handleSubmit() {
    const { model_name, provider } = form;
    if (!model_name.trim() || !provider.trim()) {
      setError('Model Name and Provider are required.');
      return;
    }
    try {
      setError(null);
      if (editingId !== null) {
        await db.execute(
          'UPDATE models SET model_name = ?, provider = ? WHERE id = ?',
          [model_name.trim(), provider.trim(), editingId]
        );
        setSuccessMsg('Model updated.');
      } else {
        await db.execute(
          'INSERT INTO models (model_name, provider) VALUES (?, ?)',
          [model_name.trim(), provider.trim()]
        );
        setSuccessMsg('Model saved.');
      }
      setForm({ model_name: '', provider: '' });
      setEditingId(null);
      await loadModels();
    } catch (err) {
      setError(err.toString());
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ model_name: row.model_name, provider: row.provider });
    setError(null);
    setSuccessMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ model_name: '', provider: '' });
  }

  async function deleteModel(id) {
    try {
      await db.execute('DELETE FROM models WHERE id = ?', [id]);
      if (editingId === id) cancelEdit();
      setSuccessMsg('Model deleted.');
      await loadModels();
    } catch (err) {
      setError(err.toString());
    }
  }

  function handleInput(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  if (loading) return html`<div class="mt-5"><p>Loading database…</p></div>`;

  return html`
    <div class="mt-5">
      <h1>Models</h1>
      <p>Manage LLM models and their providers.</p>

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
          <strong>${editingId !== null ? '✏️ Edit Model' : '➕ Add Model'}</strong>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Model Name</label>
              <input type="text" class="form-control" name="model_name" placeholder="e.g. gpt-4"
                     value=${form.model_name} oninput=${handleInput} />
            </div>
            <div class="col-md-6">
              <label class="form-label">Provider</label>
              <input type="text" class="form-control" name="provider" placeholder="e.g. openai"
                     value=${form.provider} oninput=${handleInput} />
            </div>
            <div class="col-12 d-flex gap-2">
              <button class="btn btn-primary" onclick=${handleSubmit}
                      disabled=${!form.model_name.trim() || !form.provider.trim()}>
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
          <strong>Stored Models (${models.length})</strong>
        </div>
        ${models.length === 0
          ? html`<div class="card-body"><p class="text-muted mb-0">No models stored yet.</p></div>`
          : html`
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Model Name</th>
                    <th>Provider</th>
                    <th>Created</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${models.map(row => html`
                    <tr key=${row.id} class=${editingId === row.id ? 'table-active' : ''}>
                      <td>${row.model_name}</td>
                      <td><span class="badge bg-secondary">${row.provider}</span></td>
                      <td><small class="text-muted">${row.created_at}</small></td>
                      <td class="text-end">
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-primary" onclick=${() => startEdit(row)}>Edit</button>
                          <button class="btn btn-outline-danger" onclick=${() => deleteModel(row.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          `
        }
      </div>
    </div>
  `;
}
