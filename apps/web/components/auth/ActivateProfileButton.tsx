'use client';
import {useState} from 'react';
import {Alert,Button} from '@heroui/react';

export default function ActivateProfileButton({onActivated}:{onActivated:()=>void}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function activate(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/account/bootstrap',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',
      });
      if(!response.ok){
        setError(response.status===403?'Email verification required.':'Account setup unavailable.');
        return;
      }
      onActivated();
    }catch{
      // The server may have committed the idempotent bootstrap before the
      // browser or a network/security filter dropped its HTTP response.
      // Read back trusted account state; never infer success from POST failure.
      try{
        const response=await fetch('/api/account/me',{
          credentials:'same-origin',cache:'no-store',
        });
        if(response.ok){
          const data:unknown=await response.json();
          const account=data&&typeof data==='object'?data as {
            user?:{id?:unknown};profile?:{id?:unknown}
          }:null;
          if(typeof account?.user?.id==='string'&&
            account.profile?.id===account.user.id){
            onActivated();
            return;
          }
        }
      }catch{
        // The network is still blocked. Avoid misreporting a committed write.
      }
      setError('Connection interrupted. Your account may already be active. Refresh this page to check before trying again.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-start gap-3">
    <Button type="button" variant="primary" isPending={busy} isDisabled={busy}
      onPress={()=>void activate()}>
      {busy?'Preparing…':'Activate private account'}
    </Button>
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Account setup not confirmed</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>}
  </div>;
}
