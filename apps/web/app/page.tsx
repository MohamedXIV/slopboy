import {SLOPBOY_1000} from '@slopboy/hardware';
import Link from 'next/link';
const device=SLOPBOY_1000;
export default function Home(){
 return <main>
  <header className="topbar">
   <Link className="brand" href="/" aria-label="Slopboy home"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
   <span className="pill">EARLY PROTOTYPE</span>
  </header>
  <div className="hero">
   <section className="intro">
    <p className="eyebrow">● THE IMAGINARY CONSOLE CLUB</p>
    <h1>Tiny hardware.<br/><span>Limitless ideas.</span></h1>
    <p className="description">Original virtual handhelds, real technical limitations and tiny worlds built by people or AI. A new home for games you can hold in your imagination.</p>
    <div className="links"><Link className="primary" href="/library">Explore 3 games ↗</Link><a className="secondary" href="https://github.com/MohamedXIV/slopboy">Follow development ↗</a></div>
    <p className="disclaimer">P2 curated library preview — three independent cartridges; public uploads and account features are not enabled.</p>
   </section>
   <aside className="stage" aria-label="Illustration of an original imaginary console; controls are not interactive">
    <span className="stage-label">CONCEPT // MODEL 001</span>
    <div className="console">
     <div className="wordmark">SLOPBOY <small>1000</small></div>
     <div className="bezel">
      <div className="lcd"><span className="sun"/><span className="mountain"/><strong>HELLO<br/>FUTURE_</strong></div>
      <p>4 SHADE MONO LCD</p>
     </div>
     <div className="controls"><div className="dpad"><i/><b/></div><div className="action"><i/><i/></div></div>
     <div className="bottom"><span>SELECT　START</span><span>▥ ▥ ▥ ▥</span></div>
    </div>
    <span className="stage-footer">NO EMULATION.<br/>ALL IMAGINATION.</span>
   </aside>
  </div>
  <section className="hardware" id="hardware">
   <div className="hardware-inner">
    <div className="section-heading"><div><p className="eyebrow">HARDWARE PROFILE / 001</p><h2>{device.id.toUpperCase()}</h2><p className="description">Every imaginary console has a versioned, testable hardware contract. These numbers are provisional until mobile testing.</p></div><span className="pill">SPEC v{device.version}</span></div>
    <div className="stats"><Spec label="DISPLAY" value={device.display.width+' × '+device.display.height} sub="Logical pixels"/><Spec label="PALETTE" value={device.display.indexedColors+' shades'} sub="Indexed LCD"/><Spec label="INPUT" value="D-Pad + A/B" sub="Start / Select"/><Spec label="CARTRIDGE" value="512 KiB" sub="Compressed budget"/></div>
    <p className="footnote">P2 prototype: three independently packaged games share one SDK and isolated Worker runtime. Visit the game library to choose a cartridge. Public submissions remain disabled.</p>
   </div>
  </section>
  <footer><span>© Slopboy — working title.</span><span>Open development · $0/month MVP target</span></footer>
 </main>;
}
function Spec({label,value,sub}:{label:string;value:string;sub:string}){
 return <div className="stat"><p>{label}</p><strong>{value}</strong><span>{sub}</span></div>;
}
