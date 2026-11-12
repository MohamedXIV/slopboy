/**
 * Version-addressed delivery of already-reviewed public pixel-v1 cartridges.
 * No private drafts, network, database writes, or new runnable game code.
 *
 * These files are copies of the three vetted /cartridges/<slug>.slop bundles.
 * The filename is derived from the SHA-256 locked to the immutable revision UUID.
 * Unrelated games must use the separate private artifact-upload review path.
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {attestCuratedRelease} from './attest-curated-revisions.ts';

const ROOT=resolve(import.meta.dirname,'..');
const SHA256=/^[0-9a-f]{64}$/;
export const IMMUTABLE_CURATED_PREFIX='/cartridges/by-sha256/';

export interface ImmutableCuratedArtifact {
  readonly gameId:string;
  readonly revisionId:string;
  readonly sha256:string;
  readonly byteSize:number;
  readonly path:string;
}

export function immutableCuratedPath(digest:string):string{
  if(!SHA256.test(digest))throw Error('Invalid immutable cartridge digest');
  return IMMUTABLE_CURATED_PREFIX+digest+'.slop';
}

export async function prepareImmutableCuratedAssets(options:{
  readonly rootDir?:string;
  readonly mode:'build'|'verify';
}):Promise<readonly ImmutableCuratedArtifact[]>{
  const root=options.rootDir??ROOT;
  // Recompile the original sources and verify the legacy delivered bytes
  // against the independently pinned immutable SHA-256 revision lock first.
  const evidence=await attestCuratedRelease({rootDir:root,verifyBundled:true});
  const result:ImmutableCuratedArtifact[]=[];
  for(const item of evidence){
    const source=await readFile(resolve(root,'apps/web/public'+item.bundledPath));
    const digest=createHash('sha256').update(source).digest('hex');
    if(digest!==item.contentDigest||source.byteLength!==item.byteSize){
      throw Error('Curated cartridge hash changed during immutable delivery: '+item.legacySlug);
    }
    const path=immutableCuratedPath(digest);
    const target=resolve(root,'apps/web/public'+path);
    let existing:Buffer|null=null;
    try{existing=await readFile(target);}catch(e){
      if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
    }
    if(existing===null&&options.mode==='verify'){
      throw Error('Immutable cartridge missing: '+item.revisionId);
    }
    if(existing===null){
      await mkdir(dirname(target),{recursive:true});
      // Never clobber an existing content-addressed object.
      try{await writeFile(target,source,{flag:'wx'});}
      catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
      existing=await readFile(target);
    }
    if(!existing.equals(source))throw Error('Immutable cartridge collision or overwrite: '+item.revisionId);
    result.push({
      gameId:item.gameId,revisionId:item.revisionId,sha256:digest,
      byteSize:source.byteLength,path
    });
  }
  return result;
}
async function main():Promise<void>{
  const command=process.argv[2];
  if(process.argv.length!==3||(command!=='build'&&command!=='verify')){
    throw Error('Usage: build-curated-immutable.ts build|verify');
  }
  const records=await prepareImmutableCuratedAssets({mode:command});
  for(const item of records){
    console.log('IMMUTABLE '+command+' '+item.revisionId+' '+item.path+' '+item.byteSize+' bytes');
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
