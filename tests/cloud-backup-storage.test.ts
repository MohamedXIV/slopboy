import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudStorageReady,cloudStorageTargetMatches,canUseCloudBackups,completeCloudBackup} from '../apps/web/server/cloud-backup-storage.ts';

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

const qaTarget={databaseHost:'ep-qa.example.test',databaseRole:'restricted_role',databaseName:'qa',authUrl:'https://auth.example.test/qa/auth',storageEndpoint:'https://storage.example.test',region:'eu-central-1',bucket:'slopboy-cloud-backups-qa'};
const qaEnv={CLOUD_SAVE_BACKUPS_ENABLED:'1',CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED:'1',CLOUD_SAVE_EXPECTED_TARGET:JSON.stringify(qaTarget),DATABASE_URL:'postgresql://restricted_role:fixture@ep-qa-pooler.example.test/qa?sslmode=require',NEON_AUTH_BASE_URL:qaTarget.authUrl,AWS_ENDPOINT_URL_S3:qaTarget.storageEndpoint,AWS_REGION:qaTarget.region,CLOUD_SAVE_BUCKET:qaTarget.bucket,AWS_ACCESS_KEY_ID:'fixture',AWS_SECRET_ACCESS_KEY:'fixture'};
test('prelaunch QA requires a matching reviewed backend target and both feature flags',()=>{
  assert.equal(cloudStorageReady(qaEnv),true);
  assert.equal(cloudStorageTargetMatches({...qaEnv,DATABASE_URL:qaEnv.DATABASE_URL.replace('-pooler','')}),true);
  for(const [key,value] of Object.entries({
    CLOUD_SAVE_BACKUPS_ENABLED:'0',CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED:'0',
    CLOUD_SAVE_EXPECTED_TARGET:undefined,
    DATABASE_URL:qaEnv.DATABASE_URL.replace('restricted_role','owner_role'),
    NEON_AUTH_BASE_URL:'https://other.example.test/qa/auth',
    AWS_ENDPOINT_URL_S3:'https://other-storage.example.test',
    AWS_REGION:'us-east-1',CLOUD_SAVE_BUCKET:'slopboy-cloud-backups-other'
  })) assert.equal(cloudStorageReady({...qaEnv,[key]:value}),false,key);
  assert.equal(cloudStorageReady({...qaEnv,DATABASE_URL:qaEnv.DATABASE_URL.replace('ep-qa','ep-other')}),false);
  assert.equal(cloudStorageReady({...qaEnv,DATABASE_URL:qaEnv.DATABASE_URL.replace('/qa?','/other?')}),false);
});
test('only verified admin profiles are eligible for prelaunch QA',()=>{
  assert.equal(canUseCloudBackups('admin'),true);
  for(const role of ['player','creator','system',undefined,null])assert.equal(canUseCloudBackups(role),false);
});
