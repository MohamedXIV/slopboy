/** Runtime routes and public-only manifest: tests the actual next start server. */
import assert from 'node:assert/strict';
import {startNextTestServer,BROWSER_RUNTIME_FIXTURE} from './next-test-server.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
async function main(){
  const index=JSON.parse(await readFile(resolve(import.meta.dirname,'../packages/catalog/curated-revision-lock.json'),'utf8')) as {
    revisions:{gameId:string;revisionId:string;sha256:string;byteSize:number}[]
  };
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
      // The reviewed legacy URL remains byte-identical to its immutable SHA path.
      const locked=index.revisions.find(r=>r.gameId===game.gameId&&r.revisionId===game.revisionId);
      assert.ok(locked,'Missing locked immutable revision');
      const [alias,immutable]=await Promise.all([
        get(game.cartridge),get('/cartridges/by-sha256/'+locked.sha256+'.slop')
      ]);
      assert.equal(alias.status,200,'Legacy cartridge remains accessible');
      assert.equal(immutable.status,200,'Immutable cartridge must resolve in real Next HTTP');
      const aliasBytes=Buffer.from(await alias.arrayBuffer());
      const immutableBytes=Buffer.from(await immutable.arrayBuffer());
      assert.deepEqual(immutableBytes,aliasBytes,'Static SHA artifact must preserve reviewed bytes');
      assert.equal(immutableBytes.byteLength,locked.byteSize);
      assert.equal(createHash('sha256').update(immutableBytes).digest('hex'),locked.sha256);
    }
    const sw=await get('/sw.js');
    assert.equal(sw.status,200);
    assert.match(await sw.text(),/slopboy-installed-index-v3/);
    assert.match(String(sw.headers.get('cache-control')),/no-store/);
    const manifest=await get('/manifest.webmanifest');
    assert.equal(manifest.status,200,'Next App Router-generated PWA manifest route');
    assert.match(String(manifest.headers.get('content-type')),/json/);
    assert.equal((await get('/icons/slopboy-192.png')).status,200);
    assert.equal((await get('/icons/slopboy-512.png')).status,200);
    assert.equal((await get('/library')).status,200);
    assert.equal((await get('/legacy')).status,200);
    console.log('Runtime Next server smoke PASS: fresh UUID, reviewed API, immutable SHA paths, legacy aliases, canonical fixtures, public PWA assets');
  }finally{await server.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
