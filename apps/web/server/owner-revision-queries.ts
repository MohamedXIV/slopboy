/**
 * Owner-only, read-only revision metadata queries. In every query owner_id
 * comes from the verified server session, never user input. These deliberately
 * omit storage_key, artifact paths, manifest/source, game_access grants and
 * private save data: draft metadata is not a playable bundle permission.
 */
export const OWNER_GAMES_PAGE_SIZE=50;
export const OWNER_REVISION_HISTORY_LIMIT=50;

export const LIST_OWNED_GAMES_SQL=[
  "SELECT g.id::text AS id,g.title,g.status,g.visibility,",
  "r.id::text AS latest_revision_id,r.revision_number AS latest_revision_number,",
  "r.release_version AS latest_release_version,r.status AS latest_revision_status,",
  "r.engine_id AS latest_engine_id,r.engine_version AS latest_engine_version",
  "FROM public.games g",
  "LEFT JOIN LATERAL (",
  "  SELECT id,revision_number,release_version,status,engine_id,engine_version",
  "  FROM public.game_revisions WHERE game_id=g.id",
  "  ORDER BY revision_number DESC,id DESC LIMIT 1",
  ") r ON TRUE",
  "WHERE g.owner_id=$1::uuid AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=$1::uuid)",
  "ORDER BY g.created_at DESC,g.id DESC LIMIT $2::int"
].join('\n');

/**
 * A LEFT JOIN yields one row for a real owned game without revisions; no row
 * for an unknown/foreign game. This keeps "empty history" distinct from 404.
 */
export const READ_OWNED_REVISIONS_SQL=[
  "SELECT g.id::text AS game_id,",
  "r.id::text AS revision_id,r.revision_number,r.release_version,r.status AS revision_status,",
  "r.engine_id,r.engine_version,r.device_profile,r.created_at::text AS revision_created_at",
  "FROM public.games g",
  "LEFT JOIN public.game_revisions r ON r.game_id=g.id",
  "WHERE g.id=$1::uuid AND g.owner_id=$2::uuid",
  "AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2::uuid)",
  "ORDER BY r.revision_number DESC NULLS LAST,r.id DESC NULLS LAST LIMIT $3::int"
].join('\n');
