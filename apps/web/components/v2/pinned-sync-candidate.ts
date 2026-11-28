import type {SlotListing} from '../../../../packages/runtime/src/save-slots.ts';
import type {CloudSnapshotIdentity} from '../../../../packages/runtime/src/cloud-snapshot.ts';
import {reviewedPixelSaveCapabilities,supportsProgressSave,supportsManualSave} from '../../../../packages/runtime/src/save-capabilities.ts';
import type {CloudListing} from './player-cloud-contract.ts';

/** Oldest unbacked protected save first. Rename alone must not consume another
 * immutable cloud slot. A replacement has a fresh snapshot ID and is distinct.
 * No automatic upload of legacy, auto or restored-fork records. */
export function nextPinnedCandidate(local:SlotListing,cloud:CloudListing,identity:CloudSnapshotIdentity){
  return local.slots.flatMap(slot=>slot.snapshots.map(snapshot=>({slotId:slot.id,snapshot})))
    .filter(({slotId,snapshot:s})=>{
      if(cloud.deletedSnapshotIds?.includes(s.id))return false;
      if((s.kind!=='manual'&&s.kind!=='backup')||!s.revisionId)return false;
      const source=reviewedPixelSaveCapabilities(identity.gameId,s.revisionId);
      if(!supportsProgressSave(source)||source?.schemaVersion!==s.schemaVersion||(s.kind==='manual'&&!supportsManualSave(source)))return false;
      return !cloud.snapshots.some(row=>row.slotId===slotId&&row.snapshotId===s.id&&row.payloadDigest===s.digest&&row.payloadBytes===s.bytes&&row.kind===s.kind&&
        row.hardwareId===identity.hardwareId+'@'+identity.hardwareVersion&&row.schemaVersion===s.schemaVersion&&row.revisionId===s.revisionId);
    })
    .sort((a,b)=>(a.snapshot.createdAt??0)-(b.snapshot.createdAt??0)||a.snapshot.id.localeCompare(b.snapshot.id))[0]??null;
}
