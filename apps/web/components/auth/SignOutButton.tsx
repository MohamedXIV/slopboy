'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '../../lib/auth/client';
export default function SignOutButton(){
  const router=useRouter(),[busy,setBusy]=useState(false);
  return <button type="button" disabled={busy} className="sb-account-signout"
    onClick={async()=>{if(busy)return;setBusy(true);
      try{await authClient.signOut();router.replace('/library');router.refresh();}
      finally{setBusy(false);}
    }}>{busy?'Signing out…':'Sign out'}</button>;
}
