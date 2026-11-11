'use client';

import {useState} from 'react';
import type {FormEvent} from 'react';
import {
  Alert,Button,Card,Chip,Description,Dropdown,FieldError,Form,Input,
  Label,ListBox,Modal,Popover,Radio,RadioGroup,Select,Switch,TextArea,
  TextField,Tooltip,
} from '@heroui/react';
import './batch-two.css';

type Flavor='current'|'proposed';
type Theme='light'|'dark';
type Family='select'|'textarea'|'switch'|'radio'|'modal'|'popover'|'dropdown'|'tooltip'|'validation';
type Size='desktop'|'mobile';

const FAMILIES:ReadonlyArray<{id:Family;name:string;description:string}>=[
  {id:'select',name:'Select',description:'Device palette picker with native listbox and keyboard navigation'},
  {id:'textarea',name:'Textarea',description:'Multiline description using TextField and TextArea'},
  {id:'switch',name:'Switch',description:'A real toggle, including a disabled state'},
  {id:'radio',name:'Radio group',description:'Exclusive settings with native keyboard semantics'},
  {id:'modal',name:'Dialog / Modal',description:'Accessible focus-trapped overlay with Escape dismissal'},
  {id:'popover',name:'Popover',description:'Contextual information without navigating away'},
  {id:'dropdown',name:'Dropdown menu',description:'Keyboard-navigable actions and destructive-item distinction'},
  {id:'tooltip',name:'Tooltip',description:'Secondary guidance on hover or keyboard focus'},
  {id:'validation',name:'Form validation',description:'Error, required, focus and disabled states'},
];

function overlayClasses(flavor:Flavor,theme:Theme){
  return 'sb-v2-dialog sb-b2-overlay '+theme+(flavor==='proposed'?' sb-b2-overlay-proposed':'');
}

function ComponentSample({family,flavor,theme,onAction}:{
  family:Family;flavor:Flavor;theme:Theme;onAction:(value:string)=>void;
}){
  const [alias,setAlias]=useState('');
  switch(family){
    case 'select':
      return <div className="sb-b2-stack">
        <Select placeholder="Choose a palette" defaultValue="moss" variant="secondary" fullWidth>
          <Label>LCD palette</Label>
          <Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
          <Select.Popover className={overlayClasses(flavor,theme)}>
            <ListBox>
              <ListBox.Item id="moss" textValue="Moss"><Label>Moss · four shades</Label></ListBox.Item>
              <ListBox.Item id="amber" textValue="Amber"><Label>Amber · four shades</Label></ListBox.Item>
              <ListBox.Item id="slate" textValue="Slate"><Label>Slate · four shades</Label></ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <p className="sb-lab-help">Press Enter or Space to open, then use arrow keys.</p>
      </div>;
    case 'textarea':
      return <TextField name={flavor+'-description'}>
        <Label>Cartridge description</Label>
        <TextArea variant="secondary" rows={3} placeholder="Describe your tiny game…"/>
        <Description>Keep it short enough to fit on a cartridge sleeve.</Description>
      </TextField>;
    case 'switch':
      return <div className="sb-b2-stack">
        <Switch defaultSelected>
          <Switch.Control><Switch.Thumb/></Switch.Control>
          <Switch.Content><Label>LCD screen effects</Label></Switch.Content>
        </Switch>
        <Switch isDisabled>
          <Switch.Control><Switch.Thumb/></Switch.Control>
          <Switch.Content><Label>Cloud backups (unavailable)</Label></Switch.Content>
        </Switch>
      </div>;
    case 'radio':
      return <RadioGroup defaultValue="balanced" variant="secondary" aria-label="Display scaling">
        <Label>Display scaling</Label>
        <Radio value="integer"><Radio.Content><Radio.Control><Radio.Indicator/></Radio.Control>Integer scaling</Radio.Content></Radio>
        <Radio value="balanced"><Radio.Content><Radio.Control><Radio.Indicator/></Radio.Control>Balanced scaling</Radio.Content></Radio>
      </RadioGroup>;
    case 'modal':
      return <div className="sb-b2-stack">
        <Modal>
          <Button variant="secondary">Open device dialog</Button>
          <Modal.Backdrop variant="opaque">
            <Modal.Container size="sm" placement="center">
              <Modal.Dialog className={overlayClasses(flavor,theme)} aria-label="Device settings preview">
                <Modal.CloseTrigger aria-label="Close device dialog"/>
                <Modal.Header><Modal.Heading>Device settings</Modal.Heading></Modal.Header>
                <Modal.Body>
                  <p className="sb-b2-overlay-copy">This is a native HeroUI Modal preview. Nothing is saved.</p>
                </Modal.Body>
                <Modal.Footer><Button variant="primary" slot="close">Done</Button></Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
        <p className="sb-lab-help">Tab stays inside the dialog; Escape closes it.</p>
      </div>;
    case 'popover':
      return <Popover>
        <Popover.Trigger><Button variant="secondary">About local saves</Button></Popover.Trigger>
        <Popover.Content className={overlayClasses(flavor,theme)} placement="bottom">
          <Popover.Dialog>
            <Popover.Heading>Saved on this device</Popover.Heading>
            <p className="sb-b2-overlay-copy">Guest progress stays local unless you explicitly select a future sync option.</p>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>;
    case 'dropdown':
      return <Dropdown>
        <Dropdown.Trigger><Button variant="secondary">Cartridge actions ▾</Button></Dropdown.Trigger>
        <Dropdown.Popover className={overlayClasses(flavor,theme)}>
          <Dropdown.Menu onAction={key=>onAction(flavor+' menu: '+String(key))}>
            <Dropdown.Item id="inspect" textValue="Inspect cartridge"><Label>Inspect cartridge</Label></Dropdown.Item>
            <Dropdown.Item id="copy" textValue="Copy title"><Label>Copy title (demo)</Label></Dropdown.Item>
            <Dropdown.Item id="remove" textValue="Remove from shelf" variant="danger">
              <Label>Remove from shelf (demo)</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>;
    case 'tooltip':
      return <Tooltip delay={250}>
        <Tooltip.Trigger><Button variant="outline">Hover or focus</Button></Tooltip.Trigger>
        <Tooltip.Content placement="top" showArrow className={overlayClasses(flavor,theme)}>
          <Tooltip.Arrow/>Controls can also be discovered by keyboard.
        </Tooltip.Content>
      </Tooltip>;
    case 'validation':
      return <div className="sb-b2-stack">
        <TextField name={flavor+'-handle'} isRequired isInvalid={alias.length>0&&alias.length<3}>
          <Label>Creator handle</Label>
          <Input variant="secondary" placeholder="At least 3 characters"
            value={alias} onChange={event=>setAlias(event.target.value)} autoComplete="off"/>
          <FieldError>Use at least 3 characters.</FieldError>
        </TextField>
        <TextField isDisabled name={flavor+'-invite'}>
          <Label>Invitation (not available)</Label>
          <Input variant="secondary" placeholder="Private rollout only"/>
        </TextField>
        <p className="sb-lab-help">Type 1–2 characters to see the real field validation state.</p>
      </div>;
  }
}

