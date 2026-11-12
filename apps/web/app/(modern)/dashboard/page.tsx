import AccountDashboard from '../../../components/auth/AccountDashboard';

export const dynamic='force-dynamic';
export const metadata={title:'My account · Slopboy'};

/** Public HTML contains no account-specific data; protected API reads are
 * performed by the client where Neon Auth can safely refresh session cookies. */
export default function Dashboard(){
  return <AccountDashboard/>;
}
