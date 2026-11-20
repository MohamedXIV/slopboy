import assert from 'node:assert/strict';
import test from 'node:test';
import {newGameSourceRequest, existingGameSourceRequest, normalizePastedSource,
  reuseSubmission, sourceByteLength, getTabSubmissionSeed, rotateTabSubmissionSeed,
  scopedSubmissionId} from '../apps/web/lib/ai/source-import.ts';

test('raw AI-generated source is preserved byte for byte for editing and server validation', () => {
  const input = "import kaplay from 'kaplay';\nexport default function setup() {}\n";
  assert.deepEqual(normalizePastedSource(input), {source: input, language: null, warning: null});
});

test('a single labeled Markdown block becomes editable source and records language', () => {
  assert.deepEqual(normalizePastedSource('```ts\nexport default function setup() {}\n```'), {
    source: 'export default function setup() {}', language: 'typescript', warning: null,
  });
  assert.deepEqual(normalizePastedSource('```javascript\nexport default function setup() {}\n```'), {
    source: 'export default function setup() {}', language: 'javascript', warning: null,
  });
});

test('multiple fences and prose are not silently stripped or treated as a trusted game module', () => {
  const input = 'Here are two files:\n```ts\nexport default 1\n```\n```ts\nexport default 2\n```';
  const result = normalizePastedSource(input);
  assert.equal(result.source, input);
  assert.equal(result.language, null);
  assert.match(result.warning ?? '', /one.*code block|raw source/i);
});

test('two adjacent fenced modules are never mistaken for one fenced file', () => {
  const input = '```ts\nexport default 1\n```\n```js\nexport default 2\n```';
  const result = normalizePastedSource(input);
  assert.equal(result.source, input);
  assert.equal(result.language, null);
  assert.match(result.warning ?? '', /one.*code block|raw source/i);
});

test('HTML remains inert text for the authoritative server validator to reject', () => {
  const input = '<script>alert(1)</script>';
  assert.equal(normalizePastedSource(input).source, input);
});

test('new private game request does not accept ownership or publication from the browser', () => {
  const result = newGameSourceRequest('My weird idea', '', 'typescript', 'export default 1', 'save', 'key-1');
  assert.deepEqual(result, {
    intent: 'save',
    content: {engine: 'kaplay', version: '3001.0.19', language: 'typescript', source: 'export default 1'},
    metadata: {title: 'My weird idea', description: '', genre: 'Other'},
    submission: 'key-1',
  });
  assert.ok(!JSON.stringify(result).includes('ownerId'));
});

test('revisions omit create metadata and an unchanged retry reuses the submission key', () => {
  const revised = existingGameSourceRequest('javascript', 'export default 1', 'save', 'key-2');
  assert.ok(!('metadata' in revised));
  const first = reuseSubmission(null, 'payload-A', () => 'one-time-uuid');
  assert.deepEqual(reuseSubmission(first, 'payload-A', () => 'wrong'), first);
  assert.deepEqual(reuseSubmission(first, 'payload-B', () => 'new-uuid'), {payload: 'payload-B', id: 'new-uuid'});
});

test('source byte checks report excess without truncating native or clipboard pasted code', () => {
  assert.equal(sourceByteLength('x'.repeat(65_536)), 65_536);
  assert.equal(sourceByteLength('x'.repeat(65_537)), 65_537);
  assert.equal(sourceByteLength('é'.repeat(32_769)), 65_538);
});

test('an uncertain save can retry after reload with the same tab-scoped ID but a confirmed save rotates the seed', async () => {
  const values = new Map<string, string>();
  const storage = {getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {values.set(key, value);}};
  const seedBeforeReload = getTabSubmissionSeed(storage);
  const before = await scopedSubmissionId(seedBeforeReload, 'new-game', 'the full form JSON');
  const after = await scopedSubmissionId(getTabSubmissionSeed(storage), 'new-game', 'the full form JSON');
  assert.equal(after, before, 'same save after browser reload must reuse the UUID');
  assert.match(before, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(await scopedSubmissionId(seedBeforeReload, 'another-game', 'the full form JSON'), before);
  assert.notEqual(await scopedSubmissionId(seedBeforeReload, 'new-game', 'edited form JSON'), before);
  assert.equal(values.size, 1, 'store only a random seed, never source/payload/digest');
  assert.equal([...values.values()][0], seedBeforeReload);
  rotateTabSubmissionSeed(storage);
  assert.notEqual(await scopedSubmissionId(getTabSubmissionSeed(storage), 'new-game', 'the full form JSON'), before);
});
