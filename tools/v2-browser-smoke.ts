import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openChromePage} from './chrome-cdp.ts';
import {startNextTestServer,BROWSER_RUNTIME_FIXTURE} from './next-test-server.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
const STAR_GAME_ID=GAMES[1].gameId;

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function main(){
  const profile=await mkdtemp(join(tmpdir(),'slopboy-v2-browser-'));
  const server=await startNextTestServer();
  const port=server.port;
  let browser:Awaited<ReturnType<typeof openChromePage>>|undefined;
  try{
    browser=await openChromePage('http://127.0.0.1:'+port+'/play/tiny-catcher',join(profile,'chrome'));
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
    if(!booted)throw Error('Canonical player runtime did not become ready');
    const firstPath=String(await evalJs('location.pathname'));
    if(firstPath!=='/play/'+GAMES[0].gameId)throw Error('Legacy slug bookmark did not redirect to canonical game UUID: '+firstPath);
    const dimensions=String(await evalJs("document.querySelector('.v2-display canvas').width+'x'+document.querySelector('.v2-display canvas').height"));
    if(dimensions!=='160x144')throw Error('Incorrect hardware resolution '+dimensions);
    const headerFooter=await evalJs("document.querySelectorAll('.sb-v2-header').length===1 && document.querySelectorAll('.sb-v2-footer').length===1");
    if(headerFooter!==true)throw Error('Shared V2 header and footer missing or duplicated');
    const sharedBrand=String(await evalJs("document.querySelector('.sb-v2-brand').getAttribute('href')"));
    if(sharedBrand!=='/')throw Error('Shared brand must point to the devices home');
    const quickTrigger=await evalJs("!!document.querySelector('.v2-change-game') && !!document.querySelector('.v2-full-library-link')");
    if(quickTrigger!==true)throw Error('Player must provide in-place cartridge selection and full library');
    if(Number(await evalJs("document.querySelectorAll('.v2-cartridge-strip, .v2-header').length"))!==0)
      throw Error('Duplicated legacy V2 game header still visible');
    const darkTheme=JSON.parse(String(await evalJs(`(()=>{const el=document.querySelector('.sb-v2-shell');
      const css=getComputedStyle(el);return JSON.stringify({
        mode:el.dataset.theme,accent:css.getPropertyValue('--accent').trim(),
        surface:css.getPropertyValue('--surface').trim(),
        field:css.getPropertyValue('--field-background').trim(),
        radius:css.getPropertyValue('--radius').trim(),
      });})()`)));
    if(darkTheme.mode!=='dark'||darkTheme.accent!=='#d1e99d'||
      darkTheme.surface!=='#172a2d'||darkTheme.field!=='#203537'||
      darkTheme.radius!=='0.875rem')
      throw Error('Dark HeroUI semantic tokens differ from the Slopboy identity: '+JSON.stringify(darkTheme));
    await evalJs("document.querySelector('.sb-v2-theme-toggle').click();true");
    await sleep(350);
    const sharedLight=await evalJs("document.querySelector('.sb-v2-shell').dataset.v2Theme==='light'&&document.querySelector('.v2-player').dataset.v2Theme==='light'");
    if(sharedLight!==true)throw Error('Shared theme did not propagate into player without duplicate controls');
    const lightTheme=JSON.parse(String(await evalJs(`(()=>{const el=document.querySelector('.sb-v2-shell');
      const css=getComputedStyle(el);return JSON.stringify({
        mode:el.dataset.theme,accent:css.getPropertyValue('--accent').trim(),
        surface:css.getPropertyValue('--surface').trim(),
        field:css.getPropertyValue('--field-background').trim(),
        radius:css.getPropertyValue('--radius').trim(),
      });})()`)));
    if(lightTheme.mode!=='light'||lightTheme.accent!=='#496f45'||
      lightTheme.surface!=='#fffdf7'||lightTheme.field!=='#f6f8f1'||
      lightTheme.radius!==darkTheme.radius)
      throw Error('Light HeroUI semantic tokens differ from Slopboy identity: '+JSON.stringify(lightTheme));

    const brandedButton=String(await evalJs("getComputedStyle(document.querySelector('.sb-v2-theme-toggle')).backgroundColor"));
    const brandRgb=brandedButton.match(/[0-9]+/g)?.map(Number);
    if(!brandRgb||brandRgb.length!==3||Number(brandRgb[0])<100||Number(brandRgb[1])<Number(brandRgb[0])+5
      ||Number(brandRgb[1])<Number(brandRgb[2])+5)
      throw Error('HeroUI toggle uses blue/gray defaults rather than a light Slopboy sage tone: '+brandedButton);
    const brandedText=String(await evalJs("getComputedStyle(document.querySelector('.sb-v2-theme-toggle')).color"));
    if(brandedText!=='rgb(48, 71, 68)')throw Error('HeroUI theme toggle text must use Slopboy ink: '+brandedText);
    const duplicateTheme=await evalJs("!!document.querySelector('.v2-appearance-mode, .v2-theme-button')");
    if(duplicateTheme===true)throw Error('Redundant theme switches were not removed');

    const animation=await evalJs("!!document.querySelector('.v2-cartridge-entrant')&&!!document.querySelector('.v2-boot-screen')");
    if(animation!==true)throw Error('Cartridge insertion or real boot overlay is missing');
    // Verify gamepad analog input reaches the real pixel-v1 game, not merely the UI.
    // Chromium CI has no physical controller, so inject only the navigator Gamepad API.
    const locatePlayer=async()=>{
      const result=await evalJs(`(()=>{const canvas=document.querySelector('.v2-display canvas');
        if(!canvas)return -1;
        const pixels=canvas.getContext('2d').getImageData(0,131,160,1).data;
        for(let x=0;x<160;x++){const i=x*4;if(pixels[i]===32&&pixels[i+1]===59&&pixels[i+2]===51)return x;}
        return -1;})()`);
      return Number(result);
    };
    let beforePad=-1;
    for(let i=0;i<16;i++){beforePad=await locatePlayer();if(beforePad>=0)break;await sleep(60);}
    if(beforePad<0)throw Error('Cannot locate live Tiny Catcher sprite before analog input');
    await evalJs("Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{buttons:Array.from({length:16},()=>({pressed:false})),axes:[1,0]}]});true");
    await sleep(750);
    const afterPad=await locatePlayer();
    await evalJs("delete navigator.getGamepads;true");
    if(afterPad<beforePad+18)throw Error('Gamepad analog input did not move the actual sprite: '+beforePad+' -> '+afterPad);
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
    await evalJs(`document.querySelector('.v2-quick-cartridge[href="/play/${STAR_GAME_ID}"]').click();true`);
    const swappedDeadline=Date.now()+15000;
    let swapped=false;
    while(Date.now()<swappedDeadline){
      try{
        swapped=await evalJs(`location.pathname==='/play/${STAR_GAME_ID}' && !!document.querySelector('.v2-led.on') && document.querySelector('.v2-session-id strong')?.textContent==='Star Patrol' && window.__frame!==document.querySelector('.v2-isolated-frame')`)===true;
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
    const drawerTheme=JSON.parse(String(await evalJs(`(()=>{const el=document.querySelector('.v2-mobile-drawer');
      const css=getComputedStyle(el);return JSON.stringify({
        mode:el.dataset.theme,lightClass:el.classList.contains('light'),
        accent:css.getPropertyValue('--accent').trim(),
        surface:css.getPropertyValue('--overlay').trim(),
      });})()`)));
    if(drawerTheme.mode!=='light'||!drawerTheme.lightClass||
      drawerTheme.accent!=='#496f45'||drawerTheme.surface!=='#fffdf7')
      throw Error('HeroUI portal lost the persisted Slopboy theme: '+JSON.stringify(drawerTheme));

    const liveDuringSettings=await evalJs("!!document.querySelector('.v2-led.on')&&!!document.querySelector('.v2-isolated-frame')");
    if(liveDuringSettings!==true)throw Error('Opening mobile drawer interrupted live cartridge');
    // Back to game library: real curated cartridges, not a header game strip.
    await evalJs("window.location.assign('/library');true");
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
    let lightPersisted=false;
    const themeReloadDeadline=Date.now()+5000;
    while(Date.now()<themeReloadDeadline){
      lightPersisted=await evalJs("document.querySelector('.sb-v2-shell').dataset.v2Theme==='light'&&document.querySelector('.v2-library').dataset.v2Theme==='light'")===true;
      if(lightPersisted)break;
      await sleep(120);
    }
    if(!lightPersisted)throw Error('One shared theme did not persist after rehydration on library navigation');
    const cardBackground=String(await evalJs("getComputedStyle(document.querySelector('.v2-library-game')).backgroundColor"));
    if(cardBackground!=='rgb(255, 253, 247)')
      throw Error('Library card did not inherit the HeroUI light surface: '+cardBackground);

    const libraryHeroControl=String(await evalJs("getComputedStyle(document.querySelector('.v2-library-actions button.sb-control')).color"));
    if(libraryHeroControl!=='rgb(48, 71, 68)')throw Error('HeroUI library button is not Slopboy light theme: '+libraryHeroControl);

    const libraryStats=await evalJs("JSON.parse(localStorage.getItem('slopboy:v2:history:v2:"+GAMES[0].gameId+"')||'{}').launches>=1");
    if(libraryStats!==true)throw Error('Real game launch was not recorded locally');
    const cloudStatus=String(await evalJs("document.querySelector('.v2-cloud-state')?.textContent||''"));
    if(!cloudStatus.includes('Not connected'))throw Error('Cloud saves must not claim unsupported sync');
    // A real IndexedDB / localStorage upgrade with historical names, not a mock driver.
    const circuit=GAMES[2];
    const legacySave='save-v1:slopboy-1000@0.1.0:'+circuit.legacySlug;
    const uuidSave='save-v2:slopboy-1000@0.1.0:'+circuit.gameId;
    const oldBackup='slopboy:local-backup:v1:slopboy-1000:'+circuit.legacySlug+':2';
    const uuidBackup='slopboy:local-backup:v2:slopboy-1000:'+circuit.gameId+':2';
    const gameProgress=JSON.stringify({version:1,tiles:[1,2,3,4,5,6,7,0,8],seed:4242});
    const backupValue=JSON.stringify({createdAt:2468,save:gameProgress});
    const oldHistory='slopboy:v2:history:v1:'+circuit.legacySlug;
    const newHistory='slopboy:v2:history:v2:'+circuit.gameId;
    await evalJs(`localStorage.setItem(${JSON.stringify(oldHistory)},${JSON.stringify(JSON.stringify({gameId:circuit.legacySlug,launches:7,activeMs:1234,lastPlayedAt:2468}))});true`);
    await evalJs(`(function(){
      window.__seedStatus='pending';
      const req=indexedDB.open('slopboy-local-saves',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('cartridges'))req.result.createObjectStore('cartridges');};
      req.onerror=()=>window.__seedStatus='error';
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('cartridges','readwrite'),store=tx.objectStore('cartridges');
        store.put(${JSON.stringify(gameProgress)},${JSON.stringify(legacySave)});
        store.put(${JSON.stringify(backupValue)},${JSON.stringify(oldBackup)});
        tx.oncomplete=()=>{db.close();window.__seedStatus='done';};
        tx.onerror=()=>window.__seedStatus='error';
      };
    })();true`);
    let seeded=false;
    for(let i=0;i<80;i++){
      if(await evalJs("window.__seedStatus")==='done'){seeded=true;break;}
      await sleep(60);
    }
    if(!seeded)throw Error('Could not seed legacy IndexedDB autosave and backup for real Chrome test');
    await evalJs('window.location.reload();true');
    let migratedHistory=false;
    for(let i=0;i<120;i++){
      try{
        migratedHistory=await evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(newHistory)})||'{}').launches===7
          && document.querySelectorAll('.v2-library-game').length===3`)===true;
        if(migratedHistory)break;
      }catch{}
      await sleep(80);
    }
    if(!migratedHistory)throw Error('Guest play history did not recover from legacy slug after reload');
    await evalJs("document.querySelectorAll('.v2-library-actions button[aria-controls^=v2-save-]')[2].click();true");
    let foundBackup=false;
    for(let i=0;i<80;i++){
      foundBackup=await evalJs("document.querySelectorAll('.v2-local-slot').length===1")===true;
      if(foundBackup)break;
      await sleep(60);
    }
    if(!foundBackup)throw Error('Legacy local backup not visible in UUID library after migration');
    await evalJs(`window.location.assign('/play/${circuit.gameId}');true`);
    let circuitBoot=false;
    for(let i=0;i<180;i++){
      try{
        circuitBoot=await evalJs(`location.pathname==='/play/${circuit.gameId}'&&!!document.querySelector('.v2-led.on')`)===true;
        if(circuitBoot)break;
      }catch{}
      await sleep(80);
    }
    if(!circuitBoot)throw Error('Circuit Slide did not boot via UUID route');
    await evalJs(`(function(){
      window.__migrationStatus='pending';
      const req=indexedDB.open('slopboy-local-saves',1);
      req.onerror=()=>window.__migrationStatus='error';
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('cartridges','readonly'),store=tx.objectStore('cartridges');
        const keys=${JSON.stringify([legacySave,uuidSave,oldBackup,uuidBackup])};
        const values={};
        for(const key of keys)store.get(key).onsuccess=e=>values[key]=e.target.result;
        tx.oncomplete=()=>{db.close();window.__migrationData=JSON.stringify(values);window.__migrationStatus='done';};
        tx.onerror=()=>window.__migrationStatus='error';
      };
    })();true`);
    let snapshot:null|string=null;
    for(let i=0;i<80;i++){
      if(await evalJs("window.__migrationStatus")==='done'){
        snapshot=String(await evalJs("window.__migrationData"));break;
      }
      await sleep(60);
    }
    if(!snapshot)throw Error('Could not read migrated IndexedDB keys');
    const values=JSON.parse(snapshot) as Record<string,string>;
    const migratedSave=JSON.parse(values[uuidSave]||'null') as {format?:string;gameId?:string;data?:string}|null;
    if(values[legacySave]!==gameProgress||values[oldBackup]!==backupValue||values[uuidBackup]!==backupValue
      ||migratedSave?.format!=='slopboy-save-v2'||migratedSave.gameId!==circuit.gameId||migratedSave.data!==gameProgress)
      throw Error('Guest autosave or backup was not copied exactly and non-destructively to UUID identity');
    // Routing cutover: canonical app must not load the legacy layout.
    const navigate=async(path:string,expected:string,expression:string)=>{
      try{await evalJs('window.location.assign('+JSON.stringify(path)+');true');}catch{}
      const until=Date.now()+12000;
      while(Date.now()<until){
        try{
          const ok=await evalJs('location.pathname==='+JSON.stringify(expected)+'&&('+expression+')');
          if(ok===true)return;
        }catch{/* Navigation tears down the previous execution context. */}
        await sleep(120);
      }
      throw Error('Navigation failed: '+path+' -> '+expected+' with '+expression);
    };
    await navigate('/','/',"!!document.querySelector('.sb-v2-header')&&!!document.querySelector('.v2-hub')&&!document.querySelector('.hero')");
    const homeLinks=await evalJs("JSON.stringify([...document.querySelectorAll('.v2-hub-card a')].map(a=>a.getAttribute('href')))");
    const actualLinks=JSON.parse(String(homeLinks)) as string[];
    if(actualLinks.length!==3||actualLinks.some((url,i)=>url!=='/play/'+GAMES[i].gameId))
      throw Error('Canonical home must link to UUID games, not /v2 slugs');
    await navigate('/v2','/',"!!document.querySelector('.sb-v2-header')");
    await navigate('/v2/library?source=bookmark#shelf','/library',
      "location.search==='?source=bookmark'&&location.hash==='#shelf'&&!!document.querySelector('.v2-cart-grid')");
    await navigate('/v2/play/star-patrol','/play/'+STAR_GAME_ID,
      "!!document.querySelector('.v2-led.on')");
    await navigate('/legacy','/legacy',"!!document.querySelector('.hero')&&!document.querySelector('.sb-v2-header')");
    const legacyHubLinks=await evalJs("JSON.stringify([...document.querySelectorAll('.links a')].map(a=>a.getAttribute('href')))");
    if(!String(legacyHubLinks).includes('/legacy/library'))throw Error('Legacy home links to canonical rather than legacy library');
    await navigate('/legacy/library','/legacy/library',
      "document.querySelectorAll('.game-card-grid .game-card').length===3&&!document.querySelector('.sb-v2-header')");
    const legacyLinks=await evalJs("JSON.stringify([...document.querySelectorAll('.game-card-play')].map(a=>a.getAttribute('href')))");
    const legacyExpected=GAMES.map(g=>'/legacy/play/'+g.legacySlug);
    if(JSON.stringify(JSON.parse(String(legacyLinks)))!==JSON.stringify(legacyExpected))
      throw Error('Legacy game shelf links must keep old slug-based V1 pages');
    await navigate('/legacy/play/circuit-slide','/legacy/play/circuit-slide',
      "!!document.querySelector('.player-root')&&!!document.querySelector('.isolated-game-frame')");
    await navigate('/create','/legacy/create',
      "!!document.querySelector('.creator-main')&&!document.querySelector('.sb-v2-header')");
    await navigate('/play','/play/'+GAMES[0].gameId,
      "!!document.querySelector('.v2-led.on')");
    // Verify the official library also works independently after returning from legacy.
    await navigate('/library','/library',
      "!!document.querySelector('.sb-v2-header')&&document.querySelectorAll('.v2-library-game').length===3");
    console.log('Canonical route smoke passed: UUID root/library/play, old /v2 aliases, legacy V1 pages/creator, mobile/settings and save migration');
  }finally{
    browser?.close();
    await server.stop();
    await sleep(450);
    await rm(profile,{force:true,recursive:true,maxRetries:20,retryDelay:150}).catch(err=>console.warn('Chrome temp cleanup:',err));
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