function AuthFields({flavor,showPassword,onVisibilityChange,onSubmit,onStatus}:{
  flavor:Flavor;showPassword:boolean;onVisibilityChange:()=>void;
  onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
  onStatus:(value:string)=>void;
}){
  return <div className="sb-b2-auth-fields">
    <Form aria-label={flavor+' authentication layout demo'} className="sb-b2-auth-form" onSubmit={onSubmit}>
      <TextField name={flavor+'-preview-email'} type="email" isRequired>
        <Label>Email</Label>
        <Input variant="secondary" type="email" placeholder="alex@slopboy.pocket" autoComplete="off"/>
        <FieldError>Enter a valid email address.</FieldError>
      </TextField>
      <TextField name={flavor+'-preview-password'} isRequired>
        <div className="sb-b2-auth-field-head"><Label>Password</Label><span>PRIVATE</span></div>
        <div className="sb-b2-auth-password">
          <Input variant="secondary" type={showPassword?'text':'password'} placeholder="Password" autoComplete="off"/>
          <Button variant="ghost" type="button" size="sm" aria-label={showPassword?'Hide password':'Show password'}
            onPress={onVisibilityChange}>{showPassword?'Hide':'Show'}</Button>
        </div>
        <FieldError>Password is required.</FieldError>
      </TextField>
      <Button type="submit" variant="primary" fullWidth>Sign in to Slopboy ↗</Button>
    </Form>
    <Alert status="default">
      <Alert.Indicator/>
      <Alert.Content>
        <Alert.Title>Private rollout</Alert.Title>
        <Alert.Description>New account registration is currently closed.</Alert.Description>
      </Alert.Content>
    </Alert>
    <Button variant="secondary" fullWidth type="button"
      onPress={()=>onStatus('Guest action preview only — no navigation.')}>Continue as guest</Button>
  </div>;
}

