import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {GAMES} from '../packages/catalog/src/index.ts';
import {compileGameSource,packCartridge,validateManifest}
  from '../packages/cartridge/src/index.ts';
import {prepareImmutableCuratedAssets} from '../tools/build-curated-immutable.ts';
import {buildCuratedDraftImportSql,planCuratedDraftImport,CURATED_STATIC_STORAGE_SCHEME}
  from '../tools/curated-draft-import.ts';

const ROOT=resolve(import.meta.dirname,'..');

async function fixture():Promise<string>{
  const root=await mkdtemp(resolve(tmpdir(),'slopboy-draft-import-'));
  for(const game of GAMES){
    for(const name of [game.source.manifest,game.source.game]){
      const dest=resolve(root,name);
      await mkdir(dirname(dest),{recursive:true});
      await copyFile(resolve(ROOT,name),dest);
    }
    const manifest=validateManifest(JSON.parse(
      await readFile(resolve(root,game.source.manifest),'utf8'))).manifest;
    const code=compileGameSource(await readFile(resolve(root,game.source.game),'utf8'));
    const bytes=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    const dest=resolve(root,'apps/web/public'+game.cartridge);
    await mkdir(dirname(dest),{recursive:true});
    await writeFile(dest,bytes);
  }
  await prepareImmutableCuratedAssets({rootDir:root,mode:'build'});
  return root;
}

test('generates private draft import only after every reviewed SHA address exists',async()=>{
  const root=await fixture();
  try{
    const plan=await planCuratedDraftImport(root);
    assert.equal(plan.schemaVersion,1);
    assert.equal(plan.requiredMigration,3);
    assert.equal(plan.publicationEligible,false);
    assert.equal(plan.writesToDatabase,false);
    assert.equal(plan.revisions.length,GAMES.length);
    for(const [i,row] of plan.revisions.entries()){
      assert.equal(row.game_id,GAMES[i].gameId);
      assert.equal(row.revision_id,GAMES[i].revisionId);
      assert.equal(row.legacy_slug,GAMES[i].legacySlug);
      assert.equal(row.revision_number,1);
      assert.equal(row.artifact_path,GAMES[i].legacySlug+'.slop');
      assert.equal(row.content_digest,row.artifact_sha256);
      assert.equal(row.byte_size,row.artifact_byte_size);
      assert.ok(row.storage_key.startsWith(CURATED_STATIC_STORAGE_SCHEME+'/cartridges/by-sha256/'));
      const name=row.storage_key.slice(CURATED_STATIC_STORAGE_SCHEME.length);
      const bytes=await readFile(resolve(root,'apps/web/public'+name));
      assert.equal(bytes.byteLength,row.byte_size);
    }
    assert.deepEqual(await planCuratedDraftImport(root),plan);
    const sql=buildCuratedDraftImportSql(plan);
    assert.match(sql,/^-- Issue #27:/);
    assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
    assert.match(sql,/schema_migrations WHERE version=3/);
    assert.match(sql,/g\.visibility='private' AND g\.status='draft'/);
    assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
    assert.match(sql,/ON CONFLICT \(revision_id,path\) DO NOTHING/);
    assert.match(sql,/r\.status='draft'/);
    assert.doesNotMatch(sql,/UPDATE public\.games|UPDATE public\.game_revisions|DELETE FROM/);
    assert.doesNotMatch(sql,/SET.*published/);
    assert.match(sql,/static-public-v1:/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('missing or tampered SHA-addressed copies fail before any import plan is emitted',async()=>{
  const root=await fixture();
  try{
    const plan=await planCuratedDraftImport(root);
    const first=plan.revisions[0];
    const path=resolve(root,'apps/web/public'+first.storage_key.slice(CURATED_STATIC_STORAGE_SCHEME.length));
    await rm(path);
    await assert.rejects(()=>planCuratedDraftImport(root),/Immutable cartridge missing/);
    await writeFile(path,Buffer.from('different cartridge'));
    await assert.rejects(()=>planCuratedDraftImport(root),/Immutable cartridge collision or overwrite/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('refuses a malformed or modified private import transaction at serialization',async()=>{
  const root=await fixture();
  try{
    const plan=await planCuratedDraftImport(root);
    assert.throws(()=>buildCuratedDraftImportSql({...plan,publicationEligible:true as false}),/Invalid private draft import plan/);
    assert.throws(()=>buildCuratedDraftImportSql({...plan,revisions:plan.revisions.slice(1)}),/Invalid private draft import plan/);
    assert.throws(()=>buildCuratedDraftImportSql({...plan,revisions:plan.revisions.map(
      (r,i)=>i===0?{...r,artifact_path:'../outside'}:r
    )}),/Invalid curated draft import row/);
    assert.throws(()=>buildCuratedDraftImportSql({...plan,revisions:plan.revisions.map(
      (r,i)=>i===0?{...r,storage_key:'some-fake-neon-object'}:r
    )}),/Invalid curated draft import row/);
    const forged='f'.repeat(64);
    assert.throws(()=>buildCuratedDraftImportSql({...plan,revisions:plan.revisions.map(
      (r,i)=>i===0?{...r,content_digest:forged,artifact_sha256:forged,
        storage_key:CURATED_STATIC_STORAGE_SCHEME+'/cartridges/by-sha256/'+forged+'.slop'}:r
    )}),/Invalid curated draft import row/,'Matching forged digests must still fail independent lock');
    assert.throws(()=>buildCuratedDraftImportSql({...plan,revisions:plan.revisions.map(
      (r,i)=>i===0?{...r,manifest:{...r.manifest,title:'Forged manifest'}}:r
    )}),/Invalid curated draft import row/,'SQL builder cannot bless forged manifest metadata');
  }finally{await rm(root,{recursive:true,force:true});}
});
