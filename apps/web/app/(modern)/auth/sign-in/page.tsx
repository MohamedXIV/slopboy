import Link from 'next/link';
import {authReady} from '../../../../lib/auth/auth-contract';
import SignInForm from '../../../../components/auth/SignInForm';
export const dynamic='force-dynamic';
export const metadata={title:'Sign in · Slopboy'};
export default function SignInPage(){
  return <main className="sb-account-wrap"><section className="sb-account-panel">
    <p className="sb-account-label">SLOPBOY · ACCOUNT</p>
    <h1>Welcome back.</h1>
    <p>All guest games work without an account. Sign-in is for private creator features.</p>
    {authReady(process.env)?<SignInForm/>:<p role="status">Account sign-in is not configured in this deployment.</p>}
    <p className="sb-account-small">New account registration is closed during the private development rollout.</p>
    <Link href="/library">Continue as guest</Link>
  </section></main>;
}
