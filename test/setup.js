import { beforeEach, afterEach, vi } from 'vitest';

// Preact and HTM globals used by frontend screens/components
if (typeof window !== 'undefined') {
  window.preactHooks = {
    useState: vi.fn((init) => [typeof init === 'function' ? init() : init, vi.fn()]),
    useEffect: vi.fn((effect) => effect && effect()),
  };

  window.preact = {
    h: vi.fn((tag, props, ...children) => ({ tag, props, children })),
  };

  window.htm = {
    bind: vi.fn(() => vi.fn((strings, ...values) => ({ strings, values }))),
  };

  // Mock Tauri global object matching `withGlobalTauri: true`
  window.__TAURI__ = {
    sql: {
      load: vi.fn(),
    },
    http: {
      fetch: vi.fn(),
      Body: {
        json: (val) => JSON.stringify(val),
      },
    },
    dialog: {
      save: vi.fn(),
      open: vi.fn(),
      message: vi.fn(),
    },
    fs: {
      writeTextFile: vi.fn(),
      readTextFile: vi.fn(),
      watch: vi.fn(),
    },
    shell: {
      Command: {
        create: vi.fn(),
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
