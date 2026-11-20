/** Source revisions are a separate, private lineage from published game_revisions. */
const OWNER_DRAFT_BOUNDARY = `WHERE g.id=$2::uuid AND g.visibility='private' AND g.status='draft'
AND actor.role<>'system' AND actor.id<>$3::uuid
AND ((g.owner_id=actor.id AND g.owner_id<>$3::uuid)
  OR (g.owner_id=$3::uuid AND actor.role='admin'))`;

export const SOURCE_HISTORY_PAGE_SIZE = 50;

export const LIST_SOURCE_HISTORY_SQL = `SELECT d.id::text AS id,d.language,d.source_digest,
  d.created_at::text AS created_at,d.engine_manifest
FROM public.games g JOIN public.users actor ON actor.id=$1::uuid
LEFT JOIN public.game_source_drafts anchor ON anchor.id=$4::uuid AND anchor.game_id=g.id
LEFT JOIN LATERAL (
  SELECT d.id,d.language,d.source_digest,d.created_at,d.engine_manifest
  FROM public.game_source_drafts d WHERE d.game_id=g.id
  AND ($4::uuid IS NULL OR (d.created_at,d.id)<(anchor.created_at,anchor.id))
  ORDER BY d.created_at DESC,d.id DESC LIMIT ${SOURCE_HISTORY_PAGE_SIZE + 1}
) d ON TRUE
${OWNER_DRAFT_BOUNDARY}
AND ($4::uuid IS NULL OR anchor.id IS NOT NULL)
ORDER BY d.created_at DESC NULLS LAST,d.id DESC NULLS LAST`;

export const READ_SOURCE_REVISION_SQL = `SELECT d.id::text AS id,d.language,d.source_text,
  d.source_digest,d.created_at::text AS created_at,d.engine_manifest
FROM public.games g JOIN public.users actor ON actor.id=$1::uuid
JOIN public.game_source_drafts d ON d.game_id=g.id AND d.id=$4::uuid
${OWNER_DRAFT_BOUNDARY} LIMIT 1`;

export type SourceHistoryRow = {
  id: string | null;
  language: string | null;
  source_digest: string | null;
  created_at: string | null;
  engine_manifest: unknown;
};

export function sourceHistoryItems(rows: SourceHistoryRow[]) {
  return rows.filter((row): row is SourceHistoryRow & {id: string} => Boolean(row.id))
    .map(row => ({id: row.id, language: row.language, checksum: row.source_digest,
      createdAt: row.created_at, validated: row.engine_manifest !== null}));
}


export function sourceHistoryPage(rows: SourceHistoryRow[]) {
  const revisions = sourceHistoryItems(rows.slice(0, SOURCE_HISTORY_PAGE_SIZE));
  const nextBefore = rows.length > SOURCE_HISTORY_PAGE_SIZE ? revisions.at(-1)?.id ?? null : null;
  return {revisions, nextBefore};
}
