-- Never silently drop retained or pending named cloud metadata.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.named_cloud_snapshots) THEN
  RAISE EXCEPTION 'Named cloud snapshots retained; disable rollout and preserve metadata';
 END IF;
END $$;
DROP FUNCTION public.lookup_named_cloud_snapshot(uuid,uuid,uuid);
DROP FUNCTION public.confirm_named_cloud_snapshot(uuid,uuid,uuid);
DROP FUNCTION public.reserve_named_cloud_snapshot(uuid,uuid,text,integer,jsonb);
DROP FUNCTION public.list_named_cloud_snapshots(uuid,uuid);
CREATE OR REPLACE FUNCTION public.list_cloud_save_backups(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'usedBytes',(SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account),
  'backups',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'createdAt',ready_at,'bytes',byte_size) ORDER BY ready_at DESC,id),'[]'::jsonb)
   FROM public.cloud_save_backups WHERE account_id=account AND game_id=game AND status='ready'))
 WHERE EXISTS(SELECT 1 FROM public.users WHERE id=account AND role<>'system')
 AND EXISTS(SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;
CREATE OR REPLACE FUNCTION public.reserve_cloud_save_backup(account uuid,game uuid,digest_hex text,bytes integer)
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

DROP TABLE public.named_cloud_snapshots;
