import type {PlayableGame} from '@slopboy/catalog';

/** Cartridge manifest IDs identify content, not the owner of a legacy save. */
export function gameSaveIdentity(game:PlayableGame){
  return {gameId:game.gameId,legacySlug:game.legacySaveSlug};
}
