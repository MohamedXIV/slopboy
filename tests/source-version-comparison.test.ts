import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSourceLines} from '../apps/web/lib/ai/source-version-comparison.ts';

test('source comparison reports additions and removals with their original line numbers', () => {
  assert.deepEqual(compareSourceLines('same\nold\nkeep','same\nnew\nkeep\nlast'), [
    {kind:'removed',line:2,text:'old'},
    {kind:'added',line:2,text:'new'},
    {kind:'added',line:4,text:'last'},
  ]);
});

test('normalizes platform line endings but preserves blank and whitespace changes', () => {
  assert.deepEqual(compareSourceLines('a\r\nb','a\nb'),[]);
  assert.deepEqual(compareSourceLines('a\n','a'),[{kind:'removed',line:2,text:''}]);
  assert.deepEqual(compareSourceLines('','  '),[{kind:'added',line:1,text:'  '}]);
});

test('bounds comparison work for large unrelated revisions', () => {
  assert.equal(compareSourceLines('a\n'.repeat(1100),'b\n'.repeat(1100)),null);
});
