/**
 * Host-neutral runtime Next.js PWA builder. Generate public/sw.js BEFORE next
 * build so Vercel and a future Render Node host both serve the same worker.
 * No static export, .next internals, user data or signed URLs are inspected.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAMES} from '../packages/catalog/src/index.ts';

const ROOT=resolve(import.meta.dirname,'..');
const PUBLIC=resolve(ROOT,'apps/web/public');
const SOURCE=resolve(import.meta.dirname,'offline-worker-source.js');
export const OFFLINE_SHELL_PATHS=['/','/library','/manifest.webmanifest',
  '/icons/slopboy-192.png','/icons/slopboy-512.png'] as const;
const HASH_FILES=['/icons/slopboy-192.png','/icons/slopboy-512.png'] as const;
export function renderServiceWorker(source:string,revision:string):string{
  if(!/^[0-9a-f]{16}$/.test(revision))throw Error('Invalid offline release revision');
  if(!source.includes('__RELEASE__')||!source.includes('__CURATED__'))throw Error('Incomplete offline worker template');
  const seeds=GAMES.map(({gameId,revisionId,title,legacySlug,cartridge})=>({
    format:'slopboy-public-game-v1',gameId,revisionId,title,manifestId:legacySlug,cartridge
  }));
  return source.replace('__RELEASE__',revision).replace('__CURATED__',JSON.stringify(seeds));
}
export async function buildOffline():Promise<{revision:string;bytes:number;games:number}>{
  const template=await readFile(SOURCE,'utf8');
  const hash=createHash('sha256').update(template);
  let bytes=0;
  for(const path of HASH_FILES){
    const data=await readFile(resolve(PUBLIC,path.slice(1)));
    bytes+=data.byteLength;hash.update(path);hash.update(data);
  }
  const releases=await readdir(resolve(PUBLIC,'cartridges'));
  const expected=GAMES.map(game=>game.cartridge.slice('/cartridges/'.length)).sort();
  const actual=releases.filter(path=>path.endsWith('.slop')).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Offline review list does not match built cartridges');
  for(const game of GAMES){
    const data=await readFile(resolve(PUBLIC,game.cartridge.slice(1)));
    bytes+=data.byteLength;hash.update(game.gameId);hash.update(game.revisionId);hash.update(data);
  }
  const revision=hash.digest('hex').slice(0,16);
  const script=renderServiceWorker(template,revision);
  await writeFile(resolve(PUBLIC,'sw.js'),script,'utf8');
  await writeFile(resolve(PUBLIC,'offline-build.json'),
    JSON.stringify({release:revision,shell:OFFLINE_SHELL_PATHS,reviewed:expected,bytes},null,2)+'\n','utf8');
  return {revision,bytes,games:GAMES.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  buildOffline().then(result=>console.log('Offline runtime PWA:',result))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
