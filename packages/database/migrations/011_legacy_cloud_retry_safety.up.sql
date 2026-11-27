-- Legacy retry safety prerequisite for #36. Additive, no object or row deletion.
ALTER TABLE public.cloud_save_backups ADD COLUMN last_attempt_at timestamptz;
UPDATE public.cloud_save_backups SET last_attempt_at=created_at;
ALTER TABLE public.cloud_save_backups ALTER COLUMN last_attempt_at SET DEFAULT clock_timestamp(),
 ALTER COLUMN last_attempt_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_cloud_save_backup(account uuid,game uuid,digest_hex text,bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous record; reserved_id uuid; reserved_key text;
BEGIN
 IF digest_hex IS NULL OR digest_hex !~ '^[a-f0-9]{64}$' OR bytes IS NULL OR bytes NOT BETWEEN 0 AND 262144
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_cloud_save_backups(account,game) IS NULL THEN
  RETURN jsonb_build_object('outcome','not_found'); END IF;
 -- Pending reservations remain charged until verified reconciliation.
 SELECT id,status,storage_key,byte_size,last_attempt_at INTO previous FROM public.cloud_save_backups
 WHERE account_id=account AND game_id=game AND digest=digest_hex;
 IF FOUND THEN
  IF previous.byte_size<>bytes THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
  IF previous.status='ready' THEN
   RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','replayed');
  END IF;
  IF previous.last_attempt_at>clock_timestamp()-interval '60 seconds' THEN
   RETURN jsonb_build_object('outcome','in_progress');
  END IF;
  UPDATE public.cloud_save_backups SET last_attempt_at=clock_timestamp() WHERE id=previous.id;
  -- Keep the existing reserved outcome for compatibility with deployed clients.
  RETURN jsonb_build_object('outcome','reserved','backupId',previous.id,'storageKey',previous.storage_key);
 END IF;
 IF (SELECT count(*) FROM public.cloud_save_backups WHERE account_id=account AND game_id=game)>=5
 OR ((SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account))+bytes>10485760
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.cloud_save_backups(id,account_id,game_id,digest,byte_size,storage_key)
 VALUES(reserved_id,account,game,digest_hex,bytes,reserved_key);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_cloud_save_backup(account uuid,game uuid,backup uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 SELECT status INTO row_state FROM public.cloud_save_backups
 WHERE id=backup AND account_id=account AND game_id=game FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF row_state='ready' THEN RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','replayed'); END IF;
 UPDATE public.cloud_save_backups SET status='ready',ready_at=clock_timestamp()
 WHERE id=backup AND account_id=account AND game_id=game AND status='pending';
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 RETURN public.list_cloud_save_backups(account,game)||jsonb_build_object('outcome','stored');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cloud_save_backup(account uuid,game uuid,backup uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Compatibility no-op. Absence of an HTTP response never proves no object
 -- exists or no delayed writer can finish. Only a fenced reconciler may retire.
 RETURN;
END;
$$;
