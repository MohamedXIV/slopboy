-- Source and immutable IDs survive. Export validation and idempotency metadata before rollback.
DROP FUNCTION public.save_validated_source(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text);
DROP INDEX public.source_actor_usage;
DROP INDEX public.source_request_replay;
ALTER TABLE public.game_source_drafts DROP CONSTRAINT checked_source_draft,
  DROP COLUMN engine_manifest, DROP COLUMN source_digest, DROP COLUMN request_key, DROP COLUMN request_digest;
