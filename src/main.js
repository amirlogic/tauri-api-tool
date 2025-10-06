const { invoke } = window.__TAURI__.core;
const { exists, BaseDirectory, readTextFile, readFile } = window.__TAURI__.fs;
const { getVersion } = window.__TAURI__.app
const { join, dirname, extname } = window.__TAURI__.path;
const { Menu, MenuItem, Submenu } = window.__TAURI__.menu;

const { open, message } = window.__TAURI__.dialog;
const { Command } = window.__TAURI__.shell;
const { openPath } = window.__TAURI__.opener;
const { platform } = window.__TAURI__.os;
const { getCurrent } = window.__TAURI__.deepLink   // onOpenUrl
const { getMatches } = window.__TAURI__.cli;


let openedFile

const targetEl = 'image'

let history = []

let store

let greetInputEl;
let greetMsgEl;

async function errorMessage(err){

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

  try{

    document.getElementById(targetEl).innerHTML = ''

    if(imgext === 'svg'){

      const rawsvg = await readTextFile(fname)

      

      const svg = rawsvg.substr(rawsvg.indexOf('<svg')) //rawsvg.indexOf('<svg')

      //let df = new DocumentFragment()

      //df.innerHTML = svg

      //document.getElementById(targetEl).appendChild(df)

      document.getElementById(targetEl).innerHTML = svg

    }
    else{

      const imgbytes = await readFile(fname)
          
      const base64String = btoa(
              Array.from(imgbytes)
                .map(byte => String.fromCharCode(byte))
                .join('')
            )

      const imgext = await extname(fname)

      const html = `<img alt="local image" src="data:image/${imgext};base64,${base64String}" class="d-block mx-auto" />`;

      document.getElementById(targetEl).innerHTML = html

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

  try{

    const filedir = await dirname(fname)

    /* const mdlinks = document.querySelectorAll("a[href]")

    mdlinks.forEach((lnk) => {

      lnk.addEventListener("click", async (e)=>{

        e.preventDefault()

        try{

        

          if(lnk?.href.indexOf('http') === 0 ){

            if(lnk.href.indexOf('.md') !== -1 ){

              const url = new URL(lnk.href)

              const targetmd = await join(filedir, decodeURI(url.pathname))

              //await message(targetmd, { title: 'link', kind: 'info' });

              await loadImage(targetmd)
            }
            else{

              await message("Righ-click on the link to copy", { title: 'link', kind: 'info' });
            }

          }
        }
        catch(evrr){

          errorMessage(evrr)
        }

      }, false)
    }) */

    /* const imgs = document.querySelectorAll("img")

    imgs.forEach(async (img) => {

      try{

        const url = new URL(img.src)

        if(url.host == "127.0.0.1:1430" || url.host == "tauri.localhost"){

          const localimg = await join(filedir, decodeURI(url.pathname))

          const fileExists = await exists(localimg)

          if(fileExists){

            const imgbytes = await readFile(localimg)

            const base64String = btoa(
              Array.from(imgbytes)
                .map(byte => String.fromCharCode(byte))
                .join('')
            )

            const imgext = await extname(localimg)

            img.src = `data:image/${imgext};base64,${base64String}`;

            
          }
          else{

            img.alt = "Image NOT found!"
          }
          
        }
        else{

          img.alt = url
        }

      }
      catch(imgrr){

        errorMessage(imgrr)
      }
      


    }) */

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
            id: 'print',
            text: 'Print',
            action: () => {

              window.print()
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
            id: 'bgcolor',
            text: 'Background Color',
            action: async () => {

              document.body.style.backgroundColor = '#F1F1F1'
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

              await message(`Image Tool v${appVersion}\nCreated by Amir Hachaichi\nUses marked\ngithub.com/amirlogic/tauri-image-tool`, 
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

  /* document.getElementById('open-btn').addEventListener("click", (e) => {

    openImage()
  }) */

  /* document.getElementById('reload-btn').addEventListener("click", (e) => {

    loadImage(openedFile)
  }) */

  /* document.getElementById('edit-btn').addEventListener("click", async (e) => {

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
    
  }) */

  /* document.getElementById('nav-about').addEventListener("click", async (e) => {

    await message(`Created by Amir Hachaichi\nUses marked\ngithub.com/amirlogic/tauri-apps-vanilla-js`, { title: 'About', kind: 'info' });

  }) */

  /* document.getElementById('nav-history').addEventListener("click", (e) => {

    showHistory()

  }) */


  /* document.getElementById('nav-clear').addEventListener("click", (e) => {

    document.getElementById(targetEl).innerHTML = ""

    openedFile = ""

  }) */

  
});
