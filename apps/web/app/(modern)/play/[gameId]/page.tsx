import {notFound} from 'next/navigation';
import {getLegacyCatalogGame} from '@slopboy/catalog';
import {resolvePublishedGame} from '../../../../server/published-games';
import V2DevicePlayer from '../../../../components/v2/V2DevicePlayer';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';

/** Dynamic Node SSR: unknown-at-build UUIDs are resolved on each request. */
export const dynamic='force-dynamic';
export const runtime='nodejs';

export default async function PlayGamePage({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  const game=resolvePublishedGame(gameId);
  if(game)return <V2DevicePlayer key={game.gameId} game={game}/>;
  const old=getLegacyCatalogGame(gameId);
  if(old)return <CompatibilityRedirect to={`/play/${old.gameId}`}/>;
  notFound();
}
