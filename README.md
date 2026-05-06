# Tauri Preact Boilerplate

Designed to offer state based interactive user interface with the least complexity

No webpack needed



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