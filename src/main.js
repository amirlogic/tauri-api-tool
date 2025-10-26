
//const { invoke } = window.__TAURI__.core;
const { exists, BaseDirectory, readTextFile, readFile } = window.__TAURI__.fs;
const { getVersion } = window.__TAURI__.app
const { join, dirname, extname } = window.__TAURI__.path;
const { Menu, MenuItem, Submenu, PredefinedMenuItem } = window.__TAURI__.menu;
const { getCurrentWindow } = window.__TAURI__.window;

const { open, message, confirm } = window.__TAURI__.dialog;
const { Command } = window.__TAURI__.shell;
const { openPath } = window.__TAURI__.opener;
const { platform } = window.__TAURI__.os;
const { getCurrent } = window.__TAURI__.deepLink   // onOpenUrl
const { getMatches } = window.__TAURI__.cli;


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


async function loadImage(fname) {

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

      imgHeight = svgElement.height.baseVal.value //svgel.height.baseVal.value

      imgWidth = svgElement.width.baseVal.value//svgel.width.baseVal.value

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

      history.push(fname)
    }

    openedFile = fname

    document.getElementById('opened-file').innerText = fname

  }
  catch(err){

    errorMessage(err)
  }

  

}

async function openImage() {

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
}



window.addEventListener("DOMContentLoaded", () => {

  
  (async ()=>{

    try{

      const fileMenu = await Submenu.new({
        text: 'File',
        icon: 'folder',
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
            id: 'metadata',
            text: 'Metadata',
            action: async () => {

              try{

                if(openedFile){

                  const cmdres = await Command.create('magick', [
                    'identify', '-verbose', `${openedFile}`
                  ]).execute()

                  await message(cmdres?.stdout, { title: 'ImageMagick Metadata', kind: 'info' })
                }

              }
              catch(cmderr){

                errorMessage(cmderr)
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
        text: 'View',
        items: [
          await MenuItem.new({
            id: 'bgcolorlight',
            text: 'Background Color: Light Gray',
            action: async () => {

              document.body.style.backgroundColor = '#F1F1F1'
            },
          }),
          await MenuItem.new({
            id: 'bgcolordark',
            text: 'Background Color: Dark',
            action: async () => {

              document.body.style.backgroundColor = '#000000'
            },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'zoomin125',
            text: 'Zoom In 125%',
            action: async () => {

              if(document.getElementById('image-el')){

                document.getElementById('image-el').style.transform = 'scale(1.25)'
                document.getElementById('image-el').style.transformOrigin = 'center'
              }
              else if(document.getElementById('svg-el')){

                document.getElementById('svg-el').style.transform = 'scale(1.25)'
                document.getElementById('svg-el').style.transformOrigin = 'center'
              }
            },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'zoomout75',
            text: 'Zoom Out 75%',
            action: async () => {

              if(document.getElementById('image-el')){

                document.getElementById('image-el').style.transform = 'scale(0.75)'
                document.getElementById('image-el').style.transformOrigin = 'center'
              }
              else if(document.getElementById('svg-el')){

                document.getElementById('svg-el').style.transform = 'scale(0.75)'
                document.getElementById('svg-el').style.transformOrigin = 'center'
              }
            },
          }),
          await MenuItem.new({
            id: 'zoomout50',
            text: 'Zoom Out 50%',
            action: async () => {

              if(document.getElementById('image-el')){

                document.getElementById('image-el').style.transform = 'scale(0.5)'
                document.getElementById('image-el').style.transformOrigin = 'center'
              }
              else if(document.getElementById('svg-el')){

                document.getElementById('svg-el').style.transform = 'scale(0.5)'
                document.getElementById('svg-el').style.transformOrigin = 'center'
              }
            }
          }),
          await MenuItem.new({
            id: 'zoomout25',
            text: 'Zoom Out 25%',
            action: async () => {

              if(document.getElementById('image-el')){

                document.getElementById('image-el').style.transform = 'scale(0.25)'
                document.getElementById('image-el').style.transformOrigin = 'center'
              }
              else if(document.getElementById('svg-el')){

                document.getElementById('svg-el').style.transform = 'scale(0.25)'
                document.getElementById('svg-el').style.transformOrigin = 'center'
              }
            }
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'resetview',
            text: 'Reset',
            action: async () => {

              if(document.getElementById('image-el')){

                document.getElementById('image-el').style.transform = 'scale(1)'
                
                scale = 1
              }
              else if(document.getElementById('svg-el')){

                document.getElementById('svg-el').style.transform = 'scale(1)'
                
                scale = 1
              }
            },
          }),
        ]
      })

      const actionMenu = await Submenu.new({
        text: 'Action',
        items: [
          await MenuItem.new({
              id: 'combineon',
              text: 'Combine: On',
              action: () => {

                xcombine = true
              },
          }),
          await MenuItem.new({
              id: 'combineoff',
              text: 'Combine: Off',
              action: () => {

                xcombine = false
              },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
              id: 'exec',
              text: 'Execute',
              action: async () => {


                let xconf = await confirm(`Execute this?\n\nFormat: ${xnwext}\nSize: ${xpixels}\nExtra: ${xoper.join(' ')}\n\n`, 
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
      })

      const resizeMenu = await Submenu.new({
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
      })

      const rotateMenu = await Submenu.new({
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
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'm90',
            text: '-90°',
            action: async () => {

              
            },
          }),
          await MenuItem.new({
            id: 'm180',
            text: '-180°',
            action: async () => {

              //document.body.style.backgroundColor = '#F1F1F1'
            },
          }),
          await PredefinedMenuItem.new({
            text: 'separator-text',
            item: 'Separator',
          }),
          await MenuItem.new({
            id: 'autorotate',
            text: 'Auto orient',
            action: async () => {

              
            },
          }),
        ]
      })

      const exportMenu = await Submenu.new({
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
            id: 'tojpg',
            text: 'to JPG',
            action: async () => {

              
            },
          }),
          
         
        ]
      })

      const effectsMenu = await Submenu.new({
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

              //document.body.style.backgroundColor = '#F1F1F1'
            },
          }),
          await MenuItem.new({
            id: 'wtr10',
            text: 'White transparent 10% fuzz',
            action: async () => {

              //document.body.style.backgroundColor = '#F1F1F1'
            },
          }),
         
        ]
      })

      const helpMenu = await Submenu.new({
        text: 'Help',
        items: [
          await MenuItem.new({
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
          }),
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

      const menu = await Menu.new({
        items: [
          fileMenu,
          viewMenu,
          {
            id: 'recent',
            text: 'Recent',
            action: () => {
              
               showHistory()
            },
          },
          actionMenu,
          exportMenu,
          resizeMenu,
          rotateMenu,
          effectsMenu,
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
