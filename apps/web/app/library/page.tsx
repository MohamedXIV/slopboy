import Link from 'next/link';
import {GAMES} from '@slopboy/catalog';
import './library.css';
export default function LibraryPage(){
  return <main className="library-page">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Slopboy home"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
      <span className="pill">CURATED PROTOTYPE LIBRARY</span>
    </header>
    <section className="library-content">
      <p className="eyebrow">INSERT CARTRIDGE / CHOOSE YOUR WORLD</p>
      <h1>Pick a little adventure.</h1>
      <p className="library-lead">Three independent games. One imaginary console. Every cartridge follows the same SDK and hardware contract.</p>
      <div className="game-card-grid">
        {GAMES.map(game=><article className="game-card" key={game.id}>
          <div className="game-card-cover" aria-hidden="true" style={{background:game.artwork.background,color:game.artwork.foreground}}>
            <span className="game-card-decor">{game.artwork.emblem}</span>
            <div className="game-card-platform">SLOPBOY / 1000</div>
          </div>
          <div className="game-card-body">
            <div className="game-card-tags"><span>{game.genre}</span><span>4-SHADE</span></div>
            <h2>{game.title}</h2>
            <p className="game-card-tagline">{game.tagline}</p>
            <p className="game-card-copy">{game.description}</p>
            <Link className="game-card-play" href={`/play/${game.id}`}>Insert &amp; play <span aria-hidden="true">↗</span></Link>
          </div>
        </article>)}
      </div>
      <p className="library-notice">Curated demonstration games only. Public cartridge uploads, accounts and cloud achievements are not enabled.</p>
    </section>
  </main>;
}
