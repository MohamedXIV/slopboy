'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {V2TextLink} from '../v2/V2RouteControls';
import {authClient} from '../../lib/auth/client';
import {signInFailureMessage} from '../../lib/auth/sign-in-errors';

export default function SignInForm({available=true}:{available?:boolean}){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!available)return;
    setBusy(true);setError('');
    try{
      const result=await authClient.signIn.email({email:email.trim().toLowerCase(),password});
      if(result.error){
        setError(signInFailureMessage(result.error));
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    }catch(failure){
      setError(signInFailureMessage(failure));
    }finally{
      setBusy(false);
    }
  }

  return <form className="sb-auth-form" onSubmit={submit} aria-label="Sign in to Slopboy">
    <TextField name="email" type="email" isRequired isDisabled={!available}>
      <Label>Email</Label>
      <Input variant="secondary" type="email" autoComplete="email"
        placeholder="you@example.com" maxLength={254} value={email}
        onChange={event=>setEmail(event.target.value)}/>
    </TextField>
    <TextField name="password" isRequired isDisabled={!available}>
      <div className="sb-auth-field-head">
        <Label>Password</Label>
        <V2TextLink href="/auth/reset-password">Forgot?</V2TextLink>
      </div>
      <div className="sb-auth-password">
        <Input variant="secondary" type={showPassword?'text':'password'}
          autoComplete="current-password" placeholder="Your password"
          value={password} onChange={event=>setPassword(event.target.value)}/>
        <Button type="button" variant="ghost" size="sm" isDisabled={!available}
          aria-label={showPassword?'Hide password':'Show password'}
          aria-pressed={showPassword} onPress={()=>setShowPassword(visible=>!visible)}>
          {showPassword?'Hide':'Show'}
        </Button>
      </div>
    </TextField>
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Sign-in failed</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>}
    <Button className="sb-auth-submit" type="submit" variant="primary" fullWidth
      isPending={busy} isDisabled={busy||!available}>
      {busy?'Signing in…':'Sign in to Slopboy ↗'}
    </Button>
  </form>;
}
