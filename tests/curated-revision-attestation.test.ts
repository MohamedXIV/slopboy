import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {GAMES} from '../packages/catalog/src/index.ts';
import {SYSTEM_CURATOR_USER_ID} from '../packages/database/src/schema.ts';
import {attestCuratedRelease,attestCuratedRevision}
  from '../tools/attest-curated-revisions.ts';

test('curated release produces independent SHA-256 evidence for actual built cartridge bytes',async()=>{
  const results=await attestCuratedRelease();
  assert.equal(results.length,3);
  assert.equal(new Set(results.map(r=>r.gameId)).size,3);
  assert.equal(new Set(results.map(r=>r.revisionId)).size,3);
  assert.equal(new Set(results.map(r=>r.contentDigest)).size,3);
  for(const [index,result] of results.entries()){
    const game=GAMES[index];
    assert.equal(result.gameId,game.gameId);
    assert.equal(result.revisionId,game.revisionId);
    assert.equal(result.createdBy,SYSTEM_CURATOR_USER_ID);
    assert.equal(result.manifest.id,game.legacySlug);
    assert.deepEqual(result.manifest.controls,game.controls);
    assert.equal(result.engineId,'pixel-v1');
    assert.equal(result.engineVersion,'0.1.0');
    assert.equal(result.deviceProfile,game.hardware.id);
    assert.equal(result.revisionNumber,1);
    assert.equal(result.intendedStatus,'draft','Attestation is never publication approval');
    assert.equal(result.bundledPath,game.cartridge);
    assert.equal(result.artifact.path,game.legacySlug+'.slop');
    assert.equal(result.artifact.sha256,result.contentDigest);
    assert.equal(result.artifact.byteSize,result.byteSize);
    assert.match(result.contentDigest,/^[0-9a-f]{64}$/);
    assert.ok(result.byteSize>0);
  }
  assert.deepEqual(await attestCuratedRelease(),results,'Rebuilds must attest identically');
});

test('display title edits do not rewrite the immutable curated bundle digest',async()=>{
  const game=GAMES[0];
  const original=await attestCuratedRevision(game);
  const changed=await attestCuratedRevision({...game,title:'Renamed in the catalog'});
  assert.equal(changed.contentDigest,original.contentDigest);
  assert.equal(changed.revisionId,original.revisionId);
  assert.equal(changed.gameId,original.gameId);
});

test('rejects mismatched fixture metadata before any release can be attested',async()=>{
  const game=GAMES[0];
  await assert.rejects(
    ()=>attestCuratedRevision({...game,source:{...game.source,game:'../private.ts'}}),
    /Untrusted curated fixture identity/
  );
  await assert.rejects(
    ()=>attestCuratedRevision({...game,controls:['DOWN']}),
    /manifest does not match catalog/
  );
  await assert.rejects(
    ()=>attestCuratedRevision({...game,cartridge:'/cartridges/other.slop'}),
    /Untrusted curated fixture identity/
  );
});

test('on-disk attestation rejects substituted bundles, even if source manifests are valid',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'slopboy-attest-'));
  const game=GAMES[0];
  try{
    for(const source of [game.source.manifest,game.source.game]){
      const target=resolve(root,source);
      await mkdir(dirname(target),{recursive:true});
      await copyFile(resolve(import.meta.dirname,'..',source),target);
    }
    const dest=resolve(root,'apps/web/public'+game.cartridge);
    await mkdir(dirname(dest),{recursive:true});
    await writeFile(dest,Buffer.from('not a cartridge'));
    await assert.rejects(
      ()=>attestCuratedRevision(game,{rootDir:root,verifyBundled:true}),
      /Bundled cartridge differs/
    );
    // The same source can still be built in memory, but that does not
    // authorize or attest an unrelated shipped file.
    const valid=await attestCuratedRevision(game,{rootDir:root});
    const tampered=await readFile(dest);
    assert.notEqual(createHash('sha256').update(tampered).digest('hex'),valid.contentDigest);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
