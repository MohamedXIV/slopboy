/** Real service worker, real IndexedDB, real Next server, no fake cache driver. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openChromePage} from './chrome-cdp.ts';
import {startNextTestServer,BROWSER_RUNTIME_FIXTURE} from './next-test-server.ts';
import {GAMES} from '../packages/catalog/src/index.ts';

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function main(){
  const server=await startNextTestServer();
  const profile=await mkdtemp(join(tmpdir(),'slopboy-offline-next-'));
  let browser:Awaited<ReturnType<typeof openChromePage>>|undefined;
  const game=GAMES[0];
  const btn='[data-testid="offline-game-'+game.gameId+'"]';
  const key='save-v2:slopboy-1000@0.1.0:'+game.gameId;
  const value=JSON.stringify({format:'slopboy-save-v2',gameId:game.gameId,
    state:'saved',data:'{"pwa":"offline-guest-record","level":7}'});
  try{
    browser=await openChromePage(server.url+'/library',join(profile,'chrome'));
    const evalJs=browser.evaluate;
    const wait=async(label:string,expression:string,timeout=15000)=>{
      const until=Date.now()+timeout;
      while(Date.now()<until){
        try{if(await evalJs(expression)===true)return;}catch{}
        await sleep(110);
      }
      throw Error('Timed out waiting for '+label);
    };
    await wait('worker controlling library',"(!!navigator.serviceWorker.controller)&&!!document.querySelector('"+btn+"')",30000);
    await wait('offline install button ready',"!document.querySelector('"+btn+"').disabled");
    const initial=String(await evalJs("document.querySelector('"+btn+"').textContent"));
    if(!initial.includes('Install offline'))throw Error('Guest install must be opt-in: '+initial);
    await evalJs("document.querySelector('"+btn+"').click();true");
    await wait('offline install completed',"document.querySelector('"+btn+"').textContent.includes('Remove offline')",25000);
    // The CDP runner doesn't await Promise-returning expressions.
    // Publish async CacheStorage diagnostics on window before offline navigation.
    await evalJs(`(async()=>{const c=await caches.open('slopboy-games-v3');
      window.__offlineCached=!!(await c.match('/play/${game.gameId}'))&&!!(await c.match('${game.cartridge}'));})();true`);
    await wait('installed page and bundle in CacheStorage',"window.__offlineCached===true");
    await evalJs(`(async()=>{const c=await caches.open('slopboy-games-v3');
      const assets=await caches.open('slopboy-installed-assets-v3');
      const html=await (await c.match('/play/${game.gameId}')).text();
      const requested=[...new Set(html.match(/\\/_next\\/static\\/[a-zA-Z0-9_/.%-]+\\.(?:js|css|woff2?)/g)||[])];
      const present=await Promise.all(requested.map(async p=>!!(await assets.match(p))));
      window.__assetReport=JSON.stringify({required:requested.length,cached:present.filter(Boolean).length,
        missing:requested.filter((_,i)=>!present[i]),cachedAssets:(await assets.keys()).length});
    })();true`);
    await wait('installed asset report',"!!window.__assetReport");
    console.log('Offline prefetch evidence',String(await evalJs('window.__assetReport')));
    await evalJs(`(function(){
      window.__saved='pending';const req=indexedDB.open('slopboy-local-saves',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('cartridges'))req.result.createObjectStore('cartridges');};
      req.onerror=()=>window.__saved='error';
      req.onsuccess=()=>{const db=req.result,tx=db.transaction('cartridges','readwrite');
        tx.objectStore('cartridges').put(${JSON.stringify(value)},${JSON.stringify(key)});
        tx.oncomplete=()=>{db.close();window.__saved='done';};
        tx.onerror=()=>window.__saved='error';
      };
    })();true`);
    await wait('guest save persisted',"window.__saved==='done'");
    await browser.setOffline(true);
    await evalJs(`window.location.assign('/play/${game.gameId}');true`);
    try{
      await wait('installed game boots offline',"location.pathname==='/play/${game.gameId}'&&!!document.querySelector('.v2-led.on')",26000);
    }catch(error){
      await evalJs(`(async()=>{window.__offlineProbe='pending';
        try{const r=await fetch('${game.cartridge}',{credentials:'omit',cache:'no-store'});
          const bytes=await r.arrayBuffer();
          const source=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          const reader=source.getReader();const result=await reader.read();
          window.__offlineProbe=JSON.stringify({status:r.status,bytes:bytes.byteLength,type:r.type,
            decoded:result.value?.byteLength,streamDone:result.done});
          reader.releaseLock();
        }catch(e){window.__offlineProbe=String(e);}
      })();true`);
      await sleep(1600);
      let info:unknown='unavailable';
      try{info=await evalJs(`JSON.stringify({path:location.pathname,online:navigator.onLine,
        controller:!!navigator.serviceWorker?.controller,status:document.querySelector('.v2-status')?.textContent,
        pill:document.querySelector('.v2-runtime-pill')?.textContent,
        iframe:document.querySelector('.v2-isolated-frame')?.getAttribute('srcdoc')?.length,
        probe:window.__offlineProbe,frame:!!document.querySelector('.v2-isolated-frame'),
        body:document.body?.innerText?.slice(0,1300),
        scriptCount:document.querySelectorAll('script[src]').length,app:!!document.querySelector('.v2-player')})`);}catch{}
      throw Error(String(error)+'; browser diagnostics='+String(info));
    }
    await evalJs(`window.__guestCheck='pending';
      (function(){const req=indexedDB.open('slopboy-local-saves',1);
        req.onsuccess=()=>{const db=req.result,tx=db.transaction('cartridges','readonly');
          tx.objectStore('cartridges').get(${JSON.stringify(key)}).onsuccess=e=>window.__guestValue=e.target.result;
          tx.oncomplete=()=>{db.close();window.__guestCheck='done';};
        };})();true`);
    await wait('guest save remains intact offline',"window.__guestCheck==='done'");
    if(String(await evalJs('window.__guestValue'))!==value)
      throw Error('Offline game overwrote its guest IndexedDB record');
    await evalJs("window.location.assign('/library');true");
    await wait('offline library boots',"location.pathname==='/library'&&!!document.querySelector('"+btn+"')",22000);
    await wait('offline button status',"!document.querySelector('"+btn+"').disabled");
    if(!String(await evalJs("document.querySelector('"+btn+"').textContent")).includes('Remove offline'))
      throw Error('Installed-game status lost during offline navigation');
    await evalJs("document.querySelector('"+btn+"').click();true");
    await wait('offline removal acknowledged',"document.querySelector('"+btn+"').textContent.includes('Install offline')",15000);
    await evalJs(`(async()=>{const index=await caches.open('slopboy-installed-index-v3');
      const pages=await caches.open('slopboy-games-v3');
      window.__removeOk=!(await index.match('/__offline_game_index__/${game.gameId}')) &&
        !(await pages.match('/play/${game.gameId}'));})();true`);
    await wait('installed HTML and index deleted',"window.__removeOk===true");
    await evalJs(`(function(){const request=indexedDB.open('slopboy-local-saves',1);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('cartridges','readonly');
        tx.objectStore('cartridges').get(${JSON.stringify(key)}).onsuccess=e=>window.__afterDeleteSave=e.target.result;
        tx.oncomplete=()=>db.close();};})();true`);
    await wait('save survives uninstall',"typeof window.__afterDeleteSave==='string'");
    if(String(await evalJs('window.__afterDeleteSave'))!==value)
      throw Error('Removing offline installation deleted a guest autosave');
    await evalJs(`window.location.assign('/play/${game.gameId}');true`);
    await wait('uninstalled game intentionally unavailable offline',
      "location.pathname==='/play/${game.gameId}'&&document.body?.textContent?.includes('not installed for offline play')",15000);
    await browser.setOffline(false);
    await evalJs(`window.location.assign('/play/${BROWSER_RUNTIME_FIXTURE.gameId}');true`);
    await wait('new UUID unknown during build boots runtime',
      "location.pathname==='/play/${BROWSER_RUNTIME_FIXTURE.gameId}'&&!!document.querySelector('.v2-led.on')",24000);
    const rendered=String(await evalJs("document.querySelector('.v2-session-id strong').textContent"));
    if(rendered!==BROWSER_RUNTIME_FIXTURE.title)throw Error('Runtime game did not have server metadata: '+rendered);
    console.log('Next PWA Chromium smoke PASS: opt-in installed cartridge offline boot, shell reload, guest IDB persistence, uninstall, fresh runtime UUID play');
  }finally{
    if(browser){try{await browser.setOffline(false);}catch{}browser.close();}
    await server.stop();
    await sleep(300);
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:140}).catch(()=>{});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
