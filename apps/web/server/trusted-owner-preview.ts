import {isGameUuid} from '@slopboy/catalog';
import {createHash} from 'node:crypto';

export function trustedOwnerPreviewEnabled() {
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.TRUSTED_OWNER_PREVIEW_ENABLED === '1';
}

export async function trustedOwnerPreview(
  enabled:boolean,
  actor:{id:string;emailVerified:boolean}|null,
  gameId:string,
  read:(actorId:string,gameId:string)=>Promise<{title:string}|null>,
) {
  if (!enabled || !actor?.emailVerified || !isGameUuid(gameId)) return null;
  const game = await read(actor.id,gameId);
  if (!game) return null;
  const slot = createHash('sha256').update(JSON.stringify([actor.id,gameId])).digest('hex');
  return {title:game.title,saveKey:`slopboy-trusted-owner-preview-v1:${slot}`};
}
