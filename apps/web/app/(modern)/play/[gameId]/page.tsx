import {notFound} from 'next/navigation';
import {GAMES,getCatalogGame,getLegacyCatalogGame} from '@slopboy/catalog';
import V2DevicePlayer from '../../../../components/v2/V2DevicePlayer';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';

/** Until #24 turns on dynamic Next routes, every approved fixture is pre-rendered. */
export function generateStaticParams(){
  return GAMES.flatMap(game=>[{gameId:game.gameId},{gameId:game.legacySlug}]);
}
export default async function PlayGamePage({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  const game=getCatalogGame(gameId);
  if(game)return <V2DevicePlayer key={game.gameId} gameId={game.gameId}/>;
  const old=getLegacyCatalogGame(gameId);
  if(old)return <CompatibilityRedirect to={`/play/${old.gameId}`}/>;
  notFound();
}
