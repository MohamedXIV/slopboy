import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {scaffoldCreator,previewCreator} from './creator-kit.ts';
import {openChromePage} from './chrome-cdp.ts';

const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function run():Promise<void>{
  const root=await mkdtemp(join(tmpdir(),'slopboy-preview-browser-'));
  let chrome:Awaited<ReturnType<typeof openChromePage>>|undefined;
  try{
    await scaffoldCreator('preview-smoke',root);
    const report=await previewCreator('preview-smoke',root);
    const page=join(root,report.preview);
    const html=await readFile(page,'utf8');
    if(!html.includes('sandbox="allow-scripts"'))throw Error('Preview missing opaque sandbox');
    chrome=await openChromePage(pathToFileURL(page).href,join(root,'chrome-profile'));
    const evaluate=chrome.evaluate;
    const deadline=Date.now()+12000;
    let status:unknown;
    while(Date.now()<deadline){
      status=await evaluate("document.body.dataset.status || 'missing'");
      const frames=await evaluate("Number(document.body.dataset.frames || 0)");
      if(status==='running'&&typeof frames==='number'&&frames>2)break;
      if(status==='error')throw Error('Preview failed before first frame: '+await evaluate("document.getElementById('status')?.textContent"));
      await sleep(100);
    }
    if(status!=='running')throw Error('Preview did not reach a playable state: '+String(status));
    const before=await evaluate("document.getElementById('screen').toDataURL()");
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true}));'down'");
    await sleep(700);
    await evaluate("window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft',bubbles:true}));'up'");
    await sleep(130);
    const after=await evaluate("document.getElementById('screen').toDataURL()");
    if(before===after)throw Error('Keyboard input did not move the game sprite');
    await evaluate("document.getElementById('mode').click();'mode'");
    const mode=await evaluate("document.body.classList.contains('game-only')");
    if(mode!==true)throw Error('Game-only mode switch failed');
    await evaluate("document.getElementById('restart').click();'restart'");
    let restarted=false;
    const end=Date.now()+8000;
    while(Date.now()<end){
      const next=await evaluate("document.body.dataset.status");
      const frames=await evaluate("Number(document.body.dataset.frames || 0)");
      if(next==='running'&&typeof frames==='number'&&frames>1){restarted=true;break;}
      await sleep(100);
    }
    if(!restarted)throw Error('Restart did not recover isolated game');
    const sandbox=await evaluate("document.getElementById('game-sandbox').getAttribute('sandbox')");
    if(sandbox!=='allow-scripts')throw Error('Preview escalated iframe privileges');
    console.log('Creator Preview Chrome smoke: loaded, rendered, keyboard moved sprite, game mode, restart, opaque sandbox PASS');
  }finally{chrome?.close();await rm(root,{recursive:true,force:true});}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
