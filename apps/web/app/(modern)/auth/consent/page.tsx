import {notFound} from 'next/navigation';
import {authReady} from '../../../../lib/auth/auth-contract';
import OAuthConsentForm from '../../../../components/auth/OAuthConsentForm';

export const dynamic='force-dynamic';
export const metadata={title:'Authorize connection · Slopboy'};

/** An OAuth authorization surface exists only on the explicitly enabled dev Preview. */
export default async function OAuthConsentPage({searchParams}:{searchParams:Promise<{
  client_id?:string|string[];scope?:string|string[];
}>}){
  const query=await searchParams;
  if(process.env.VERCEL_ENV!=='preview'||process.env.MCP_DEV_OAUTH_ENABLED!=='1'||
    !authReady({NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
      NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET})||
    typeof query.client_id!=='string'||!query.client_id)notFound();
  return <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
    <OAuthConsentForm clientId={query.client_id}
      requestedScope={typeof query.scope==='string'?query.scope:''}/>
  </main>;
}
