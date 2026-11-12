/* First-party public offline support. Compiled by tools/build-offline.ts before Next build.
 * No account pages, API JSON, RSC responses or private drafts are cached. */
'use strict';
const RELEASE='__RELEASE__';
const CURATED=__CURATED__;
const SHELL='slopboy-shell-v3-'+RELEASE;
const INSTALLED='slopboy-games-v3';
const INDEX='slopboy-installed-index-v3';
const GAME_ASSETS='slopboy-installed-assets-v3';
const ASSETS='slopboy-hashed-assets-v3-'+RELEASE;
const SHELL_URLS=['/','/library','/manifest.webmanifest','/icons/slopboy-192.png','/icons/slopboy-512.png'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARTRIDGE=/^\/cartridges\/[a-z0-9]+(?:-[a-z0-9]+)*\.slop$/;
const STATIC=/^\/_next\/static\/[a-zA-Z0-9_/.%-]+\.(?:js|css|woff2?)$/;
const MAX_CARTRIDGE_BYTES=1024*1024; // network/cache safety guard; NOT simulated ROM capacity
const PUBLIC_META='/__offline_game_index__/';
const REMOVED='/__offline_game_removed__/'; // version-stable uninstall tombstones
const noCredentials=path=>new Request(path,{credentials:'omit',redirect:'error',cache:'no-store'});
function validMetadata(data,id){
  return data&&typeof data==='object'&&data.format==='slopboy-public-game-v1'&&
    data.gameId===id&&UUID.test(id)&&UUID.test(data.revisionId)&&
    typeof data.title==='string'&&data.title.length>0&&data.title.length<=90&&
    typeof data.manifestId==='string'&&
    data.cartridge==='/cartridges/'+data.manifestId+'.slop'&&CARTRIDGE.test(data.cartridge);
}
function pathsFromHtml(html){
  return [...new Set((html.match(/\/_next\/static\/[a-zA-Z0-9_/.%-]+\.(?:js|css|woff2?)/g)||[])
    .filter(path=>STATIC.test(path)))];
}
async function cacheDependencies(html,cache){
  const paths=pathsFromHtml(html);
  for(const path of paths){
    if(await cache.match(path))continue;
    try{
      const response=await fetch(noCredentials(path));
      if(response.ok&&response.type!=='opaque')await cache.put(path,response);
    }catch{/* Optional preloads: required shell routes are cached separately. */}
  }
}
async function publicPage(path){
  const response=await fetch(noCredentials(path));
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||
    response.headers.get('X-Slopboy-Offline-Public')!=='1'||response.type==='opaque')throw Error('Public page unavailable');
  return response;
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL);
    for(const path of SHELL_URLS){
      const response=await fetch(noCredentials(path));
      if(!response.ok||response.type==='opaque')throw Error('Offline app shell missing: '+path);
      if((path==='/'||path==='/library')&&response.headers.get('X-Slopboy-Offline-Public')!=='1')
        throw Error('Refusing to cache a non-public app shell');
      await cache.put(path,response.clone());
      if(path==='/'||path==='/library')await cacheDependencies(await response.text(),cache);
    }
    await self.skipWaiting();
  })());
});
async function migratePreviousStaticInstall(){
  const old=(await caches.keys()).filter(key=>key.startsWith('slopboy-static-'));
  if(!old.length)return;
  const pages=await caches.open(INSTALLED);
  const index=await caches.open(INDEX);
  const assets=await caches.open(GAME_ASSETS);
  for(const key of old){
    const previous=await caches.open(key);
    for(const game of CURATED){
      if(await index.match(PUBLIC_META+game.gameId)||await index.match(REMOVED+game.gameId))continue;
      const cartridge=await previous.match(game.cartridge);
      const page=(await previous.match('/play/'+game.gameId+'.html'))||
        (await previous.match('/v2/play/'+game.gameId+'.html'));
      if(!cartridge||!page)continue;
      await pages.put(game.cartridge,cartridge.clone());
      await pages.put('/play/'+game.gameId,page.clone());
      await cacheDependencies(await page.text(),assets);
      await index.put(PUBLIC_META+game.gameId,new Response(JSON.stringify(game)));
    }
    // Previous static worker implicitly precached all games. Keep old hashed assets
    // available for those HTML snapshots, including after the new shell activates.
    for(const req of await previous.keys()){
      const path=new URL(req.url).pathname;
      if(STATIC.test(path)&&!(await assets.match(path))){
        const response=await previous.match(req);
        if(response)await assets.put(path,response);
      }
    }
  }
  // Deliberately keep old slopboy-static caches for rollback; do not delete user data.
}
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{await migratePreviousStaticInstall();}catch(error){console.warn('Old offline cache migration skipped',error);}
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('slopboy-shell-v3-')&&key!==SHELL||
      key.startsWith('slopboy-hashed-assets-v3-')&&key!==ASSETS).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
