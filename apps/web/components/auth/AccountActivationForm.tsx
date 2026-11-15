'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

/** Email ownership is proven by Neon OTP, never by client input or DB edits.
 * Registration stays closed; this flow is only for existing invited accounts. */
type Phase='email'|'verify'|'request-password'|'set-password'|'complete';
export default function AccountActivationForm(){
  const [phase,setPhase]=useState<Phase>('email');
  const [email,setEmail]=useState('');
  const [otp,setOtp]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const normalizedEmail=email.trim().toLowerCase();

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||phase==='complete')return;
    setBusy(true);
    setError('');
    try{
      if(phase==='email'){
        const result=await authClient.emailOtp.sendVerificationOtp({
          email:normalizedEmail,type:'email-verification',
        });
        if(result.error)throw Error('verification');
        setEmail(normalizedEmail);
        setPhase('verify');
      }else if(phase==='verify'){
        const result=await authClient.emailOtp.verifyEmail({
          email:normalizedEmail,otp:otp.trim(),
        });
        if(result.error)throw Error('verification');
        setOtp('');
        setPhase('request-password');
      }else if(phase==='request-password'){
        const result=await authClient.forgetPassword.emailOtp({email:normalizedEmail});
        if(result.error)throw Error('password-request');
        setPhase('set-password');
      }else if(phase==='set-password'){
        if(password.length<12||password!==confirmPassword){
          setError('Use a password of at least 12 characters, and make sure both entries match.');
          return;
        }
        const result=await authClient.emailOtp.resetPassword({
          email:normalizedEmail,otp:otp.trim(),password,
        });
        if(result.error)throw Error('password-reset');
        setOtp('');
        setPassword('');
        setConfirmPassword('');
        setPhase('complete');
      }
    }catch{
      setError(phase==='email'?'Could not send the verification code. Please try again.':
        phase==='verify'?'That verification code could not be accepted. Request a new one if it expired.':
        phase==='request-password'?'Could not send a password setup code. Please try again.':
        'Could not set the password. Check the code and try again.');
    }finally{setBusy(false);}
  }

  if(phase==='complete')return <div className="flex flex-col gap-4">
    <Alert status="success">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Account ready</Alert.Title>
        <Alert.Description>Your email is verified and your password has been set. Sign in to start the session test.</Alert.Description>
      </Alert.Content>
    </Alert>
    <Link className="link" href="/auth/sign-in">Go to sign in</Link>
  </div>;

  const heading={
    email:'Enter the invited email address',
    verify:'Verify your email address',
    'request-password':'Set up your password',
    'set-password':'Choose a password',
  }[phase];
  const action={
    email:'Send verification code',
    verify:'Verify email',
    'request-password':'Send password setup code',
    'set-password':'Set password',
  }[phase];

  return <form onSubmit={submit} className="flex flex-col gap-4">
    <p className="text-sm text-muted">{heading}</p>
    {phase==='email'?<TextField name="email" type="email" isRequired>
      <Label>Email</Label>
      <Input variant="secondary" type="email" autoComplete="email"
        maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/>
    </TextField>:<p className="text-sm">{normalizedEmail}</p>}
    {(phase==='verify'||phase==='set-password')&&<TextField name="otp" isRequired>
      <Label>Code sent to your email</Label>
      <Input variant="secondary" inputMode="numeric" autoComplete="one-time-code"
        maxLength={12} value={otp} onChange={event=>setOtp(event.target.value)}/>
    </TextField>}
    {phase==='set-password'&&<>
      <TextField name="new-password" type="password" isRequired>
        <Label>New password (12 characters minimum)</Label>
        <Input variant="secondary" type="password" autoComplete="new-password"
          minLength={12} value={password} onChange={event=>setPassword(event.target.value)}/>
      </TextField>
      <TextField name="confirm-password" type="password" isRequired>
        <Label>Confirm new password</Label>
        <Input variant="secondary" type="password" autoComplete="new-password"
          minLength={12} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/>
      </TextField>
    </>}
    {phase==='verify'&&<p className="text-xs text-muted">The code expires. If you need a new one, start again using the same email.</p>}
    {phase==='set-password'&&<p className="text-xs text-muted">Use the newest password setup code, not the earlier verification code. Never share a code or password in chat.</p>}
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content><Alert.Title>Could not continue</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content>
    </Alert>}
    <Button type="submit" variant="primary" fullWidth isPending={busy} isDisabled={busy}>
      {busy?'Working…':action}
    </Button>
    {phase!=='email'&&<Button type="button" variant="ghost" isDisabled={busy}
      onPress={()=>{setPhase('email');setOtp('');setPassword('');setConfirmPassword('');setError('');}}>
      Start again
    </Button>}
  </form>;
}
