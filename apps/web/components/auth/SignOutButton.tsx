'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

export default function SignOutButton(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function signOut(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const result=await authClient.signOut();
      if(result.error){
        setError('Could not sign out. Try again.');
        return;
      }
      router.replace('/library');
      router.refresh();
    }catch{
      setError('Could not sign out. Try again.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-start gap-3">
    <Button type="button" variant="secondary" isPending={busy} isDisabled={busy} onPress={()=>void signOut()}>
      {busy?'Signing out…':'Sign out'}
    </Button>
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Sign-out failed</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>}
  </div>;
}
