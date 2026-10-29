import Link from 'next/link';
import {SLOPBOY_1000} from '@slopboy/hardware';
import CopyCreatorPrompt from '../../components/CopyCreatorPrompt';
import './create.css';

const hardware=SLOPBOY_1000;
const commands=[
  {name:'1. Scaffold',command:'pnpm creator:new my-first-game',note:'Creates the manifest and typed game starter without overwriting files.'},
  {name:'2. Validate',command:'pnpm creator:check my-first-game',note:'Checks SDK TypeScript, hardware budgets and security-screening rules.'},
  {name:'3. Package',command:'pnpm creator:build my-first-game',note:'Produces deterministic .slop cartridge; no code execution.'},
  {name:'4. Verify',command:'pnpm creator:verify my-first-game',note:'Checks that cartridge bytes still match the source.'},
  {name:'5. Preview locally',command:'pnpm creator:preview my-first-game',note:'Open creations/my-first-game/dist/my-first-game.preview.html — no upload or server.'}
];
export default function CreatePage(){
  return <main className="create-page">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
      <Link href="/library" className="creator-back">← Game Library</Link>
    </header>
    <section className="creator-main">
      <p className="eyebrow">MAKE SOMETHING SMALL / CREATE WITH ANY AI</p>
      <h1>Build your own cartridge.</h1>
      <p className="creator-lead">Make a tiny original game using TypeScript or ask ChatGPT or Claude to help. One SDK, real handheld constraints, no paid AI API required by Slopboy.</p>
      <div className="creator-note"><strong>Local creator preview · no public uploads.</strong> The tools build and validate your cartridge locally, and can generate a private standalone playable preview. Third-party games still cannot be uploaded or run on the public Slopboy site; cross-browser security tests and human review remain mandatory.</div>
      <div className="creator-grid">
        <section>
          <h2>Five commands to start</h2>
          <p className="creator-subtext">Clone <a href="https://github.com/MohamedXIV/slopboy">the source repository</a>, install Node 22 and pnpm 10, then run <code>pnpm install --frozen-lockfile --ignore-scripts</code>.</p>
          <div className="creator-steps">{commands.map(step=><div key={step.name} className="creator-step"><strong>{step.name}</strong><code>{step.command}</code><p>{step.note}</p></div>)}</div>
        </section>
        <aside className="creator-spec">
          <span className="creator-spec-overline">HARDWARE CONTRACT / v{hardware.version}</span>
          <h2>SLOPBOY 1000</h2>
          <div><span>Resolution</span><strong>{hardware.display.width} × {hardware.display.height}</strong></div>
          <div><span>Shades</span><strong>{hardware.display.indexedColors}</strong></div>
          <div><span>Controls</span><strong>D-pad · A/B · Start/Select</strong></div>
          <div><span>Compiled code</span><strong>{hardware.budgets.codeBytes/1024} KiB max</strong></div>
          <div><span>Cartridge</span><strong>{hardware.budgets.compressedBytes/1024} KiB max</strong></div>
          <div><span>Local save</span><strong>{hardware.budgets.saveBytes/1024} KiB max</strong></div>
        </aside>
      </div>
      <CopyCreatorPrompt />
      <div className="creator-footer"><p>Read the <a href="https://github.com/MohamedXIV/slopboy/blob/main/docs/creator-kit.md">complete Creator Kit guide</a> and the <a href="https://github.com/MohamedXIV/slopboy/blob/main/packages/sdk/src/index.ts">official SDK contract</a> before creating or reviewing games.</p></div>
    </section>
  </main>;
}
