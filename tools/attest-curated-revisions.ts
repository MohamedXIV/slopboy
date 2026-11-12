/**
 * Read-only evidence for the three already-reviewed, statically bundled
 * pixel-v1 cartridges. Does not publish games, touch Neon, or issue storage
 * credentials. SHA-256 is computed from the actual compressed .slop bytes.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAMES,isGameUuid,type CatalogGame} from '../packages/catalog/src/index.ts';
import {compileGameSource,packCartridge,unpackCartridge,validateManifest,type Manifest}
  from '../packages/cartridge/src/index.ts';
import {SYSTEM_CURATOR_USER_ID} from '../packages/database/src/schema.ts';

const ROOT=resolve(import.meta.dirname,'..');
const HEX_SHA256=/^[0-9a-f]{64}$/;

export interface CuratedRevisionEvidence {
  readonly gameId:string;
  readonly revisionId:string;
  readonly revisionNumber:1;
  readonly legacySlug:string;
  readonly engineId:'pixel-v1';
  readonly engineVersion:'0.1.0';
  readonly deviceProfile:string;
  readonly createdBy:string;
  readonly manifest:Manifest;
  readonly contentDigest:string;
  readonly byteSize:number;
  readonly artifact:{
    readonly artifactType:'bundle';
    readonly path:string;
    readonly sha256:string;
    readonly byteSize:number;
    readonly mimeType:'application/octet-stream';
  };
  /** Current reviewed static delivery path; NOT a Neon object-storage key. */
  readonly bundledPath:string;
  /** Evidence is not publication/review approval. */
  readonly intendedStatus:'draft';
}

interface PinnedRevision{
  readonly gameId:string;
  readonly revisionId:string;
  readonly sha256:string;
  readonly byteSize:number;
}

/** A revision's known-reviewed digest is pinned independently of rebuilt source. */
async function pinnedRevisions():Promise<readonly PinnedRevision[]>{
  const value:unknown=JSON.parse(await readFile(
    resolve(ROOT,'packages/catalog/curated-revision-lock.json'),'utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid revision lock');
  const lock=value as Record<string,unknown>;
  if(lock.schemaVersion!==1||!Array.isArray(lock.revisions)||
      lock.revisions.length!==GAMES.length)throw Error('Incomplete revision lock');
  const pinned:PinnedRevision[]=[];
  for(const entry of lock.revisions){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Invalid revision lock entry');
    const row=entry as Record<string,unknown>;
    if(typeof row.gameId!=='string'||typeof row.revisionId!=='string'||
        typeof row.sha256!=='string'||!HEX_SHA256.test(row.sha256)||
        typeof row.byteSize!=='number'||!Number.isSafeInteger(row.byteSize)||row.byteSize<=0||
        Object.keys(row).sort().join(',')!=='byteSize,gameId,revisionId,sha256'){
      throw Error('Malformed revision lock entry');
    }
    const game=GAMES.find(g=>g.gameId===row.gameId&&g.revisionId===row.revisionId);
    if(!game||pinned.some(p=>p.gameId===row.gameId))throw Error('Unknown or duplicate revision lock');
    pinned.push(row as unknown as PinnedRevision);
  }
  return pinned;
}

interface AttestationOptions {
  readonly rootDir?:string;
  /** Require the deployed-build .slop to match freshly rebuilt source bytes. */
  readonly verifyBundled?:boolean;
}

export async function attestCuratedRevision(
  game:CatalogGame,options:AttestationOptions={}
):Promise<CuratedRevisionEvidence>{
  const root=options.rootDir??ROOT;
  const slug=game.legacySlug;
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||
      !isGameUuid(game.gameId)||!isGameUuid(game.revisionId)||
      game.gameId===game.revisionId||
      game.source.manifest!==`examples/${slug}/manifest.json`||
      game.source.game!==`examples/${slug}/src/game.ts`||
      game.cartridge!==`/cartridges/${slug}.slop`){
    throw Error('Untrusted curated fixture identity or source path');
  }
  const manifestRaw:unknown=JSON.parse(await readFile(
    resolve(root,game.source.manifest),'utf8'));
  const {manifest}=validateManifest(manifestRaw);
  if(manifest.id!==slug||manifest.hardware.id!==game.hardware.id||
      manifest.hardware.version!==game.hardware.version||
      JSON.stringify(manifest.controls)!==JSON.stringify(game.controls)){
    throw Error('Curated source manifest does not match catalog contract: '+slug);
  }
  const code=compileGameSource(await readFile(resolve(root,game.source.game),'utf8'));
  const rebuilt=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
  const bytes=options.verifyBundled?
    await readFile(resolve(root,'apps/web/public'+game.cartridge)):rebuilt;
  if(!bytes.equals(rebuilt))throw Error('Bundled cartridge differs from reviewed source: '+slug);
  const decoded=unpackCartridge(bytes);
  if(decoded.manifest.id!==slug||
      !isDeepStrictEqual(decoded.manifest,manifest)){
    throw Error('Bundled cartridge manifest changed: '+slug);
  }
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(!HEX_SHA256.test(digest))throw Error('Invalid SHA-256 digest');
  const pinned=(await pinnedRevisions()).find(p=>p.gameId===game.gameId&&p.revisionId===game.revisionId);
  if(!pinned||pinned.sha256!==digest||pinned.byteSize!==bytes.byteLength){
    throw Error('Immutable curated revision changed: '+slug+'; create and review a new revision ID');
  }
  return {
    gameId:game.gameId,revisionId:game.revisionId,revisionNumber:1,
    legacySlug:slug,engineId:'pixel-v1',engineVersion:'0.1.0',
    deviceProfile:game.hardware.id,createdBy:SYSTEM_CURATOR_USER_ID,
    manifest,contentDigest:digest,byteSize:bytes.byteLength,
    artifact:{artifactType:'bundle',path:slug+'.slop',sha256:digest,
      byteSize:bytes.byteLength,mimeType:'application/octet-stream'},
    bundledPath:game.cartridge,intendedStatus:'draft'
  };
}

export async function attestCuratedRelease(
  options:AttestationOptions={}
):Promise<readonly CuratedRevisionEvidence[]>{
  const games=new Set<string>(),revisions=new Set<string>(),slugs=new Set<string>();
  for(const game of GAMES){
    if(games.has(game.gameId)||revisions.has(game.revisionId)||
        slugs.has(game.legacySlug)){
      throw Error('Duplicate curated game or revision identity');
    }
    games.add(game.gameId);revisions.add(game.revisionId);slugs.add(game.legacySlug);
  }
  return Promise.all(GAMES.map(game=>attestCuratedRevision(game,options)));
}

async function main():Promise<void>{
  const arg=process.argv.slice(2);
  if(arg.length!==1||!['--verify','--json'].includes(arg[0])){
    throw Error('Usage: attest-curated-revisions.ts --verify|--json');
  }
  const evidence=await attestCuratedRelease({verifyBundled:true});
  if(arg[0]==='--json'){
    console.log(JSON.stringify({schemaVersion:1,publicationEligible:false,revisions:evidence},null,2));
  }else{
    for(const e of evidence){
      console.log(`ATTESTED ${e.legacySlug} ${e.revisionId} sha256=${e.contentDigest} bytes=${e.byteSize} status=draft`);
    }
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
