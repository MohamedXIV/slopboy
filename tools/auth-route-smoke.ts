/** Real Next.js server: anonymous account endpoints fail closed, guest play remains public. */
import assert from 'node:assert/strict';
import {startNextTestServer} from './next-test-server.ts';

async function main(){
  // CI must never unintentionally send real auth credentials to this regression.
  if(process.env.NEON_AUTH_BASE_URL||process.env.NEON_AUTH_COOKIE_SECRET||process.env.DATABASE_URL)
    throw Error('Anonymous auth smoke must run with all real provider credentials absent');
  const app=await startNextTestServer();
  try{
    const get=(path:string)=>fetch(app.url+path,{redirect:'manual',cache:'no-store'});
    const me=await get('/api/account/me');
    assert.equal(me.status,503,'Unconfigured auth must not fabricate a logged-in identity');
    assert.match(String(me.headers.get('cache-control')),/no-store/);
    assert.equal((await get('/api/auth/get-session')).status,503,'No proxy without provider');
    assert.equal((await get('/api/account/games')).status,401,'Private game listing requires a session');
    assert.equal((await get('/api/admin/overview')).status,401,'Admin endpoint requires a session');
    assert.equal((await get('/api/account/games?ownerId=00000000-0000-4000-a000-000000000001')).status,401,
      'Client-supplied owner ID must never enable reads');
    assert.equal((await get('/api/account/games/5b0edbf4-644d-43f4-9ad3-5506eacd05d3/revisions')).status,401,
      'Curated system-owned draft revision metadata must not be exposed anonymously');
    assert.equal((await get('/api/account/games/5b0edbf4-644d-43f4-9ad3-5506eacd05d3/revisions?ownerId=00000000-0000-4000-a000-000000000001')).status,401,
      'Spoofed owner query parameter cannot grant private revision access');

    const mutation=(origin?:string)=>fetch(app.url+'/api/account/bootstrap',{
      method:'POST',redirect:'manual',
      headers:origin?{'Origin':origin,'Content-Type':'application/json',
        'Sec-Fetch-Site':origin===app.url?'same-origin':'cross-site'}:{'Content-Type':'application/json'},
      body:'{}',cache:'no-store',
    });
    assert.equal((await mutation()).status,403,'No-Origin mutation rejected');
    assert.equal((await mutation('https://attacker.example')).status,403,'Foreign-Origin mutation rejected');
    const sameOrigin=await mutation(app.url);
    assert.equal(sameOrigin.status,401,
      'Same-origin mutation should pass CSRF guard then reject missing session: '+await sameOrigin.text());
    // Catalog must fail closed when no private database is configured.
    assert.equal((await get('/api/games')).status,503);
    assert.equal((await get('/api/games?limit=0')).status,400);
    assert.equal((await get('/api/games?limit=25')).status,400);
    assert.equal((await get('/api/games?cursor=malformed')).status,400);
    assert.equal((await get('/api/games/not-a-uuid')).status,404);
    assert.equal((await get('/api/games/5b0edbf4-644d-43f4-9ad3-5506eacd05d3')).status,503);
    assert.equal((await get('/games/5b0edbf4-644d-43f4-9ad3-5506eacd05d3')).status,200);
    const login=await get('/auth/sign-in');
    assert.equal(login.status,200);
    assert.match(await login.text(),/Authentication is not configured in this deployment/);
    assert.match(await (await get('/auth/sign-in')).text(),/Reset password/,
      'Sign-in must link to recovery for existing accounts');
    const recovery=await get('/auth/reset-password');
    assert.equal(recovery.status,200,'Recovery must be routed in modern UI');
    assert.match(await recovery.text(),/Authentication is not configured in this deployment/,
      'Unconfigured password reset must fail closed');
    const activation=await get('/auth/activate');
    assert.equal(activation.status,200,'Invited-account activation page remains reachable');
    assert.match(await activation.text(),/Authentication is not configured in this deployment/,
      'Unconfigured account activation must fail closed');
    assert.equal((await get('/dashboard')).status,200,'Static dashboard shell contains no private identity');
    assert.equal((await get('/library')).status,200,'Guest cartridge library remains public');
    console.log('Anonymous auth HTTP regression PASS: fail-closed proxy/session, CSRF, owner ID, admin, guest library');
  }finally{await app.stop();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
