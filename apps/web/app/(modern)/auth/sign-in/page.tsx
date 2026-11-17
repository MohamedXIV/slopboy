import {Alert} from '@heroui/react';
import {authReady} from '../../../../lib/auth/auth-contract';
import SignInForm from '../../../../components/auth/SignInForm';
import SlopboyAuthPanel from '../../../../components/ui/SlopboyAuthPanel';
import {V2ActionLink,V2TextLink} from '../../../../components/v2/V2RouteControls';

export const dynamic='force-dynamic';
export const metadata={title:'Sign in · Slopboy'};

/** The approved Lab authentication composition, connected to the actual sign-in flow. */
export default function SignInPage(){
  const configured=authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  });

  return <main className="sb-auth-page">
    <SlopboyAuthPanel titleId="sb-auth-title"
      secondary={<V2TextLink href="/auth/activate">Have an invitation? Activate your account</V2TextLink>}>
      <SignInForm available={configured}/>
      {!configured&&<Alert status="warning">
        <Alert.Indicator/>
        <Alert.Content>
          <Alert.Title>Sign-in unavailable</Alert.Title>
          <Alert.Description>Authentication is not configured in this deployment. Local saves stay on this device; previously installed games may be playable offline.</Alert.Description>
        </Alert.Content>
      </Alert>}
      <Alert status="default">
        <Alert.Indicator/>
        <Alert.Content>
          <Alert.Description>New account registration is closed during the private development rollout.</Alert.Description>
        </Alert.Content>
      </Alert>
      <V2ActionLink className="sb-auth-guest" href="/library" variant="secondary">
        Continue as guest <span className="sb-auth-guest-caption">NO CLOUD SYNC</span>
      </V2ActionLink>
    </SlopboyAuthPanel>
  </main>;
}
