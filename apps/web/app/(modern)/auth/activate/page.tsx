import Link from 'next/link';
import {Alert,Card} from '@heroui/react';
import {authReady} from '../../../../lib/auth/auth-contract';
import AccountActivationForm from '../../../../components/auth/AccountActivationForm';

export const dynamic='force-dynamic';
export const metadata={title:'Activate account · Slopboy'};

/** Invited-user activation: provider OTP verifies ownership; no sign-up API exposed. */
export default function ActivateAccountPage(){
  const configured=authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  });
  return <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
    <Card>
      <Card.Header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Slopboy · Private access</p>
        <Card.Title>Activate an invited account</Card.Title>
        <Card.Description>
          Verify the email address that was invited, then choose your own password.
          Public registration remains closed during development.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {configured?<AccountActivationForm/>:
          <Alert status="warning">
            <Alert.Indicator/>
            <Alert.Content>
              <Alert.Title>Activation unavailable</Alert.Title>
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
