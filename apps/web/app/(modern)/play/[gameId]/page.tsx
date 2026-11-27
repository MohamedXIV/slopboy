import {notFound} from 'next/navigation';
import {managedCloudEnabled} from '../../../../server/named-cloud-api';
import {readPlayableGame} from '../../../../server/playable-catalog';
import V2DevicePlayer from '../../../../components/v2/V2DevicePlayer';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';

/** Dynamic Node SSR: unknown-at-build UUIDs are resolved on each request. */
export const dynamic='force-dynamic';
export const runtime='nodejs';

export default async function PlayGamePage({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  const game=await readPlayableGame(gameId);
  if(game&&game.gameId!==gameId)return <CompatibilityRedirect to={`/play/${game.gameId}`}/>;
  if(game)return <V2DevicePlayer key={game.gameId} game={game} managedSyncAvailable={managedCloudEnabled(process.env)}/>;
  notFound();
}
