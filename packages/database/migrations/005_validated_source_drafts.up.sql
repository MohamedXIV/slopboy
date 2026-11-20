ALTER TABLE public.game_source_drafts
  ADD COLUMN engine_manifest jsonb,
  ADD COLUMN source_digest text,
  ADD COLUMN request_key uuid,
  ADD COLUMN request_digest text,
  ADD CONSTRAINT checked_source_draft CHECK (
    (engine_manifest IS NULL AND source_digest IS NULL AND request_key IS NULL AND request_digest IS NULL)
    OR (engine_manifest IS NOT NULL AND source_digest IS NOT NULL AND request_key IS NOT NULL
      AND request_digest IS NOT NULL AND request_digest ~ '^[0-9a-f]{64}$'
      AND source_digest = encode(sha256(convert_to(source_text,'UTF8')),'hex'))
  );
CREATE UNIQUE INDEX source_request_replay ON public.game_source_drafts(created_by,request_key);
CREATE INDEX source_actor_usage ON public.game_source_drafts(created_by,created_at);

-- The application passes the verified human actor. The function is invoker-rights and
-- all writes (including audit) roll back together on error.
CREATE FUNCTION public.save_validated_source(
  actor_id uuid, platform_id uuid, target_game uuid, new_game uuid, revision uuid,
  submission uuid, fingerprint text, metadata jsonb, manifest jsonb,
  source_language text, source_body text
) RETURNS TABLE(outcome text, game_id uuid, revision_id uuid, checksum text)
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  actor_role text;
  existing record;
  owned_game uuid;
  source_hash text;
  used_bytes bigint;
  recent bigint;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id=actor_id AND id<>platform_id AND role<>'system';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::uuid,NULL::text;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('slopboy.source:' || actor_id::text,0));
  IF target_game IS NOT NULL THEN
    SELECT g.id INTO owned_game FROM public.games g WHERE g.id=target_game
      AND g.visibility='private' AND g.status='draft'
      AND (g.owner_id=actor_id OR (g.owner_id=platform_id AND actor_role='admin'))
      FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::uuid,NULL::text;
      RETURN;
    END IF;
  END IF;
  SELECT d.id,d.game_id,d.request_digest,d.source_digest INTO existing
    FROM public.game_source_drafts d WHERE d.created_by=actor_id AND d.request_key=submission;
  IF FOUND THEN
    IF existing.request_digest<>fingerprint THEN
      RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::uuid,NULL::text;
    ELSE
      RETURN QUERY SELECT 'replayed',existing.game_id,existing.id,existing.source_digest;
    END IF;
    RETURN;
  END IF;
  SELECT coalesce(sum(octet_length(d.source_text)),0),
    count(*) FILTER (WHERE d.created_at>=clock_timestamp()-interval '1 hour')
    INTO used_bytes,recent FROM public.game_source_drafts d WHERE d.created_by=actor_id;
  IF recent>=20 OR used_bytes+octet_length(source_body)>1048576 THEN
    RETURN QUERY SELECT 'quota',NULL::uuid,NULL::uuid,NULL::text;
    RETURN;
  END IF;
  IF target_game IS NULL THEN
    INSERT INTO public.games(id,owner_id,title,tagline,description,genre)
      VALUES(new_game,actor_id,metadata->>'title',metadata->>'tagline',metadata->>'description',metadata->>'genre');
    owned_game := new_game;
    INSERT INTO public.audit_events(actor_id,action,target_type,target_id)
      VALUES(actor_id,'game.created','game',owned_game);
  END IF;
  source_hash := encode(sha256(convert_to(source_body,'UTF8')),'hex');
  INSERT INTO public.game_source_drafts(id,game_id,created_by,language,source_text,
      engine_manifest,source_digest,request_key,request_digest)
    VALUES(revision,owned_game,actor_id,source_language,source_body,manifest,source_hash,submission,fingerprint);
  INSERT INTO public.audit_events(actor_id,action,target_type,target_id)
    VALUES(actor_id,'game.source_draft_created','game',owned_game);
  RETURN QUERY SELECT 'stored',owned_game,revision,source_hash;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_validated_source(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text) FROM PUBLIC;
