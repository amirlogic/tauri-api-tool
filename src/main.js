
const { h, render } = window.preact;
const html = window.htm.bind(h);
import App from './App.js';

//const { invoke } = window.__TAURI__.core;
const { exists, BaseDirectory, readTextFile, readFile } = window.__TAURI__.fs;
const { getVersion } = window.__TAURI__.app
const { join, dirname, extname } = window.__TAURI__.path;
const { Menu, MenuItem, Submenu, PredefinedMenuItem, CheckMenuItem } = window.__TAURI__.menu;
const { getCurrentWindow } = window.__TAURI__.window;

const { open, message, confirm } = window.__TAURI__.dialog;
const { Command } = window.__TAURI__.shell;
const { openPath } = window.__TAURI__.opener;
const { platform } = window.__TAURI__.os;
const { getCurrent } = window.__TAURI__.deepLink   // onOpenUrl
const { getMatches } = window.__TAURI__.cli;
const Database = window.__TAURI__.sql


let openedFile

const targetEl = 'image'

let history = []

let store

let imgWidth

let imgHeight

let xnwext = ''

let xoper = []

let xpixels = ''

//let xcmd = ''

let xsuffix = ''

let xcombine = false

let scale = 1


async function shellCmd(xrr=[]){

  try{

    if(!openedFile){

      throw "No opened file"
      
    }

    const cmdres = await Command.create('magick', xrr).execute();

    const cftxt = cmdres?.stdout || xrr[xrr.length-1]

    await message(cftxt, { title: 'Operation completed', kind: 'info' });

  }
  catch(cmderr){

    errorMessage(cmderr)
  }
}

async function addSuffix(sfx=''){

  if(openedFile){

    const sfext = await extname(openedFile)

    return openedFile.replace(`.${sfext}`,`_${sfx}.${sfext}`)
  }
  
}

async function changeExt(nwex=''){

  const sfext = await extname(openedFile)

  return openedFile.replace(`.${sfext}`,`.${nwex}`)
}

async function errorMessage(err=''){

  await message(err, { title: 'Oops...', kind: 'error' });
}

async function updateRecentMenu(){

  const recentMenu = await menu.get('recent')

  history.forEach(async (hitem,indx)=>{

    const recentItem = await recentMenu.get(`r${indx}`)

    if(recentItem){

      await recentItem.setText(hitem)
    }

  })

}

/* async function storeFileName(fname){
  //const store = await load('store.json', { autoSave: false });
  await store.set('lastfile', fname);
  await store.save();
} */
/* async function getStoreData(){
  //const store = await load('store.json', { autoSave: false });
  return await store.get('lastfile')
} */

function showHistory(){

  document.getElementById(targetEl).innerHTML = history.map((row,indx)=>{
                                                                      return `<p><a id="hlnk-${indx}" href="#" class="history-item" data-filename="${row}">${row}</a></p>`
                                                                    }).join('')

  let hitems = document.querySelectorAll('.history-item')
  
  hitems.forEach((item)=>{

    item.addEventListener('click',(e)=>{

      e.preventDefault();

      try{

        const el = e.currentTarget

        loadImage(el.dataset.filename)

        
      }
      catch(err){

        errorMessage(err)
      }
      
    })

  })
}


/* async function loadImage(fname) {

  //console.log(`Md file opening requested: ${fname}`)

  const imgext = await extname(fname)

  const cont = document.getElementById(targetEl)

  document.getElementById('topleft').innerText = ''

  try{

    if (cont.hasChildNodes()) {

      cont.removeChild(cont.firstChild);
    }

    //document.getElementById(targetEl).innerHTML = ''

    if(imgext === 'svg'){

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

      document.getElementById('topleft').innerText = `svg ${imgHeight}x${imgWidth}`

    }
    else{

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

        document.getElementById('topleft').innerText = `${imgnode.naturalWidth}x${imgnode.naturalHeight}`

        imgWidth = imgnode.naturalWidth

        imgHeight = imgnode.naturalHeight

      });

      document.getElementById(targetEl).appendChild(imgnode)

      

    }

    if(history.indexOf(fname) == -1){

      history.splice(0,0,fname)
      updateRecentMenu()
    }

    openedFile = fname

    document.getElementById('opened-file').innerText = fname

  }
  catch(err){

    errorMessage(err)
  }

  

} */

/* async function openImage() {

  try{

    const filename = await open({
      multiple: false,
      directory: false,
      extensions: ['svg','png','jpg','jpeg','bmp','gif','tiff']
    });

    if(filename){

      loadImage(filename)
    }
    
  }
  catch(err){

    errorMessage(err)
    
  }
} */

let menu


