# Image Tool

Image viewer and editor designed to be lightweight, fast and customizable

[ImageMagick](https://github.com/ImageMagick/ImageMagick) v7+ is required for editing



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
```


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


### Features

- Open and view images

- Modify images using commands sent to ImageMagick






