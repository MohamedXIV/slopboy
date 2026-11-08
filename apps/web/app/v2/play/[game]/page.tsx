import {notFound} from 'next/navigation';
import {getLegacyCatalogGame} from '@slopboy/catalog';
import {resolvePublishedGame} from '../../../server/published-games';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';

export const dynamic='force-dynamic';
export default async function PreviousV2Game({params}:{params:Promise<{game:string}>}){
  const {game:oldId}=await params;
  const game=resolvePublishedGame(oldId)??getLegacyCatalogGame(oldId);
  if(!game)notFound();
  return <CompatibilityRedirect to={`/play/${game.gameId}`}/>;
}
