/** All source access is scoped to the owner or an admin of platform games. */
export const READ_SOURCE_DRAFT_SQL=`SELECT d.id::text AS id,d.language,d.source_text,d.engine_manifest,d.source_digest,d.created_at::text AS created_at
FROM public.games g JOIN public.users actor ON actor.id=$1::uuid
LEFT JOIN LATERAL (SELECT id,language,source_text,engine_manifest,source_digest,created_at FROM public.game_source_drafts
  WHERE game_id=g.id ORDER BY created_at DESC,id DESC LIMIT 1) d ON true
WHERE g.id=$2::uuid AND actor.role<>'system' AND actor.id<>$3::uuid
AND ((g.owner_id=actor.id AND g.owner_id<>$3::uuid) OR (g.owner_id=$3::uuid AND actor.role='admin')) LIMIT 1`;
export const CREATE_SOURCE_DRAFT_SQL=`WITH target AS (
  SELECT g.id FROM public.games g JOIN public.users actor ON actor.id=$1::uuid
  WHERE g.id=$2::uuid AND g.status<>'archived' AND actor.role<>'system' AND actor.id<>$3::uuid
  AND ((g.owner_id=actor.id AND g.owner_id<>$3::uuid) OR (g.owner_id=$3::uuid AND actor.role='admin'))
), created AS (
  INSERT INTO public.game_source_drafts(id,game_id,created_by,language,source_text)
  SELECT $4::uuid,id,$1::uuid,$5,$6 FROM target RETURNING id,game_id
), audited AS (
  INSERT INTO public.audit_events(actor_id,action,target_type,target_id)
  SELECT $1::uuid,'game.source_draft_created','game',game_id FROM created RETURNING target_id
) SELECT created.id::text AS id FROM created JOIN audited ON audited.target_id=created.game_id`;
