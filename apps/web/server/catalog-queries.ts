/** Fixed, parameterized SQL. Review/visibility predicates are part of the query,
 * not post-processing of rows that might contain private game metadata. */
export const LIST_PUBLIC_GAMES_SQL=[
  "SELECT g.id::text AS id, g.title,g.tagline,g.description,g.genre,",
  "g.visibility,g.status,g.created_at::text AS cursor_created_at,",
  "g.updated_at::text AS updated_at,r.id::text AS revision_id,",
  "r.engine_id,r.engine_version,r.device_profile",
  "FROM public.games g",
  "JOIN public.game_revisions r ON r.id=g.current_published_revision_id AND r.game_id=g.id",
  "WHERE g.visibility='public' AND g.status='published' AND r.status='published'",
  "AND ($1::timestamptz IS NULL OR (g.created_at,g.id)<($1::timestamptz,$2::uuid))",
  "ORDER BY g.created_at DESC,g.id DESC LIMIT $3::int"
].join('\n');

/** A current verified session may read *its own* draft metadata, never another's.
 * Guests see only reviewed public releases. Deliberately no grant-based preview
 * until sharing / private builds have their own acceptance test. */
export const READ_VISIBLE_GAME_SQL=[
  "SELECT g.id::text AS id,g.title,g.tagline,g.description,g.genre,",
  "g.visibility,g.status,g.created_at::text AS cursor_created_at,",
  "g.updated_at::text AS updated_at,r.id::text AS revision_id,",
  "r.engine_id,r.engine_version,r.device_profile,",
  "(g.owner_id=$2::uuid) AS is_owner",
  "FROM public.games g",
  "LEFT JOIN public.game_revisions r ON r.id=g.current_published_revision_id AND r.game_id=g.id",
  "WHERE g.id=$1::uuid AND (",
  "(g.visibility='public' AND g.status='published' AND r.status='published')",
  "OR (g.owner_id=$2::uuid AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2::uuid))",
  ") LIMIT 1"
].join('\n');
