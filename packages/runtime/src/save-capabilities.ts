/**
 * Engine-neutral save capabilities. Missing declarations are historical/unknown,
 * not implicit permission for manual capture. Never infer from genre or title.
 */
export const SAVE_MODES = ['none','persistent-data','auto','manual','manual-and-auto'] as const;
export type SaveMode = typeof SAVE_MODES[number];
export interface SaveCapabilities {
  readonly mode: SaveMode;
  readonly schemaVersion?: number;
}
export function isSaveMode(value:unknown):value is SaveMode {
  return typeof value==='string' && (SAVE_MODES as readonly string[]).includes(value);
}
export function parseSaveCapabilities(value:unknown):SaveCapabilities {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid save capabilities');
  const record=value as Record<string,unknown>;
  if(Object.keys(record).some(key=>key!=='mode'&&key!=='schemaVersion')||!isSaveMode(record.mode))
    throw Error('Invalid save mode');
  if(record.mode==='none'){
    if(Object.hasOwn(record,'schemaVersion'))throw Error('No-save games cannot declare a save schema');
    return {mode:'none'};
  }
  const schema=record.schemaVersion;
  if(typeof schema!=='number'||!Number.isSafeInteger(schema)||schema<1||schema>9999)
    throw Error('Save-enabled games require an explicit schema version');
  return {mode:record.mode,schemaVersion:schema};
}
export function supportsManualSave(capabilities:SaveCapabilities|undefined):boolean {
  return capabilities?.mode==='manual'||capabilities?.mode==='manual-and-auto';
}
export function supportsAutosave(capabilities:SaveCapabilities|undefined):boolean {
  return capabilities?.mode==='auto'||capabilities?.mode==='manual-and-auto';
}
export function supportsProgressSave(capabilities:SaveCapabilities|undefined):boolean {
  return supportsManualSave(capabilities)||supportsAutosave(capabilities);
}
/** Historical revisions are intentionally unknown unless a reviewed declaration exists. */
export function reviewedPixelSaveCapabilities(gameId:string,revisionId:string):SaveCapabilities|undefined {
  const reviewed:ReadonlyArray<readonly [string,string,SaveCapabilities]>=[
    ['5b0edbf4-644d-43f4-9ad3-5506eacd05d3','107d59b4-03d5-4a29-be33-f8246a2c4caa',{mode:'none'}],
    ['f8067e25-7c16-4e9d-b496-69b1b8fe7ccc','38ecff6f-6b60-40d1-81ab-c07ad0dc928e',{mode:'none'}],
    ['3ce74eec-ca3c-484b-8d16-2af4840c539b','8b2c6f40-4684-4e6f-95d4-ce7cfca730f2',{mode:'auto',schemaVersion:1}],
  ];
  return reviewed.find(entry=>entry[0]===gameId&&entry[1]===revisionId)?.[2];
}
export type SaveCompatibility='compatible'|'incompatible'|'unknown';
export interface SaveFormatIdentity {
  readonly gameId:string;
  readonly hardwareId:string;
  readonly schemaVersion?:number;
}
export function saveCompatibility(saved:SaveFormatIdentity,target:SaveFormatIdentity):SaveCompatibility {
  if(saved.gameId!==target.gameId||saved.hardwareId!==target.hardwareId)return 'incompatible';
  if(saved.schemaVersion===undefined||target.schemaVersion===undefined)return 'unknown';
  return saved.schemaVersion===target.schemaVersion?'compatible':'incompatible';
}
