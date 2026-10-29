import test from 'node:test';
import assert from 'node:assert/strict';
import {SANDBOX_DOCUMENT} from '../packages/runtime/src/sandbox-document.ts';
test('sandbox boots game through private MessageChannel, not public worker postMessage',()=>{
 assert.match(SANDBOX_DOCUMENT,/new MessageChannel\(\)/);
 assert.match(SANDBOX_DOCUMENT,/worker.postMessage\(\{type:'setup',port:channel.port2\},\[channel.port2\]\)/);
 assert.match(SANDBOX_DOCUMENT,/trustedPort\.postMessage/);
 assert.doesNotMatch(SANDBOX_DOCUMENT,/self\.postMessage\(/);
 assert.doesNotMatch(SANDBOX_DOCUMENT,/worker\.onmessage\s*=/);
});
test('runtime phase gates unexpected readiness and frames',()=>{
 assert.match(SANDBOX_DOCUMENT,/phase!=='starting'/);
 assert.match(SANDBOX_DOCUMENT,/phase!=='running'/);
 assert.match(SANDBOX_DOCUMENT,/phase='stopped'/);
 assert.match(SANDBOX_DOCUMENT,/event.source!==parent/);
});
