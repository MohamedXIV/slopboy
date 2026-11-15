import {Alert,Card,Chip,Tabs} from '@heroui/react';
import {authReady} from '../../../../lib/auth/auth-contract';
import SignInForm from '../../../../components/auth/SignInForm';
import {V2ActionLink,V2TextLink} from '../../../../components/v2/V2RouteControls';
import './auth-panel.css';

export const dynamic='force-dynamic';
export const metadata={title:'Sign in · Slopboy'};

/** The approved Lab authentication composition, connected to the actual sign-in flow. */
export default function SignInPage(){
  const configured=authReady({
    NEON_AUTH_BASE_URL:process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET:process.env.NEON_AUTH_COOKIE_SECRET,
  });

  return <main className="sb-auth-page">
    <section className="sb-auth-stage" aria-labelledby="sb-auth-title">
      <div className="sb-auth-ribbon" aria-hidden="true">
        <span>● SYS.LINK // AUTH-GATEWAY</span>
        <span>SLOPBOY / ACCOUNT</span>
      </div>
      <Card className="sb-auth-card">
        <Card.Content className="sb-auth-inner">
          <div className="sb-auth-hardware" aria-hidden="true">
            <span className="sb-auth-vents"><i/><i/><i/><i/> MIC/SLOT</span>
            <span className="sb-auth-power">● &nbsp; PWR · READY</span>
          </div>
          <Tabs className="sb-auth-tabs" defaultSelectedKey="sign-in">
            <Tabs.ListContainer>
              <Tabs.List aria-label="Account options">
                <Tabs.Tab id="sign-in"><Tabs.Indicator/>Sign in</Tabs.Tab>
                <Tabs.Tab id="create-account" isDisabled>Create account · closed</Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="sign-in">
              <div className="sb-auth-heading">
                <Chip variant="soft" color="accent">SLOPBOY · ACCOUNT</Chip>
                <h1 id="sb-auth-title">Welcome back</h1>
                <p>Sign in to access your private creator dashboard. You can still play every guest game without an account.</p>
              </div>
              <div className="sb-auth-fields">
                <SignInForm available={configured}/>
                {!configured&&<Alert status="warning">
                  <Alert.Indicator/>
                  <Alert.Content>
                    <Alert.Title>Sign-in unavailable</Alert.Title>
                    <Alert.Description>Authentication is not configured in this deployment. Guest games and local saves remain available.</Alert.Description>
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
              </div>
            </Tabs.Panel>
          </Tabs>
          <div className="sb-auth-secondary">
            <span className="sb-auth-rule">ACCOUNT OPTIONS</span>
            <V2TextLink href="/auth/activate">Have an invitation? Activate your account</V2TextLink>
          </div>
          <div className="sb-auth-footnote" aria-hidden="true">
            <span>● ● ● &nbsp; INDEXED · 4 SHADES</span>
            <span>GUEST SAVES · LOCAL</span>
          </div>
        </Card.Content>
      </Card>
      <div className="sb-auth-base" aria-hidden="true">
        <span>■ PIXEL V1 COMPATIBILITY</span>
        <span>VIRTUAL HANDHELD</span>
      </div>
    </section>
  </main>;
}