window.addEventListener("DOMContentLoaded", () => {

  
  (async ()=>{

    try{

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
            id: 'increment-counter',
            text: 'Increment Counter',
            action: () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'increment-counter' }));
            },
          }),
          await MenuItem.new({
            id: 'edit',
            text: 'Edit',
            action: async () => {

              try{

                await openPath(openedFile)

              }
              catch(err){

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
            id: 'home',
            text: 'Home',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-home' }));
            },
          }),
          await MenuItem.new({
            id: 'about',
            text: 'About',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-about' }));
            },
          }),
          await MenuItem.new({
            id: 'settings',
            text: 'Settings',
            action: async () => {
              window.dispatchEvent(new CustomEvent('tauri-menu-command', { detail: 'navigate-settings' }));
            },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
        ]
      })


      /* const check_sub_item_combine_on = await CheckMenuItem.new({
              id: 'combineon',
              text: 'Combine: ON',
              checked: xcombine,
              action: () => {

                xcombine = true
                check_sub_item_combine_off.setChecked(!xcombine)
              },
          })

      const check_sub_item_combine_off = await CheckMenuItem.new({
              id: 'combineoff',
              text: 'Combine: OFF',
              checked: !xcombine,
              action: () => {

                xcombine = false
                check_sub_item_combine_on.setChecked(xcombine)
              },
          }) */

      /* const actionMenu = await Submenu.new({
        text: 'Action',
        items: [
          check_sub_item_combine_on,
          check_sub_item_combine_off,
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
              id: 'exec',
              text: 'Execute',
              action: async () => {


                let xconf = await confirm(`Export with these changes?\n\nFormat: ${xnwext}\nSize: ${xpixels}\nExtra: ${xoper.join(' ')}\n${xcombine ? '' : "\nCombine is Off!"}\n`, 
                                          { title: 'Confirm execution', kind: 'warning' })

                if(xconf && xcombine){

                  let xrr = [openedFile]

                  let sfx = ''

                  try {
                    
                    // resize
                    if(xpixels){

                      xrr.push(...['-resize',xpixels])

                      sfx += `_${xpixels}`
                    }

                    if(xoper){

                        xrr.push(...xoper)

                        sfx += `_m`
                    }
                   
                    // output file
                    if(xnwext && sfx){

                      const sfext = await extname(openedFile)

                      const outx = openedFile.replace(`.${sfext}`,`_${sfx}.${xnwext}`)

                      xrr.push(outx)
                      
                    }
                    else if(sfx){

                      const outx = await addSuffix(sfx)

                      xrr.push(outx)

                    }
                    else if(xnwext){

                      const outx = await changeExt(xnwext)

                      xrr.push(outx)
                    }

                    if(xrr.length > 1){
                      
                      shellCmd(xrr)
                    }
                    
                    //await message(cmdres?.stdout, { title: 'ImageMagick', kind: 'info' });

                  } catch (xerror) {
                    
                    errorMessage(xerror)
                  }
                }

              },
          }),
          await MenuItem.new({
              id: 'reset',
              text: 'Reset',
              action: async () => {

                xnwext = ''

                xoper = []

                xpixels = ''

                //xcmd = ''

                xsuffix = ''

              },
          }),
        ]
      }) */

      /* const resizeMenu = await Submenu.new({
        text: 'Resize',
        items: [
          await MenuItem.new({
              id: '800x800',
              text: '800x800',
              action: async () => {

                if(openedFile){

                  if(!xcombine){

                    const outsfx = await addSuffix('800x800')
                    shellCmd([openedFile,'-resize','800x800',outsfx])
                  }
                  else{

                    
                  }
                }
              },
          }),
          
        ]
      }) */

      /* const rotateMenu = await Submenu.new({
        text: 'Rotate',
        items: [
          await MenuItem.new({
            id: 'p90',
            text: '+90°',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outsfx = await addSuffix('rp90')
                  shellCmd(['convert','-rotate','90',openedFile, outsfx])
                }
                else{

                  
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'p180',
            text: '+180°',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outsfx = await addSuffix('rp180')
                  shellCmd(['convert','-rotate','180',openedFile, outsfx])
                }
                else{

                  
                }
              }
            },
          }),
          
          
        ]
      }) */

      /* const exportMenu = await Submenu.new({
        text: 'Export',
        items: [
          await MenuItem.new({
            id: 'topng',
            text: 'to PNG',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await changeExt('png')
                  shellCmd([openedFile, outx])
                }
                else{

                  xnwext = 'png'
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'topngwhtrp',
            text: 'to PNG White Transparent Fz5%',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await changeExt('png')
                  shellCmd([openedFile, '-fuzz','5%','-transparent','white', outx])
                }
                else{

                  xnwext = 'png'
                  xoper.push(...['-fuzz','5%','-transparent','white'])
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'tojpg',
            text: 'to JPG',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await changeExt('jpg')
                  shellCmd([openedFile, outx])
                }
                else{

                  xnwext = 'jpg'
                }
              }
            },
          }),
          
         
        ]
      }) */

      /* const effectsMenu = await Submenu.new({
        text: 'Effects',
        items: [
          await MenuItem.new({
            id: 'wtr1',
            text: 'White transparent 1% fuzz',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await addSuffix('_whtrsp')
                  shellCmd([openedFile, '-fuzz','1%','-transparent','white', outx])
                }
                else{

                  xoper.push(...['-fuzz','1%','-transparent','white'])
                  
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'wtr5',
            text: 'White transparent 5% fuzz',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await addSuffix('_whtrsp')
                  shellCmd([openedFile, '-fuzz','5%','-transparent','white', outx])
                }
                else{

                  xoper.push(...['-fuzz','5%','-transparent','white'])
                  
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'wtr10',
            text: 'White transparent 10% fuzz',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await addSuffix('_whtrsp')
                  shellCmd([openedFile, '-fuzz','10%','-transparent','white', outx])
                }
                else{

                  xoper.push(...['-fuzz','10%','-transparent','white'])
                  
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'grayscale',
            text: 'Grayscale',
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await addSuffix('_grayscale')
                  shellCmd([openedFile, '-colorspace','Gray', outx])
                }
                else{

                  xoper.push(...['-colorspace','Gray'])
                  
                }
              }
            },
          }),
          await MenuItem.new({
            id: 'flip',
            text: 'Flip', // vertical flip
            action: async () => {

              if(openedFile){

                if(!xcombine){

                  const outx = await addSuffix('_flipped')
                  shellCmd([openedFile, '-flip', outx])
                }
                else{

                  xoper.push('-flip')
                  
                }
              }
            },
          }),
          
          
        ]
      }) */

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

              await message(`Image Tool v${appVersion}\nCreated by Amir Hachaichi\ngithub.com/amirlogic/tauri-image-tool`, 
                            { title: 'About', kind: 'info' });
            },
          }),
        ]
      })

      let recent_menu = {
            id: 'recent',
            text: 'Recent',
            items:[

              {id: 'r0',text:'-', action:()=>{ loadImage(history[0]) }},
              {id: 'r1',text:'-', action:()=>{ loadImage(history[1]) }},
              {id: 'r2',text:'-', action:()=>{ loadImage(history[2]) }},
              {id: 'r3',text:'-', action:()=>{ loadImage(history[3]) }},
              {id: 'r4',text:'-', action:()=>{ loadImage(history[4]) }},
              {id: 'r5',text:'-', action:()=>{ loadImage(history[5]) }},
              {id: 'r6',text:'-', action:()=>{ loadImage(history[6]) }},
              {id: 'r7',text:'-', action:()=>{ loadImage(history[7]) }},
              {id: 'r8',text:'-', action:()=>{ loadImage(history[8]) }},
              {id: 'r9',text:'-', action:()=>{ loadImage(history[9]) }}
            ]
            
          }

      menu = await Menu.new({
        items: [
          fileMenu,
          viewMenu,
          recent_menu,
          //actionMenu,
          //exportMenu,
          //resizeMenu,
          //rotateMenu,
          //effectsMenu,
          helpMenu
        ],
      });

      await menu.setAsAppMenu();
    }
    catch(err){

      errorMessage(err)
    }
  })();


  (async ()=>{

    const matches = await getMatches();

    try{

      if (matches.args && matches.args.file && matches.args.file.value) {
        
        let filePath = matches.args.file.value.trim();

        if(filePath.indexOf('\\\\') !== -1){
          
          let pathrr = filePath.split('\\\\')

          filePath = await join(...pathrr)
        }
        else{

          let pathrr = filePath.split('\\')

          filePath = await join(...pathrr)
        }

        openedFile = filePath   // debug

        const fileExists = await exists(filePath)

        if(fileExists){

          document.getElementById(targetEl).innerText = `open: ${filePath}`

          openedFile = filePath

          //setTimeout(async () => {
            
          await loadImage(filePath)
          //}, 1000)
        }
        else{

          document.getElementById(targetEl).innerText = `File not found: ${filePath}`

          errorMessage("File not found")
        }

      }
    }
    catch(err){

      errorMessage(err)
    }

    // OpenWith DEV
    let devmode = "none"

    if(devmode == "plugin"){

      const urls = await getCurrent()

      if(urls){

        console.log(`getCurrent: ${urls}`)

        //await message(`getCurrent: ${urls}`, { title: 'deep-link', kind: 'info' });

        document.getElementById(targetEl).innerText = `getCurrent: ${urls}`
      }

    }
    else if(devmode == "listen"){

        const getevent = await getCurrentWindow().listen('deep-link', (event) => {

          console.log(`getCurrentWindow().listen: ${event.payload}`);

          document.getElementById(targetEl).innerText = `getCurrentWindow().listen: ${event.payload}`
        });

        /* const getevent = await getCurrentWindow().listen('open-file', (event) => {
          console.log(`getCurrentWindow().listen: ${event.payload}`);
          document.getElementById(targetEl).innerText = `getCurrentWindow().listen: ${event.payload}`
        }); */

    }
    else if(devmode == "cli"){

      if (matches.subcommand?.name === 'run') {

        // `./your-app run $ARGS` was executed
        const args = matches.subcommand.matches.args;

        if (args.debug?.value === true) {
          // `./your-app run --debug` was executed
          document.getElementById(targetEl).innerText = `cli: debug`
        }

        if (args.release?.value === true) {
          // `./your-app run --release` was executed
        }

      }

    }
    else{

      console.log("No DevMode specified")
    }

  })();

  

  
});

// Render the Preact app
render(html`<${App} />`, document.getElementById('app'));
