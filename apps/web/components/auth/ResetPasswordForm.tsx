'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {Alert,Button,Input,Label,TextField} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

type Step='request'|'reset'|'complete';

/** Reset an existing account only: Neon manages code delivery, expiry and password hashing. */
export default function ResetPasswordForm(){
  const [step,setStep]=useState<Step>('request');
  const [email,setEmail]=useState('');
  const [otp,setOtp]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const normalizedEmail=email.trim().toLowerCase();

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||step==='complete')return;
    setBusy(true);
    setError('');
    try{
      if(step==='request'){
        const result=await authClient.forgetPassword.emailOtp({email:normalizedEmail});
        if(result.error)throw Error('request');
        setEmail(normalizedEmail);
        setStep('reset');
      }else{
        if(password.length<12||password!==confirmPassword){
          setError('Use at least 12 characters and make sure both passwords match.');
          return;
        }
        const result=await authClient.emailOtp.resetPassword({
          email:normalizedEmail,otp:otp.trim(),password,
        });
        if(result.error)throw Error('reset');
        setOtp('');
        setPassword('');
        setConfirmPassword('');
        setStep('complete');
      }
    }catch{
      setError(step==='request'?
        'Could not request a reset code. Please retry.':
        'Could not reset the password. Check the newest code and try again.');
    }finally{
      setBusy(false);
    }
  }

  if(step==='complete')return <div className="flex flex-col gap-4">
    <Alert status="success">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Password updated</Alert.Title>
        <Alert.Description>Sign in with your new password. Re-enter it instead of using a saved browser password.</Alert.Description>
      </Alert.Content>
    </Alert>
    <Link className="link" href="/auth/sign-in">Go to sign in</Link>
  </div>;

  return <form className="flex flex-col gap-4" onSubmit={submit}>
    {step==='request'?<TextField name="email" type="email" isRequired>
      <Label>Account email</Label>
      <Input variant="secondary" type="email" autoComplete="email"
        maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/>
    </TextField>:<>
      <p className="text-sm text-muted">Enter the newest password-reset code sent to {normalizedEmail}.</p>
      <TextField name="otp" isRequired>
        <Label>Email code</Label>
        <Input variant="secondary" inputMode="numeric" autoComplete="one-time-code"
          maxLength={12} value={otp} onChange={event=>setOtp(event.target.value)}/>
      </TextField>
      <TextField name="new-password" type="password" isRequired>
        <Label>New password (12 characters minimum)</Label>
        <Input variant="secondary" type="password" autoComplete="new-password"
          minLength={12} value={password} onChange={event=>setPassword(event.target.value)}/>
      </TextField>
      <TextField name="confirm-password" type="password" isRequired>
        <Label>Confirm password</Label>
        <Input variant="secondary" type="password" autoComplete="new-password"
          minLength={12} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/>
      </TextField>
    </>}
    {error&&<Alert status="danger">
      <Alert.Indicator/>
      <Alert.Content><Alert.Title>Could not continue</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content>
    </Alert>}
    <Button type="submit" variant="primary" fullWidth isPending={busy} isDisabled={busy}>
      {busy?'Working…':step==='request'?'Send password reset code':'Update password'}
    </Button>
    {step==='reset'&&<Button type="button" variant="ghost" isDisabled={busy}
      onPress={()=>{setStep('request');setOtp('');setPassword('');setConfirmPassword('');setError('');}}>
      Request a new code
    </Button>}
    <p className="text-xs text-muted">Codes and passwords are never needed in chat.</p>
  </form>;
}
