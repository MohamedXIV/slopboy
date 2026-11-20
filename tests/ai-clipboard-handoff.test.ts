import assert from 'node:assert/strict';
import test from 'node:test';
import {newGameSourceRequest, existingGameSourceRequest, normalizePastedSource,
  reuseSubmission} from '../apps/web/lib/ai/source-import.ts';

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
