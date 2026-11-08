import {notFound} from 'next/navigation';
import {GAMES,resolveCatalogGame} from '@slopboy/catalog';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';
export function generateStaticParams(){
  return GAMES.flatMap(game=>[{game:game.gameId},{game:game.legacySlug}]);
}
export default async function PreviousV2Game({params}:{params:Promise<{game:string}>}){
  const {game:oldId}=await params;
  const game=resolveCatalogGame(oldId);
  if(!game)notFound();
  return <CompatibilityRedirect to={`/play/${game.gameId}`}/>;
}
