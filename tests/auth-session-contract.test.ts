import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authReady,verifySessionShape,sameOriginMutation} from '../apps/web/lib/auth/auth-contract.ts';
import {signInFailureMessage} from '../apps/web/lib/auth/sign-in-errors.ts';
import {classifyAuthDenial} from '../apps/web/lib/auth/auth-diagnostics.ts';

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
  assert.equal(sameOriginMutation('http://localhost:3000','http://127.0.0.1:3000/api/account/bootstrap',
    'same-origin','localhost:3000'),true,'Trusted proxy Host is allowed with browser same-origin metadata');
  assert.equal(sameOriginMutation('https://attacker.example',route,
    'cross-site','attacker.example'),false);
  assert.equal(sameOriginMutation('https://attacker.example',route,
    'same-origin','slopboy.example'),false,'Origin must match Host even with forged Fetch Metadata');
});

test('auth proxy forwards catch-all route params to the Neon handler for GET and POST',()=>{
  // Guards the production 500 regression: Neon SDK reads context.params.
  const source=readFileSync(new URL('../apps/web/app/api/auth/[...path]/route.ts',import.meta.url),'utf8');
  assert.match(source,/GET\(request:NextRequest,context:AuthRouteContext\)/);
  assert.match(source,/POST\(request:NextRequest,context:AuthRouteContext\)/);
  assert.match(source,/auth\.handler\(\)\.GET\(request,context\)/);
  assert.match(source,/auth\.handler\(\)\.POST\(request,context\)/);
});

test('auth UI distinguishes rejected credentials from server errors without disclosing account existence',()=>{
  assert.match(signInFailureMessage({status:401}),/email and password/);
  assert.match(signInFailureMessage({error:{status:401}}),/email and password/);
  assert.match(signInFailureMessage({response:{status:401}}),/email and password/);
  assert.match(signInFailureMessage({status:403}),/verify your email/);
  assert.match(signInFailureMessage({status:429}),/Too many/);
  assert.match(signInFailureMessage({status:503}),/temporarily unavailable/);
  assert.doesNotMatch(signInFailureMessage({status:401}),/unknown email|user not found/i);
});

test('auth 401 diagnostics log fixed nonidentifying categories only',()=>{
  assert.equal(classifyAuthDenial({code:'INVALID_EMAIL_OR_PASSWORD',password:'never-log',email:'private@example.com'}),'credential-rejected');
  assert.equal(classifyAuthDenial({code:'EMAIL_NOT_VERIFIED'}),'verification-required');
  assert.equal(classifyAuthDenial({code:'TOO_MANY_REQUESTS'}),'rate-limited');
  assert.equal(classifyAuthDenial({code:'INTERNAL',password:'secret'}),'unknown');
  assert.equal(classifyAuthDenial({code:{secret:'value'}}),'unknown');
  assert.equal(classifyAuthDenial(null),'unknown');
});
