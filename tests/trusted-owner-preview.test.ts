import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedOwnerPreview} from '../apps/web/server/trusted-owner-preview.ts';

const owner = {id:'owner',emailVerified:true};
const visitor = {id:'visitor',emailVerified:true};
const gameId = 'a5f07002-1c29-4a97-9b12-00b3f3325999';
const read = async (actorId:string,id:string) =>
  actorId === owner.id && id === gameId ? {title:'Private game'} : null;

test('trusted fixture preview is enabled only on the dev preview', async () => {
  assert.equal(await trustedOwnerPreview(false,owner,gameId,read),null);
});

test('a verified owner can preview, while a foreign session and guest cannot', async () => {
  assert.equal((await trustedOwnerPreview(true,owner,gameId,read))?.title,'Private game');
  assert.equal(await trustedOwnerPreview(true,visitor,gameId,read),null);
  assert.equal(await trustedOwnerPreview(true,null,gameId,read),null);
  assert.equal(await trustedOwnerPreview(true,{...owner,emailVerified:false},gameId,read),null);
  assert.equal(await trustedOwnerPreview(true,owner,'invalid',read),null);
});

test('the trusted fixture uses a separate browser save slot per owner and draft', async () => {
  const secondId = 'a5f07002-1c29-4a97-9b12-00b3f3325998';
  const fixture = async () => ({title:'Private game'});
  const first = await trustedOwnerPreview(true,owner,gameId,fixture);
  assert.match(first?.saveKey ?? '',/^slopboy-trusted-owner-preview-v1:[0-9a-f]{64}$/);
  assert.notEqual(first?.saveKey,(await trustedOwnerPreview(true,owner,secondId,fixture))?.saveKey);
  assert.notEqual(first?.saveKey,(await trustedOwnerPreview(true,visitor,gameId,fixture))?.saveKey);
});
