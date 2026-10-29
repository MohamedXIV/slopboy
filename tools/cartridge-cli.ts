import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {compileGameSource,packCartridge,unpackCartridge,type Manifest} from '../packages/cartridge/src/index.ts';
async function run(args:string[]):Promise<void>{
 const [command,...rest]=args;
 if(command==='build'&&rest.length===3){
  const [manifestFile,sourceFile,outputFile]=rest;
  const manifest=JSON.parse(await readFile(manifestFile,'utf8')) as Manifest;
  const code=compileGameSource(await readFile(sourceFile,'utf8'));
  const bytes=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
  await mkdir(dirname(outputFile),{recursive:true});await writeFile(outputFile,bytes);
  console.info('Built '+outputFile+' ('+bytes.byteLength+' bytes)');return;
 }
 if(command==='verify'&&rest.length===1){
  const c=unpackCartridge(await readFile(rest[0]));
  console.info('Verified '+c.manifest.id+' for '+c.manifest.hardware.id+'@'+c.manifest.hardware.version);
  return;
 }
 throw Error('Usage: cartridge-cli.ts build <manifest.json> <game.ts> <output.slop> | verify <file.slop>');
}
run(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
