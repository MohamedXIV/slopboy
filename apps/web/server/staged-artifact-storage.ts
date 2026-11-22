import {neon} from '@neondatabase/serverless';
import type {ProjectManifest} from './staged-artifact-policy';

export type Stage = {id: string; expiresAt: string; finalizedAt: string | null; manifest: ProjectManifest};
type Failure = {error: string};
type Operation =
  | {kind: 'initiate'; key: string; quota: number; manifest: ProjectManifest}
  | {kind: 'describe' | 'finalize' | 'list'}
  | {kind: 'read'; path: string}
  | {kind: 'upload'; path: string; body: string};

export function stagedArtifactStorage(connection: string, actor: string, game: string) {
  const sql = neon(connection);
  async function perform<T>(project: string | null, operation: Operation): Promise<T | Failure> {
    const payload = operation.kind === 'upload' ? {path: operation.path} : operation;
    const bytes = operation.kind === 'upload' ? operation.body : null;
    const [row] = await sql`SELECT public.staged_game_artifact(${actor}::uuid,${game}::uuid,
      ${project}::uuid,${operation.kind},${JSON.stringify(payload)}::jsonb,decode(${bytes},'base64')) AS result`;
    return row.result;
  }
  return {
    list: () => perform<{projects: Omit<Stage,'manifest'>[]}>(null,{kind:'list'}),
    initiate: (key: string, quota: number, manifest: ProjectManifest) =>
      perform<Stage>(null,{kind:'initiate',key,quota,manifest}),
    describe: (project: string) => perform<Stage>(project,{kind:'describe'}),
    finalize: (project: string) => perform<Stage>(project,{kind:'finalize'}),
    upload: (project: string, path: string, body: Buffer) =>
      perform<{stored: boolean}>(project,{kind:'upload',path,body:body.toString('base64')}),
    read: (project: string, path: string) => perform<{body: string; sha256: string}>(project,{kind:'read',path}),
  };
}
