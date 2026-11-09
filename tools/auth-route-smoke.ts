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
    const mutation=(origin?:string)=>fetch(app.url+'/api/account/bootstrap',{
      method:'POST',redirect:'manual',
      headers:origin?{'Origin':origin,'Content-Type':'application/json'}:{'Content-Type':'application/json'},
      body:'{}',cache:'no-store',
    });
    assert.equal((await mutation()).status,403,'No-Origin mutation rejected');
    assert.equal((await mutation('https://attacker.example')).status,403,'Foreign-Origin mutation rejected');
    assert.equal((await mutation(app.url)).status,401,'Same-origin mutation still needs real session');
    const login=await get('/auth/sign-in');
    assert.equal(login.status,200);
    assert.match(await login.text(),/Account sign-in is not configured/);
    assert.equal((await get('/dashboard')).status,200,'Static dashboard shell contains no private identity');
    assert.equal((await get('/library')).status,200,'Guest cartridge library remains public');
    console.log('Anonymous auth HTTP regression PASS: fail-closed proxy/session, CSRF, owner ID, admin, guest library');
  }finally{await app.stop();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
