'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

export default function SignInForm(){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');
    try{
      const result=await authClient.signIn.email({email,password});
      if(result.error){
        setError('Could not sign in. Check your credentials and try again.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    }catch{
      setError('Sign-in service unavailable. Try again later.');
    }finally{
      setBusy(false);
    }
  }

  return <form className="flex flex-col gap-4" onSubmit={submit}>
    <TextField name="email" type="email" isRequired>
      <Label>Email</Label>
      <Input variant="secondary" type="email" autoComplete="email"
        maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/>
    </TextField>
    <TextField name="password" type="password" isRequired>
      <Label>Password</Label>
      <Input variant="secondary" type="password" autoComplete="current-password"
        value={password} onChange={event=>setPassword(event.target.value)}/>
    </TextField>
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Sign-in failed</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>}
    <Button type="submit" variant="primary" fullWidth isPending={busy} isDisabled={busy}>
      {busy?'Signing in…':'Sign in'}
    </Button>
  </form>;
}
