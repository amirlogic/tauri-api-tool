import DatabaseScreen from './screens/DatabaseScreen.js';
import OpenRouterScreen from './screens/OpenRouterScreen.js';
import ApiKeysScreen from './screens/ApiKeysScreen.js';
import ModelsScreen from './screens/ModelsScreen.js';
import OllamaScreen from './screens/OllamaScreen.js';
import LMStudioScreen from './screens/LMStudioScreen.js';
import ImageMagickScreen from './screens/ImageMagickScreen.js';
import { useHashRoute } from './router.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

function App() {
  const [route, navigate] = useHashRoute();

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.startsWith('navigate-')) {
        const targetRoute = event.detail.replace('navigate-', '');
        navigate(targetRoute);
      }
    };

    window.addEventListener('tauri-menu-command', handler);
    return () => window.removeEventListener('tauri-menu-command', handler);
  }, [navigate]);

  const routeMap = {
    home: () => html`
      <div class="py-5 text-center">
        <div class="container py-5">
          <h1 class="display-3 fw-bold mb-4">LLM APIs Client</h1>
          <p class="lead mb-5 mx-auto text-secondary" style="max-width: 800px;">
            A unified desktop interface for managing and interacting with diverse Large Language Model APIs. 
            Connect to cloud providers like OpenRouter or local instances like Ollama and LM Studio through a single, secure application.
          </p>
          
          <div class="row g-4 justify-content-center mt-5">
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm p-4 bg-light">
                <div class="display-5 mb-3">🚀</div>
                <h4 class="fw-bold">OpenRouter</h4>
                <p class="text-muted small">Access a vast catalog of cloud models with unified management and billing.</p>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm p-4 bg-light">
                <div class="display-5 mb-3">🏠</div>
                <h4 class="fw-bold">Local LLMs</h4>
                <p class="text-muted small">Seamless integration with Ollama and LM Studio for private, local inference.</p>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm p-4 bg-light">
                <div class="display-5 mb-3">🛡️</div>
                <h4 class="fw-bold">Secure Storage</h4>
                <p class="text-muted small">Your API keys and model configurations are stored safely in a local SQLite database.</p>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-4">
            <button class="btn btn-primary btn-lg px-5 shadow-sm" onclick=${() => navigate('openrouter')}>
              Get Started
            </button>
          </div>
        </div>
      </div>
    `,
    database: () => html`<${DatabaseScreen} />`,
    openrouter: () => html`<${OpenRouterScreen} />`,
    ollama: () => html`<${OllamaScreen} provider="ollama" />`,
    lmstudio: () => html`<${LMStudioScreen} />`,
    'api-keys': () => html`<${ApiKeysScreen} />`,
    'models': () => html`<${ModelsScreen} />`,
    'imagemagick': () => html`<${ImageMagickScreen} />`,
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
          <a class="navbar-brand fw-bold" href="#" onclick=${(e) => { e.preventDefault(); navigate('home'); }}>
            LLM Client
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
                <a class="nav-link ${route.name === 'imagemagick' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('imagemagick'); }}>ImageMagick</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'api-keys' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('api-keys'); }}>API Keys</a>
              </li>
              <li class="nav-item">
                <a class="nav-link ${route.name === 'models' ? 'active fw-bold' : ''}" 
                   href="#" onclick=${(e) => { e.preventDefault(); navigate('models'); }}>Models</a>
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
