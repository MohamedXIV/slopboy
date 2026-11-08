import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderServiceWorker,OFFLINE_SHELL_PATHS} from '../tools/build-offline.ts';
import {GAMES} from '../packages/catalog/src/index.ts';

const readSource=()=>readFile(new URL('../tools/offline-worker-source.js',import.meta.url),'utf8');
test('runtime offline worker is generated from reviewed source and seeded immutable UUIDs',async()=>{
  const source=await readSource();
  const script=renderServiceWorker(source,'deadbeef12345678');
  assert.match(script,/const RELEASE='deadbeef12345678'/);
  assert.match(script,/const SHELL='slopboy-shell-v3-'\+RELEASE/);
  assert.match(script,/slopboy-games-v3/);
  assert.match(script,/slopboy-installed-index-v3/);
  assert.ok(!script.includes('__RELEASE__')&&!script.includes('__CURATED__'));
  for(const game of GAMES){
    assert.ok(script.includes(game.gameId));
    assert.ok(script.includes(game.cartridge));
    assert.ok(script.includes(game.revisionId));
  }
  assert.deepEqual(OFFLINE_SHELL_PATHS,['/','/library','/manifest.webmanifest',
    '/icons/slopboy-192.png','/icons/slopboy-512.png']);
  assert.throws(()=>renderServiceWorker('wrong','deadbeef12345678'),/Incomplete/);
  assert.throws(()=>renderServiceWorker(source,'invalid'),/Invalid/);
});
test('public shell and explicit installs only; private API and RSC requests bypass persistent cache',async()=>{
  const code=await readSource();
  assert.match(code,/event\.request/);
  assert.match(code,/request\.headers\.has\('RSC'\)/);
  assert.match(code,/request\.headers\.has\('Next-Router-Prefetch'\)/);
  assert.match(code,/request\.headers\.has\('Next-Router-State-Tree'\)/);
  assert.match(code,/request\.mode==='navigate'/);
  assert.match(code,/request\.method!=='GET'/);
  assert.match(code,/url\.origin!==self\.location\.origin/);
  assert.match(code,/data\.type==='SL_OP_INSTALL'/);
  assert.match(code,/data\.type==='SL_OP_REMOVE'/);
  assert.match(code,/fetch\(noCredentials\('\/api\/public-games\/'/);
  assert.match(code,/MAX_CARTRIDGE_BYTES/);
  assert.match(code,/slopboy-static-/); // old implicit installs preserved on activation
  assert.match(code,/REMOVED\+game.gameId/); // deleted games do not resurrect after a new SW activates
  assert.match(code,/REMOVED\+id/);
  assert.match(code,/X-Slopboy-Offline-Public/);
  assert.ok(!code.includes("caches.delete('slopboy-local-saves')"));
  assert.ok(!code.includes("indexedDB.deleteDatabase"));
});
