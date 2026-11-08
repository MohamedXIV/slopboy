import Link from 'next/link';
import {notFound} from 'next/navigation';
import {GAMES,resolveCatalogGame} from '@slopboy/catalog';
import HandheldPlayer from '../../../components/HandheldPlayer';

export function generateStaticParams(){
  return GAMES.flatMap(game=>[{game:game.gameId},{game:game.legacySlug}]);
}
export default async function CuratedGamePage({params}:{params:Promise<{game:string}>}){
  const {game:routeId}=await params;
  const game=resolveCatalogGame(routeId);
  if(!game)notFound();
  return <main className="play-page">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
      <Link href="/library" className="back-link">← Game library</Link>
    </header>
    <HandheldPlayer key={game.gameId} gameId={game.gameId}/>
  </main>;
}
