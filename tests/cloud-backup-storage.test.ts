import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudStorageReady,completeCloudBackup} from '../apps/web/server/cloud-backup-storage.ts';

test('cloud saves stay off without provider-verified create-only writes',()=>{
  const old=process.env.CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED;
  try{
    delete process.env.CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED;
    assert.equal(cloudStorageReady(),false);
  }finally{
    if(old===undefined)delete process.env.CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED;
    else process.env.CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED=old;
  }
});

test('a lost confirmation response retries only confirmation and preserves uploaded bytes',async()=>{
  const objects=new Map<string,string>();
  let uploads=0,confirmations=0,ready=false;
  const result=await completeCloudBackup(
    async()=>{uploads++;objects.set('fixture','original');},
    async()=>{
      confirmations++;
      if(!ready){ready=true;throw new Error('response lost after commit');}
      return {outcome:'replayed'};
    },
  );
  assert.deepEqual(result,{outcome:'replayed'});
  assert.equal(uploads,1);
  assert.equal(confirmations,2);
  assert.equal(objects.get('fixture'),'original');
});
test('an ambiguous repeated confirmation failure retains the uploaded object',async()=>{
  const objects=new Map<string,string>();
  let ready=false,confirmations=0;
  await assert.rejects(completeCloudBackup(
    async()=>{objects.set('fixture','original');},
    async()=>{ready=true;confirmations++;throw new Error('confirmation unavailable');},
  ),/confirmation unavailable/);
  assert.equal(ready,true);
  assert.equal(confirmations,2);
  assert.equal(objects.get('fixture'),'original');
});
test('an upload failure does not attempt database confirmation',async()=>{
  let confirmations=0;
  await assert.rejects(completeCloudBackup(
    async()=>{throw new Error('upload failed');},
    async()=>{confirmations++;},
  ),/upload failed/);
  assert.equal(confirmations,0);
});
