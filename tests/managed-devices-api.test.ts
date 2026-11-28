import test from 'node:test';
import assert from 'node:assert/strict';
import {handleManagedDevices,parseManagedDevices,type ManagedDevicesDependencies} from '../apps/web/server/managed-devices-api.ts';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',game='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const row={deviceId:other,count:5,lastSavedAt:'2026-11-27T12:00:00Z'};
test('device discovery is private, account-bound, bounded and rate-limited',async()=>{
 let queries=0,allowed=true,actor:string|null=account,enabled=true,role='admin';
 const deps:ManagedDevicesDependencies={enabled:()=>enabled,subject:async()=>actor?{id:actor,emailVerified:true}:null,role:async()=>role,consumeRequest:async()=>allowed,list:async(a,g)=>{queries++;assert.equal(a,account);assert.equal(g,game);return [{...row,storageKey:'private',payload:'private'}];}};
 const run=(headers:Record<string,string>={'x-slopboy-sync-account':account})=>handleManagedDevices(new Request('https://slopboy.test/devices',{headers}),game,deps);
 enabled=false;assert.equal((await run()).status,404);enabled=true;
 actor=null;assert.equal((await run()).status,401);actor=other;assert.equal((await run()).status,403);actor=account;
 role='player';assert.equal((await run()).status,404);role='admin';
 assert.equal((await run({'x-slopboy-sync-account':account,'sec-fetch-site':'cross-site'})).status,403);
 allowed=false;assert.equal((await run()).status,429);assert.equal(queries,0);allowed=true;
 const response=await run();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(await response.json(),{devices:[row]});
 assert.equal(queries,1);
 for(const bad of [[row,row],[{...row,count:6}],[{...row,lastSavedAt:'invalid'}]])assert.throws(()=>parseManagedDevices(bad),/INVALID_DEVICE_LIST/);
});
