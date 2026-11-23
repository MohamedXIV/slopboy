CREATE TABLE public.cloud_save_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  hardware_id text NOT NULL DEFAULT 'slopboy-1000@0.1.0'
    CHECK (hardware_id = 'slopboy-1000@0.1.0'),
  save_schema integer NOT NULL DEFAULT 1 CHECK (save_schema = 1),
  payload text NOT NULL CHECK (octet_length(payload) <= 262144),
  byte_size integer GENERATED ALWAYS AS (octet_length(payload)) STORED,
  digest bytea NOT NULL CHECK (digest = sha256(convert_to(payload, 'UTF8'))),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (account_id,game_id,digest)
);

REVOKE ALL ON public.cloud_save_backups FROM PUBLIC;

-- The trusted application supplies the verified account subject.
CREATE FUNCTION public.list_cloud_save_backups(account uuid, game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'usedBytes', (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account),
    'backups', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'createdAt',created_at,'bytes',byte_size) ORDER BY created_at DESC,id),'[]'::jsonb)
      FROM public.cloud_save_backups WHERE account_id=account AND game_id=game)
  )
  WHERE EXISTS (SELECT 1 FROM public.users WHERE id=account AND role<>'system')
    AND EXISTS (SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;

CREATE FUNCTION public.create_cloud_save_backup(account uuid, game uuid, save_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF save_text IS NULL OR octet_length(save_text)>262144 THEN
    RETURN jsonb_build_object('outcome','invalid');
  END IF;

  -- Serialize backup creation across all games for this account.
  PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:' || account::text, 0));
  IF public.list_cloud_save_backups(account,game) IS NULL THEN
    RETURN jsonb_build_object('outcome','not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.cloud_save_backups
    WHERE account_id=account AND game_id=game AND digest=sha256(convert_to(save_text,'UTF8'))
      AND payload=save_text) THEN
    RETURN public.list_cloud_save_backups(account,game) || jsonb_build_object('outcome','replayed');
  END IF;
  IF (SELECT count(*) FROM public.cloud_save_backups WHERE account_id=account AND game_id=game)>=5
    OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)
      + octet_length(save_text)>10485760 THEN
    RETURN jsonb_build_object('outcome','quota');
  END IF;

  INSERT INTO public.cloud_save_backups(account_id,game_id,payload,digest)
  VALUES (account,game,save_text,sha256(convert_to(save_text,'UTF8')));
  RETURN public.list_cloud_save_backups(account,game) || jsonb_build_object('outcome','stored');
END;
$$;

REVOKE ALL ON FUNCTION public.list_cloud_save_backups(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_cloud_save_backup(uuid,uuid,text) FROM PUBLIC;
