import Link from 'next/link';
import {Alert,Card,Chip,Tabs} from '@heroui/react';
import '../../../../components/auth/sign-in-panel.css';
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
    <article className="sb-auth-panel">
      <div className="sb-auth-ribbon" aria-hidden="true">
        <span>● SYS.LINK // ACCOUNT</span><span>SLOPBOY · PRIVATE</span>
      </div>
      <Card className="sb-auth-card">
        <Card.Content className="sb-auth-inner">
          <div className="sb-auth-hardware" aria-hidden="true">
            <span className="sb-auth-vents"><i/><i/><i/><i/> MIC/SLOT</span>
            <span className="sb-auth-power">● PRIVATE ACCESS</span>
          </div>
          <Tabs defaultSelectedKey="sign-in" className="sb-auth-tabs">
            <Tabs.ListContainer>
              <Tabs.List aria-label="Account options">
                <Tabs.Tab id="sign-in"><Tabs.Indicator/>Sign in</Tabs.Tab>
                <Tabs.Tab id="create-account" isDisabled>Create account · closed</Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="sign-in">
              <div className="sb-auth-heading">
                <Chip color="accent" variant="soft">SLOPBOY · ACCOUNT</Chip>
                <h1>Welcome back</h1>
                <p>Sign in to access your private creator dashboard. Guest games remain available without an account.</p>
              </div>
              <div className="sb-auth-fields">
                {configured ? <SignInForm/> :
                  <Alert status="warning">
                    <Alert.Indicator/>
                    <Alert.Content>
                      <Alert.Title>Sign-in unavailable</Alert.Title>
                      <Alert.Description>Authentication is not configured in this deployment. Guest play still works.</Alert.Description>
                    </Alert.Content>
                  </Alert>}
                <Alert status="default">
                  <Alert.Indicator/>
                  <Alert.Content>
                    <Alert.Title>Private rollout</Alert.Title>
                    <Alert.Description>New account registration is currently closed.</Alert.Description>
                  </Alert.Content>
                </Alert>
                <Link href="/library" className="link sb-auth-guest">Continue as guest</Link>
              </div>
            </Tabs.Panel>
          </Tabs>
          <div className="sb-auth-footnote" aria-hidden="true"><span>INDEXED · 4 SHADES</span><span>VIRTUAL HANDHELD</span></div>
        </Card.Content>
      </Card>
    </article>
  </main>;
}
