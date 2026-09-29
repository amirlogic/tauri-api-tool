# Tauri API Tool

Many functions that demonstrates Tauri capabilities:


- API calls (Ollama - LLM) with API keys management

Preact based, No webpack needed


## Notes

### Dev

Built using Tauri V2

Uses PNPM

To pass command line arguments to dev: `pnpm tauri dev -- -- <arguments>`

Check Tauri version and update: 

`pnpm outdated @tauri-apps/cli` then `pnpm update @tauri-apps/cli @tauri-apps/api --latest`


### Config

`withGlobalTauri` is set to `true`


### Plugins

The following plugins were installed:

```bash
pnpm tauri add dialog
pnpm tauri add fs
pnpm tauri add shell
pnpm tauri add store
pnpm tauri add opener
pnpm tauri add os
pnpm tauri add deep-link
pnpm tauri add cli
pnpm tauri add sql
pnpm tauri add http
```

Also for SQLite: `cargo add tauri-plugin-sql --features sqlite`

For the watch function, it is optionnal and had to be activated in cargo.toml

### Linux

On Fedora, the following packages were needed:

```bash
sudo dnf install libsoup3-devel
sudo dnf install javascriptcoregtk4.1-devel
sudo dnf install webkit2gtk4.1-devel
```

### Debug

To open the console and view errors: Open DevTools using Right click then Inspect.

The semicolon after the 2 IIFEs inside the DOMContentLoaded event listener are necessary to avoid error.

Do not put icons in menus to avoid errors


### Permissions

Tauri has restrictive default permissions

- SQLite: Default does not include execute

- File system (fs): Default does not allow to modify files

- Shell: Commands must be whitelisted to allow execution

- http: Urls must be whitelisted



### Added

1. Created src/router.js:
       - parseRoute(hash): Logic to parse the URL hash into a route object.
       - buildRoutePath(name, params): Helper to generate hash strings for navigation.
       - useHashRoute(): A custom Preact hook that manages the current route state and listens for hashchange events.

2. Modified src/App.js:
       - Integrated the useHashRoute hook.
       - Implemented conditional rendering using a routeMap (Home, About, Settings, and 404 pages).
       - Updated the Navbar with interactive links that use the navigate function.
       - Extended the tauri-menu-command event listener to handle navigation requests from the native OS menu.

3. Modified src/main.js:
       - Updated the "Router" native menu items to dispatch custom events (navigate-home, navigate-about,
         navigate-settings) when clicked, allowing the native menu to control the frontend routing.

---

 I have added the requested feature to the Tauri v2 app. The application can now open text files, display their
  content, and automatically update the display when the file is modified on disk.

  Changes Summary:

   1. Routing: Updated `src/router.js` to include the textfile route.
   2. Frontend:
       * Implemented the TextFileScreen component in `src/App.js`.
       * Added file opening logic using Tauri's dialog plugin.
       * Implemented live-watching using Tauri's fs.watch API, ensuring the content stays in sync with the file on disk.
       * Updated the navigation bar and route mapping to include the new screen.
   3. Permissions: Updated `src-tauri/capabilities/default.json` to include `fs:allow-watch`, enabling the file-watching
      functionality in Tauri v2.
  The feature is now fully integrated and can be accessed via the "Text File" link


### Features

- File operations plugins

- "Open with" support

- SQLite plugin


## Tests

1. Test Harness & Infrastructure (Step 1)
Test Runner: Configured Vitest
 (v5.0.2) with happy-dom
 and pool: 'vmThreads' in vitest.config.js.
Scripts: Added "test": "vitest run" and "test:watch": "vitest" to package.json.
Global Environment Setup: Created test/setup.js which provides:
Stubs for Preact / HTM runtime globals (window.preactHooks, window.preact, window.htm) so modules with global dependencies load cleanly.
Automatic teardown and cleanup (vi.clearAllMocks(), localStorage.clear()) after each test.

2. Unit Testing Pure Business Logic (Step 1)
Router Logic in test/router.test.js:
Verified parseRoute across default/empty paths, root #, all 15 registered routes, and fallback 404 routes.
Verified buildRoutePath for route serialization and unknown screen defaults.
LLM Pure Functions in test/llmService.test.js:
Verified getProviderEndpoint for OpenRouter, Ollama default and custom URLs, LM Studio custom baseUrl and localStorage persistence.
Verified getProviderHeaders auth token injection and provider-specific headers (HTTP-Referer).
Verified parseAssistantResponse for OpenAI format (choices[0].message), Ollama format (message object and string), and error payloads.

3. Tauri IPC Mocking & Service Integration (Step 2)
IPC Global Mocking: test/setup.js equips window.__TAURI__ with mocks for sql, http, dialog, fs, and shell.
Database Service in test/dbService.test.js:
Added resetConnection() to allow clean connection state isolation.
Tested missing SQL plugin error handling.
Tested table DDL execution in ensureTables().
Tested single-key lookups (getApiKey) and two-step model-to-provider key lookups (getApiKeyForModel).
Tested multi-provider query building in getModelsForProviders and provider deduplication in getDistinctProviders.
Export Service in test/exportService.test.js:
Tested exportToMarkdown with simulated file save dialog acceptance, rejection/cancellation, and missing API checks.
LLM IPC & End-to-End Chat Completion in test/llmService.ipc.test.js:
Tested httpFetch using Tauri HTTP plugin vs standard browser window.fetch.
Tested chatCompletion with OpenRouter (reasoning payload, headers, explicit vs DB-resolved API keys) and LM Studio.
Tested HTTP error propagation on 4xx/5xx responses.