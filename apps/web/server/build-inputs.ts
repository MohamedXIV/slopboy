import {createHash} from 'node:crypto';
import {isProceduralProject,parseUploadManifest} from './staged-artifact-policy.ts';

export function describeBuildInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const manifest = raw as Record<string,unknown>;
  const engine = manifest.engine as Record<string,unknown> | undefined;
  const normalized = parseUploadManifest({files:manifest.files});
  if (!normalized || !isProceduralProject(normalized) || manifest.schemaVersion !== normalized.schemaVersion ||
      manifest.deviceProfile !== normalized.deviceProfile || manifest.entrypoint !== normalized.entrypoint ||
      engine?.id !== normalized.engine.id || engine?.version !== normalized.engine.version ||
      engine?.adapterProtocol !== normalized.engine.adapterProtocol) return null;

  // Reconstruct a fixed key order independently of the JSONB representation.
  // Use code-unit order for ASCII paths so the digest is independent of ICU.
  const files = [...normalized.files].sort((left,right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const input = {...normalized,files};
  const inputDigest = createHash('sha256')
    .update('slopboy-build-input-v1\0').update(JSON.stringify(input)).digest('hex');
  return {state:'blocked_by_adapter',inputDigest,input} as const;
}

export const READ_OWNED_BUILD_SOURCE_SQL = `SELECT d.engine_manifest,d.language,d.source_digest,
  octet_length(d.source_text) AS source_bytes
FROM public.game_source_drafts d
JOIN public.games g ON g.id=d.game_id
JOIN public.users u ON u.id=g.owner_id
WHERE g.owner_id=$1::uuid AND g.id=$2::uuid AND d.id=$3::uuid
  AND g.visibility='private' AND g.status='draft' AND u.role<>'system'`;

export function describeSingleFileBuildInput(row: {
  engine_manifest: unknown; language: string; source_digest: string; source_bytes: number;
}) {
  if (!row.engine_manifest || typeof row.engine_manifest !== 'object') return null;
  const typescript = row.language === 'typescript';
  if (!typescript && row.language !== 'javascript') return null;
  return describeBuildInput({...row.engine_manifest,files:[{
    path:typescript ? 'src/game.ts' : 'src/game.js',
    mime:typescript ? 'text/typescript' : 'text/javascript',
    bytes:row.source_bytes,
    sha256:row.source_digest,
  }]});
}
