'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '../../lib/auth/client';
export default function SignInForm(){
  const router=useRouter();
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');
    try{
      const result=await authClient.signIn.email({email,password});
      if(result.error){setError('Could not sign in. Check your credentials and try again.');return;}
      router.replace('/dashboard');router.refresh();
    }catch{setError('Sign-in service unavailable. Try again later.');}
    finally{setBusy(false);}
  }
  return <form className="sb-account-form" onSubmit={submit}>
    <label>Email<input name="email" type="email" autoComplete="email" maxLength={254}
      required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Password<input name="password" type="password" autoComplete="current-password"
      required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
  </form>;
}
