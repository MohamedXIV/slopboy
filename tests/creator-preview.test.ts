import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scaffoldCreator,previewCreator,CreatorError} from '../tools/creator-kit.ts';
import {renderCreatorPreview,PREVIEW_SCRIPT} from '../tools/creator-preview.ts';
import {compileGameSource,validateCartridge} from '../packages/cartridge/src/index.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
const fixture=async(run:(root:string)=>Promise<void>)=>{
  const root=await mkdtemp(join(tmpdir(),'slopboy-preview-unit-'));
  try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
};
test('preview builds only after typed, budgeted Creator Kit validation',async()=>fixture(async root=>{
  await scaffoldCreator('my-preview',root);
  const report=await previewCreator('my-preview',root);
  assert.equal(report.approved,false);
  assert.equal(report.preview,'creations/my-preview/dist/my-preview.preview.html');
  const html=await readFile(join(root,report.preview),'utf8');
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/sandbox="allow-scripts"/);
  assert.match(html,/data-status="booting"/);
  assert.match(html,/preview-data/);
  assert.match(html,/preview-sandbox/);
  assert.ok(html.length<200_000);
  assert.ok(!html.includes('import type { GameModule }')); // authored code only in inert base64 payload
  const again=await previewCreator('my-preview',root);
  assert.deepEqual(again,report);
  assert.equal(await readFile(join(root,report.preview),'utf8'),html);
}));
test('preview HTML refuses unsupported profiles or invalid digest',()=>{
  const cart=validateCartridge({format:'slopboy-cartridge-v0',manifest:{
    id:'handmade',title:'<script>alert("bad")</script>',
    hardware:{id:SLOPBOY_1000.id,version:SLOPBOY_1000.version},
    controls:['A'],achievements:[]
  },code:compileGameSource('export default {update(){},draw(ctx){ctx.screen.clear(0)}};'),assets:[]});
  assert.throws(()=>renderCreatorPreview(cart,'bad'),/digest/);
  const html=renderCreatorPreview(cart,'f'.repeat(64));
  assert.ok(!html.includes('<script>alert("bad")</script>')); // title stays in base64; textContent only
  assert.equal((html.match(/<script\b/g)||[]).length,3);
  assert.ok(PREVIEW_SCRIPT.includes("event.origin!=='null'"));
  assert.ok(PREVIEW_SCRIPT.includes("event.source!==iframe.contentWindow"));
}));
test('creator preview refuses invalid SDK source without producing preview',async()=>fixture(async root=>{
  await scaffoldCreator('bad-preview',root);
  const file=join(root,'creations/bad-preview/src/game.ts');
  const source=await readFile(file,'utf8');
  await writeFile(file,source.replace('ctx.screen.clear(0);','ctx.screen.notReal(0);'));
  await assert.rejects(previewCreator('bad-preview',root),(e:unknown)=>e instanceof CreatorError&&e.code==='CODE_TYPECHECK');
  await assert.rejects(readFile(join(root,'creations/bad-preview/dist/bad-preview.preview.html'),'utf8'));
}));
