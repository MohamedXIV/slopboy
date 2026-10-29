import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPrecachePath,renderServiceWorker} from '../tools/build-offline.ts';
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
