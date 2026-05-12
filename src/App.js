import DatabaseScreen from './screens/DatabaseScreen.js';
import OpenRouterScreen from './screens/OpenRouterScreen.js';
import ApiKeysScreen from './screens/ApiKeysScreen.js';
import OllamaScreen from './screens/OllamaScreen.js';
import { useHashRoute } from './router.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

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
        <p>Welcome to the Tauri API Tool!</p>
        <div class="mt-4">
          <h3>Counter Example</h3>
          <p>Count: ${count}</p>
          <button class="btn btn-primary" onclick=${() => setCount(count + 1)}>
            Increment
          </button>
        </div>
      </div>
    `,
    database: () => html`<${DatabaseScreen} />`,
    openrouter: () => html`<${OpenRouterScreen} />`,
    ollama: () => html`<${OllamaScreen} />`,
    lmstudio: () => html`<${OllamaScreen} />`,
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
                <a class="nav-link ${route.name === 'openrouter' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('openrouter'); }}>OpenRouter</a>
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
        <div id="image" class="min-vh-50"></div>
      </main>
    </div>
  `;
}

export default App;
