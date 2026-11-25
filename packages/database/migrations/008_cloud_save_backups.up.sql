-- Cloud Saves #36: immutable object payloads belong in PRIVATE storage, not PostgreSQL.
CREATE TABLE public.cloud_save_backups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 hardware_id text NOT NULL DEFAULT 'slopboy-1000@0.1.0' CHECK (hardware_id='slopboy-1000@0.1.0'),
 save_schema integer NOT NULL DEFAULT 1 CHECK (save_schema=1),
 storage_key text NOT NULL UNIQUE CHECK (storage_key LIKE 'backups/%' AND length(storage_key)<=512),
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 0 AND 262144),
 digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ready_at timestamptz,
 CHECK ((status='ready') = (ready_at IS NOT NULL)),
 UNIQUE(account_id,game_id,digest)
);
CREATE INDEX cloud_save_account_quota ON public.cloud_save_backups(account_id,status);
REVOKE ALL ON public.cloud_save_backups FROM PUBLIC;
CREATE FUNCTION public.list_cloud_save_backups(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'usedBytes',(SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account),
  'backups',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'createdAt',ready_at,'bytes',byte_size) ORDER BY ready_at DESC,id),'[]'::jsonb)
   FROM public.cloud_save_backups WHERE account_id=account AND game_id=game AND status='ready'))
 WHERE EXISTS(SELECT 1 FROM public.users WHERE id=account AND role<>'system')
 AND EXISTS(SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;
CREATE FUNCTION public.reserve_cloud_save_backup(account uuid,game uuid,digest_hex text,bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous record; reserved_id uuid; reserved_key text;
BEGIN
 IF digest_hex IS NULL OR digest_hex !~ '^[a-f0-9]{64}$' OR bytes IS NULL OR bytes NOT BETWEEN 0 AND 262144
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_cloud_save_backups(account,game) IS NULL THEN
  RETURN jsonb_build_object('outcome','not_found'); END IF;
 -- Expired reservations release quota; uploaded-orphan cleanup remains a rollout gate.
 DELETE FROM public.cloud_save_backups WHERE account_id=account AND status='pending'
 AND created_at < clock_timestamp()-interval '15 minutes';
 SELECT id,status INTO previous FROM public.cloud_save_backups
 WHERE account_id=account AND game_id=game AND digest=digest_hex;
 IF FOUND THEN
  IF previous.status='ready' THEN
   RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','replayed');
  END IF;
  RETURN jsonb_build_object('outcome','in_progress');
 END IF;
 IF (SELECT count(*) FROM public.cloud_save_backups WHERE account_id=account AND game_id=game)>=5
 OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+bytes>10485760
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.cloud_save_backups(id,account_id,game_id,digest,byte_size,storage_key)
 VALUES(reserved_id,account,game,digest_hex,bytes,reserved_key);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
END;
$$;
CREATE FUNCTION public.confirm_cloud_save_backup(account uuid,game uuid,backup uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 SELECT status INTO row_state FROM public.cloud_save_backups
 WHERE id=backup AND account_id=account AND game_id=game FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF row_state='ready' THEN RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','replayed'); END IF;
 UPDATE public.cloud_save_backups SET status='ready',ready_at=clock_timestamp()
 WHERE id=backup AND account_id=account AND game_id=game AND status='pending'
 AND created_at>=clock_timestamp()-interval '15 minutes';
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','expired'); END IF;
 RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','stored');
END;
$$;
CREATE FUNCTION public.release_cloud_save_backup(account uuid,game uuid,backup uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 DELETE FROM public.cloud_save_backups WHERE id=backup AND account_id=account
 AND game_id=game AND status='pending';
END;
$$;
REVOKE ALL ON FUNCTION public.list_cloud_save_backups(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_cloud_save_backup(uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_cloud_save_backup(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_cloud_save_backup(uuid,uuid,uuid) FROM PUBLIC;
