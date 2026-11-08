import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPrecachePath,renderServiceWorker} from '../tools/build-offline.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
test('offline builder only accepts static assets, no credentials or dynamic endpoints',()=>{
  for(const asset of ['/index.html','/library.html','/_next/static/chunk.js','/cartridges/tiny-catcher.slop','/icons/slopboy-192.png','/manifest.webmanifest']) assert.equal(allowedPrecachePath(asset),true,asset);
  for(const path of ['/api/me','/sw.js','/../config.json','https://evil.com/app.js','/x.js?auth=secret','/foo/bar'])assert.equal(allowedPrecachePath(path),false,path);
});
test('generated offline worker precaches exact files and isolates cache names',()=>{
  const script=renderServiceWorker(['/library.html','/index.html','/cartridges/tiny-catcher.slop'],'deadbeef12345678');
  assert.match(script,/CACHE='slopboy-static-deadbeef12345678'/);
  assert.match(script,/cache.addAll/);
  assert.match(script,/credentials:'omit'/);
  assert.match(script,/request.mode==='navigate'/);
  assert.match(script,/url.origin!==self.location.origin/);
  assert.ok(script.includes("k.startsWith('slopboy-static-')"));
  assert.ok(!script.includes('/api/me'));
});

test('UUID play pages and legacy bookmarks remain eligible for the static offline worker',()=>{
  const game=GAMES[0];
  const paths=[
    '/index.html','/library.html',
    '/play/'+game.gameId+'.html','/play/'+game.legacySlug+'.html',
    '/legacy.html','/legacy/library.html','/legacy/play/'+game.legacySlug+'.html',
    '/v2/play/'+game.gameId+'.html','/v2/play/'+game.legacySlug+'.html'
  ];
  for(const path of paths)assert.ok(allowedPrecachePath(path),path);
  const worker=renderServiceWorker(paths,'0123456789abcdef');
  for(const path of paths)assert.ok(worker.includes(path),path);
});
