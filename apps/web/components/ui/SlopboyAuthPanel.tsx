import type {ReactNode} from 'react';
import {Card,Chip,Tabs} from '@heroui/react';
import './slopboy-auth-panel.css';

interface SlopboyAuthPanelProps {
  /** Both Design Lab and the real account page render this same HeroUI composition. */
  children:ReactNode;
  titleId:string;
  headingLevel?:'h1'|'h3';
  secondary?:ReactNode;
  className?:string;
}

export default function SlopboyAuthPanel({children,titleId,headingLevel='h1',secondary,className}:SlopboyAuthPanelProps){
  const Heading=headingLevel;
  return <section className={['sb-auth-stage',className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
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
              <Heading id={titleId}>Welcome back</Heading>
              <p>Sign in to access your private creator dashboard. Your local saves stay on this device.</p>
            </div>
            <div className="sb-auth-fields">{children}</div>
          </Tabs.Panel>
        </Tabs>
        {secondary&&<div className="sb-auth-secondary">
          <span className="sb-auth-rule">ACCOUNT OPTIONS</span>
          {secondary}
        </div>}
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
  </section>;
}
