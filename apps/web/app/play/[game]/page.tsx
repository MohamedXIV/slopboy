import Link from 'next/link';
import {notFound} from 'next/navigation';
import {GAMES,getCatalogGame} from '@slopboy/catalog';
import HandheldPlayer from '../../../components/HandheldPlayer';

export function generateStaticParams(){return GAMES.map(game=>({game:game.id}));}
export default async function CuratedGamePage({params}:{params:Promise<{game:string}>}){
  const {game:id}=await params;
  const game=getCatalogGame(id);
  if(!game)notFound();
  return <main className="play-page">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
      <Link href="/library" className="back-link">← Game library</Link>
    </header>
    <HandheldPlayer key={game.id} gameId={game.id} />
  </main>;
}
