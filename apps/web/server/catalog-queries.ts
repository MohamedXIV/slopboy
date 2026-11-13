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

/** A verified owner may inspect its own *latest* draft revision metadata.
 * Guests/strangers see only the public, reviewed revision. No artifact
 * references, manifests or executable source leave this metadata query.
 * We never trust a client-supplied owner ID: $2 is the server-authenticated
 * subject, and the same owner predicate gates both row and draft join.
 */
export const READ_VISIBLE_GAME_SQL=[
  "SELECT g.id::text AS id,g.title,g.tagline,g.description,g.genre,",
  "g.visibility,g.status,g.created_at::text AS cursor_created_at,",
  "g.updated_at::text AS updated_at,",
  "COALESCE(d.id,p.id)::text AS revision_id,",
  "COALESCE(d.engine_id,p.engine_id) AS engine_id,",
  "COALESCE(d.engine_version,p.engine_version) AS engine_version,",
  "COALESCE(d.device_profile,p.device_profile) AS device_profile,",
  "COALESCE(d.status,p.status) AS revision_status,",
  "(g.owner_id=$2::uuid) AS is_owner",
  "FROM public.games g",
  "LEFT JOIN public.game_revisions p ON p.id=g.current_published_revision_id",
  "  AND p.game_id=g.id AND p.status='published'",
  "LEFT JOIN LATERAL (",
  "  SELECT r.id,r.engine_id,r.engine_version,r.device_profile,r.status",
  "  FROM public.game_revisions r",
  "  WHERE r.game_id=g.id AND g.owner_id=$2::uuid",
  "    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2::uuid)",
  "  ORDER BY r.revision_number DESC,r.id DESC LIMIT 1",
  ") d ON TRUE",
  "WHERE g.id=$1::uuid AND (",
  "  (g.visibility='public' AND g.status='published' AND p.status='published')",
  "  OR (g.owner_id=$2::uuid AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2::uuid))",
  ") LIMIT 1"
].join('\n');
