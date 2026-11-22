CREATE TABLE public.staged_game_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  game_id uuid NOT NULL REFERENCES public.games(id),
  request_key uuid NOT NULL,
  manifest jsonb NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 2097152),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 minutes'),
  finalized_at timestamptz,
  UNIQUE (actor_id, request_key)
);
CREATE INDEX staged_projects_expiry ON public.staged_game_projects(expires_at) WHERE finalized_at IS NULL;
CREATE TABLE public.staged_game_files (
  project_id uuid NOT NULL REFERENCES public.staged_game_projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  body bytea NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 524288),
  sha256 text GENERATED ALWAYS AS (encode(sha256(body),'hex')) STORED,
  PRIMARY KEY(project_id,path)
);
CREATE TRIGGER staged_file_immutable BEFORE UPDATE ON public.staged_game_files
  FOR EACH ROW EXECUTE FUNCTION public.slopboy_source_draft_immutable();

-- The app role can invoke this function but receives no direct table grants.
CREATE FUNCTION public.staged_game_artifact(
  actor uuid, game uuid, project uuid, operation text, input jsonb, bytes bytea
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  stage public.staged_game_projects%ROWTYPE;
  file public.staged_game_files%ROWTYPE;
  expected jsonb;
  total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('slopboy.staging:' || actor::text,0));
  PERFORM 1 FROM public.games g JOIN public.users u ON u.id=actor
    WHERE g.id=game AND g.owner_id=actor AND g.visibility='private' AND g.status='draft'
      AND u.role IN ('player','creator','admin') FOR SHARE OF g;
  IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}'; END IF;

  IF operation='list' THEN
    RETURN (SELECT jsonb_build_object('projects',coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'finalizedAt',finalized_at,'expiresAt',expires_at) ORDER BY finalized_at DESC NULLS LAST,expires_at DESC,id),'[]'))
      FROM public.staged_game_projects WHERE actor_id=actor AND game_id=game
        AND (finalized_at IS NOT NULL OR expires_at>clock_timestamp()));
  END IF;

  IF operation='initiate' THEN
    DELETE FROM public.staged_game_projects
      WHERE actor_id=actor AND finalized_at IS NULL AND expires_at<=clock_timestamp();
    SELECT * INTO stage FROM public.staged_game_projects
      WHERE actor_id=actor AND request_key=(input->>'key')::uuid;
    IF FOUND AND (stage.game_id<>game OR stage.manifest<>input->'manifest') THEN
      RETURN '{"error":"CONFLICT"}';
    END IF;
    IF NOT FOUND THEN
      IF jsonb_typeof(input->'manifest'->'files') IS DISTINCT FROM 'array'
        OR jsonb_array_length(input->'manifest'->'files') NOT BETWEEN 1 AND 16 THEN
        RETURN '{"error":"INVALID_INPUT"}';
      END IF;
      SELECT sum((f->>'bytes')::integer) INTO total FROM jsonb_array_elements(input->'manifest'->'files') f;
      IF total IS NULL OR total NOT BETWEEN 1 AND 2097152 THEN RETURN '{"error":"INVALID_INPUT"}'; END IF;
      IF (SELECT coalesce(sum(capacity),0)+total > (input->>'quota')::integer OR count(*)>=64
          FROM public.staged_game_projects WHERE actor_id=actor) THEN
        RETURN '{"error":"QUOTA"}';
      END IF;
      INSERT INTO public.staged_game_projects(actor_id,game_id,request_key,manifest,capacity)
        VALUES(actor,game,(input->>'key')::uuid,input->'manifest',total) RETURNING * INTO stage;
    END IF;
  ELSE
    SELECT * INTO stage FROM public.staged_game_projects
      WHERE id=project AND actor_id=actor AND game_id=game;
    IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}'; END IF;
    IF stage.finalized_at IS NULL AND stage.expires_at<=clock_timestamp() THEN RETURN '{"error":"EXPIRED"}'; END IF;
    IF operation IN ('upload','read') THEN
      SELECT value INTO expected FROM jsonb_array_elements(stage.manifest->'files')
        WHERE value->>'path'=input->>'path';
      IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}'; END IF;
    END IF;

    CASE operation
      WHEN 'describe' THEN NULL;
      WHEN 'upload' THEN
        IF stage.finalized_at IS NOT NULL THEN RETURN '{"error":"FINALIZED"}'; END IF;
        IF bytes IS NULL OR octet_length(bytes)<>(expected->>'bytes')::integer
          OR encode(sha256(bytes),'hex')<>expected->>'sha256' THEN
          RETURN '{"error":"DIGEST_MISMATCH"}';
        END IF;
        INSERT INTO public.staged_game_files(project_id,path,body)
          VALUES(stage.id,input->>'path',bytes) ON CONFLICT DO NOTHING;
        RETURN '{"stored":true}';
      WHEN 'finalize' THEN
        IF stage.finalized_at IS NULL THEN
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(stage.manifest->'files') f
            WHERE NOT EXISTS (SELECT 1 FROM public.staged_game_files a
              WHERE a.project_id=stage.id AND a.path=f->>'path' AND a.sha256=f->>'sha256')) THEN
            RETURN '{"error":"INCOMPLETE"}';
          END IF;
          UPDATE public.staged_game_projects SET finalized_at=clock_timestamp() WHERE id=stage.id RETURNING * INTO stage;
          INSERT INTO public.audit_events(actor_id,action,target_type,target_id)
            VALUES(actor,'game.project_finalized','game',game);
        END IF;
      WHEN 'read' THEN
        IF stage.finalized_at IS NULL THEN RETURN '{"error":"NOT_FOUND"}'; END IF;
        SELECT * INTO file FROM public.staged_game_files WHERE project_id=stage.id AND path=input->>'path';
        IF NOT FOUND THEN RETURN '{"error":"NOT_FOUND"}'; END IF;
        RETURN jsonb_build_object('body',encode(file.body,'base64'),'sha256',file.sha256);
      ELSE RETURN '{"error":"INVALID_INPUT"}';
    END CASE;
  END IF;
  RETURN jsonb_build_object('id',stage.id,'manifest',stage.manifest,
    'expiresAt',stage.expires_at,'finalizedAt',stage.finalized_at);
END;
$$;
REVOKE ALL ON FUNCTION public.staged_game_artifact(uuid,uuid,uuid,text,jsonb,bytea) FROM PUBLIC;
