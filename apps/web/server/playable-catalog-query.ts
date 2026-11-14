/** The view exposes only published, matching game/revision/artifact rows. */
export const READ_PLAYABLE_GAME_SQL=`
SELECT id::text AS id,title,tagline,description,genre,legacy_slug,
  revision_id::text AS revision_id,manifest,content_digest,storage_key
FROM public.published_playable_games
WHERE ($2::boolean AND id::text=$1) OR (NOT $2::boolean AND legacy_slug=$1) LIMIT 1`;
