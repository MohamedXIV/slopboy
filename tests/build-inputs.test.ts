import assert from 'node:assert/strict';
import test from 'node:test';
import {describeBuildInput,describeSingleFileBuildInput} from '../apps/web/server/build-inputs.ts';
import {PRIVATE_SOURCE_TEMPLATE as engine} from '../packages/cartridge/src/private-source-template.ts';

const manifest = {
  schemaVersion:1, deviceProfile:engine.deviceProfile, entrypoint:'src/game.ts',
  engine:{id:engine.id,version:engine.version,adapterProtocol:engine.adapterProtocol},
  files:[
    {path:'src/game.ts',mime:'text/typescript',bytes:34,sha256:'a'.repeat(64)},
    {path:'assets/a.png',mime:'image/png',bytes:40,sha256:'b'.repeat(64)},
  ],
};
test('build input digest is stable across file order and keys, and changes with content', () => {
  const input=describeBuildInput(manifest)!;
  assert.match(input.inputDigest,/^[a-f0-9]{64}$/);
  assert.equal(input.state,'blocked_by_adapter');
  assert.equal(input.inputDigest,describeBuildInput({...manifest,files:[...manifest.files].reverse()})?.inputDigest);
  const [first,second]=manifest.files;
  assert.notEqual(input.inputDigest,describeBuildInput({...manifest,files:[{...first,sha256:'c'.repeat(64)},second]})?.inputDigest);
});
test('build inputs reject incompatible engine versions, devices and malformed files', () => {
  assert.equal(describeBuildInput({...manifest,engine:{...manifest.engine,version:'latest'}}),null);
  assert.equal(describeBuildInput({...manifest,deviceProfile:'different'}),null);
  assert.equal(describeBuildInput({...manifest,files:[{...manifest.files[0],path:'src/../game.ts'}]}),null);
});

test('validated source and a one-file project have the same build input identity', () => {
  const source = {
    engine_manifest:{schemaVersion:manifest.schemaVersion,deviceProfile:manifest.deviceProfile,
      entrypoint:manifest.entrypoint,engine:manifest.engine,assets:[]},
    language:'typescript',source_bytes:manifest.files[0].bytes,source_digest:manifest.files[0].sha256,
  };
  const single = describeSingleFileBuildInput(source)!;
  assert.ok(single);
  assert.equal(single.inputDigest,describeBuildInput({...manifest,files:[manifest.files[0]]})?.inputDigest);
  assert.equal(describeSingleFileBuildInput({...source,engine_manifest:null}),null);
});
