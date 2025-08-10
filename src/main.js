const { invoke } = window.__TAURI__.core;
const { exists, BaseDirectory, readTextFile } = window.__TAURI__.fs;
const { getCurrentWindow } = window.__TAURI__.window;

const { open, message } = window.__TAURI__.dialog;
const { Command } = window.__TAURI__.shell;
const { openPath } = window.__TAURI__.opener;
const { platform } = window.__TAURI__.os;
const { getCurrent } = window.__TAURI__.deepLink   // onOpenUrl
const { getMatches } = window.__TAURI__.cli;


let openedFile

const targetEl = 'markdown'

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

        loadMD(el.dataset.filename)

        
      }
      catch(err){

        errorMessage(err)
      }
      
    })

  })
}


async function loadMD(fname) {

  let mdcontent = await readTextFile(fname)
      
  let html = marked.parse(mdcontent);

  document.getElementById(targetEl).innerHTML = html

  if(history.indexOf(fname) == -1){

    history.push(fname)
  }

  openedFile = fname

  document.getElementById('opened-file').innerText = fname

  //storeFileName(fname)
}

async function openMD() {

  try{

    const filename = await open({
      multiple: false,
      directory: false,
    });

    loadMD(filename)

    //document.getElementById('moreinfo').textContent = filename

  }
  catch(err){

    errorMessage(err)
    //document.getElementById('debug').textContent = `${err}`
  }
}

/* async function testDialog(){

  let stored = getStoreData()

  if(typeof(stored) == "string"){

    await message(`Stored filename (str): ${getStoreData()}`, { title: 'Tauri', kind: 'info' });
  }
  else if(typeof(stored) == "object"){

    await message(`Stored filename (obj): ${JSON.stringify(stored)}`, { title: 'Tauri', kind: 'info' });
  }
  else{

    await message(`Error: Could not get stored data`, { title: 'Tauri', kind: 'error' });
  }
  
} */

window.addEventListener("DOMContentLoaded", () => {

  //greetInputEl = document.querySelector("#greet-input");
  //greetMsgEl = document.querySelector("#greet-msg");
  /* (async()=>{
    store = await load('store.json', { autoSave: false });
  })() */
  /* document.getElementById('testdialog').addEventListener("click", (e) => {
    //testDialog()
    openMD()
  }) */

  
  (async()=>{

    // OpenWith DEV
    let devmode = "cli"

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

      const matches = await getMatches();

      if (matches.args && matches.args.file && matches.args.file.value) {
        
        const filePath = matches.args.file.value;

        document.getElementById(targetEl).innerText = `open: ${filePath}`

        await loadMD(filePath)

        
      }

      /* if( matches.args[1].value ){

        document.getElementById(targetEl).innerText = `open file: ${matches.args[1].value}`
      } */

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
    


  })()

  document.getElementById('open-btn').addEventListener("click", (e) => {

    openMD()
  })

  document.getElementById('reload-btn').addEventListener("click", (e) => {

    loadMD(openedFile)
  })

  document.getElementById('edit-btn').addEventListener("click", async (e) => {

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
    
  })

  document.getElementById('nav-about').addEventListener("click", async (e) => {

    await message(`Created by Amir Hachaichi\nUses marked\ngithub.com/amirlogic/tauri-apps-vanilla-js`, { title: 'About', kind: 'info' });

  })

  document.getElementById('nav-history').addEventListener("click", (e) => {

    showHistory()

  })


  document.getElementById('nav-clear').addEventListener("click", (e) => {

    document.getElementById(targetEl).innerHTML = ""

    openedFile = ""

  })

  /* document.getElementById('mdfile').addEventListener("change", (e) => {
    document.getElementById('filedata').textContent = document.getElementById('mdfile').value 
  }); */
  /* document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    //greet();
    //viewMD()
    testDialog()
  }); */
});
