import {notFound} from 'next/navigation';
import {readPlayableGame} from '../../../../server/playable-catalog';
import CompatibilityRedirect from '../../../../components/CompatibilityRedirect';

export const dynamic='force-dynamic';
export default async function PreviousV2Game({params}:{params:Promise<{game:string}>}){
  const {game:oldId}=await params;
  const game=await readPlayableGame(oldId);
  if(!game)notFound();
  return <CompatibilityRedirect to={`/play/${game.gameId}`}/>;
}
