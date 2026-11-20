'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {V2TextLink} from '../v2/V2RouteControls';
import {authClient} from '../../lib/auth/client';
import {signInFailureMessage} from '../../lib/auth/sign-in-errors';

export default function SignInForm({available=true,oauthRequest=false}:{available?:boolean;oauthRequest?:boolean}){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [oauthChecking,setOAuthChecking]=useState(oauthRequest);
  const [oauthExpired,setOAuthExpired]=useState(false);

  useEffect(()=>{
    if(!oauthRequest){return;}
    const params=new URLSearchParams(window.location.search);
    // OAuth requests are signed by the provider; the SDK carries that query on continuation.
    const mustSignInAgain=(params.get('prompt')??'').split(/\s+/).some(value=>value==='login'||value==='create');
    let cancelled=false;
    (async()=>{
      try{
        const {data:session}=await authClient.getSession();
        if(!session||mustSignInAgain){if(!cancelled)setOAuthChecking(false);return;}
        // The SDK navigates to consent (or directly to the relying party).
        await authClient.oauth2.continue({selected:true});
      }catch(failure){
        if(cancelled)return;
        if((failure as {status?:number}|null)?.status===400)setOAuthExpired(true);
        else setError(signInFailureMessage(failure));
        setOAuthChecking(false);
      }
    })();
    return ()=>{cancelled=true;};
  },[oauthRequest]);

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
      if(oauthRequest){
        // A successful OAuth sign-in normally redirects itself. Resume only if it did not.
        if(!result.data?.redirect)await authClient.oauth2.continue({selected:true});
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

  if(oauthExpired)return <Alert status="danger"><Alert.Indicator/><Alert.Content>
    <Alert.Title>Sign-in request expired</Alert.Title>
    <Alert.Description>Return to ChatGPT or Claude and start the connection again.</Alert.Description>
  </Alert.Content></Alert>;
  if(oauthChecking)return <p role="status">Checking your Slopboy session…</p>;

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
