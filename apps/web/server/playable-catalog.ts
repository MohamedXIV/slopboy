import {neon} from '@neondatabase/serverless';
import {isGameUuid,type PlayableGame} from '@slopboy/catalog';
import {READ_PLAYABLE_GAME_SQL} from './playable-catalog-query';

/** Resolve only reviewed published games and their matching immutable bundle.
 * Draft manifests and storage keys never leave this server function. */
export async function readPlayableGame(routeId:string):Promise<PlayableGame|null>{
  if(!isGameUuid(routeId)&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeId))return null;
  const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_UNAVAILABLE');
  const sql=neon(url);
  const rows=await sql.query(READ_PLAYABLE_GAME_SQL,[routeId,isGameUuid(routeId)]);
  const row=rows[0];if(!row)return null;
  const manifest=row.manifest as {id?:unknown;hardware?:{id?:unknown;version?:unknown};controls?:unknown};
  const digest=String(row.content_digest),id=String(row.id),revisionId=String(row.revision_id);
  const path='/cartridges/by-sha256/'+digest+'.slop';
  if(!isGameUuid(id)||!isGameUuid(revisionId)||!/^[0-9a-f]{64}$/.test(digest)||
    row.storage_key!=='static-public-v1:'+path||!manifest||
    typeof manifest.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)||
    manifest.hardware?.id!=='slopboy-1000'||typeof manifest.hardware.version!=='string'||
    !Array.isArray(manifest.controls)||!manifest.controls.every(x=>typeof x==='string'&&['UP','DOWN','LEFT','RIGHT','A','B','START','SELECT'].includes(x))||
    typeof row.title!=='string'||typeof row.genre!=='string')return null;
  return {gameId:id,revisionId,legacySlug:manifest.id,title:row.title,
    tagline:typeof row.tagline==='string'?row.tagline:'',description:typeof row.description==='string'?row.description:'',
    genre:row.genre,hardware:{id:manifest.hardware.id,version:manifest.hardware.version},controls:manifest.controls,
    cartridge:path as `/cartridges/${string}.slop`,artwork:{background:'#dce9a3',foreground:'#254637',emblem:'◆'},status:'curated'};
}
