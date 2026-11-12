import {resolvePublishedGame} from '../../../../server/published-games';

/** Reviewed, PUBLIC, runtime-resolved cartridge metadata; no accounts or drafts. */
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  const game=resolvePublishedGame(gameId);
  if(!game)return Response.json({error:'Not found'},{status:404,headers:{'Cache-Control':'no-store'}});
  return Response.json({
    format:'slopboy-public-game-v1',
    gameId:game.gameId,revisionId:game.revisionId,title:game.title,
    manifestId:game.legacySlug,cartridge:game.cartridge
  },{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