async function gameMetadata(id){
  const cached=await (await caches.open(INDEX)).match(PUBLIC_META+id);
  if(!cached)return null;
  try{
    const item=await cached.json();
    return validMetadata(item,id)?item:null;
  }catch{return null;}
}
async function listInstalled(){
  const cache=await caches.open(INDEX);
  const keys=await cache.keys();
  const games=[];
  for(const key of keys){
    const path=new URL(key.url).pathname;
    if(!path.startsWith(PUBLIC_META))continue;
    const id=path.slice(PUBLIC_META.length);
    if(UUID.test(id)){
      const game=await gameMetadata(id);
      if(game)games.push({gameId:id,revisionId:game.revisionId,title:game.title});
    }
  }
  return games;
}
async function installGame(id){
  if(!UUID.test(id))throw Error('Invalid game ID');
  const response=await fetch(noCredentials('/api/public-games/'+id));
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))
    throw Error('Game not approved for offline distribution');
  const meta=await response.json();
  if(!validMetadata(meta,id))throw Error('Unapproved cartridge metadata');
  const cartridge=await fetch(noCredentials(meta.cartridge));
  if(!cartridge.ok||cartridge.type==='opaque')throw Error('Cartridge unavailable');
  const payload=await cartridge.clone().arrayBuffer();
  const bytes=new Uint8Array(payload);
  if(bytes.byteLength<2||bytes.byteLength>MAX_CARTRIDGE_BYTES||
    bytes[0]!==0x1f||bytes[1]!==0x8b)throw Error('Cartridge download is invalid');
  const page=await publicPage('/play/'+id);
  const html=await page.clone().text();
  const games=await caches.open(INSTALLED);
  const assets=await caches.open(GAME_ASSETS);
  await cacheDependencies(html,assets);
  // Do not mutate a previous installation unless every download succeeded.
  await games.put(meta.cartridge,cartridge.clone());
  await games.put('/play/'+id,page.clone());
  const registry=await caches.open(INDEX);
  await registry.put(PUBLIC_META+id,
    new Response(JSON.stringify(meta),{headers:{'Content-Type':'application/json'}}));
  await registry.delete(REMOVED+id);
  return {gameId:id,revisionId:meta.revisionId,title:meta.title};
}
async function deleteGame(id){
  if(!UUID.test(id))throw Error('Invalid game ID');
  const meta=await gameMetadata(id);
  if(!meta)return {gameId:id,removed:false};
  const index=await caches.open(INDEX);
  // Keep the old static-release cache for rollback, but never resurrect an
  // explicitly deleted installation on the next worker activation.
  await index.put(REMOVED+id,new Response('removed'));
  await index.delete(PUBLIC_META+id);
  const games=await caches.open(INSTALLED);
  await games.delete('/play/'+id);
  // Multiple reviewed UUIDs may legitimately share the same immutable fixture.
  let referenced=false;
  for(const key of await index.keys()){
    if(!new URL(key.url).pathname.startsWith(PUBLIC_META))continue;
    const response=await index.match(key);
    if(!response)continue;
    try{if((await response.json()).cartridge===meta.cartridge){referenced=true;break;}}catch{}
  }
  if(!referenced)await games.delete(meta.cartridge);
  if(!(await listInstalled()).length)await caches.delete(GAME_ASSETS);
  return {gameId:id,removed:true};
}
self.addEventListener('message',event=>{
  const data=event.data,port=event.ports?.[0];
  if(!port||!data||typeof data!=='object')return;
  const client=event.source;
  if(!client?.url||new URL(client.url).origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    try{
      let result;
      if(data.type==='SL_OP_INSTALLED')result={games:await listInstalled()};
      else if(data.type==='SL_OP_INSTALL')result={game:await installGame(data.gameId)};
      else if(data.type==='SL_OP_REMOVE')result=await deleteGame(data.gameId);
      else throw Error('Unsupported offline operation');
      port.postMessage({ok:true,...result});
    }catch(error){port.postMessage({ok:false,error:String(error instanceof Error?error.message:error).slice(0,140)});}
  })());
});
function safePage(path){return path==='/'||path==='/library';}
function installedRoute(path){return path.startsWith('/play/')&&UUID.test(path.slice(6));}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.search||request.headers.has('RSC')||
    request.headers.has('Next-Router-Prefetch')||request.headers.has('Next-Router-State-Tree'))return;
  const path=url.pathname;
  if(request.mode==='navigate'&&(safePage(path)||installedRoute(path))){
    event.respondWith((async()=>{
      try{return await fetch(request);}catch{
        if(safePage(path))return (await caches.open(SHELL)).match(path)||
          new Response('Offline shell unavailable',{status:503});
        if(await gameMetadata(path.slice(6)))return (await caches.open(INSTALLED)).match(path)||
          new Response('Offline game page missing',{status:503});
        return new Response('This game is not installed for offline play',{status:503});
      }
    })());
    return;
  }
  if(STATIC.test(path)){
    event.respondWith((async()=>{
      const installed=await caches.open(GAME_ASSETS);
      const shell=await caches.open(SHELL);
      const assets=await caches.open(ASSETS);
      const cached=(await assets.match(path))||(await installed.match(path))||(await shell.match(path));
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok&&response.type!=='opaque')await assets.put(path,response.clone());
      return response;
    })());
    return;
  }
  if(CARTRIDGE.test(path)){
    event.respondWith((async()=>{
      const saved=await (await caches.open(INSTALLED)).match(path);
      if(saved)return saved;
      return fetch(request);
    })());
  }
});
