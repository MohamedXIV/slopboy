import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectPrivateSource, PRIVATE_SOURCE_TEMPLATE} from '../packages/cartridge/src/private-source.ts';

const input = {engine: 'kaplay', version: PRIVATE_SOURCE_TEMPLATE.version, language: 'typescript'};
test('accepts a pinned single-file template and constructs the manifest on the server', () => {
  const result = inspectPrivateSource({...input, source: "import kaplay from 'kaplay'; export default function setup(init: typeof kaplay) {}"});
  assert.ok(result.ok);
  assert.equal(result.manifest.entrypoint, 'src/game.ts');
  assert.deepEqual(result.manifest.assets, []);
});

test('rejects invalid syntax, website input, unsupported dependencies and request fields', () => {
  for (const source of [
    'export default function {',
    '<html><script></script></html>',
    "export {default} from 'https://example.com/mod';",
    "import './helper'; export default {};",
    "export default import('kaplay');",
    "/// <reference path=\"../outside.ts\" />\nexport default {};",
    'export default ' + 'é'.repeat(40_000),
  ]) {
    const result = inspectPrivateSource({...input, source});
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.diagnostics.length);
  }
  const source = 'export default {}';
  for (const override of [{version:'latest'}, {engine:'phaser'}, {filename:'../../game.ts'}, {ownerId:'another-id'}])
    assert.equal(inspectPrivateSource({...input, source, ...override}).ok, false);
  assert.equal(inspectPrivateSource({...input, language:'javascript', source:'export default function setup() {}'}).ok, true);
  assert.equal(inspectPrivateSource({...input, language:'javascript', source:'export default function setup(x: string) {}'}).ok, false);
});
