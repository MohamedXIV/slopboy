import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptAnonymousCloud,HOSTED_CLOUD_ORIGIN,HOSTED_CLOUD_ROUTE} from '../tools/hosted-cloud-acceptance.ts';

function error(status:number,code:string,headers:Record<string,string>={}){
  return Response.json({error:code},{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}});
}
test('hosted cloud guest probe requires exact app denial and sends no valid save or credentials',async()=>{
  const requests:{url:string;init:RequestInit}[]=[];
  const expected=[error(401,'UNAUTHENTICATED'),error(401,'UNAUTHENTICATED'),
    error(403,'INVALID_ORIGIN'),error(401,'UNAUTHENTICATED'),error(403,'INVALID_ORIGIN')];
  const fetcher:typeof fetch=async(input,init)=>{
    requests.push({url:String(input),init:init??{}});
    return expected[requests.length-1];
  };
  const checks=await acceptAnonymousCloud(fetcher);
  assert.deepEqual(checks.map(c=>c.status),[401,401,403,401,403]);
  for(const req of requests){
    assert.ok(req.url.startsWith(HOSTED_CLOUD_ORIGIN+HOSTED_CLOUD_ROUTE));
    assert.equal(req.init.credentials,'omit');
    assert.equal(req.init.redirect,'manual');
    const headers=new Headers(req.init.headers);
    assert.equal(headers.has('cookie'),false);
    assert.equal(headers.has('authorization'),false);
    if(req.init.method==='POST')assert.equal(req.init.body,'{}');
  }
});
test('hosted cloud probe refuses protection page, disabled gate, wrong error or unsafe cache',async()=>{
  for(const response of [
    new Response('<html>Authentication required</html>',{status:401,headers:{'content-type':'text/html'}}),
    error(404,'NOT_FOUND'),error(401,'OTHER'),error(401,'UNAUTHENTICATED',{'cache-control':'public'}),
    error(401,'UNAUTHENTICATED',{'x-content-type-options':'none'}),
    Response.json({error:'UNAUTHENTICATED',snapshots:[]},{status:401,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}}),
  ])await assert.rejects(()=>acceptAnonymousCloud(async()=>response),/HOSTED_(HTTP|HEADERS|ERROR)_MISMATCH/);
});
