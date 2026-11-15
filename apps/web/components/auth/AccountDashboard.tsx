'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Alert,Card,Spinner} from '@heroui/react';
import SignOutButton from './SignOutButton';
import ActivateProfileButton from './ActivateProfileButton';

type User={id:string;email:string;displayName:string;emailVerified:boolean};
type Profile={id:string;displayName:string;role:'player'|'creator'|'admin'|'system'};
type Revision={
  id:string;revisionNumber:number;releaseVersion:string|null;
  status:string;engineId:string;engineVersion:string;
};
type Game={id:string;title:string;status:string;visibility:string;latestRevision:Revision|null};
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

  if(status==='loading')return <main className="mx-auto w-full max-w-2xl px-4 py-12">
    <Card>
      <Card.Content className="flex flex-row items-center gap-3">
        <Spinner size="sm"/>
        <p role="status" className="text-sm text-muted">Checking your private account…</p>
      </Card.Content>
    </Card>
  </main>;

  if(status==='unavailable'||!account)return <main className="mx-auto w-full max-w-2xl px-4 py-12">
    <Card>
      <Card.Header>
        <Card.Title>Account service unavailable</Card.Title>
        <Card.Description>Sign-in or private storage could not be verified.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Alert status="warning">
          <Alert.Indicator/>
          <Alert.Content>
            <Alert.Title>Guest games remain available</Alert.Title>
            <Alert.Description>Your local saves are still on this device.</Alert.Description>
          </Alert.Content>
        </Alert>
      </Card.Content>
      <Card.Footer>
        <Link className="link" href="/library">Open guest library</Link>
      </Card.Footer>
    </Card>
  </main>;

  const {user,profile}=account;
  return <main className="mx-auto w-full max-w-2xl px-4 py-12">
    <Card>
      <Card.Header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Slopboy · Private account</p>
        <Card.Title>Hello, {user.displayName}</Card.Title>
        <Card.Description>Signed in as {user.email}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {!user.emailVerified&&<Alert status="warning">
          <Alert.Indicator/>
          <Alert.Content>
            <Alert.Title>Verify your email</Alert.Title>
            <Alert.Description>Email verification is required before creator features.</Alert.Description>
          </Alert.Content>
        </Alert>}
        {user.emailVerified&&!profile&&<Card variant="secondary">
          <Card.Header>
            <Card.Title>Finish setting up your account</Card.Title>
            <Card.Description>No guest saves will be uploaded automatically.</Card.Description>
          </Card.Header>
          <Card.Content>
            <ActivateProfileButton onActivated={()=>void refresh()}/>
          </Card.Content>
        </Card>}
        {user.emailVerified&&profile&&<Card variant="secondary">
          <Card.Header>
            <Card.Title>My Games</Card.Title>
            <Card.Description>
              Account role: {profile.role}. Only games owned by your verified account are listed.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            {error&&<Alert status="danger">
              <Alert.Indicator/>
              <Alert.Content>
                <Alert.Title>Library unavailable</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>}
            {games.length===0?<p className="text-sm text-muted">No games have been created for this account yet.</p>:
              <ul className="flex flex-col gap-2">
                {games.map(game=><li key={game.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/games/${game.id}`} className="link font-semibold">{game.title}</Link>
                    <span className="text-muted">{game.status} · {game.visibility}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {game.latestRevision
                      ? `Revision ${game.latestRevision.revisionNumber}${game.latestRevision.releaseVersion
                        ? ' · '+game.latestRevision.releaseVersion : ''} · ${game.latestRevision.status}
                        · ${game.latestRevision.engineId} ${game.latestRevision.engineVersion}`
                      : 'No uploaded revisions yet'}
                  </p>
                </li>)}
              </ul>}
            <p className="text-xs text-muted">
              New game creation and untrusted game previews are not enabled yet.
            </p>
          </Card.Content>
        </Card>}
        <SignOutButton/>
      </Card.Content>
      <Card.Footer className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted">
          Local guest saves and offline cartridges are never silently imported or deleted.
        </p>
        <Link className="link" href="/library">Continue playing</Link>
      </Card.Footer>
    </Card>
  </main>;
}
