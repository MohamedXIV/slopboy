import {NextResponse,type NextRequest} from 'next/server';
import {serverAuth} from '../../../../lib/auth/server';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type AuthRouteContext={params:Promise<{path:string[]}>};

const unavailable=()=>NextResponse.json({error:'AUTH_NOT_CONFIGURED'},{
  status:503,headers:{'Cache-Control':'private, no-store'}});

/** Forward Next.js route context to the official Neon proxy.
 * Its handler resolves [...path] from context.params, and throws if context is omitted. */
export async function GET(request:NextRequest,context:AuthRouteContext){
  const auth=serverAuth();if(!auth)return unavailable();
  return auth.handler().GET(request,context);
}
export async function POST(request:NextRequest,context:AuthRouteContext){
  const auth=serverAuth();if(!auth)return unavailable();
  return auth.handler().POST(request,context);
}
