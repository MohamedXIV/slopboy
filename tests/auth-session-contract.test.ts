import test from 'node:test';
import assert from 'node:assert/strict';
import {authReady,verifySessionShape,sameOriginMutation} from '../apps/web/lib/auth/auth-contract.ts';

const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const now=Date.parse('2026-11-09T12:00:00.000Z');
function session(id:string,expiresAt:string|Date,verified=true){
  return {data:{user:{id,email:'player@example.invalid',name:'Test player',emailVerified:verified},
    session:{userId:id,expiresAt}}};
}
test('server-verified UUID identity and expiry are required',()=>{
  assert.equal(verifySessionShape(session(A,new Date(now+1000)),now)?.id,A);
  assert.equal(verifySessionShape(session(A,new Date(now-1)),now),null);
  assert.equal(verifySessionShape(session(A,'2026-11-09T13:00:00.000Z'),now)?.id,A);
  const mismatch=session(A,new Date(now+10000));mismatch.data.session.userId=B;
  assert.equal(verifySessionShape(mismatch,now),null);
  assert.equal(verifySessionShape({user:{id:'admin'},session:{}},now),null);
  assert.equal(verifySessionShape(null,now),null);
});
test('client owner/role claims cannot change authenticated principal',()=>{
  const result=verifySessionShape({...session(A,new Date(now+60000)),
    ownerId:B,userId:B,role:'admin'},now);
  assert.equal(result?.id,A);
  assert.deepEqual(Object.keys(result!).sort(),
    ['displayName','email','emailVerified','expiresAt','id']);
});
test('unconfigured, weak or non-HTTPS auth fails closed',()=>{
  const secret='x'.repeat(40);
  assert.equal(authReady({}),false);
  assert.equal(authReady({NEON_AUTH_BASE_URL:'http://example.com/db/auth',NEON_AUTH_COOKIE_SECRET:secret}),false);
  assert.equal(authReady({NEON_AUTH_BASE_URL:'https://example.com/db/auth',NEON_AUTH_COOKIE_SECRET:'short'}),false);
  assert.equal(authReady({NEON_AUTH_BASE_URL:'https://example.com/db/auth',NEON_AUTH_COOKIE_SECRET:secret}),true);
  assert.equal(authReady({NEON_AUTH_BASE_URL:'https://evil:pw@example.com/db/auth',NEON_AUTH_COOKIE_SECRET:secret}),false);
});

test('session-bearing mutations require an explicit same-origin request',()=>{
  const route='https://slopboy.example/api/account/bootstrap';
  assert.equal(sameOriginMutation('https://slopboy.example',route,'same-origin'),true);
  assert.equal(sameOriginMutation('https://slopboy.example',route,null),true);
  assert.equal(sameOriginMutation('https://attacker.example',route,'cross-site'),false);
  assert.equal(sameOriginMutation(null,route,'same-origin'),false);
  assert.equal(sameOriginMutation('null',route,'same-origin'),false);
  assert.equal(sameOriginMutation('https://slopboy.example:444',route,'same-origin'),false);
});
