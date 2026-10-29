/** Offline-only Creator Kit. Validation, compilation and packaging never execute game JS. */
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,lstat,readFile,realpath,rename,rm,writeFile} from 'node:fs/promises';
import {resolve,join,relative,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
import {compileGameSource,packCartridge,unpackCartridge,validateManifest,CartridgeError} from '../packages/cartridge/src/index.ts';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SDK_PATH=resolve(ROOT,'packages/sdk/src/index.ts');
const ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_MANIFEST_BYTES=16*1024;
const MAX_SOURCE_BYTES=128*1024;

export class CreatorError extends Error{
  constructor(readonly code:string, message:string){super(code+': '+message);this.name='CreatorError';}
}
function checkedId(id:string):void{
  if(!ID.test(id)||id.length>64)throw new CreatorError('PROJECT_ID','Use 1–64 lowercase letters, digits and hyphens');
}
function pathsFor(id:string,base:string){
  checkedId(id);
  const folder=resolve(base,'creations',id);
  return {folder,manifest:join(folder,'manifest.json'),source:join(folder,'src/game.ts'),output:join(folder,'dist',id+'.slop')};
}
async function regularSafeFile(file:string,folder:string):Promise<void>{
  const root=await realpath(folder);
  const resolved=await realpath(file);
  if(!resolved.startsWith(root+sep))throw new CreatorError('SOURCE_PATH','Source must stay within its own project');
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new CreatorError('SOURCE_PATH','Symlinks and non-files are not supported');
}
async function limitedText(file:string,folder:string,max:number):Promise<string>{
  await regularSafeFile(file,folder);
  const data=await readFile(file);
  if(data.byteLength>max)throw new CreatorError('SOURCE_SIZE','Input source exceeds '+max+' bytes');
  return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
export const STARTER_GAME=[
  "import type { GameModule } from '@slopboy/sdk';",
  "",
  "// Author-owned cartridge. No DOM, network or runtime imports.",
  "let playerX = 76;",
  "let counter = 0;",
  "const game: GameModule = {",
  "  init() { playerX = 76; counter = 0; },",
  "  update(ctx, dt) {",
  "    const speed = 60 * Math.min(Math.max(dt, 0), 0.05);",
  "    if (ctx.input.down('LEFT')) playerX = Math.max(0, playerX - speed);",
  "    if (ctx.input.down('RIGHT')) playerX = Math.min(152, playerX + speed);",
  "    if (ctx.input.pressed('A')) counter = (counter + 1) % 18;",
  "  },",
  "  draw(ctx) {",
  "    ctx.screen.clear(0);",
  "    ctx.screen.rect(0, 138, 160, 6, 1);",
  "    ctx.screen.rect(playerX, 124, 8, 8, 3);",
  "    for (let i = 0; i < counter; i++) ctx.screen.rect(3 + i * 8, 8, 5, 5, 2);",
  "  }",
  "};",
  "export default game;",
  ""
].join('\n');

export async function scaffoldCreator(id:string,base=ROOT){
  const p=pathsFor(id,base);
  await mkdir(resolve(base,'creations'),{recursive:true});
  await mkdir(p.folder); // fails closed rather than overwrite an existing project
  await mkdir(dirname(p.source));
  const manifest={
    id,title:id.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join(' '),
    hardware:{id:SLOPBOY_1000.id,version:SLOPBOY_1000.version},
    controls:['LEFT','RIGHT','A'],achievements:[]
  };
  await writeFile(p.manifest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  await writeFile(p.source,STARTER_GAME,{flag:'wx'});
  return {project:id,path:relative(base,p.folder).split(sep).join('/'),hardware:SLOPBOY_1000.id};
}

function typecheck(sourceFile:string):void{
  const options:ts.CompilerOptions={
    strict:true,noEmit:true,skipLibCheck:true,
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
    types:[],lib:['lib.es2022.d.ts'],baseUrl:ROOT,
    paths:{'@slopboy/sdk':[SDK_PATH]}
  };
  const program=ts.createProgram([sourceFile],options);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.length){
    const info=diagnostics.slice(0,5).map(d=>{
      const loc=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):null;
      return (loc?'line '+(loc.line+1)+': ':'')+ts.flattenDiagnosticMessageText(d.messageText,' ');
    }).join(' | ');
    throw new CreatorError('CODE_TYPECHECK',info);
  }
}
export interface CreatorReport{
  readonly ok:true;
  readonly project:string;
  readonly hardware:string;
  readonly profileVersion:string;
  readonly packageBytes:number;
  readonly codeBytes:number;
  readonly sha256:string;
  readonly achievements:number;
  readonly approved:false;
}
async function prepare(id:string,base:string){
  const p=pathsFor(id,base);
  const projectStat=await lstat(p.folder);
  if(!projectStat.isDirectory()||projectStat.isSymbolicLink())throw new CreatorError('SOURCE_PATH','Project directory invalid');
  const manifest=JSON.parse(await limitedText(p.manifest,p.folder,MAX_MANIFEST_BYTES));
  const contract=validateManifest(manifest);
  if(contract.manifest.id!==id)throw new CreatorError('PROJECT_ID','Manifest ID must match project directory');
  const codeSource=await limitedText(p.source,p.folder,MAX_SOURCE_BYTES);
  // Screen source with the cartridge AST gate; semantic check catches SDK API misuses.
  const code=compileGameSource(codeSource);
  typecheck(p.source);
  const packed=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
  const parsed=unpackCartridge(packed);
  if(parsed.manifest.id!==id)throw new CreatorError('CARTRIDGE','Output identity mismatch');
  const report:CreatorReport={
    ok:true,project:id,hardware:contract.hardware.id,profileVersion:contract.hardware.version,
    packageBytes:packed.byteLength,codeBytes:Buffer.byteLength(code,'utf8'),
    sha256:createHash('sha256').update(packed).digest('hex'),
    achievements:contract.manifest.achievements.length,approved:false
  };
  return {p,packed,report};
}
export async function checkCreator(id:string,base=ROOT):Promise<CreatorReport>{
  return (await prepare(id,base)).report;
}
export async function buildCreator(id:string,base=ROOT):Promise<CreatorReport>{
  const {p,packed,report}=await prepare(id,base);
  await mkdir(dirname(p.output),{recursive:true});
  const temp=p.output+'.partial-'+process.pid;
  try{await writeFile(temp,packed,{flag:'wx'});await rename(temp,p.output);}
  finally{await rm(temp,{force:true});}
  return report;
}
export async function verifyCreator(id:string,base=ROOT):Promise<CreatorReport>{
  const {p,packed,report}=await prepare(id,base);
  await regularSafeFile(p.output,p.folder);
  const actual=await readFile(p.output);
  if(!actual.equals(packed))throw new CreatorError('STALE_BUILD','Cartridge differs from validated source; rebuild it');
  return report;
}
