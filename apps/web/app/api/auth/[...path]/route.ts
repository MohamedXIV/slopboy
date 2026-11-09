import {NextResponse} from 'next/server';
import {serverAuth} from '../../../../lib/auth/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const unavailable=()=>NextResponse.json({error:'AUTH_NOT_CONFIGURED'},{
  status:503,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
  const auth=serverAuth();if(!auth)return unavailable();
  const handler=auth.handler().GET as (request:Request)=>Promise<Response>;
  return handler(request);
}
export async function POST(request:Request){
  const auth=serverAuth();if(!auth)return unavailable();
  const handler=auth.handler().POST as (request:Request)=>Promise<Response>;
  return handler(request);
}
