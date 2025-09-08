# Markdown Viewer

Opens and views markdown files. Has recent opened files function. 

Built using Tauri V2

Uses Marked to generate HTML from Markdown

Uses PNPM


## Apps

```dev``` MD Viewer Development 


## Notes

### Dev

To pass command line arguments to dev: `pnpm tauri dev -- -- <arguments>`


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
```


### Linux

On Fedora, the following packages were needed:

```bash
sudo dnf install libsoup3-devel
sudo dnf install javascriptcoregtk4.1-devel
sudo dnf install webkit2gtk4.1-devel
```


### Features

- Implement Open With using CLI ✅

- Filename as Positional argument ✅

- The app launches when using CMD: `start markdown://open-file?payload=C:/Users/you/Documents/example.md`

- Deep link received when using `getCurrent()` ✅

- Add Menu items using Window plugin ✅
