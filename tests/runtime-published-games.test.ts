import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {parseRuntimeFixtureRegistry,resolvePublishedGame,RUNTIME_FIXTURES_ENV}
  from '../apps/web/server/published-games.ts';

const fixture={gameId:'c260881a-647d-43c1-bf24-81e7a5902908',
  revisionId:'7400f98c-e2f8-49a9-9c40-400923705580',title:'Late-arriving approved fixture',
  reviewedCartridgeSlug:'tiny-catcher'};

test('only explicit immutable UUIDs and pre-reviewed shipped artifacts resolve',()=>{
  const registry=JSON.stringify([fixture]);
  assert.equal(resolvePublishedGame(GAMES[0].gameId,registry)?.legacySlug,'tiny-catcher');
  assert.equal(resolvePublishedGame(fixture.gameId)?.gameId,undefined);
  const published=resolvePublishedGame(fixture.gameId,registry);
  assert.equal(published?.gameId,fixture.gameId);
  assert.equal(published?.revisionId,fixture.revisionId);
  assert.equal(published?.cartridge,'/cartridges/tiny-catcher.slop');
  assert.equal(published?.status,'runtime-fixture');
  assert.equal(resolvePublishedGame('tiny-catcher',registry),undefined);
  assert.equal(resolvePublishedGame('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',registry),undefined);
  assert.equal(RUNTIME_FIXTURES_ENV,'SLOPBOY_RUNTIME_FIXTURES_JSON');
});
test('unknown files, collisions and malformed JSON fail closed',()=>{
  const valid=JSON.stringify([fixture]);
  assert.equal(parseRuntimeFixtureRegistry(valid).length,1);
  for(const invalid of [
    'wrong',JSON.stringify([{},fixture]),JSON.stringify({...fixture}),
    JSON.stringify([{...fixture,reviewedCartridgeSlug:'../../private'}]),
    JSON.stringify([{...fixture,gameId:GAMES[0].gameId}]),
    JSON.stringify([{...fixture,revisionId:GAMES[1].revisionId}]),
    JSON.stringify([fixture,fixture]),
    JSON.stringify(Array.from({length:17},()=>fixture))
  ])assert.deepEqual(parseRuntimeFixtureRegistry(invalid),[],invalid);
});
test('server runtime registry can change after build without modifying game bundles',()=>{
  const prior=process.env[RUNTIME_FIXTURES_ENV];
  try{
    process.env[RUNTIME_FIXTURES_ENV]=JSON.stringify([fixture]);
    assert.equal(resolvePublishedGame(fixture.gameId)?.title,fixture.title);
    delete process.env[RUNTIME_FIXTURES_ENV];
    assert.equal(resolvePublishedGame(fixture.gameId),undefined);
  }finally{
    if(prior===undefined)delete process.env[RUNTIME_FIXTURES_ENV];
    else process.env[RUNTIME_FIXTURES_ENV]=prior;
  }
});
