import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {openChromePage} from './chrome-cdp.ts';

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const root=resolve('apps/web/out');
const mime:Record<string,string>={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.slop':'application/octet-stream',
  '.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json',
  '.woff2':'font/woff2','.svg':'image/svg+xml'
};
async function main(){
  const profile=await mkdtemp(join(tmpdir(),'slopboy-v2-browser-'));
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname);
      const candidate=pathname.endsWith('/')?pathname+'index.html':pathname;
      const safe=resolve(root,'.'+candidate);
      if(!safe.startsWith(root+sep)){res.writeHead(403).end();return;}
      const finalPath=extname(safe)?safe:safe+'.html';
      const payload=await readFile(finalPath);
      res.writeHead(200,{'content-type':mime[extname(finalPath)]||'application/octet-stream','cache-control':'no-store'});
      res.end(payload);
    }catch{res.writeHead(404).end('Not Found');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  let browser:Awaited<ReturnType<typeof openChromePage>>|undefined;
  try{
    browser=await openChromePage('http://127.0.0.1:'+port+'/v2/play/tiny-catcher',join(profile,'chrome'));
    const evalJs=browser.evaluate;
    const deadline=Date.now()+15000;
    let booted=false;
    while(Date.now()<deadline){
      const info=await evalJs("JSON.stringify({ready:!!document.querySelector('.v2-led.on'),canvas:!!document.querySelector('.v2-display canvas'),error:document.querySelector('.v2-status')?.textContent||''})");
      const state=JSON.parse(String(info));
      if(state.ready&&state.canvas){booted=true;break;}
      if(state.error.includes('Game stopped'))throw Error('V2 playback error: '+state.error);
      await sleep(150);
    }
    if(!booted)throw Error('V2 runtime did not become ready');
    const dimensions=String(await evalJs("document.querySelector('.v2-display canvas').width+'x'+document.querySelector('.v2-display canvas').height"));
    if(dimensions!=='160x144')throw Error('Incorrect hardware resolution '+dimensions);
    const headerFooter=await evalJs("document.querySelectorAll('.sb-v2-header').length===1 && document.querySelectorAll('.sb-v2-footer').length===1");
    if(headerFooter!==true)throw Error('Shared V2 header and footer missing or duplicated');
    const sharedBrand=String(await evalJs("document.querySelector('.sb-v2-brand').getAttribute('href')"));
    if(sharedBrand!=='/v2')throw Error('Shared brand must point to the devices home');
    const quickTrigger=await evalJs("!!document.querySelector('.v2-change-game') && !!document.querySelector('.v2-full-library-link')");
    if(quickTrigger!==true)throw Error('Player must provide in-place cartridge selection and full library');
    if(Number(await evalJs("document.querySelectorAll('.v2-cartridge-strip, .v2-header').length"))!==0)
      throw Error('Duplicated legacy V2 game header still visible');
    await evalJs("document.querySelector('.sb-v2-theme-toggle').click();true");
    await sleep(120);
    const sharedLight=await evalJs("document.querySelector('.sb-v2-shell').dataset.v2Theme==='light'&&document.querySelector('.v2-player').dataset.v2Theme==='light'");
    if(sharedLight!==true)throw Error('Shared theme did not propagate into player without duplicate controls');
    const brandedButton=String(await evalJs("getComputedStyle(document.querySelector('.sb-v2-theme-toggle')).backgroundColor"));
    const brandRgb=brandedButton.match(/[0-9]+/g)?.map(Number);
    if(!brandRgb||brandRgb.length!==3||Number(brandRgb[0])<170||Number(brandRgb[1])<Number(brandRgb[0])+5
      ||Number(brandRgb[1])<Number(brandRgb[2])+5)
      throw Error('HeroUI toggle uses blue/gray defaults rather than a light Slopboy sage tone: '+brandedButton);
    const brandedText=String(await evalJs("getComputedStyle(document.querySelector('.sb-v2-theme-toggle')).color"));
    if(brandedText!=='rgb(48, 71, 68)')throw Error('HeroUI theme toggle text must use Slopboy ink: '+brandedText);
    const duplicateTheme=await evalJs("!!document.querySelector('.v2-appearance-mode, .v2-theme-button')");
    if(duplicateTheme===true)throw Error('Redundant theme switches were not removed');

    const animation=await evalJs("!!document.querySelector('.v2-cartridge-entrant')&&!!document.querySelector('.v2-boot-screen')");
    if(animation!==true)throw Error('Cartridge insertion or real boot overlay is missing');
    const initial=String(await evalJs("document.querySelector('.v2-display canvas').toDataURL()"));
    await evalJs("window.__frame=document.querySelector('.v2-isolated-frame');window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));true");
    await sleep(900);
    await evalJs("window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));true");
    const moved=String(await evalJs("document.querySelector('.v2-display canvas').toDataURL()"));
    if(initial===moved)throw Error('Real game framebuffer did not change on player input');
    const canvasTintBefore=String(await evalJs("JSON.stringify(Array.from(document.querySelector('.v2-display canvas').getContext('2d').getImageData(1,1,1,1).data).slice(0,3))"));
    await evalJs("document.querySelectorAll('.v2-palettes button')[1].click();true");
    await sleep(180);
    const canvasTintAfter=String(await evalJs("JSON.stringify(Array.from(document.querySelector('.v2-display canvas').getContext('2d').getImageData(1,1,1,1).data).slice(0,3))"));
    if(canvasTintBefore===canvasTintAfter)throw Error('LCD selection did not recolor the actual framebuffer');
    const pal=await evalJs("document.querySelectorAll('.v2-palettes button')[1].getAttribute('aria-pressed')");
    if(pal!=='true')throw Error('LCD palette did not change');
    const finishBefore=String(await evalJs("getComputedStyle(document.querySelector('.v2-device-stage')).getPropertyValue('--v2-shell')"));
    await evalJs("document.querySelectorAll('.v2-swatches button')[2].click();true");
    const finishAfter=String(await evalJs("getComputedStyle(document.querySelector('.v2-device-stage')).getPropertyValue('--v2-shell')"));
    if(finishBefore===finishAfter)throw Error('Shell swatch did not change hardware finish');
    const skin=await evalJs("document.querySelectorAll('.v2-swatches button')[2].getAttribute('aria-pressed')");
    if(skin!=='true')throw Error('Shell finish did not change');
    const fxNode=String(await evalJs("document.querySelector('.v2-display').classList.contains('fx-active')"));
    if(fxNode!=='true')throw Error('Classic LCD did not enable the real WebGL screen FX layer');
    const fxOutputBefore=String(await evalJs("document.querySelector('.v2-fx-output').toDataURL()"));
    await evalJs("document.querySelector('.v2-fx-presets button:nth-child(3)').click();true");
    await sleep(200);
    const fxOutputPhosphor=String(await evalJs("document.querySelector('.v2-fx-output').toDataURL()"));
    if(fxOutputBefore===fxOutputPhosphor)throw Error('Phosphor preset did not change the actual GPU output');
    await evalJs("document.querySelector('.v2-fx-details summary').click();true");
    await evalJs("const slider=document.querySelector('#v2-fx-glow');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'92');slider.dispatchEvent(new Event('input',{bubbles:true}));true");
    await sleep(150);
    const fxSetting=await evalJs("document.querySelector('#v2-fx-glow').value");
    if(String(fxSetting)!=='92')throw Error('Fine-tuning screen effect slider failed');
    const resetVisible=Boolean(await evalJs("!!document.querySelector('.v2-fx-reset')"));
    if(!resetVisible)throw Error('Custom preset reset control missing');
    const persisted=String(await evalJs("localStorage.getItem('slopboy:v2:screen-fx:v1')"));
    if(!persisted.includes('"glow":92'))throw Error('Screen settings were not persisted');
    await evalJs("document.querySelector('#v2-screen-refresh').value='20';document.querySelector('#v2-screen-refresh').dispatchEvent(new Event('change',{bubbles:true}));true");
    await sleep(100);
    if(String(await evalJs("JSON.parse(localStorage.getItem('slopboy:v2:screen-fx:v1')).refresh"))!=='20')
      throw Error('Display-only refresh cap preference not saved');
    await evalJs("document.querySelector('[aria-label=\"Screen effects\"]').click();true");
    const off=await evalJs("document.querySelector('[aria-label=\"Screen effects\"]').getAttribute('aria-checked')==='false'&&!document.querySelector('.v2-display').classList.contains('fx-active')");
    if(off!==true)throw Error('Complete screen FX bypass not working');
    const glassOff=await evalJs("getComputedStyle(document.querySelector('.v2-display-glass')).opacity");
    if(Number(glassOff)!==0)throw Error('Screen FX off must also bypass optical glass overlay');
    const rawStillAvailable=await evalJs("document.querySelector('.v2-raw-frame').getContext('2d').getImageData(0,0,1,1).data[3]===255");
    if(rawStillAvailable!==true)throw Error('Effect bypass broke the underlying frame');
    await evalJs("document.querySelector('.v2-fx-presets button:first-child').click();true");
    const clean=await evalJs("document.querySelector('.v2-display').classList.contains('fx-active')");
    if(clean!==false)throw Error('Clean pixels must bypass GPU layer');
    await evalJs("document.querySelector('.v2-controlbar button').click();true");
    const same=await evalJs("document.querySelector('.v2-device-stage').classList.contains('v2-game-mode')&&window.__frame===document.querySelector('.v2-isolated-frame')");
    if(same!==true)throw Error('Game mode restarted the live sandbox');
    await evalJs("document.querySelector('.v2-controlbar button:last-child').click();true");
    let restarted=false;
    const end=Date.now()+9000;
    while(Date.now()<end){
      const isOn=await evalJs("!!document.querySelector('.v2-led.on')&&window.__frame!==document.querySelector('.v2-isolated-frame')");
      if(isOn===true){restarted=true;break;}
      await sleep(150);
    }
    if(!restarted)throw Error('Restart failed to recover a fresh sandbox');
    // The quick shelf must not navigate to a separate library page just to choose a new game.
    const oldGameFrame=await evalJs("window.__frame=document.querySelector('.v2-isolated-frame');true");
    if(oldGameFrame!==true)throw Error('Current game iframe missing before cartridge swap');
    await evalJs("document.querySelector('.v2-change-game').click();true");
    const quickDeadline=Date.now()+6000;
    let quickVisible=false;
    while(Date.now()<quickDeadline){
      quickVisible=await evalJs("!!document.querySelector('.v2-quick-library-drawer')")===true;
      if(quickVisible)break;
      await sleep(130);
    }
    if(!quickVisible)throw Error('Quick cartridge Drawer never opened');
    const simultaneous=await evalJs("!!document.querySelector('.v2-led.on')&&window.__frame===document.querySelector('.v2-isolated-frame')");
    if(simultaneous!==true)throw Error('Opening quick cartridge Drawer restarted or paused the active runtime');
    const quickCount=Number(await evalJs("document.querySelectorAll('.v2-quick-cartridge-list .v2-quick-cartridge').length"));
    if(quickCount!==3)throw Error('Quick cartridge shelf must show every curated title');
    await evalJs("document.querySelector('.v2-quick-cartridge[href=\"/v2/play/star-patrol\"]').click();true");
    const swappedDeadline=Date.now()+15000;
    let swapped=false;
    while(Date.now()<swappedDeadline){
      try{
        swapped=await evalJs("location.pathname==='/v2/play/star-patrol' && !!document.querySelector('.v2-led.on') && document.querySelector('.v2-session-id strong')?.textContent==='Star Patrol' && window.__frame!==document.querySelector('.v2-isolated-frame')")===true;
        if(swapped)break;
      }catch{/* Client navigation may briefly replace the execution context. */}
      await sleep(180);
    }
    if(!swapped)throw Error('New cartridge failed to boot in the same Play workspace after quick selection');
    const persistentHeader=await evalJs("document.querySelectorAll('.sb-v2-header').length===1 && document.querySelector('.sb-v2-shell').dataset.v2Theme==='light'");
    if(persistentHeader!==true)throw Error('Changing a cartridge lost the shared V2 header or theme');

    // Exercise the actual HeroUI mobile drawer on a device-width viewport.
    await browser.setViewport(390,844);
    await sleep(450);
    const mobileReady=await evalJs("window.matchMedia('(max-width:760px)').matches && getComputedStyle(document.querySelector('.v2-mobile-settings')).display!=='none'");
    if(mobileReady!==true)throw Error('Mobile settings trigger not visible');
    await evalJs("document.querySelector('.v2-mobile-settings').click();true");
    let drawerOpen=false;
    const drawerDeadline=Date.now()+5000;
    while(Date.now()<drawerDeadline){
      drawerOpen=await evalJs("!!document.querySelector('.v2-mobile-drawer')")===true;
      if(drawerOpen)break;
      await sleep(150);
    }
    if(!drawerOpen)throw Error('HeroUI mobile device settings drawer failed to open');
    const liveDuringSettings=await evalJs("!!document.querySelector('.v2-led.on')&&!!document.querySelector('.v2-isolated-frame')");
    if(liveDuringSettings!==true)throw Error('Opening mobile drawer interrupted live cartridge');
    // Back to game library: real curated cartridges, not a header game strip.
    await evalJs("window.location.assign('/v2/library');true");
    let libraryReady=false;
    const libraryDeadline=Date.now()+12000;
    while(Date.now()<libraryDeadline){
      try{
        libraryReady=await evalJs("!!document.querySelector('.v2-cart-grid')&&!!document.querySelector('.v2-library-game')")===true;
        if(libraryReady)break;
      }catch{/* Navigation can replace execution context. */}
      await sleep(180);
    }
    if(!libraryReady)throw Error('Library route failed to render');
    const libraryCount=Number(await evalJs("document.querySelectorAll('.v2-cart-grid .v2-library-game').length"));
    if(libraryCount!==3)throw Error('Curated library cartridges missing: '+libraryCount);
    const librarySharedChrome=await evalJs("document.querySelectorAll('.sb-v2-header').length===1&&document.querySelectorAll('.sb-v2-footer').length===1&&!document.querySelector('.v2-library-header,.v2-library-footer')");
    if(librarySharedChrome!==true)throw Error('Library incorrectly rendered a duplicated local header or footer');
    const lightPersisted=await evalJs("document.querySelector('.sb-v2-shell').dataset.v2Theme==='light'&&document.querySelector('.v2-library').dataset.v2Theme==='light'");
    if(lightPersisted!==true)throw Error('One shared theme did not persist across library navigation');
    const libraryHeroControl=String(await evalJs("getComputedStyle(document.querySelector('.v2-library-actions button.sb-control')).color"));
    if(libraryHeroControl!=='rgb(48, 71, 68)')throw Error('HeroUI library button is not Slopboy light theme: '+libraryHeroControl);

    const libraryStats=await evalJs("JSON.parse(localStorage.getItem('slopboy:v2:history:v1:tiny-catcher')||'{}').launches>=1");
    if(libraryStats!==true)throw Error('Real game launch was not recorded locally');
    const cloudStatus=String(await evalJs("document.querySelector('.v2-cloud-state')?.textContent||''"));
    if(!cloudStatus.includes('Not connected'))throw Error('Cloud saves must not claim unsupported sync');
    console.log('V2 Chrome smoke passed: shared V2 chrome / unified theme / branded HeroUI / in-player cartridge swap / GPU optics / mobile drawer / full library');
  }finally{
    browser?.close();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await sleep(450);
    await rm(profile,{force:true,recursive:true,maxRetries:20,retryDelay:150}).catch(err=>console.warn('Chrome temp cleanup:',err));
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
