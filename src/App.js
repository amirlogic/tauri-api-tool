const { h, render } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);


function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail === 'increment-counter') {
        setCount((c) => c + 1);
      }
    };

    window.addEventListener('tauri-menu-command', handler);
    return () => window.removeEventListener('tauri-menu-command', handler);
  }, []);

  return html`
    <div>
      <nav class="navbar navbar-expand-lg bg-body-tertiary">
        <div class="container-fluid">
          <a id="topleft" class="navbar-brand" href="#" style="cursor:default;">
            img
          </a>
          
          <span id="opened-file" class="navbar-text">
            Please open a file
          </span>
          
        </div>
      </nav>

      <main class="container-fluid">
        <div class="text-center mt-5">
          <h1>Preact Demo</h1>
          <p>Count: ${count}</p>
          <button class="btn btn-primary" onclick=${() => setCount(count + 1)}>
            Increment
          </button>
        </div>
        <div id="image" class="min-vh-50">
        </div>
      </main>
    </div>
  `;
}

export default App;