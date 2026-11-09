import Link from 'next/link';
import {redirect} from 'next/navigation';
import {serverAuth,currentSubject} from '../../../lib/auth/server';
import {databaseConfigured,readProfile,listOwnedGames,type DatabaseProfile,type OwnerGame} from '../../../lib/auth/database';
import SignOutButton from '../../../components/auth/SignOutButton';
import ActivateProfileButton from '../../../components/auth/ActivateProfileButton';
export const dynamic='force-dynamic';
export const metadata={title:'My account · Slopboy'};
export default async function Dashboard(){
  if(!serverAuth())return <main className="sb-account-wrap"><section className="sb-account-panel">
    <h1>Account setup pending.</h1><p>Account services are not configured here. Guest play remains available.</p>
    <Link href="/library">Open guest library</Link>
  </section></main>;
  const subject=await currentSubject();
  if(!subject)redirect('/auth/sign-in');
  let profile:DatabaseProfile|null=null,games:readonly OwnerGame[]=[];
  let databaseAvailable=databaseConfigured();
  if(databaseAvailable){
    try{
      profile=await readProfile(subject);
      if(profile)games=await listOwnedGames(subject);
    }catch{databaseAvailable=false;}
  }
  return <main className="sb-account-wrap"><section className="sb-account-panel">
    <p className="sb-account-label">SLOPBOY · PRIVATE ACCOUNT</p>
    <h1>Hello, {subject.displayName}.</h1>
    <p>Signed in as <strong>{subject.email}</strong>.</p>
    {!subject.emailVerified&&<p role="status">Email verification is required before creator features.</p>}
    {subject.emailVerified&&!databaseAvailable&&<p role="status" className="sb-account-message">
      Game database is currently unavailable. Your guest saves remain safe on this device.
    </p>}
    {subject.emailVerified&&databaseAvailable&&!profile&&<div className="sb-account-message">
      <p>Finish setting up your private account. No guest data will be uploaded automatically.</p>
      <ActivateProfileButton/>
    </div>}
    {subject.emailVerified&&databaseAvailable&&profile&&<section aria-label="My owned games">
      <h2>My Games</h2>
      <p>Account role: <strong>{profile.role}</strong>. Showing only games owned by your verified account.</p>
      {games.length===0?<p>No games have been created for this account yet.</p>:
        <ul>{games.map(game=><li key={game.id}><strong>{game.title}</strong> · {game.status} · {game.visibility}</li>)}</ul>}
      <p className="sb-account-small">New game creation and untrusted source previews are not enabled yet.</p>
    </section>}
    <SignOutButton/>
    <p className="sb-account-small">Local guest saves and offline cartridges are never silently imported or deleted.</p>
    <Link href="/library">Play as guest</Link>
  </section></main>;
}
