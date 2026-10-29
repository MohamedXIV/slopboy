import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import {compileGameSource, packCartridge, unpackCartridge, validateCartridge, validateManifest, CartridgeError} from '../packages/cartridge/src/index.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
const manifest = {id:'tiny-catcher',title:'Tiny Catcher',hardware:{id:'slopboy-1000',version:'0.1.0'},controls:['LEFT','RIGHT','A'],achievements:[]};
const code = 'export default {update(){},draw(){}};';
const fresh = () => ({format:'slopboy-cartridge-v0',manifest:structuredClone(manifest),code,assets:[] as unknown[]});
const fails=(fn:()=>unknown,code:string)=>assert.throws(fn,(e:unknown)=>e instanceof CartridgeError && e.code===code);
test('deterministic package and round trip',()=>{
 const first=packCartridge(fresh()), second=packCartridge(fresh());
 assert.deepEqual(first,second);assert.deepEqual(unpackCartridge(first),validateCartridge(fresh()));
});
test('unknown hardware version is rejected',()=>{
 const value=fresh();value.manifest.hardware.version='99.0.0';fails(()=>packCartridge(value),'HARDWARE');
 assert.equal(SLOPBOY_1000.display.width,160);
});
test('unsupported or duplicate controls rejected',()=>{
 const value=fresh();value.manifest.controls=['ANALOG'];fails(()=>validateManifest(value.manifest),'INPUT');
 value.manifest.controls=['A','A'];fails(()=>validateManifest(value.manifest),'INPUT');
});
test('fifth indexed color rejected',()=>{
 const value=fresh();value.assets=[{path:'assets/hero.json',type:'sprite',content:JSON.stringify({width:1,height:1,pixels:[4]})}];
 fails(()=>packCartridge(value),'PALETTE');
});
test('traversal and duplicate assets rejected',()=>{
 const value=fresh();value.assets=[{path:'assets/../../secret.txt',type:'text',content:'a'}];
 fails(()=>packCartridge(value),'ASSET_PATH');
 value.assets=[{path:'assets/AA.txt',type:'text',content:'a'},{path:'assets/aa.txt',type:'text',content:'b'}];
 fails(()=>packCartridge(value),'ASSET_PATH');
});
test('oversize code and wrong format rejected',()=>{
 const value=fresh();value.code="export default {s:'"+'x'.repeat(65536)+"'};";
 fails(()=>packCartridge(value),'CODE_SIZE');value.code=code;value.format='bad';
 fails(()=>packCartridge(value),'FORMAT');
});
test('runtime imports and browser APIs rejected by static scan',()=>{
 const value=fresh();value.code='import x from "remote"; export default {}';
 fails(()=>packCartridge(value),'CODE_IMPORT');
 value.code='fetch("https://example.com"); export default {}';
 fails(()=>packCartridge(value),'CODE_API');
 fails(()=>compileGameSource('import {x} from "remote";export default x'),'CODE_IMPORT');
});
test('decompression bombs are bounded',()=>{
 fails(()=>unpackCartridge(gzipSync(Buffer.alloc(2*1024*1024+100))),'EXPANDED_SIZE');
});
test('independent TypeScript game compiles and packs',async()=>{
 const source=await readFile(new URL('../examples/tiny-catcher/src/game.ts',import.meta.url),'utf8');
 const code=compileGameSource(source);assert.match(code,/export default game/);
 const packed=packCartridge({...fresh(),code});assert.equal(unpackCartridge(packed).manifest.id,'tiny-catcher');
});
