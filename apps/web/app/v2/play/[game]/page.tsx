import {notFound} from 'next/navigation';
import {GAMES,resolveCatalogGame} from '@slopboy/catalog';
import V2DevicePlayer from '../../../../components/v2/V2DevicePlayer';

// Keep both pre-cutover bookmark aliases and stable UUID links in the static V2 build.
export function generateStaticParams(){
  return GAMES.flatMap(game=>[{game:game.gameId},{game:game.legacySlug}]);
}
export default async function V2GamePage({params}:{params:Promise<{game:string}>}){
  const {game:routeId}=await params;
  const game=resolveCatalogGame(routeId);
  if(!game)notFound();
  return <V2DevicePlayer key={game.gameId} gameId={game.gameId}/>;
}
