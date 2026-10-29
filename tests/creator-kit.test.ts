import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scaffoldCreator,checkCreator,buildCreator,verifyCreator,CreatorError} from '../tools/creator-kit.ts';

async function fixture(run:(root:string)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'slopboy-creator-'));
  try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('creator scaffolds complete, typed and budget-compliant first cartridge',async()=>fixture(async root=>{
  const made=await scaffoldCreator('indie-puzzle',root);
  assert.equal(made.project,'indie-puzzle');
  const manifest=JSON.parse(await readFile(join(root,'creations/indie-puzzle/manifest.json'),'utf8'));
  assert.equal(manifest.hardware.id,'slopboy-1000');
  const checked=await checkCreator('indie-puzzle',root);
  assert.equal(checked.ok,true);
  assert.equal(checked.approved,false);
  const packed=await buildCreator('indie-puzzle',root);
  const verified=await verifyCreator('indie-puzzle',root);
  assert.deepEqual(verified,packed);
  assert.equal(verified.sha256,checked.sha256);
  assert.ok(verified.packageBytes<524288);
}));
test('creator never overwrites scaffold or accepts traversal IDs',async()=>fixture(async root=>{
  await scaffoldCreator('a-game',root);
  await assert.rejects(scaffoldCreator('a-game',root),{code:'EEXIST'});
  await assert.rejects(scaffoldCreator('../outside',root),(err:unknown)=>err instanceof CreatorError&&err.code==='PROJECT_ID');
  await assert.rejects(checkCreator('A-Game',root),(err:unknown)=>err instanceof CreatorError&&err.code==='PROJECT_ID');
}));
test('creator detects broken SDK API calls before packaging',async()=>fixture(async root=>{
  await scaffoldCreator('incorrect-api',root);
  const file=join(root,'creations/incorrect-api/src/game.ts');
  const source=await readFile(file,'utf8');
  await writeFile(file,source.replace('ctx.screen.clear(0);','ctx.screen.notReal(0);'));
  await assert.rejects(checkCreator('incorrect-api',root),(err:unknown)=>err instanceof CreatorError&&err.code==='CODE_TYPECHECK');
}));
test('creator rejects disallowed JS API and oversized source',async()=>fixture(async root=>{
  await scaffoldCreator('untrusted-code',root);
  const file=join(root,'creations/untrusted-code/src/game.ts');
  const source=await readFile(file,'utf8');
  await writeFile(file,source.replace('ctx.screen.clear(0);','fetch("https://example.org"); ctx.screen.clear(0);'));
  await assert.rejects(checkCreator('untrusted-code',root),/CODE_API/);
  await writeFile(file,'x'.repeat(130*1024));
  await assert.rejects(checkCreator('untrusted-code',root),(err:unknown)=>err instanceof CreatorError&&err.code==='SOURCE_SIZE');
}));
test('creator verification catches stale cartridge after edit',async()=>fixture(async root=>{
  await scaffoldCreator('steady-test',root);
  await buildCreator('steady-test',root);
  const file=join(root,'creations/steady-test/src/game.ts');
  await writeFile(file,(await readFile(file,'utf8')).replace('counter + 1','counter + 2'));
  await assert.rejects(verifyCreator('steady-test',root),(err:unknown)=>err instanceof CreatorError&&err.code==='STALE_BUILD');
  await buildCreator('steady-test',root);
  assert.equal((await verifyCreator('steady-test',root)).ok,true);
}));
test('creator rejects symlinked sources',async()=>fixture(async root=>{
  await scaffoldCreator('safe-dir',root);
  const file=join(root,'creations/safe-dir/src/game.ts');
  await rm(file);
  const target=join(root,'other.ts');
  await writeFile(target,'export default {}');
  await symlink(target,file);
  await assert.rejects(checkCreator('safe-dir',root),(err:unknown)=>err instanceof CreatorError&&err.code==='SOURCE_PATH');
}));
