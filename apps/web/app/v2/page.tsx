import Link from 'next/link';
import {GAMES} from '@slopboy/catalog';
import {V2_DEVICE_1000,V2_DEVICE_FAMILIES} from '@slopboy/hardware/v2';
import './v2-hub.css';

export default function V2LabHome(){
  return <main className="v2-hub">
    <header className="v2-hub-header"><Link href="/" className="v2-hub-logo">SLOPBOY <em>2.0</em></Link>
      <div><span>INDEPENDENT DESIGN LAB</span><Link href="/library">Original prototype ↗</Link></div>
    </header>
    <section className="v2-hub-hero">
      <div className="v2-hub-copy">
        <p className="v2-hub-kicker">SMALL DEVICES · INFINITE WORLDS</p>
        <h1>A pocket full<br/>of <em>possibility.</em></h1>
        <p>We are rebuilding Slopboy with original collectible handhelds, visual display limits, and a game-making platform for humans and AI.</p>
        <Link className="v2-hub-cta" href="/v2/library">Open my game library <span>↗</span></Link>
        <div className="v2-hub-status"><span className="v2-dot"/> REAL PLAYABLE SLICE · NO FAKE ACCOUNT OR ONLINE FEATURES</div>
      </div>
      <div className="v2-hub-product" aria-label="Original slab-shaped handheld concept">
        <span className="v2-product-caption">CONCEPT 001 / VERTICAL SLAB</span>
        <div className="v2-hub-device">
          <div className="v2-hub-brand">SLOPBOY <small>1000</small><i/></div>
          <div className="v2-hub-bezel"><div className="v2-hub-lcd"><b>HELLO<br/>FUTURE_</b>
            <span className="v2-hub-sun"/><span className="v2-hub-hill"/></div><div className="v2-hub-label">INDEXED · 4 SHADES</div></div>
          <div className="v2-hub-buttons"><div className="v2-hub-cross"><i/><i/></div><div className="v2-hub-faces"><i/><i/></div></div>
          <div className="v2-hub-micro"><span>SELECT　 START</span><span>▥ ▥ ▥ ▥</span></div>
        </div>
        <span className="v2-product-foot">NOT EMULATION. A NEW LITTLE UNIVERSE.</span>
      </div>
    </section>
    <section className="v2-hub-library">
      <p className="v2-hub-kicker">CURRENTLY PLAYABLE / PIXEL V1 COMPATIBILITY</p>
      <h2>Three small worlds. One fresh shell.</h2>
      <div className="v2-hub-games">{GAMES.map((game,index)=><article key={game.id} className="v2-hub-card">
        <div className="v2-hub-art" style={{background:game.artwork.background,color:game.artwork.foreground}}>
          <span className="v2-hub-card-id">0{index+1} / GAME CARD</span><strong aria-hidden="true">{game.artwork.emblem}</strong><span>{game.genre.toUpperCase()}</span>
        </div>
        <div className="v2-hub-card-body"><h3>{game.title}</h3><p>{game.description}</p>
          <Link href={'/v2/play/'+game.id}>Insert &amp; play <span aria-hidden="true">↗</span></Link></div>
      </article>)}</div>
    </section>
    <section className="v2-hub-concepts"><div><p className="v2-hub-kicker">ENGINE FEASIBILITY / REAL WEBGL</p><h2>Try a KAPLAY cartridge</h2><p>A separate test game with four-color WebGL capture, an opaque sandbox and instrumentation. Not a public cartridge uploader.</p><Link href="/v2/spikes/kaplay">Open KAPLAY spike ↗</Link></div></section>
    <section className="v2-hub-concepts">
      <div><p className="v2-hub-kicker">HARDWARE IS A CONTRACT</p><h2>{V2_DEVICE_1000.display.width} × {V2_DEVICE_1000.display.height}</h2>
      <p>Every game respects a versioned virtual device. Cosmetics change appearance; resolution and indexed color count define display limits. Inputs describe the device controls, not CPU or RAM caps.</p></div>
      <div className="v2-family-list">{V2_DEVICE_FAMILIES.map(family=><div key={family.id}><span>{family.name}</span><small>{family.status==='active'?'Playable profile':'Concept only'}</small></div>)}</div>
    </section>
    <footer className="v2-hub-footer"><Link href="/">← V1 reference</Link><span>Slopboy is a working title · 2.0 design lab</span></footer>
  </main>;
}
