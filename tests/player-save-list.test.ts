import test from 'node:test';
import assert from 'node:assert/strict';
import {saveEntries,saveDate,nextSaveSort} from '../apps/web/components/v2/player-save-list.ts';
import type {SlotListing} from '../packages/runtime/src/save-slots.ts';
const row=(id:string,kind:'auto'|'manual'|'backup'|'fork'|'legacy',name:string,createdAt:number|null)=>({
  id,kind,name,createdAt,revisionId:null,releaseVersion:null,schemaVersion:1,bytes:2,digest:'a'.repeat(64),
});
const listing:SlotListing={selectedSlotId:'a',slots:[
  {id:'a',name:'Hidden slot A',createdAt:1,headId:'a2',snapshots:[row('a1','auto','Autosave',1000),row('a2','auto','Autosave',2000),row('a3','manual','Before boss',3000),row('a4','backup','Keep',4000)]},
  {id:'b',name:'Restored game',createdAt:2,headId:'b1',snapshots:[row('b1','fork','Source name',5000),row('b2','legacy','Original save',null)]},
]};
test('flat save lanes preserve all saved entries and only show the real selected head as current',()=>{
  assert.deepEqual(saveEntries(listing,'a','auto','','newest').map(r=>[r.snapshot.id,r.active]),[['a2',true],['a1',false]]);
  assert.deepEqual(saveEntries(listing,'a','manual','','newest').map(r=>r.name),['Restored game','Keep','Before boss','Original save']);
  assert.equal(saveEntries(listing,'a','manual','hidden slot','newest').length,0);
  assert.equal(saveEntries(listing,'a','manual','BOSS','newest')[0].snapshot.id,'a3');
  assert.equal(saveEntries(listing,'a','auto','1970-01-01','newest').length,2);
});
test('sort is reversible, unknown dates stay last, date text includes seconds',()=>{
  assert.deepEqual(saveEntries(listing,'a','auto','','oldest').map(r=>r.snapshot.id),['a1','a2']);
  assert.deepEqual(saveEntries(listing,'a','manual','','name').map(r=>r.name),['Before boss','Keep','Original save','Restored game']);
  assert.equal(saveDate(null),'Unknown date');
  assert.equal(saveDate(Number.MAX_SAFE_INTEGER),'Unknown date');
  assert.match(saveDate(1700000005000),/\d{1,2}:\d{2}:\d{2}/);
  assert.equal(nextSaveSort(nextSaveSort(nextSaveSort('newest'))),'newest');
});
