
const { h, render } = window.preact;
const html = window.htm.bind(h);
import App from './App.js';

//const { invoke } = window.__TAURI__.core;
const { exists, BaseDirectory, readTextFile, readFile, watch } = window.__TAURI__.fs || {};
const { getVersion } = window.__TAURI__.app || { getVersion: () => '0.0.0' };
const { join, dirname, extname } = window.__TAURI__.path || { join: (...a) => a.join('/'), extname: (p) => p.split('.').pop() };
const { Menu, MenuItem, Submenu, PredefinedMenuItem, CheckMenuItem } = window.__TAURI__.menu || {};
const { getCurrentWindow } = window.__TAURI__.window || {};

const { open, message, confirm } = window.__TAURI__.dialog || {};
const { Command } = window.__TAURI__.shell || {};
const { openPath } = window.__TAURI__.opener || {};
const { platform } = window.__TAURI__.os || {};
const { getCurrent } = window.__TAURI__.deepLink || {};
const { getMatches } = window.__TAURI__.cli || { getMatches: () => ({}) };
const Database = window.__TAURI__.sql


let openedFile

//const targetEl = 'image'
//let history = []

let store

//let imgWidth
//let imgHeight
//let xnwext = ''
//let xoper = []
//let xpixels = ''
//let xcmd = ''
//let xsuffix = ''
//let xcombine = false
//let scale = 1


async function shellCmd(xrr = []) {

  try {

    if (!openedFile) {

      throw "No opened file"

    }

    const cmdres = await Command.create('magick', xrr).execute();

    const cftxt = cmdres?.stdout || xrr[xrr.length - 1]

    await message(cftxt, { title: 'Operation completed', kind: 'info' });

  }
  catch (cmderr) {

    errorMessage(cmderr)
  }
}

/* async function addSuffix(sfx = '') {

  if (openedFile) {

    const sfext = await extname(openedFile)

    return openedFile.replace(`.${sfext}`, `_${sfx}.${sfext}`)
  }

} */

/* async function changeExt(nwex = '') {

  const sfext = await extname(openedFile)

  return openedFile.replace(`.${sfext}`, `.${nwex}`)
} */

async function errorMessage(err = '') {

  await message(err, { title: 'Oops...', kind: 'error' });
}


/* async function loadImage(fname) {

  //console.log(`Md file opening requested: ${fname}`)

  const imgext = await extname(fname)

  const cont = document.getElementById(targetEl)

  //document.getElementById('topleft').innerText = ''

  try {

    if (cont.hasChildNodes()) {

      cont.removeChild(cont.firstChild);
    }

    //document.getElementById(targetEl).innerHTML = ''

    if (imgext === 'svg') {

      const rawsvg = await readTextFile(fname)

      // SVG node
      const parser = new DOMParser()

      const svgnode = parser.parseFromString(rawsvg, "image/svg+xml")

      const svgElement = svgnode.documentElement

      //const svg = rawsvg.substr(rawsvg.indexOf('<svg')) //rawsvg.indexOf('<svg')

      svgElement.id = "svg-el"

      document.getElementById(targetEl).appendChild(svgElement)

      //document.getElementById(targetEl).innerHTML = svg
      //const svgel = document.querySelector('#image svg')

      imgHeight = svgElement.height.baseVal.value

      imgWidth = svgElement.width.baseVal.value

      //document.getElementById('topleft').innerText = `svg ${imgHeight}x${imgWidth}`

    }
    else {

      const imgbytes = await readFile(fname)

      const base64String = btoa(
        Array.from(imgbytes)
          .map(byte => String.fromCharCode(byte))
          .join('')
      )

      const imgext = await extname(fname)

      const imgnode = document.createElement("img")

      imgnode.id = "image-el"

      imgnode.alt = "local image"

      imgnode.src = `data:image/${imgext};base64,${base64String}`

      imgnode.className = "d-block mx-auto"

      imgnode.addEventListener("load", () => {

        //document.getElementById('topleft').innerText = `${imgnode.naturalWidth}x${imgnode.naturalHeight}`

        imgWidth = imgnode.naturalWidth

        imgHeight = imgnode.naturalHeight

      });

      document.getElementById(targetEl).appendChild(imgnode)



    }

    if (history.indexOf(fname) == -1) {

      history.splice(0, 0, fname)
      updateRecentMenu()
    }

    openedFile = fname

    document.getElementById('opened-file').innerText = fname

  }
  catch (err) {

    errorMessage(err)
  }



} */

