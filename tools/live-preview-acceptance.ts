/**
 * Live, unauthenticated Neon Development Preview acceptance.
 *
 * Read-only and fail-closed: never tries to sign in, mutates server data or
 * sends a session cookie. A Vercel protection bypass token can be provided in
 * the caller's environment; it is never displayed or persisted.
 *
 * This is NOT a verified-owner/stranger authenticated acceptance test.
 */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAMES} from '../packages/catalog/src/index.ts';

export interface PreviewAcceptanceOptions {
  readonly baseUrl:string;
  readonly fetcher?:typeof fetch;
  readonly protectionBypass?:string;
}
export interface PreviewAcceptanceCheck {
  readonly route:string;
  readonly status:number;
}
export interface PreviewAcceptanceResult {
  readonly checks:readonly PreviewAcceptanceCheck[];
}

/** The CLI must not accidentally probe a production or local domain. */
export function checkedPreviewOrigin(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw Error('INVALID_PREVIEW_URL');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    url.pathname!=='/'||!url.hostname.endsWith('.vercel.app')||
    url.hostname==='vercel.app'||url.port){
    throw Error('INVALID_PREVIEW_URL');
  }
  return url.origin;
}

export async function acceptAnonymousPreview({
  baseUrl,fetcher=fetch,protectionBypass
}:PreviewAcceptanceOptions):Promise<PreviewAcceptanceResult>{
  const origin=checkedPreviewOrigin(baseUrl);
  const checks:PreviewAcceptanceCheck[]=[];
  async function read(route:string,expectedStatus:number){
    const headers:Record<string,string>={'Accept':'application/json'};
    if(protectionBypass)headers['x-vercel-protection-bypass']=protectionBypass;
    const response=await fetcher(origin+route,{
      method:'GET',headers,redirect:'manual',cache:'no-store',credentials:'omit'
    });
    if(response.status!==expectedStatus||
      !response.headers.get('content-type')?.includes('application/json')){
      throw Error('PREVIEW_HTTP_MISMATCH '+route+' status='+response.status);
    }
    if(!response.headers.get('cache-control')?.includes('no-store')&&
      !route.startsWith('/api/auth/')){
      throw Error('PREVIEW_CACHE_MISMATCH '+route);
    }
    let body:unknown;
    try{body=await response.json();}catch{throw Error('PREVIEW_NON_JSON '+route);}
    checks.push({route,status:response.status});
    return body;
  }
  const publicCatalog=await read('/api/games?limit=4',200);
  assert.deepEqual(publicCatalog,{games:[],nextCursor:null},
    'The development catalog must still have zero published releases');
  const anonymousSession=await read('/api/auth/get-session',200);
  assert.equal(anonymousSession,null,'No anonymous identity may be fabricated');
  for(const game of GAMES){
    const route='/api/games/'+game.gameId;
    assert.deepEqual(await read(route,404),{error:'NOT_FOUND'},
      'The reviewed static bundles do not authorize private metadata');
  }
  assert.deepEqual(await read('/api/games?limit=0',400),
    {error:'INVALID_LIMIT'});
  assert.deepEqual(await read('/api/account/games',401),
    {error:'UNAUTHENTICATED'},'The dashboard must require a session');
  assert.deepEqual(await read('/api/account/games?ownerId=00000000-0000-4000-a000-000000000001',401),
    {error:'UNAUTHENTICATED'},'Client ownerId can never authorize a read');
  assert.deepEqual(await read('/api/account/games/'+GAMES[0].gameId+'/revisions',401),
    {error:'UNAUTHENTICATED'},'Revision history must require a session');
  assert.deepEqual(await read('/api/account/me',401),
    {error:'UNAUTHENTICATED'},'No account object can be returned to a guest');
  return {checks};
}

async function main(){
  const baseUrl=process.env.SLOPBOY_PREVIEW_URL;
  if(!baseUrl)throw Error('SLOPBOY_PREVIEW_URL must name a HTTPS *.vercel.app Preview');
  const result=await acceptAnonymousPreview({
    baseUrl,
    protectionBypass:process.env.SLOPBOY_PREVIEW_PROTECTION_BYPASS
  });
  for(const check of result.checks){
    console.log('PASS',check.status,check.route);
  }
  console.log('Anonymous Neon Preview acceptance PASS; authenticated owner/stranger acceptance not tested');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
