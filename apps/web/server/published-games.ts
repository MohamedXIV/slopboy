/**
 * Server-owned runtime resolver. This first implementation proves that a UUID
 * absent during next build can resolve at request time, without public uploads.
 * SLOPBOY_RUNTIME_FIXTURES_JSON is a trusted deployment-only QA adapter:
 * records may bind ONLY to one of the reviewed bundled pixel-v1 cartridges.
 * Replace this adapter with the publication database in the backend sprint.
 */
import {GAMES,getCatalogGame,getLegacyCatalogGame,isGameUuid,type PlayableGame}
  from '@slopboy/catalog';

export const RUNTIME_FIXTURES_ENV='SLOPBOY_RUNTIME_FIXTURES_JSON';
const MAX_RUNTIME_FIXTURES=16;
interface RuntimeFixture{
  readonly gameId:string;
  readonly revisionId:string;
  readonly title:string;
  readonly reviewedCartridgeSlug:string;
}
function parseFixture(raw:unknown):RuntimeFixture|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const o=raw as Record<string,unknown>;
  if(typeof o.gameId!=='string'||!isGameUuid(o.gameId)||typeof o.revisionId!=='string'||
      !isGameUuid(o.revisionId)||o.gameId===o.revisionId||
      typeof o.title!=='string'||o.title.trim().length<1||o.title.length>90||
      typeof o.reviewedCartridgeSlug!=='string'||!getLegacyCatalogGame(o.reviewedCartridgeSlug))
    return null;
  return {gameId:o.gameId,revisionId:o.revisionId,title:o.title.trim(),
    reviewedCartridgeSlug:o.reviewedCartridgeSlug};
}
export function parseRuntimeFixtureRegistry(value:string|undefined):readonly RuntimeFixture[]{
  if(!value)return [];
  let raw:unknown;
  try{raw=JSON.parse(value);}catch{return [];}
  if(!Array.isArray(raw)||raw.length>MAX_RUNTIME_FIXTURES)return [];
  const seen=new Set(GAMES.map(game=>game.gameId));
  const revisions=new Set(GAMES.map(game=>game.revisionId));
  const entries:RuntimeFixture[]=[];
  for(const item of raw){
    const game=parseFixture(item);
    // Fail the entire registry closed rather than silently publishing a subset.
    if(!game||seen.has(game.gameId)||revisions.has(game.revisionId)||seen.has(game.revisionId)||
        revisions.has(game.gameId))return [];
    seen.add(game.gameId);revisions.add(game.revisionId);entries.push(game);
  }
  return entries;
}
export function resolvePublishedGame(gameId:string,registry=process.env[RUNTIME_FIXTURES_ENV]):PlayableGame|undefined{
  if(!isGameUuid(gameId))return undefined;
  const curated=getCatalogGame(gameId);
  if(curated)return curated;
  const fixture=parseRuntimeFixtureRegistry(registry).find(item=>item.gameId===gameId);
  if(!fixture)return undefined;
  const reviewed=getLegacyCatalogGame(fixture.reviewedCartridgeSlug);
  if(!reviewed)return undefined;
  return {...reviewed,gameId:fixture.gameId,revisionId:fixture.revisionId,
    title:fixture.title,status:'runtime-fixture'};
}
