import Link from 'next/link';
import {notFound} from 'next/navigation';
import {GAMES,resolveCatalogGame} from '@slopboy/catalog';
import HandheldPlayer from '../../../../components/HandheldPlayer';

export function generateStaticParams(){
  return GAMES.flatMap(game=>[{legacySlug:game.gameId},{legacySlug:game.legacySlug}]);
}
export default async function CuratedGamePage({params}:{params:Promise<{legacySlug:string}>}){
  const {legacySlug:routeId}=await params;
  const game=resolveCatalogGame(routeId);
  if(!game)notFound();
  return <main className="play-page">
    <header className="topbar">
      <Link className="brand" href="/legacy"><span className="brand-icon">S</span>SLOPBOY<span className="accent">.</span></Link>
      <Link href="/legacy/library" className="back-link">← Game library</Link>
    </header>
    <HandheldPlayer key={game.gameId} gameId={game.gameId}/>
  </main>;
}
