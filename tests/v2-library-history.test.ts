import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {readGameHistory,recordGameLaunch,recordActivePlaytime,formatActiveTime,HISTORY_PREFIX,LEGACY_HISTORY_PREFIX}
  from '../apps/web/components/v2/library-history.ts';
import {makeCartridgeAppearance} from '../apps/web/components/v2/cartridge-cover.ts';
const makeStorage=()=>{
  const values=new Map<string,string>();
  return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},values};
};
const tiny=GAMES[0],star=GAMES[1];
test('history tracks actual launches and active playtime under the UUID',()=>{
  const storage=makeStorage();
  assert.equal(readGameHistory(storage,tiny.gameId).launches,0);
  recordGameLaunch(storage,tiny.gameId,1000);
  recordActivePlaytime(storage,tiny.gameId,10000);
  recordActivePlaytime(storage,tiny.gameId,3000000);
  assert.deepEqual(readGameHistory(storage,tiny.gameId),
    {gameId:tiny.gameId,launches:1,activeMs:40000,lastPlayedAt:1000});
  assert.equal(formatActiveTime(40000),'Under a minute');
  assert.equal(formatActiveTime(3660000),'1 hr 1 min');
  assert.ok(storage.values.has(HISTORY_PREFIX+tiny.gameId));
});
test('legacy slug history is migrated once without losing sessions, even on restart',()=>{
  const storage=makeStorage();
  const legacy=JSON.stringify({gameId:tiny.legacySlug,launches:4,activeMs:7000,lastPlayedAt:1234});
  storage.setItem(LEGACY_HISTORY_PREFIX+tiny.legacySlug,legacy);
  assert.equal(readGameHistory(storage,tiny.gameId).launches,4);
  assert.equal(readGameHistory(storage,tiny.gameId).launches,4);
  const reload=readGameHistory(storage,tiny.gameId);
  assert.equal(reload.activeMs,7000);
  recordGameLaunch(storage,tiny.gameId,2222);
  assert.equal(readGameHistory(storage,tiny.gameId).launches,5);
  assert.equal(storage.getItem(LEGACY_HISTORY_PREFIX+tiny.legacySlug),legacy);
});
test('broken or unsupported history fails closed with old-value fallback',()=>{
  const storage=makeStorage();
  storage.setItem(LEGACY_HISTORY_PREFIX+star.legacySlug,
    '{"launches":-20,"activeMs":"bad","story":{"completed":9,"total":3}}');
  storage.setItem(HISTORY_PREFIX+star.gameId,'{malformed');
  const r=readGameHistory(storage,star.gameId);
  assert.equal(r.launches,0);assert.equal(r.activeMs,0);assert.equal('story' in r,false);
  assert.equal(storage.getItem(HISTORY_PREFIX+star.gameId),'{malformed');
  assert.throws(()=>readGameHistory(storage,'../secret'),/Invalid/);
});
test('procedural legacy cartridge art stays deterministic and varied',()=>{
  const a=makeCartridgeAppearance(tiny.legacySlug);
  assert.deepEqual(a,makeCartridgeAppearance(tiny.legacySlug));
  assert.notDeepEqual(a,makeCartridgeAppearance(star.legacySlug));
  assert.match(a.primary,/^#[0-9a-f]{6}$/i);
  assert.ok(a.stripes>=3&&a.stripes<=8);
});
test('current arcade catalog never fabricates story completion percentages',()=>{
  assert.ok(GAMES.every(game=>!game.mainStory));
});
