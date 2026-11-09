'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '../../lib/auth/client';
export default function SignOutButton(){
  const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <button type="button" disabled={busy} className="sb-account-signout"
    onClick={async()=>{if(busy)return;setBusy(true);
      try{
        setError('');
        const result=await authClient.signOut();
        if(result.error){setError('Could not sign out. Try again.');return;}
        router.replace('/library');router.refresh();
      }catch{setError('Could not sign out. Try again.');}
      finally{setBusy(false);}
    }}>{busy?'Signing out…':'Sign out'}</button>;

}
