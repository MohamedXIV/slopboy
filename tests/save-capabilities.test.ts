import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSaveCapabilities,supportsManualSave,supportsAutosave,supportsProgressSave,reviewedPixelSaveCapabilities,saveCompatibility} from '../packages/runtime/src/save-capabilities.ts';
import {GAMES} from '../packages/catalog/src/index.ts';

test('explicit save modes distinguish progress, profile data and no saving',()=>{
  for(const mode of ['none','persistent-data','auto','manual','manual-and-auto'] as const){
    const cap=parseSaveCapabilities(mode==='none'?{mode}:{mode,schemaVersion:1});
    assert.equal(supportsManualSave(cap),mode==='manual'||mode==='manual-and-auto');
    assert.equal(supportsAutosave(cap),mode==='auto'||mode==='manual-and-auto');
    assert.equal(supportsProgressSave(cap),['auto','manual','manual-and-auto'].includes(mode));
  }
  assert.equal(supportsProgressSave(undefined),false);
  for(const invalid of [null,[],{}, {mode:'runner'}, {mode:'auto'}, {mode:'none',schemaVersion:1},
    {mode:'manual',schemaVersion:0},{mode:'manual',schemaVersion:1.5},{mode:'auto',schemaVersion:10000},
    {mode:'auto',schemaVersion:1,unknown:true}]){
    assert.throws(()=>parseSaveCapabilities(invalid));
  }
});
test('reviewed pixel policy is revision-specific, not inferred from genre or name',()=>{
  for(const [i,g] of GAMES.entries()){
    assert.equal(reviewedPixelSaveCapabilities(g.gameId,g.revisionId)?.mode,i===2?'auto':'none');
    assert.equal(reviewedPixelSaveCapabilities(g.gameId,'00000000-0000-4000-a000-000000000000'),undefined);
  }
});
test('compatibility requires game, hardware and known schema, not release labels',()=>{
  const saved={gameId:GAMES[2].gameId,hardwareId:'slopboy-1000',schemaVersion:1};
  assert.equal(saveCompatibility(saved,{...saved}), 'compatible');
  assert.equal(saveCompatibility(saved,{...saved,schemaVersion:2}), 'incompatible');
  assert.equal(saveCompatibility(saved,{...saved,schemaVersion:undefined}), 'unknown');
  assert.equal(saveCompatibility(saved,{...saved,gameId:GAMES[0].gameId}), 'incompatible');
  assert.equal(saveCompatibility(saved,{...saved,hardwareId:'other'}), 'incompatible');
});
