import {createNeonAuth} from '@neondatabase/auth/next/server';
import {authReady,verifySessionShape,type Subject} from './auth-contract';
type NeonAuth=ReturnType<typeof createNeonAuth>;
let cached:{base:string;key:string;value:NeonAuth}|null=null;
/** Official managed SDK. Never synthesize an identity on a failed/missing session. */
export function serverAuth():NeonAuth|null{
  if(!authReady({NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET}))return null;
  const base=process.env.NEON_AUTH_BASE_URL!,key=process.env.NEON_AUTH_COOKIE_SECRET!;
  if(!cached||cached.base!==base||cached.key!==key)
    cached={base,key,value:createNeonAuth({baseUrl:base,cookies:{secret:key,sessionDataTtl:60}})};
  return cached.value;
}
export async function currentSubject():Promise<Subject|null>{
  const auth=serverAuth();if(!auth)return null;
  try{return verifySessionShape(await auth.getSession());}catch{return null;}
}
