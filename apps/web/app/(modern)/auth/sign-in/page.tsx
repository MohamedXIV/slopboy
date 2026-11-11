import Link from 'next/link';
import {Alert, Card} from '@heroui/react';
import {authReady} from '../../../../lib/auth/auth-contract';
import SignInForm from '../../../../components/auth/SignInForm';

export const dynamic='force-dynamic';
export const metadata={title:'Sign in · Slopboy'};

export default function SignInPage(){
  const configured=authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  });

  return <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
    <Card>
      <Card.Header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Slopboy · Account</p>
        <Card.Title>Welcome back</Card.Title>
        <Card.Description>
          Sign in to access your private creator dashboard. You can still play every guest game without an account.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {configured ? <SignInForm/> :
          <Alert status="warning">
            <Alert.Indicator/>
            <Alert.Content>
              <Alert.Title>Sign-in unavailable</Alert.Title>
              <Alert.Description>Authentication is not configured in this deployment. Guest play still works.</Alert.Description>
            </Alert.Content>
          </Alert>}
      </Card.Content>
      <Card.Footer className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted">New account registration is closed during the private development rollout.</p>
        <Link className="link" href="/auth/reset-password">Reset password</Link>
        <Link className="link" href="/auth/activate">Activate an invited account</Link>
        <Link className="link" href="/library">Continue as guest</Link>
      </Card.Footer>
    </Card>
  </main>;
}
