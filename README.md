# Markdown Viewer

Opens and views markdown files. Has recent opened files function. 

Built using Tauri V2

Uses Marked to generate HTML from Markdown

Uses PNPM


## Apps

```dev``` MD Viewer Development 


## Notes

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
```


### Linux

On Fedora, the following packages were needed:

```bash
sudo dnf install libsoup3-devel
sudo dnf install javascriptcoregtk4.1-devel
sudo dnf install webkit2gtk4.1-devel
```

