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
      setError('Account setup unavailable.');
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
        <Alert.Title>Account setup failed</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>}
  </div>;
}
