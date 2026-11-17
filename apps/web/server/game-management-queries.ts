/** Fixed parameterized statements; actor is always the verified server session. */
export const CREATE_GAME_SQL=`
WITH actor AS (SELECT id,role FROM public.users WHERE id=$1::uuid AND role <> 'system' AND id<>$2::uuid),
created AS (
  INSERT INTO public.games(id,owner_id,title,tagline,description,genre)
  SELECT $3::uuid,CASE WHEN $4::boolean THEN $2::uuid ELSE actor.id END,$5,$6,$7,$8
  FROM actor WHERE NOT $4::boolean OR actor.role='admin'
  RETURNING id,owner_id,title,status,visibility
), audited AS (
  INSERT INTO public.audit_events(actor_id,action,target_type,target_id,metadata)
  SELECT $1::uuid,'game.created','game',id,jsonb_build_object('owner_id',owner_id) FROM created
  RETURNING target_id
) SELECT created.id::text AS id,created.title,created.status,created.visibility
  FROM created JOIN audited ON audited.target_id=created.id`;
export const UPDATE_GAME_SQL=`
WITH actor AS (SELECT id,role FROM public.users WHERE id=$1::uuid AND role <> 'system' AND id<>$2::uuid),
changed AS (
  UPDATE public.games g SET title=$4,tagline=$5,description=$6,genre=$7,updated_at=clock_timestamp()
  FROM actor WHERE g.id=$3::uuid AND g.status='draft' AND g.visibility='private' AND
    ((g.owner_id=actor.id AND g.owner_id<>$2::uuid) OR (g.owner_id=$2::uuid AND actor.role='admin'))
  RETURNING g.id,g.owner_id,g.title,g.status,g.visibility
), audited AS (
  INSERT INTO public.audit_events(actor_id,action,target_type,target_id,metadata)
  SELECT $1::uuid,'game.metadata_updated','game',id,jsonb_build_object('owner_id',owner_id) FROM changed
  RETURNING target_id
) SELECT changed.id::text AS id,changed.title,changed.status,changed.visibility
  FROM changed JOIN audited ON audited.target_id=changed.id`;
