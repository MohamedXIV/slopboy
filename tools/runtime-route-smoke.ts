/** Runtime routes and public-only manifest: tests the actual next start server. */
import assert from 'node:assert/strict';
import {startNextTestServer,BROWSER_RUNTIME_FIXTURE} from './next-test-server.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
async function main(){
  const server=await startNextTestServer();
  try{
    const get=(path:string)=>fetch(server.url+path,{redirect:'manual'});
    const fresh='/play/'+BROWSER_RUNTIME_FIXTURE.gameId;
    const html=await get(fresh);
    assert.equal(html.status,200,'unknown-at-build runtime UUID must render');
    assert.match(await html.text(),/Late-arriving approved fixture/);
    const api=await get('/api/public-games/'+BROWSER_RUNTIME_FIXTURE.gameId);
    assert.equal(api.status,200);
    assert.match(String(api.headers.get('cache-control')),/no-store/);
    const data=await api.json();
    assert.equal(data.gameId,BROWSER_RUNTIME_FIXTURE.gameId);
    assert.equal(data.revisionId,BROWSER_RUNTIME_FIXTURE.revisionId);
    assert.equal(data.cartridge,'/cartridges/tiny-catcher.slop');
    for(const path of ['/play/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '/api/public-games/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '/api/public-games/tiny-catcher']){
      assert.equal((await get(path)).status,404,path);
    }
    for(const game of GAMES){
      const play=await get('/play/'+game.gameId);
      assert.equal(play.status,200,game.title);
      const manifest=await get('/api/public-games/'+game.gameId);
      assert.equal(manifest.status,200,game.title);
      assert.equal((await manifest.json()).cartridge,game.cartridge);
    }
    const sw=await get('/sw.js');
    assert.equal(sw.status,200);
    assert.match(await sw.text(),/slopboy-installed-index-v3/);
    assert.match(String(sw.headers.get('cache-control')),/no-store/);
    assert.equal((await get('/library')).status,200);
    assert.equal((await get('/legacy')).status,200);
    console.log('Runtime Next server smoke PASS: fresh runtime UUID, reviewed API, unknown 404, canonical fixtures, public PWA assets');
  }finally{await server.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
