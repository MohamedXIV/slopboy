'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
export default function ActivateProfileButton(){
  const router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div><button className="sb-account-signout" type="button" disabled={busy}
    onClick={async()=>{
      if(busy)return;setBusy(true);setError('');
      try{
        const res=await fetch('/api/account/bootstrap',{method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
        if(!res.ok){setError(res.status===403?'Email verification required.':'Account setup unavailable.');return;}
        router.refresh();
      }catch{setError('Account setup unavailable.');}
      finally{setBusy(false);}
    }}>{busy?'Preparing…':'Activate private account'}</button>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
