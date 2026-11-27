import type {SlotListing} from '../../../../packages/runtime/src/save-slots.ts';
import type {CloudSnapshotIdentity} from '../../../../packages/runtime/src/cloud-snapshot.ts';
import {exactLocalCloudMatch,type CloudRow,type CloudListing} from './player-cloud-contract.ts';
import {saveEntries,filterAndSortSaves,type SaveLane,type SaveSort,type SaveListEntry} from './player-save-list.ts';
export type IntegratedSaveRow=
  | {location:'local';name:string;local:SaveListEntry;backedUp:boolean}
  | {location:'cloud';name:string;remote:CloudRow};
export function integratedSaves(local:SlotListing|null,active:string|null,cloud:CloudListing|null,identity:CloudSnapshotIdentity|undefined,
  lane:SaveLane,query:string,sort:SaveSort):IntegratedSaveRow[]{
  const remote=identity?cloud?.snapshots??[]:[];
  const matched=identity?remote.filter(row=>exactLocalCloudMatch(row,local,identity)):[];
  const rows:IntegratedSaveRow[]=saveEntries(local,active,lane,'','newest').map(entry=>({
    location:'local',name:entry.name,local:entry,backedUp:matched.some(row=>row.slotId===entry.slotId&&row.snapshotId===entry.snapshot.id),
  }));
  for(const row of remote){
    if(matched.includes(row)||(lane==='auto')!==(row.kind==='auto'))continue;
    rows.push({location:'cloud',name:row.kind==='fork'?row.slotName:row.snapshotName,remote:row});
  }
  return filterAndSortSaves(rows,query,sort,row=>row.location==='local'?row.local.snapshot.createdAt:row.remote.snapshotCreatedAt);
}
