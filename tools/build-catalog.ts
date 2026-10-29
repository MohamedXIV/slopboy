/**
 * Curated release builder. This script accepts no contributor-controlled paths.
 * Creator submissions are data-only and must pass human review before catalog inclusion.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {GAMES} from '../packages/catalog/src/index.ts';
import {compileGameSource,packCartridge,unpackCartridge,validateManifest} from '../packages/cartridge/src/index.ts';

const ROOT=resolve(import.meta.dirname,'..');
const DEST=resolve(ROOT,'apps/web/public/cartridges');
async function release(action:'build'|'verify'):Promise<void>{
  const ids=new Set<string>();
  const known=new Set<string>();
  for (const entry of GAMES) {
    if(ids.has(entry.id))throw Error('Duplicate catalog ID: '+entry.id);
    ids.add(entry.id);
    const expected='/cartridges/'+entry.id+'.slop';
    if(entry.cartridge!==expected)throw Error('Invalid cartridge name for '+entry.id);
    const readSource=(relative:string)=>{
      if(!/^examples\/[a-z0-9-]+\/(?:src\/game\.ts|manifest\.json)$/.test(relative))throw Error('Untrusted source path');
      if(!relative.startsWith('examples/'+entry.id+'/'))throw Error('Source path does not match catalog');
      return readFile(resolve(ROOT,relative),'utf8');
    };
    const output=resolve(DEST,basename(entry.cartridge));
    known.add(basename(output));
    const declared=JSON.parse(await readSource(entry.source.manifest));
    const {manifest}=validateManifest(declared);
    if(manifest.id!==entry.id||manifest.title!==entry.title||
      manifest.hardware.id!==entry.hardware.id||manifest.hardware.version!==entry.hardware.version||
      JSON.stringify(manifest.controls)!==JSON.stringify(entry.controls))throw Error('Catalog manifest mismatch: '+entry.id);
    const code=compileGameSource(await readSource(entry.source.game));
    const bytes=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    const decoded=unpackCartridge(bytes);
    if(decoded.manifest.id!==entry.id)throw Error('Generated cartridge identity mismatch');
    if(action==='build'){
      await mkdir(dirname(output),{recursive:true});
      await writeFile(output,bytes);
    } else {
      const existing=await readFile(output);
      if(!existing.equals(bytes))throw Error('Released cartridge bytes differ from source: '+entry.id);
    }
    console.info(action+': '+entry.id+' ('+bytes.byteLength+' bytes)');
  }
  if(action==='verify'){
    const actual=(await readdir(DEST)).filter(f=>f.endsWith('.slop')).sort();
    if(actual.length!==known.size||actual.some(f=>!known.has(f)))throw Error('Unlisted cartridge in release output');
  }
}
const action=process.argv[2];
if(action!=='build'&&action!=='verify'){console.error('Usage: build-catalog.ts build|verify');process.exitCode=1;}
else release(action).catch(e=>{console.error(e);process.exitCode=1;});
