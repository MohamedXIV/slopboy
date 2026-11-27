import type {SlotListing} from '../../../../packages/runtime/src/save-slots.ts';
export type SaveLane='auto'|'manual';
export type SaveSort='newest'|'oldest'|'name';
type Slot=SlotListing['slots'][number];
export interface SaveListEntry {
  slotId:string; snapshot:Slot['snapshots'][number]; name:string; active:boolean;
}
function knownDate(timestamp:number|null):timestamp is number{
  return timestamp!==null&&Number.isFinite(new Date(timestamp).getTime());
}
export function saveDate(timestamp:number|null):string{
  return !knownDate(timestamp)?'Unknown date':new Date(timestamp).toLocaleString(undefined,{
    year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',
  });
}
export function saveEntries(list:SlotListing|null,activeSlotId:string|null,lane:SaveLane,query:string,sort:SaveSort):SaveListEntry[]{
  const rows=list?.slots.flatMap(slot=>slot.snapshots.filter(s=>lane==='auto'?s.kind==='auto':s.kind!=='auto').map(snapshot=>({
    slotId:slot.id,snapshot,name:snapshot.kind==='fork'?slot.name:snapshot.name,
    active:slot.id===activeSlotId&&slot.headId===snapshot.id,
  })))??[];
  return filterAndSortSaves(rows,query,sort,row=>row.snapshot.createdAt);
}
/** Shared search/order across both local and remote-only entries. */
export function filterAndSortSaves<T extends {name:string}>(rows:T[],query:string,sort:SaveSort,date:(row:T)=>number|null):T[]{
  const q=query.trim().toLocaleLowerCase();
  return rows.filter(row=>{
    const at=date(row);
    return !q||[row.name,saveDate(at),knownDate(at)?new Date(at).toISOString():''].some(v=>v.toLocaleLowerCase().includes(q));
  }).sort((a,b)=>{
    const ad=date(a),bd=date(b),at=knownDate(ad)?ad:null,bt=knownDate(bd)?bd:null;
    if(sort==='name'){const diff=a.name.localeCompare(b.name);if(diff)return diff;}
    if(at===null||bt===null)return at===bt?0:at===null?1:-1;
    return sort==='oldest'?at-bt:bt-at;
  });
}
export const SAVE_SORT_LABELS:Record<SaveSort,string>={newest:'Newest first',oldest:'Oldest first',name:'Name A–Z'};
export function nextSaveSort(sort:SaveSort):SaveSort{
  return sort==='newest'?'oldest':sort==='oldest'?'name':'newest';
}
