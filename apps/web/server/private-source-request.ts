import {createHash, randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {inspectPrivateSource} from '@slopboy/cartridge';
import {currentSubject} from '../lib/auth/server';
import {sameOriginMutation} from '../lib/auth/auth-contract';
import {readBoundedJson} from './bounded-json';
import {parseGameMetadata} from './game-management-contract';
import {PLATFORM_OWNER_ID} from './game-ownership';

export const privateHeaders = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const response = (data: object, status = 200) => NextResponse.json(data, {status, headers: privateHeaders});

export async function submitPrivateSource(request: Request, gameId: string | null) {
  if (!sameOriginMutation(request.headers.get('origin'), request.url, request.headers.get('sec-fetch-site'), request.headers.get('host')))
    return response({error: 'INVALID_ORIGIN'}, 403);
  const actor = await currentSubject();
  if (!actor) return response({error: 'UNAUTHENTICATED'}, 401);
  if (!actor.emailVerified) return response({error: 'FORBIDDEN'}, 403);
  if (gameId !== null && !isGameUuid(gameId)) return response({error: 'NOT_FOUND'}, 404);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return response({error: 'EXPECTED_JSON'}, 415);

  let body: unknown;
  try { body = await readBoundedJson(request, 400_000); }
  catch { return response({error: 'INVALID_INPUT'}, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response({error: 'INVALID_INPUT'}, 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['intent','content','metadata','submission'].includes(key)) ||
      (input.intent !== 'validate' && input.intent !== 'save') || (gameId !== null && input.metadata !== undefined))
    return response({error: 'INVALID_INPUT'}, 400);
  const metadata = gameId === null ? parseGameMetadata(input.metadata) : null;
  if (gameId === null && !metadata) return response({error: 'INVALID_METADATA'}, 400);
  const content = inspectPrivateSource(input.content);
  if (!content.ok) return response({error: 'REJECTED_BY_VALIDATION', diagnostics: content.diagnostics}, 422);
  if (input.intent === 'validate') return response({status: 'validated'});
  if (typeof input.submission !== 'string' || !isGameUuid(input.submission))
    return response({error: 'INVALID_SUBMISSION'}, 400);

  const fingerprint = createHash('sha256')
    .update(JSON.stringify([gameId, metadata, content.manifest, content.language, content.source])).digest('hex');
  const url = process.env.DATABASE_URL;
  if (!url) return response({error: 'PRIVATE_STORAGE_UNAVAILABLE'}, 503);
  try {
    const db = neon(url);
    const [saved] = await db`SELECT * FROM public.save_validated_source(
      ${actor.id}::uuid, ${PLATFORM_OWNER_ID}::uuid, ${gameId}::uuid,
      ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${input.submission}::uuid, ${fingerprint},
      ${JSON.stringify(metadata)}::jsonb, ${JSON.stringify(content.manifest)}::jsonb,
      ${content.language}, ${content.source})`;
    switch (saved?.outcome) {
      case 'stored':
      case 'replayed':
        return response({gameId: saved.game_id, revisionId: saved.revision_id, checksum: saved.checksum,
          status: 'stored_validated'}, saved.outcome === 'stored' ? 201 : 200);
      case 'quota': return response({error: 'SOURCE_QUOTA'}, 429);
      case 'conflict': return response({error: 'SUBMISSION_CONFLICT'}, 409);
      case 'forbidden': return response({error: 'FORBIDDEN'}, 403);
      case 'not_found': return response({error: 'NOT_FOUND'}, 404);
    }
  } catch { /* Never log provider messages that could contain private source. */ }
  return response({error: 'PRIVATE_STORAGE_UNAVAILABLE'}, 503);
}
