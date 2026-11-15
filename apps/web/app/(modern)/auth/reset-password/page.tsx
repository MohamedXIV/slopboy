import Link from 'next/link';
import {Alert,Card} from '@heroui/react';
import {authReady} from '../../../../lib/auth/auth-contract';
import ResetPasswordForm from '../../../../components/auth/ResetPasswordForm';

export const dynamic='force-dynamic';
export const metadata={title:'Reset password · Slopboy'};

/** Existing accounts only; password reset never creates users. */
export default function ResetPasswordPage(){
  const configured=authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  });
  return <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
    <Card>
      <Card.Header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Slopboy · Account recovery</p>
        <Card.Title>Reset password</Card.Title>
        <Card.Description>Use a code sent to your verified email to set a new password.
          Account creation remains closed.</Card.Description>
      </Card.Header>
      <Card.Content>
        {configured?<ResetPasswordForm/>:
          <Alert status="warning">
            <Alert.Indicator/>
            <Alert.Content>
              <Alert.Title>Password reset unavailable</Alert.Title>
              <Alert.Description>Authentication is not configured in this deployment. Guest play still works.</Alert.Description>
            </Alert.Content>
          </Alert>}
      </Card.Content>
      <Card.Footer className="flex flex-col items-start gap-2">
        <Link className="link" href="/auth/sign-in">Back to sign in</Link>
        <Link className="link" href="/library">Continue as guest</Link>
      </Card.Footer>
    </Card>
  </main>;
}
