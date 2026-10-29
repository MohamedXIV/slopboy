import test from 'node:test';
import assert from 'node:assert/strict';
import {SANDBOX_DOCUMENT} from '../packages/runtime/src/sandbox-document.ts';
import {validateFrame} from '../packages/runtime/src/protocol.ts';
test('frame bridge validates dimensions, shade limits and types',()=>{
 assert.equal(validateFrame(new Uint8Array([0,1,2,3]),2,2,4),true);
 assert.equal(validateFrame(new Uint8Array([0,1,2,4]),2,2,4),false);
 assert.equal(validateFrame(new Uint8Array(3),2,2,4),false);
 assert.equal(validateFrame([0,1,2,3],2,2,4),false);
});
test('opaque sandbox declares explicit no-network policy',()=>{
 assert.match(SANDBOX_DOCUMENT,/connect-src 'none'/);
 assert.match(SANDBOX_DOCUMENT,/default-src 'none'/);
 assert.match(SANDBOX_DOCUMENT,/worker-src blob:/);
 assert.match(SANDBOX_DOCUMENT,/frame-src 'none'/);
 assert.doesNotMatch(SANDBOX_DOCUMENT,/allow-same-origin/);
});
test('worker imposes per-frame execution limit and restricted host message types',()=>{
 assert.match(SANDBOX_DOCUMENT,/MAX_FRAME_MS = 1500/);
 assert.match(SANDBOX_DOCUMENT,/\.terminate\(\)/);
 assert.match(SANDBOX_DOCUMENT,/data\?\.type!=='frame'/);
});