/* async function openImage() {

  try {

    const filename = await open({
      multiple: false,
      directory: false,
      extensions: ['svg', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff']
    });

    if (filename) {

      loadImage(filename)
    }

  }
  catch (err) {

    errorMessage(err)

  }
} */

let menu


window.addEventListener("DOMContentLoaded", () => {


  (async () => {

    try {

      const fileMenu = await Submenu.new({
        text: 'File',
        //icon: 'folder',
        items: [
          await MenuItem.new({
            id: 'open',
            text: 'Open',
            action: () => {

              openImage()
            },
          }),
          await MenuItem.new({
            id: 'reload',
            text: 'Reload',
            action: () => {

              loadImage(openedFile)
            },
          }),
          await MenuItem.new({
            id: 'edit',
            text: 'Edit',
            action: async () => {

              try {

                await openPath(openedFile)

              }
              catch (err) {

                await Command.create('notepad', [
                  openedFile
                ]).execute();

              }
              finally {

                errorMessage(err)
              }
            },
          }),

          await MenuItem.new({
            id: 'clear',
            text: 'Clear',
            action: () => {

              document.getElementById(targetEl).innerHTML = ""

              openedFile = ""
            },
          }),
        ]
      })

      const viewMenu = await Submenu.new({
        text: 'Router',
        items: [
          
          await MenuItem.new({
            id: 'database',
            text: 'Database',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-database' }));
            },
          }),
          
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          
          await MenuItem.new({
            id: 'openrouter',
            text: 'Open Router',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-openrouter' }));
            },
          }),
          await MenuItem.new({
            id: 'ollama',
            text: 'Ollama',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-ollama' }));
            },
          }),
          await MenuItem.new({
            id: 'lmstudio',
            text: 'LM Studio',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-lmstudio' }));
            },
          }),
          await MenuItem.new({
            id: 'imagemagick',
            text: 'ImageMagick',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-imagemagick' }));
            },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'api-keys',
            text: 'API Keys',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-api-keys' }));
            },
          }),
        ]
      })


      
      const helpMenu = await Submenu.new({
        text: 'Help',
        items: [
          /* await MenuItem.new({
            id: 'magickv',
            text: 'ImageMagick Version',
            action: async () => {

              try{

                const cmdres = await Command.create('magick', [
                  '-version'
                ]).execute();

                await message(cmdres?.stdout, { title: 'ImageMagick Version', kind: 'info' });

              }
              catch(cmderr){

                errorMessage(cmderr)
              }
              
            },
          }), */
          await MenuItem.new({
            id: 'about',
            text: 'About',
            action: async () => {

              const appVersion = await getVersion();

              await message(`Tauri LLM APIs v${appVersion}\nCreated by Amir Hachaichi\ngithub.com/amirlogic/tauri-api-tool`,
                { title: 'About', kind: 'info' });
            },
          }),
        ]
      })


      menu = await Menu.new({
        items: [
          fileMenu,
          viewMenu,
          //recent_menu,
          helpMenu
        ],
      });

      await menu.setAsAppMenu();
    }
    catch (err) {

      errorMessage(err)
    }
  })();


  (async () => {

    const matches = await getMatches();

    try {

      if (matches.args && matches.args.file && matches.args.file.value) {

        let filePath = matches.args.file.value.trim();

        if (filePath.indexOf('\\\\') !== -1) {

          let pathrr = filePath.split('\\\\')

          filePath = await join(...pathrr)
        }
        else {

          let pathrr = filePath.split('\\')

          filePath = await join(...pathrr)
        }

        openedFile = filePath   // debug

        const fileExists = await exists(filePath)

        if (fileExists) {

          document.getElementById(targetEl).innerText = `open: ${filePath}`

          openedFile = filePath

          //setTimeout(async () => {

          await loadImage(filePath)
          //}, 1000)
        }
        else {

          document.getElementById(targetEl).innerText = `File not found: ${filePath}`

          errorMessage("File not found")
        }

      }
    }
    catch (err) {

      errorMessage(err)
    }

    

  })();




});

// Render the Preact app
render(html`<${App} />`, document.getElementById('app'));
