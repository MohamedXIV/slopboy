import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {encodeCatalogCursor,type CatalogPage} from './catalog-contract';
import {LIST_PUBLIC_GAMES_SQL,READ_VISIBLE_GAME_SQL} from './catalog-queries';

export interface CatalogGameMetadata{
  readonly id:string;readonly title:string;readonly tagline:string|null;
  readonly description:string|null;readonly genre:string;
  readonly visibility:string;readonly status:string;readonly revisionId:string|null;
  readonly engineId:string|null;readonly engineVersion:string|null;
  readonly deviceProfile:string|null;readonly updatedAt:string;
  readonly isOwner:boolean;
}
type CatalogRow=Record<string,unknown>;

function catalogDatabase(){
  const url=process.env.DATABASE_URL;
  if(!url)return null;
  try{
    const parsed=new URL(url);
    if(!['postgresql:','postgres:'].includes(parsed.protocol)||!parsed.hostname)return null;
    return neon(url);
  }catch{return null;}
}
export function catalogDatabaseConfigured():boolean{return catalogDatabase()!==null;}
export class CatalogUnavailableError extends Error{
  constructor(){super('DATABASE_UNAVAILABLE');this.name='CatalogUnavailableError';}
}
function mapRow(row:CatalogRow):CatalogGameMetadata{
  if(typeof row.id!=='string'||!isGameUuid(row.id)||typeof row.title!=='string'||
    typeof row.genre!=='string'||typeof row.updated_at!=='string')
    throw new CatalogUnavailableError();
  const nullable=(value:unknown):string|null=>typeof value==='string'?value:null;
  return {id:row.id,title:row.title,tagline:nullable(row.tagline),
    description:nullable(row.description),genre:row.genre,
    visibility:String(row.visibility),status:String(row.status),
    revisionId:nullable(row.revision_id),engineId:nullable(row.engine_id),
    engineVersion:nullable(row.engine_version),deviceProfile:nullable(row.device_profile),
    updatedAt:row.updated_at,isOwner:row.is_owner===true};
}
export async function listPublicCatalog(page:CatalogPage){
  const db=catalogDatabase();if(!db)throw new CatalogUnavailableError();
  // The extra row establishes whether there really is a further page.
  const rows=await db.query(LIST_PUBLIC_GAMES_SQL,[
    page.cursor?.createdAt??null,page.cursor?.gameId??null,page.limit+1,
  ]);
  const visible=rows.slice(0,page.limit);
  const games=visible.map(row=>mapRow(row as CatalogRow));
  const last=visible[visible.length-1] as CatalogRow|undefined;
  const nextCursor=rows.length>page.limit&&last&&
    typeof last.cursor_created_at==='string'&&typeof last.id==='string'?
    encodeCatalogCursor({createdAt:last.cursor_created_at,gameId:last.id}):null;
  return {games,nextCursor};
}
export async function readVisibleCatalogGame(id:string,subjectId:string|null):Promise<CatalogGameMetadata|null>{
  if(!isGameUuid(id))return null;
  const db=catalogDatabase();if(!db)throw new CatalogUnavailableError();
  const rows=await db.query(READ_VISIBLE_GAME_SQL,[id,subjectId]);
  const row=rows[0];
  return row?mapRow(row as CatalogRow):null;
}
