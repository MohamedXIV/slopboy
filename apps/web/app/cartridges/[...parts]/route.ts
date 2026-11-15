import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {neon} from '@neondatabase/serverless';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const headers={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff'
};
const SHA256=/^[0-9a-f]{64}$/;
const LEGACY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CARTRIDGE_BYTES=1024*1024;

/** Cartridges are NOT files in public/. CDN requests must reach this route,
 * which authorizes the exact reviewed digest on every GET and HEAD. */
async function serve(request:Request,{params}:{params:Promise<{parts:string[]}>},head:boolean){
  const {parts}=await params;
  const digestName=parts.length===2&&parts[0]==='by-sha256'&&parts[1].endsWith('.slop')
    ?parts[1].slice(0,-5):null;
  const legacyName=parts.length===1&&parts[0].endsWith('.slop')
    ?parts[0].slice(0,-5):null;
  if(!(digestName&&SHA256.test(digestName))&&!(legacyName&&LEGACY.test(legacyName)))
    return new Response('Not found',{status:404,headers});
  if(!process.env.DATABASE_URL)return new Response('Unavailable',{status:503,headers});
  try{
    const sql=neon(process.env.DATABASE_URL);
    const rows=await sql`SELECT content_digest FROM public.published_playable_games
      WHERE (${digestName}::text IS NOT NULL AND content_digest=${digestName})
        OR (${legacyName}::text IS NOT NULL AND legacy_slug=${legacyName}) LIMIT 1`;
    const digest=rows[0]?.content_digest;
    if(typeof digest!=='string'||!SHA256.test(digest))return new Response('Not found',{status:404,headers});

    // This path is fixed by validated route segments, never user filesystem input.
    const file=digestName
      ?resolve(process.cwd(),'private','cartridges','by-sha256',digestName+'.slop')
      :resolve(process.cwd(),'private','cartridges',legacyName+'.slop');
    const bytes=await readFile(file);
    if(bytes.byteLength>MAX_CARTRIDGE_BYTES||createHash('sha256').update(bytes).digest('hex')!==digest)
      return new Response('Not found',{status:404,headers});
    return new Response(head?null:new Uint8Array(bytes),{status:200,headers:{
      ...headers,'Content-Type':'application/octet-stream',
      'Content-Length':String(bytes.byteLength),
      'Content-Disposition':'attachment'
    }});
  }catch{return new Response('Unavailable',{status:503,headers});}
}

export const GET=(request:Request,context:{params:Promise<{parts:string[]}>})=>serve(request,context,false);
export const HEAD=(request:Request,context:{params:Promise<{parts:string[]}>})=>serve(request,context,true);
