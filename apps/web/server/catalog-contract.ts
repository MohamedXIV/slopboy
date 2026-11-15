/** Stable server-side public catalog cursors; never trust caller-provided SQL or owner IDs. */
import {isGameUuid} from '@slopboy/catalog';

export const CATALOG_MAX_PAGE_SIZE=24;
export const CATALOG_DEFAULT_PAGE_SIZE=12;
export interface CatalogCursor {readonly createdAt:string;readonly gameId:string}
export interface CatalogPage {readonly limit:number;readonly cursor:CatalogCursor|null}
export type CatalogParseResult={readonly ok:true;readonly page:CatalogPage}|
  {readonly ok:false;readonly error:'INVALID_LIMIT'|'INVALID_CURSOR'};

export function encodeCatalogCursor(value:CatalogCursor):string{
  if(!isGameUuid(value.gameId)||!validTimestamp(value.createdAt))throw Error('INVALID_CURSOR');
  return Buffer.from(JSON.stringify([value.createdAt,value.gameId]),'utf8').toString('base64url');
}
function validTimestamp(value:unknown):value is string{
  return typeof value==='string'&&value.length<=48&&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)&&
    Number.isFinite(Date.parse(value));
}
export function decodeCatalogCursor(value:string):CatalogCursor|null{
  if(value.length<1||value.length>200||!/^[A-Za-z0-9_-]+$/.test(value))return null;
  try{
    const bytes=Buffer.from(value,'base64url');
    if(bytes.toString('base64url')!==value)return null;
    const decoded:unknown=JSON.parse(bytes.toString('utf8'));
    if(!Array.isArray(decoded)||decoded.length!==2||
      !validTimestamp(decoded[0])||typeof decoded[1]!=='string'||!isGameUuid(decoded[1]))return null;
    return {createdAt:decoded[0],gameId:decoded[1]};
  }catch{return null;}
}
export function parseCatalogPage(query:URLSearchParams):CatalogParseResult{
  const rawLimit=query.getAll('limit'),rawCursor=query.getAll('cursor');
  if(rawLimit.length>1||rawCursor.length>1)return {ok:false,error:'INVALID_LIMIT'};
  if(rawLimit.length===1&&!/^[1-9][0-9]{0,2}$/.test(rawLimit[0]))
    return {ok:false,error:'INVALID_LIMIT'};
  const limit=rawLimit.length?Number(rawLimit[0]):CATALOG_DEFAULT_PAGE_SIZE;
  if(limit>CATALOG_MAX_PAGE_SIZE)return {ok:false,error:'INVALID_LIMIT'};
  const cursor=rawCursor.length?decodeCatalogCursor(rawCursor[0]):null;
  if(rawCursor.length&&!cursor)return {ok:false,error:'INVALID_CURSOR'};
  return {ok:true,page:{limit,cursor}};
}
