import {trustedOwnerPreviewEnabled} from '@/server/trusted-owner-preview';
import AccountDashboard from '../../../components/auth/AccountDashboard';
import {redirect} from 'next/navigation';
import {authReady} from '../../../lib/auth/auth-contract';

export const dynamic='force-dynamic';
export const metadata={title:'My account · Slopboy'};

/** Public HTML contains no account-specific data; protected API reads are
 * performed by the client where Neon Auth can safely refresh session cookies. */
export default function Dashboard(){
  if(!authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  }))redirect('/auth/sign-in');
  return <AccountDashboard trustedPreviewEnabled={trustedOwnerPreviewEnabled()}/>;
}
