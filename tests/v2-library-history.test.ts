import test from 'node:test';
import assert from 'node:assert/strict';
import {readGameHistory,recordGameLaunch,recordActivePlaytime,formatActiveTime,HISTORY_PREFIX}
  from '../apps/web/components/v2/library-history.ts';
import {makeCartridgeAppearance} from '../apps/web/components/v2/cartridge-cover.ts';
const makeStorage=()=>{
  const values=new Map<string,string>();
  return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},values};
};
test('guest library records real launches and active foreground time only',()=>{
  const storage=makeStorage();
  assert.equal(readGameHistory(storage,'tiny-catcher').launches,0);
  recordGameLaunch(storage,'tiny-catcher',1000);
  recordActivePlaytime(storage,'tiny-catcher',10000);
  recordActivePlaytime(storage,'tiny-catcher',3000000);
  assert.deepEqual(readGameHistory(storage,'tiny-catcher'),
    {gameId:'tiny-catcher',launches:1,activeMs:40000,lastPlayedAt:1000});
  assert.equal(formatActiveTime(40000),'Under a minute');
  assert.equal(formatActiveTime(3660000),'1 hr 1 min');
});
test('corrupt local metadata is discarded and unverified story progress is absent',()=>{
  const storage=makeStorage();
  storage.setItem(HISTORY_PREFIX+'star-patrol','{"launches":-20,"activeMs":"bad","story":{"completed":9,"total":3}}');
  const r=readGameHistory(storage,'star-patrol');
  assert.equal(r.launches,0);assert.equal(r.activeMs,0);
  assert.equal('story' in r,false);
  assert.throws(()=>readGameHistory(storage,'../secret'),/Invalid/);
});
test('procedural cartridge covers are deterministic and varied',()=>{
  const a=makeCartridgeAppearance('tiny-catcher');
  assert.deepEqual(a,makeCartridgeAppearance('tiny-catcher'));
  assert.notDeepEqual(a,makeCartridgeAppearance('star-patrol'));
  assert.match(a.primary,/^#[0-9a-f]{6}$/i);
  assert.ok(a.stripes>=3&&a.stripes<=8);
});
