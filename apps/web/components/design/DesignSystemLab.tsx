'use client';

import {useState} from 'react';
import {Alert,Button,Card,Checkbox,Chip,Drawer,Input,Label,Spinner,Tabs,TextField} from '@heroui/react';
import {useV2Theme} from '../v2/V2AppShell';
import './design-lab.css';

type Flavor='current'|'proposed';
type Family='buttons'|'fields'|'cards'|'tabs'|'chips'|'alerts'|'selection'|'feedback'|'drawers';
const FAMILIES:ReadonlyArray<{id:Family;title:string;description:string}>=[
  {id:'buttons',title:'Buttons',description:'Priority, secondary actions, disabled and compact states'},
  {id:'fields',title:'Text fields',description:'Email and password with native labels and keyboard focus'},
  {id:'cards',title:'Cards',description:'Reusable surfaces with natural hierarchy'},
  {id:'tabs',title:'Tabs',description:'Segmented selection without custom tab mechanics'},
  {id:'chips',title:'Chips',description:'Small statuses and category indicators'},
  {id:'alerts',title:'Alerts',description:'Clear neutral, warning and error notices'},
  {id:'selection',title:'Checkbox',description:'Native, keyboard-accessible selection'},
  {id:'feedback',title:'Loading',description:'Pending state and progress feedback'},
  {id:'drawers',title:'Drawers',description:'Interactive overlays using the same theme and portal behavior'},
];
const COLORS=[
  {name:'Midnight petrol',value:'#0d1719'},
  {name:'LCD lime',value:'#d1e99d'},
  {name:'Sage',value:'#496f45'},
  {name:'Cream',value:'#f4f0e5'},
  {name:'Surface',value:'#fffdf7'},
  {name:'Warm coral · A/B buttons',value:'#c77361'},
];

function Example({family,flavor,onAction,openDrawer,setOpenDrawer,theme}:{
  family:Family;flavor:Flavor;onAction:(message:string)=>void;
  openDrawer:Flavor|null;setOpenDrawer:(flavor:Flavor|null)=>void;
  theme:'light'|'dark';
}){
  const id=(name:string)=>flavor+'-'+name;
  switch(family){
    case 'buttons':
      return <div className="sb-lab-stack">
        <Button variant="primary" onPress={()=>onAction(flavor+' primary button pressed')}>Primary action ↗</Button>
        <div className="sb-lab-wrap">
          <Button variant="secondary" onPress={()=>onAction(flavor+' secondary button pressed')}>Secondary</Button>
          <Button variant="outline" onPress={()=>onAction(flavor+' outline button pressed')}>Outline</Button>
          <Button variant="ghost" onPress={()=>onAction(flavor+' ghost button pressed')}>Ghost</Button>
          <Button variant="secondary" className="sb-lab-warm-action"
            onPress={()=>onAction(flavor+' special edition action pressed')}>Special edition</Button>
        </div>
        <div className="sb-lab-wrap">
          <Button size="sm" variant="primary" onPress={()=>onAction(flavor+' compact action pressed')}>Compact</Button>
          <Button variant="primary" isDisabled>Unavailable</Button>
        </div>
      </div>;
    case 'fields':
      return <div className="sb-lab-stack">
        <TextField name={id('email')} type="email">
          <Label>Email</Label>
          <Input type="email" variant="secondary" placeholder="alex@slopboy.pocket" autoComplete="off"/>
        </TextField>
        <TextField name={id('password')} type="password">
          <Label>Password</Label>
          <Input type="password" variant="secondary" placeholder="Enter a password" autoComplete="off"/>
        </TextField>
        <p className="sb-lab-help">Try keyboard focus, selection and typing.</p>
      </div>;
    case 'cards':
      return <Card>
        <Card.Header>
          <Card.Title>Pocket collection</Card.Title>
          <Card.Description>Three cartridges available on this device.</Card.Description>
        </Card.Header>
        <Card.Content><p className="sb-lab-card-copy">Play a short session or open your saved games.</p></Card.Content>
        <Card.Footer><Button variant="secondary" size="sm" onPress={()=>onAction(flavor+' collection opened')}>Open collection</Button></Card.Footer>
      </Card>;
    case 'tabs':
      return <Tabs defaultSelectedKey={id('library')} className="sb-lab-tabs">
        <Tabs.ListContainer>
          <Tabs.List aria-label={flavor+' collection tabs'}>
            <Tabs.Tab id={id('library')}><Tabs.Indicator/>Library</Tabs.Tab>
            <Tabs.Tab id={id('saves')}><Tabs.Indicator/>Saves</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id={id('library')}><p className="sb-lab-tab-copy">Your installed cartridges appear here.</p></Tabs.Panel>
        <Tabs.Panel id={id('saves')}><p className="sb-lab-tab-copy">Local saves stay on this device.</p></Tabs.Panel>
      </Tabs>;
    case 'chips':
      return <div className="sb-lab-wrap">
        <Chip color="accent" variant="soft">New</Chip>
        <Chip color="success" variant="soft">Playable</Chip>
        <Chip color="warning" variant="soft">Review</Chip>
        <Chip color="danger" variant="soft">Offline</Chip>
        <Chip variant="secondary">Slopboy 1000</Chip>
        <Chip variant="secondary" className="sb-lab-coral-chip">Coral shell</Chip>
      </div>;
    case 'alerts':
      return <div className="sb-lab-stack">
        <Alert status="default">
          <Alert.Indicator/><Alert.Content>
            <Alert.Title>Guest mode</Alert.Title>
            <Alert.Description>Local games are available without an account.</Alert.Description>
          </Alert.Content>
        </Alert>
        <Alert status="warning">
          <Alert.Indicator/><Alert.Content>
            <Alert.Title>Cloud sync is unavailable</Alert.Title>
            <Alert.Description>Your local progress is unaffected.</Alert.Description>
          </Alert.Content>
        </Alert>
      </div>;
    case 'selection':
      return <div className="sb-lab-stack">
        <Checkbox defaultSelected>
          <Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control>
            Keep screen effects enabled
          </Checkbox.Content>
        </Checkbox>
        <Checkbox>
          <Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control>
            Show technical labels
          </Checkbox.Content>
        </Checkbox>
      </div>;
    case 'feedback':
      return <div className="sb-lab-stack">
        <div className="sb-lab-inline"><Spinner size="sm"/><span>Checking your collection…</span></div>
        <Button variant="primary" isPending isDisabled>Saving settings…</Button>
      </div>;
    case 'drawers':
      return <div className="sb-lab-stack">
        <Button variant="secondary" onPress={()=>setOpenDrawer(flavor)}>Open device settings ↗</Button>
        <p className="sb-lab-help">This opens a real HeroUI drawer. Escape and backdrop dismiss work.</p>
        <Drawer>
          <Drawer.Backdrop isOpen={openDrawer===flavor} onOpenChange={isOpen=>setOpenDrawer(isOpen?flavor:null)} variant="blur">
            <Drawer.Content placement="right">
              <Drawer.Dialog className={'sb-v2-dialog sb-lab-drawer '+(flavor==='proposed'?'sb-lab-drawer-proposed ':'')+theme}
                aria-label="Design lab device settings">
                <Drawer.Header>
                  <Drawer.Heading>Display preferences</Drawer.Heading>
                  <Drawer.CloseTrigger aria-label="Close device settings">✕</Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body>
                  <p>Choose settings that are local to your device. This design sample does not save changes.</p>
                  <Checkbox defaultSelected>
                    <Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control>Show screen effects</Checkbox.Content>
                  </Checkbox>
                </Drawer.Body>
                <Drawer.Footer>
                  <Button variant="primary" onPress={()=>setOpenDrawer(null)}>Done</Button>
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>;
  }
}

