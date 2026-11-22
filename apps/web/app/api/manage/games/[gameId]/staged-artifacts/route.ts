import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '@/lib/auth/server';
import {sameOriginMutation} from '@/lib/auth/auth-contract';
import {readBoundedBytes,readBoundedJson} from '@/server/bounded-json';
import {isProceduralProject,issueArtifactTicket,parseUploadManifest,validateArtifactBytes,verifyArtifactTicket} from '@/server/staged-artifact-policy';
import {stagedArtifactStorage,type Stage} from '@/server/staged-artifact-storage';
import {privateHeaders} from '@/server/private-source-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{gameId: string}>};
const response = (data: object, status = 200) => Response.json(data,{status,headers:privateHeaders});
const failure = (error: string, status: number) => response({error},status);
const errorStatus: Readonly<Record<string,number>> = {
  NOT_FOUND:404, EXPIRED:410, QUOTA:429, INVALID_INPUT:400, CONFLICT:409, FINALIZED:409,
  INCOMPLETE:409, DIGEST_MISMATCH:422,
};

function present(stage: Stage, key: string, actor: string) {
  const now = Math.floor(Date.now()/1000);
  const expires = stage.finalizedAt ? now+300 : Math.min(now+300,Math.floor(Date.parse(stage.expiresAt)/1000));
  const action = stage.finalizedAt ? 'read' : 'upload';
  return response({
    ...stage, revisionId: stage.finalizedAt ? stage.id : null, ticketExpiresAt: expires,
    tickets: Object.fromEntries(stage.manifest.files.map(file =>
      [file.path,issueArtifactTicket(key,action,actor,stage.id,file.path,expires)])),
  });
}

async function handle(request: Request, context: Context) {
  const key = process.env.STAGED_ARTIFACT_TICKET_SECRET;
  const connection = process.env.DATABASE_URL;
  if (process.env.STAGED_ARTIFACTS_ENABLED !== '1' || !connection || !key || Buffer.byteLength(key)<32)
    return failure('UNAVAILABLE',503);
  if (request.method !== 'GET' && !sameOriginMutation(request.headers.get('origin'),request.url,
      request.headers.get('sec-fetch-site'),request.headers.get('host'))) return failure('INVALID_ORIGIN',403);
  const actor = await currentSubject();
  if (!actor) return failure('UNAUTHENTICATED',401);
  if (!actor.emailVerified) return failure('FORBIDDEN',403);
  const {gameId} = await context.params;
  if (!isGameUuid(gameId)) return failure('NOT_FOUND',404);
  const store = stagedArtifactStorage(connection,actor.id,gameId);
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  const path = url.searchParams.get('file');
  const token = request.headers.get('x-slopboy-artifact-ticket');

  try {
    if (request.method === 'GET' && project === null && path === null) {
      const list = await store.list();
      return 'error' in list ? failure(list.error,errorStatus[list.error]??503) : response(list);
    }
    if (request.method === 'POST' && project === null && path === null) {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
        return failure('UNSUPPORTED_MEDIA',415);
      let data: unknown;
      try { data = await readBoundedJson(request,8192); }
      catch { return failure('INVALID_INPUT',400); }
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2)
        return failure('INVALID_INPUT',400);
      const {key: submission,manifest: raw} = data as Record<string,unknown>;
      const manifest = parseUploadManifest(raw);
      if (typeof submission !== 'string' || !isGameUuid(submission) || !manifest) return failure('INVALID_INPUT',400);
      if (!isProceduralProject(manifest)) return failure('PROCEDURAL_SOURCE_REQUIRED',422);
      const quota = Number(process.env.STAGED_ARTIFACT_QUOTA_BYTES ?? 16*1024*1024);
      if (!Number.isSafeInteger(quota) || quota<1 || quota>64*1024*1024) return failure('UNAVAILABLE',503);
      const stage = await store.initiate(submission,quota,manifest);
      return 'error' in stage ? failure(stage.error,errorStatus[stage.error]??503) : present(stage,key,actor.id);
    }
    if (project === null || !isGameUuid(project)) return failure('NOT_FOUND',404);

    if (path === null && (request.method === 'GET' || request.method === 'POST')) {
      const stage = request.method === 'POST' ? await store.finalize(project) : await store.describe(project);
      return 'error' in stage ? failure(stage.error,errorStatus[stage.error]??503) : present(stage,key,actor.id);
    }
    if (path === null || path.length > 64 || !verifyArtifactTicket(key,token,
      request.method === 'PUT' ? 'upload' : 'read',actor.id,project,path)) return failure('INVALID_TICKET',403);

    const stage = await store.describe(project);
    if ('error' in stage) return failure(stage.error,errorStatus[stage.error]??503);
    const file = stage.manifest.files.find(item => item.path === path);
    if (!file) return failure('NOT_FOUND',404);
    if (request.method === 'PUT') {
      if (stage.finalizedAt) return failure('FINALIZED',409);
      if (request.headers.get('content-type') !== file.mime || request.headers.has('content-encoding'))
        return failure('UNSUPPORTED_MEDIA',415);
      let body: Buffer;
      try { body = Buffer.from(await readBoundedBytes(request,file.bytes)); }
      catch { return failure('INVALID_SIZE',413); }
      if (!validateArtifactBytes(stage.manifest,file,body)) return failure('INVALID_ARTIFACT',422);
      const saved = await store.upload(project,path,body);
      return 'error' in saved ? failure(saved.error,errorStatus[saved.error]??503) : response(saved);
    }
    if (request.method !== 'GET') return failure('INVALID_INPUT',400);
    const artifact = await store.read(project,path);
    if ('error' in artifact) return failure(artifact.error,errorStatus[artifact.error]??503);
    return new Response(Uint8Array.from(Buffer.from(artifact.body,'base64')), {headers:{
      ...privateHeaders, 'Content-Type':'application/octet-stream',
      'Content-Disposition':`attachment; filename="${path.split('/').at(-1)}"`,
      'Content-Length':String(file.bytes), 'Content-Security-Policy':"default-src 'none'; sandbox",
    }});
  } catch {
    return failure('UNAVAILABLE',503);
  }
}

export {handle as GET,handle as POST,handle as PUT};
