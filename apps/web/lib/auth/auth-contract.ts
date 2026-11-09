/** Validates the shape of a session returned by trusted Neon Auth; never reads client owner/role claims. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Obj=Record<string,unknown>;
const obj=(x:unknown):Obj|null=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Obj:null;
export interface Subject {readonly id:string;readonly email:string;readonly displayName:string;readonly emailVerified:boolean;readonly expiresAt:string}
export function verifySessionShape(raw:unknown,now=Date.now()):Subject|null{
  const data=obj(obj(raw)?.data??raw),user=obj(data?.user),session=obj(data?.session);
  if(!user||!session||typeof user.id!=='string'||!UUID.test(user.id)||
    session.userId!==user.id||typeof user.email!=='string'||user.email.length>254||
    typeof user.emailVerified!=='boolean')return null;
  const expires=session.expiresAt instanceof Date?session.expiresAt.getTime():
    typeof session.expiresAt==='string'?Date.parse(session.expiresAt):NaN;
  if(!Number.isFinite(expires)||expires<=now)return null;
  return {id:user.id,email:user.email,displayName:typeof user.name==='string'&&user.name.trim()?user.name.trim().slice(0,100):'Player',
    emailVerified:user.emailVerified,expiresAt:new Date(expires).toISOString()};
}
export function authReady(env:{NEON_AUTH_BASE_URL?:string;NEON_AUTH_COOKIE_SECRET?:string}):boolean{
  if(!env.NEON_AUTH_BASE_URL||!env.NEON_AUTH_COOKIE_SECRET||
    Buffer.byteLength(env.NEON_AUTH_COOKIE_SECRET,'utf8')<32)return false;
  try{const url=new URL(env.NEON_AUTH_BASE_URL);return url.protocol==='https:'&&!url.username&&!url.password&&
    !url.search&&!url.hash&&url.pathname.endsWith('/auth');}catch{return false;}
}

/** Reject cross-origin mutation requests even when a browser sends cookies. */
export function sameOriginMutation(
  origin:string|null,url:string,fetchSite:string|null,requestHost?:string|null,
):boolean{
  // Fetch Metadata headers are browser-controlled. Origin is mandatory for all
  // state changes; a cross-site browser request must never pass.
  if(!origin||origin==='null'||fetchSite==='cross-site')return false;
  try{
    const source=new URL(origin),internal=new URL(url);
    if(origin!==source.origin||source.username||source.password)return false;
    if(source.origin===internal.origin)return true;
    // Next.js behind a proxy may have an internal request.url hostname. Accept
    // only the actual Host header *plus* the browser's same-origin metadata.
    // A foreign-origin browser cannot forge Sec-Fetch-Site: same-origin.
    return fetchSite==='same-origin'&&!!requestHost&&source.host===requestHost&&
      source.protocol===internal.protocol;
  }catch{return false;}
}