function AuthPanel({flavor}:{flavor:Flavor}){
  const [status,setStatus]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const proposed=flavor==='proposed';
  const onSubmit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    setStatus('Visual preview only — no credentials submitted or stored.');
  };
  return <article className={'sb-b2-auth-sample'+(proposed?' sb-lab-proposed sb-b2-auth-proposed':' sb-b2-auth-current')}
    data-auth-variant={flavor} data-preview-only="true">
    <div className="sb-b2-auth-ribbon" aria-hidden="true">
      <span>● {proposed?'SYS.LINK // ACCOUNT':'CURRENT / ACCOUNT'}</span>
      <span>{proposed?'PWR · READY':'SLOPBOY · 2.0'}</span>
    </div>
    <Card className="sb-b2-auth-card">
      {proposed?<Card.Content className="sb-b2-auth-inner">
        <div className="sb-b2-auth-hardware" aria-hidden="true">
          <span className="sb-b2-auth-vents"><i/><i/><i/><i/> MIC/SLOT</span>
          <span className="sb-b2-auth-power">● &nbsp; READY</span>
        </div>
        <div className="sb-b2-auth-tabs">
          <Button variant="secondary" aria-current="page">Sign in</Button>
          <Button variant="secondary" isDisabled>Create account · closed</Button>
        </div>
        <div className="sb-b2-auth-heading">
          <Chip variant="soft" color="accent">SLOPBOY · ACCOUNT</Chip>
          <h3>Welcome back</h3>
          <p>Sign in to access your private creator dashboard. Guest games remain available without an account.</p>
        </div>
        <AuthFields flavor={flavor} showPassword={showPassword} onVisibilityChange={()=>setShowPassword(v=>!v)}
          onSubmit={onSubmit} onStatus={setStatus}/>
        <div className="sb-b2-auth-footnote" aria-hidden="true"><span>INDEXED · 4 SHADES</span><span>VIRTUAL HANDHELD</span></div>
      </Card.Content>:
      <>
        <Card.Header>
          <p className="sb-b2-baseline-eyebrow">Slopboy · Account</p>
          <Card.Title>Welcome back</Card.Title>
          <Card.Description>Sign in to access your private creator dashboard. You can still play every guest game without an account.</Card.Description>
        </Card.Header>
        <Card.Content>
          <AuthFields flavor={flavor} showPassword={showPassword} onVisibilityChange={()=>setShowPassword(v=>!v)}
            onSubmit={onSubmit} onStatus={setStatus}/>
        </Card.Content>
      </>}
    </Card>
    <p className="sb-b2-auth-status" role="status">{status||'Preview only · authentication is not connected'}</p>
  </article>;
}

function AuthPreview(){
  const [size,setSize]=useState<Size>('desktop');
  return <section className="sb-b2-auth-section" data-auth-preview={size} aria-label="Authentication layout comparison">
    <div className="sb-b2-heading-row">
      <div><span className="sb-b2-kicker">BATCH 2 / COMPOSED UI</span>
        <h2>Authentication panel</h2>
        <p>Current component composition versus the new Slopboy design. No real auth calls, invitations or sign-up flow.</p>
      </div>
      <div className="sb-b2-viewport-switch" aria-label="Authentication preview width">
        <Button size="sm" variant="secondary" aria-pressed={size==='desktop'}
          onPress={()=>setSize('desktop')}>Desktop</Button>
        <Button size="sm" variant="secondary" aria-pressed={size==='mobile'}
          onPress={()=>setSize('mobile')}>Mobile</Button>
      </div>
    </div>
    <div className={'sb-b2-auth-grid sb-b2-auth-grid--'+size}>
      <div className="sb-b2-auth-column">
        <p className="sb-b2-auth-column-label">01 / CURRENT AUTH STRUCTURE</p>
        <AuthPanel flavor="current"/>
      </div>
      <div className="sb-b2-auth-column">
        <p className="sb-b2-auth-column-label">02 / SLOPBOY PROPOSAL</p>
        <AuthPanel flavor="proposed"/>
      </div>
    </div>
    <p className="sb-b2-review-note">The preview inherits the actual site Light/Dark preference. Mobile mode constrains each composition to a 375px viewport. No product route uses these examples.</p>
  </section>;
}

export default function BatchTwoLab({theme}:{theme:Theme}){
  const [feedback,setFeedback]=useState('Try the menus and fields; examples do not change account or game data.');
  return <div className="sb-b2-lab" data-batch="2">
    <div className="sb-b2-heading-row">
      <div>
        <span className="sb-b2-kicker">BATCH 2 / COMPONENT LIBRARY</span>
        <h2>More components, same personality.</h2>
        <p>Both columns render native HeroUI v3 components. The proposed side only applies scoped styles.</p>
      </div>
      <Chip variant="soft" color="accent">9 new demos</Chip>
    </div>
    {FAMILIES.map(item=><section className="sb-lab-family" key={item.id} data-batch-two-component={item.id}>
      <div className="sb-lab-family-heading"><h2>{item.name}</h2><p>{item.description}</p></div>
      <div className="sb-lab-pair">
        {(['current','proposed'] as const).map(flavor=><div key={flavor}
          className={'sb-lab-frame sb-lab-'+flavor+(flavor==='proposed'?' sb-b2-proposed':'')}
          data-variant={flavor}>
          <div className="sb-lab-frame-label">{flavor==='current'?'Current / baseline':'Proposed / preview'}</div>
          <div className="sb-lab-stage sb-b2-sample-stage">
            <ComponentSample family={item.id} flavor={flavor} theme={theme} onAction={setFeedback}/>
          </div>
        </div>)}
      </div>
    </section>)}
    <p className="sb-lab-action-status" aria-live="polite">{feedback}</p>
    <AuthPreview/>
  </div>;
}
