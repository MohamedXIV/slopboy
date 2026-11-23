import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudStorageReady} from '../apps/web/server/cloud-backup-storage.ts';

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
