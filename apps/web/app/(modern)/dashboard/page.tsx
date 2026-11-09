import Link from 'next/link';
import {redirect} from 'next/navigation';
import {serverAuth,currentSubject} from '../../../lib/auth/server';
import SignOutButton from '../../../components/auth/SignOutButton';
export const dynamic='force-dynamic';
export const metadata={title:'My account · Slopboy'};
export default async function Dashboard(){
  if(!serverAuth())return <main className="sb-account-wrap"><section className="sb-account-panel">
    <h1>Account setup pending.</h1><p>Account services are not configured here. Guest play remains available.</p>
    <Link href="/library">Open guest library</Link>
  </section></main>;
  const subject=await currentSubject();
  if(!subject)redirect('/auth/sign-in');
  return <main className="sb-account-wrap"><section className="sb-account-panel">
    <p className="sb-account-label">SLOPBOY · PRIVATE ACCOUNT</p>
    <h1>Hello, {subject.displayName}.</h1>
    <p>Signed in as <strong>{subject.email}</strong>.</p>
    {!subject.emailVerified&&<p role="status">Verify your email before using creator services.</p>}
    <p className="sb-account-message">My Games and private storage are not enabled yet. This page never invents cloud games or linked integrations.</p>
    <SignOutButton/>
    <p className="sb-account-small">Local game saves and offline cartridges remain on this device after sign-out.</p>
    <Link href="/library">Play as guest</Link>
  </section></main>;
}
