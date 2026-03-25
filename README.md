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
```

Also for SQLite: `cargo add tauri-plugin-sql --features sqlite`

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


### Features

- File operations plugins

- "Open with" support

- SQLite plugin