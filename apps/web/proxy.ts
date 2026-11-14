import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Public static files are not an authorization boundary. Only a currently
 * published revision with a matching immutable artifact may be served. */
export async function proxy(request:NextRequest){
  const path=request.nextUrl.pathname;
  const hashed=/^\/cartridges\/by-sha256\/([0-9a-f]{64})\.slop$/.exec(path);
  const legacy=/^\/cartridges\/([a-z0-9]+(?:-[a-z0-9]+)*)\.slop$/.exec(path);
  if(!hashed&&!legacy)return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  if(!process.env.DATABASE_URL)return new NextResponse('Unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  try{
    const sql=neon(process.env.DATABASE_URL);
    const rows=await sql`SELECT content_digest FROM public.published_playable_games
      WHERE ((${hashed?.[1]??null}::text IS NOT NULL AND content_digest=${hashed?.[1]??null})
        OR (${legacy?.[1]??null}::text IS NOT NULL AND legacy_slug=${legacy?.[1]??null})) LIMIT 1`;
    const digest=rows[0]?.content_digest;
    if(typeof digest!=='string'||!/^[0-9a-f]{64}$/.test(digest))return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const file=hashed?resolve(process.cwd(),'public','cartridges','by-sha256',hashed[1]+'.slop'):
      resolve(process.cwd(),'public','cartridges',legacy![1]+'.slop');
    const bytes=await readFile(file);
    if(bytes.byteLength>1024*1024||createHash('sha256').update(bytes).digest('hex')!==digest)
      return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const response=NextResponse.next();response.headers.set('Cache-Control','no-store');return response;
  }catch{return new NextResponse('Unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const config={matcher:['/cartridges/:path*']};
