import test from 'node:test';
import assert from 'node:assert/strict';
import {SANDBOX_DOCUMENT} from '../packages/runtime/src/sandbox-document.ts';
import {PROCEDURAL_DEMO} from '../apps/web/lib/ai/procedural-demo.ts';

test('the trusted demo generates pixels and asks the host to synthesize tones', () => {
  assert.match(PROCEDURAL_DEMO,/screen\.rect/);
  assert.match(PROCEDURAL_DEMO,/audio\?\.tone/);
  assert.doesNotMatch(PROCEDURAL_DEMO,/data:|https?:|fetch\(/);
  assert.match(SANDBOX_DOCUMENT,/audio:m\.audio===true/);
  assert.match(SANDBOX_DOCUMENT,/connect-src 'none'/);
});
