'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import SignOutButton from './SignOutButton';
import ActivateProfileButton from './ActivateProfileButton';

type User={id:string;email:string;displayName:string;emailVerified:boolean};
type Profile={id:string;displayName:string;role:'player'|'creator'|'admin'|'system'};
type Game={id:string;title:string;status:string;visibility:string};
type Account={user:User;profile:Profile|null};

export default function AccountDashboard(){
  const router=useRouter();
  const [account,setAccount]=useState<Account|null>(null);
  const [games,setGames]=useState<readonly Game[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'unavailable'>('loading');
  const [error,setError]=useState('');
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;
    setStatus('loading');setError('');
    try{
      const me=await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store'});
      if(current!==generation.current)return;
      if(me.status===401){router.replace('/auth/sign-in');return;}
      if(!me.ok){setStatus('unavailable');return;}
      const data=await me.json() as Account;
      if(current!==generation.current)return;
      if(!data?.user || typeof data.user.id!=='string'){setStatus('unavailable');return;}
      setAccount(data);
      if(data.profile && data.user.emailVerified){
        const response=await fetch('/api/account/games',{credentials:'same-origin',cache:'no-store'});
        if(current!==generation.current)return;
        if(!response.ok){setError('Private game library is temporarily unavailable.');setGames([]);}
        else{
          const catalog=await response.json() as {games:Game[]};
          if(current!==generation.current)return;
          setGames(Array.isArray(catalog.games)?catalog.games:[]);
        }
      }else setGames([]);
      setStatus('ready');
    }catch{
      if(current===generation.current)setStatus('unavailable');
    }
  },[router]);
  useEffect(()=>{
    // Start the request after React has committed, not via a synchronous
    // state update during the effect itself.
    let active=true;
    queueMicrotask(()=>{if(active)void refresh();});
    const ref=generation;
    return()=>{active=false;ref.current++;};
  },[refresh]);

  if(status==='loading')return <main className="sb-account-wrap"><section className="sb-account-panel">
    <p role="status">Checking your private account…</p>
  </section></main>;
  if(status==='unavailable'||!account)return <main className="sb-account-wrap"><section className="sb-account-panel">
    <h1>Account service unavailable.</h1>
    <p>Sign-in or private storage could not be verified. Your guest games and local saves remain available.</p>
    <Link href="/library">Open guest library</Link>
  </section></main>;

  const {user,profile}=account;
  return <main className="sb-account-wrap"><section className="sb-account-panel">
    <p className="sb-account-label">SLOPBOY · PRIVATE ACCOUNT</p>
    <h1>Hello, {user.displayName}.</h1>
    <p>Signed in as <strong>{user.email}</strong>.</p>
    {!user.emailVerified&&<p role="status" className="sb-account-message">
      Verify your email before using creator features.
    </p>}
    {user.emailVerified&&!profile&&<div className="sb-account-message">
      <p>Finish setting up your private account. No guest saves will be uploaded automatically.</p>
      <ActivateProfileButton onActivated={()=>void refresh()}/>
    </div>}
    {user.emailVerified&&profile&&<section aria-label="My owned games">
      <h2>My Games</h2>
      <p>Account role: <strong>{profile.role}</strong>. Only games owned by your verified account are shown.</p>
      {error&&<p role="alert">{error}</p>}
      {games.length===0?<p>No games have been created for this account yet.</p>:
        <ul>{games.map(game=><li key={game.id}><strong>{game.title}</strong> · {game.status} · {game.visibility}</li>)}</ul>}
      <p className="sb-account-small">New game creation and untrusted game previews are not enabled yet.</p>
    </section>}
    <SignOutButton/>
    <p className="sb-account-small">Local guest saves and offline cartridges are never silently imported or deleted.</p>
    <Link href="/library">Continue playing</Link>
  </section></main>;
}