export default function DesignSystemLab(){
  const {theme}=useV2Theme();
  const [lastAction,setLastAction]=useState('');
  const [openDrawer,setOpenDrawer]=useState<Flavor|null>(null);
  const [elevation,setElevation]=useState<'outline'|'shadow'>('shadow');

  return <main className="sb-design-lab" data-lab-theme={theme} data-lab-elevation={elevation}>
    <header className="sb-lab-intro">
      <div className="sb-lab-eyebrow">SLOPBOY / DESIGN SYSTEM / EXPERIMENT 001</div>
      <h1>Same Slopboy. <em>Better foundations.</em></h1>
      <p>Real HeroUI v3 primitives on both sides. The left uses the current app theme; the right previews a softer tactile treatment inspired by our existing platform and auth reference. Nothing here changes the production components.</p>
      <div className="sb-lab-meta">
        <Chip variant="soft" color="accent">Isolated experiment</Chip>
        <span>Current theme: <strong>{theme}</strong> · Switch it in the site header</span>
      </div>
      <div className="sb-lab-experiments">
        <div className="sb-lab-experiment-copy">
          <strong>Surface elevation</strong>
          <span>Compare an outlined card with a subtle floating shadow. Proposed column only.</span>
        </div>
        <div className="sb-lab-elevation-switch" aria-label="Proposed card elevation">
          <Button size="sm" variant="secondary" data-elevation-choice="outline"
            aria-pressed={elevation==='outline'} onPress={()=>setElevation('outline')}>Border only</Button>
          <Button size="sm" variant="secondary" data-elevation-choice="shadow"
            aria-pressed={elevation==='shadow'} onPress={()=>setElevation('shadow')}>Soft shadow</Button>
        </div>
      </div>
      <p className="sb-lab-experiment-note">Dark header: shadow instead of the bottom rule, on this lab route only. Coral: a small optional accent inspired by the device's A/B buttons.</p>
    </header>
    <section className="sb-lab-palette" aria-label="Existing Slopboy identity colors">
      {COLORS.map(color=><div className="sb-lab-swatch" key={color.name}>
        <span className="sb-lab-swatch-color" style={{backgroundColor:color.value}}/>
        <span><strong>{color.name}</strong><small>{color.value}</small></span>
      </div>)}
    </section>

    <div className="sb-lab-column-head" aria-hidden="true">
      <div>01 / CURRENT HEROUI</div>
      <div>02 / PROPOSED SLOPBOY</div>
    </div>
    {FAMILIES.map(item=><section className="sb-lab-family" key={item.id} data-component={item.id}>
      <div className="sb-lab-family-heading">
        <h2>{item.title}</h2><p>{item.description}</p>
      </div>
      <div className="sb-lab-pair">
        {(['current','proposed'] as const).map(flavor=><div key={flavor}
          className={'sb-lab-frame sb-lab-'+flavor}
          data-variant={flavor}>
          <div className="sb-lab-frame-label">{flavor==='current'?'Current / baseline':'Proposed / preview'}</div>
          <div className="sb-lab-stage">
            <Example family={item.id} flavor={flavor} onAction={setLastAction}
              openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} theme={theme}/>
          </div>
        </div>)}
      </div>
    </section>)}
    <div className="sb-lab-action-status" aria-live="polite">
      {lastAction || 'Click any action to inspect real component feedback. No account or game data is changed.'}
    </div>
    <footer className="sb-lab-note">
      <strong>Review gate:</strong> These styles stay scoped to this lab until we agree on a visual direction.
      Existing routes, devices, game runtime and auth remain untouched.
    </footer>
  </main>;
}
