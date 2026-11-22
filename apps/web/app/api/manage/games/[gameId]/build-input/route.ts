import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '@/lib/auth/server';
import {describeBuildInput,describeSingleFileBuildInput,READ_OWNED_BUILD_SOURCE_SQL} from '@/server/build-inputs';
import {privateHeaders} from '@/server/private-source-request';
import {stagedArtifactStorage} from '@/server/staged-artifact-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (body:object,status=200) => Response.json(body,{headers:privateHeaders,status});

export async function GET(request:Request,{params}:{params:Promise<{gameId:string}>}) {
  const actor = await currentSubject();
  if (!actor) return json({error:'UNAUTHENTICATED'},401);
  if (!actor.emailVerified) return json({error:'FORBIDDEN'},403);
  const {gameId} = await params;
  const query = new URL(request.url).searchParams;
  const revisionId = query.get('revision');
  const kind = query.get('kind');
  if (!isGameUuid(gameId) || !revisionId || !isGameUuid(revisionId) ||
      (kind !== 'source' && kind !== 'project')) return json({error:'NOT_FOUND'},404);
  const connection = process.env.DATABASE_URL;
  if (!connection || (kind === 'project' && process.env.STAGED_ARTIFACTS_ENABLED !== '1'))
    return json({error:'UNAVAILABLE'},503);

  try {
    if (kind === 'project') {
      const project = await stagedArtifactStorage(connection,actor.id,gameId).describe(revisionId);
      if ('error' in project || !project.finalizedAt) return json({error:'NOT_FOUND'},404);
      const descriptor = describeBuildInput(project.manifest);
      return descriptor ? json({revisionId,kind,...descriptor}) : json({error:'UNSUPPORTED_INPUT'},409);
    }

    const [source] = await neon(connection).query(READ_OWNED_BUILD_SOURCE_SQL,[actor.id,gameId,revisionId]);
    if (!source) return json({error:'NOT_FOUND'},404);
    const descriptor = describeSingleFileBuildInput(source as Parameters<typeof describeSingleFileBuildInput>[0]);
    return descriptor ? json({revisionId,kind,...descriptor}) : json({error:'UNSUPPORTED_INPUT'},409);
  } catch {
    return json({error:'UNAVAILABLE'},503);
  }
}
