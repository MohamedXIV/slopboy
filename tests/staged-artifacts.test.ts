import {createHash} from "node:crypto";
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUploadManifest, validateArtifactBytes, issueArtifactTicket, verifyArtifactTicket } from '../apps/web/server/staged-artifact-policy.ts';

const source = {path: 'src/game.ts', mime: 'text/typescript', bytes: 64, sha256: 'a'.repeat(64)};
test('staging accepts a canonical entrypoint and rejects traversal, URLs and duplicate paths', () => {
  assert.ok(parseUploadManifest({files: [source]}));
  for (const path of ['../src/game.ts', 'src/../game.ts', 'https://example.invalid/x.ts', 'assets/x.svg', 'src/%2e.ts']) {
    assert.equal(parseUploadManifest({files: [source, {...source, path}]}), null);
  }
  assert.equal(parseUploadManifest({files: [source, source]}), null);
  assert.equal(parseUploadManifest({files: [{...source, bytes: 65537}]}), null);
});
test('tickets bind action, actor, stage, path, and expiration', () => {
  const secret = 'qa-only-secret'.repeat(4);
  const ticket = issueArtifactTicket(secret, 'read', 'actor', 'stage', 'src/game.ts', 100);
  assert.ok(verifyArtifactTicket(secret, ticket, 'read', 'actor', 'stage', 'src/game.ts', 99));
  assert.ok(!verifyArtifactTicket(secret, ticket, 'read', 'actor', 'stage', 'src/game.ts', 100));
  assert.ok(!verifyArtifactTicket(secret, ticket, 'read', 'other', 'stage', 'src/game.ts', 99));
  assert.ok(!verifyArtifactTicket(secret, ticket, 'upload', 'actor', 'stage', 'src/game.ts', 99));
});

test('source can reference declared sibling modules only; asset bytes must match their declared digest and type', () => {
  const entry = Buffer.from("import {score} from './score.ts'; export default function setup() { return score; }");
  const helper = Buffer.from('export const score = 1;');
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const files = [entry, helper].map((bytes,index) => ({
    path: index === 0 ? 'src/game.ts' : 'src/score.ts', mime: 'text/typescript',
    bytes: bytes.length, sha256: digest(bytes),
  }));
  const manifest = parseUploadManifest({files})!;
  assert.ok(validateArtifactBytes(manifest,files[0],entry));
  assert.ok(validateArtifactBytes(manifest,files[1],helper));
  assert.ok(!validateArtifactBytes(parseUploadManifest({files:[files[0]]})!,files[0],entry));
  for (const specifier of ['https://example.invalid/x.ts', 'npm:example', '../assets/x.ts']) {
    const remote = Buffer.from(`export {x} from '${specifier}'; export default {};`);
    const file = {...files[0],bytes:remote.length,sha256:digest(remote)};
    assert.ok(!validateArtifactBytes(parseUploadManifest({files:[file]})!,file,remote));
  }
  const html = Buffer.from('<html>not an image</html>');
  const image = {path:'assets/x.png',mime:'image/png',bytes:html.length,sha256:digest(html)};
  assert.ok(!validateArtifactBytes(parseUploadManifest({files:[files[0],image]})!,image,html));
  assert.ok(!validateArtifactBytes(manifest,files[0],Buffer.from(entry.toString().replace('score','other'))));
});
