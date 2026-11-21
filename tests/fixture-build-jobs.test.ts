import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {produceFixtureArtifact,runTrustedFixtureChild} from '../tools/fixture-build-worker.ts';

test('trusted fixture artifact is identical across separate worker processes', async () => {
  const [a,b] = await Promise.all([produceFixtureArtifact(),produceFixtureArtifact()]);
  assert.equal(a.status,'ready');
  assert.equal(b.status,'ready');
  if (a.status !== 'ready' || b.status !== 'ready') return;
  assert.deepEqual(a.bytes,b.bytes);
  assert.equal(a.sha256,createHash('sha256').update(a.bytes).digest('hex'));
});
test('trusted child crash and wall-clock timeout are bounded failures', async () => {
  assert.deepEqual(await runTrustedFixtureChild('crash',1000),{status:'failed',code:'CRASH'});
  assert.deepEqual(await runTrustedFixtureChild('timeout',50),{status:'failed',code:'TIMEOUT'});
  assert.deepEqual(await runTrustedFixtureChild('output_limit',1000),
    {status:'failed',code:'OUTPUT_LIMIT'});
});
