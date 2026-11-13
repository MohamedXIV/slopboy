import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {
  acceptAnonymousPreview,checkedPreviewOrigin
} from '../tools/live-preview-acceptance.ts';

type Fixture={status:number;body:unknown;cache?:string;html?:boolean};
function fixtures():Map<string,Fixture>{
  const routes=new Map<string,Fixture>([
    ['/api/games?limit=4',{status:200,body:{games:[],nextCursor:null}}],
    ['/api/auth/get-session',{status:200,body:null}],
    ['/api/games?limit=0',{status:400,body:{error:'INVALID_LIMIT'}}],
    ['/api/account/games',{status:401,body:{error:'UNAUTHENTICATED'}}],
    ['/api/account/games?ownerId=00000000-0000-4000-a000-000000000001',
      {status:401,body:{error:'UNAUTHENTICATED'}}],
    ['/api/account/games/'+GAMES[0].gameId+'/revisions',
      {status:401,body:{error:'UNAUTHENTICATED'}}],
    ['/api/account/me',{status:401,body:{error:'UNAUTHENTICATED'}}]
  ]);
  for(const game of GAMES){
    routes.set('/api/games/'+game.gameId,{status:404,body:{error:'NOT_FOUND'}});
  }
  return routes;
}
function fakeHttp(entries:Map<string,Fixture>,records:{
  urls:string[];headers:Headers;credentials:RequestCredentials|undefined
}[]){
  return (async(input:string|URL|Request,options?:RequestInit)=>{
    const url=new URL(String(input));
    const item=entries.get(url.pathname+url.search);
    if(!item)throw Error('Unexpected preview request: '+url.pathname+url.search);
    const headers=new Headers(options?.headers);
    records.push({urls:[url.href],headers,credentials:options?.credentials});
    const responseHeaders=new Headers({
      'content-type':item.html?'text/html; charset=utf-8':'application/json',
      'cache-control':item.cache??'private, no-store'
    });
    return new Response(item.html?String(item.body):JSON.stringify(item.body),{
      status:item.status,headers:responseHeaders
    });
  }) as typeof fetch;
}

test('Preview acceptance requires explicit HTTPS deployment origin only',()=>{
  assert.equal(checkedPreviewOrigin('https://slopboy-qa.vercel.app/'),
    'https://slopboy-qa.vercel.app');
  for(const bad of [
    '', 'https://vercel.app','http://slopboy-qa.vercel.app/',
    'https://slopboy-qa.vercel.app/auth/sign-in',
    'https://slopboy-qa.vercel.app/?secret=1',
    'https://user:pass@slopboy-qa.vercel.app/',
    'https://slopboy-qa.vercel.app:8000/',
    'https://slopboy.example.com/',
    'https://localhost:3000/'
  ])assert.throws(()=>checkedPreviewOrigin(bad),/INVALID_PREVIEW_URL/,bad);
});

test('real HTTP acceptance contract detects configured Neon without leaking private draft metadata',async()=>{
  const records:Parameters<typeof fakeHttp>[1]=[];
  const checks=await acceptAnonymousPreview({
    baseUrl:'https://slopboy-qa.vercel.app/',
    protectionBypass:'private-qa-bypass',
    fetcher:fakeHttp(fixtures(),records)
  });
  assert.equal(checks.checks.length,10);
  assert.equal(records.length,10);
  assert.ok(records.every(x=>x.credentials==='omit'));
  assert.ok(records.every(x=>x.urls.every(u=>u.startsWith('https://slopboy-qa.vercel.app/'))));
  assert.ok(records.every(x=>x.headers.get('x-vercel-protection-bypass')==='private-qa-bypass'));
  assert.ok(records.every(x=>x.headers.get('cookie')===null));
  assert.doesNotMatch(JSON.stringify(checks),/private-qa-bypass/);
});

test('database not connected, unexpected public releases and leaked draft details fail closed',async()=>{
  const privateId=GAMES[0].gameId;
  for(const [route,changed] of [
    ['/api/games?limit=4',{status:503,body:{error:'DATABASE_UNAVAILABLE'}}],
    ['/api/games?limit=4',{status:200,body:{games:[{id:privateId}],nextCursor:null}}],
    ['/api/games/'+privateId,{status:200,body:{game:{id:privateId}}}],
  ] as const){
    const data=fixtures();data.set(route,changed);
    await assert.rejects(()=>acceptAnonymousPreview({
      baseUrl:'https://slopboy-qa.vercel.app/',
      fetcher:fakeHttp(data,[])
    }));
  }
});

test('Vercel protection 401 HTML cannot masquerade as the authenticated route denial',async()=>{
  const data=fixtures();
  data.set('/api/account/games',{status:401,body:'Vercel Authentication',html:true});
  await assert.rejects(()=>acceptAnonymousPreview({
    baseUrl:'https://slopboy-qa.vercel.app/',
    fetcher:fakeHttp(data,[])
  }),/PREVIEW_HTTP_MISMATCH/);
});

test('anonymous session and weak cache protections are not accepted',async()=>{
  const loggedIn=fixtures();
  loggedIn.set('/api/auth/get-session',{status:200,body:{user:{id:'forged'}}});
  await assert.rejects(()=>acceptAnonymousPreview({
    baseUrl:'https://slopboy-qa.vercel.app/',fetcher:fakeHttp(loggedIn,[])
  }));
  const cache=fixtures();
  cache.set('/api/games?limit=4',{status:200,body:{games:[],nextCursor:null},cache:'public, max-age=600'});
  await assert.rejects(()=>acceptAnonymousPreview({
    baseUrl:'https://slopboy-qa.vercel.app/',fetcher:fakeHttp(cache,[])
  }),/PREVIEW_CACHE_MISMATCH/);
});
