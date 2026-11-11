'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

export default function SignInForm(){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
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
    <TextField name="password" isRequired>
      <Label>Password</Label>
      <div className="sb-auth-password-row">
        <Input variant="secondary" type={showPassword?'text':'password'} autoComplete="current-password"
          value={password} onChange={event=>setPassword(event.target.value)}/>
        <Button type="button" variant="ghost" size="sm"
          aria-label={showPassword?'Hide password':'Show password'}
          onPress={()=>setShowPassword(value=>!value)}>{showPassword?'Hide':'Show'}</Button>
      </div>
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
