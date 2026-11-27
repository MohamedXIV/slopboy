-- #36: bounded transactional managed autosaves; explicit backups remain in S3.
-- Old object-backed managed rows, if any, remain intact and separately audited.
ALTER TABLE public.managed_auto_snapshots ADD COLUMN payload_text text;
ALTER TABLE public.managed_auto_snapshots ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE public.managed_auto_snapshots ADD CONSTRAINT managed_auto_storage_mode CHECK (
 (payload_text IS NULL AND storage_key IS NOT NULL) OR
 (payload_text IS NOT NULL AND storage_key IS NULL AND status='ready' AND retired_at IS NULL
  AND octet_length(payload_text)=byte_size AND encode(sha256(convert_to(payload_text,'UTF8')),'hex')=digest)
);

CREATE FUNCTION public.store_atomic_managed_autosave(account uuid,game uuid,device uuid,raw text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE envelope jsonb; s jsonb; source_revision uuid; digest_hex text; bytes integer;
 previous record; evicted_bytes bigint; evicted_count bigint; stamp timestamptz;
BEGIN
 IF device IS NULL OR raw IS NULL OR octet_length(raw) NOT BETWEEN 1 AND 262144 THEN
  RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_managed_auto_snapshots(account,game,device) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 -- Never mix storage modes in a stream. Previous object rows require operator reconciliation.
 IF EXISTS(SELECT 1 FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device AND storage_key IS NOT NULL)
 THEN RETURN jsonb_build_object('outcome','in_progress'); END IF;
 envelope:=raw::jsonb; s:=envelope->'snapshot'; source_revision:=(s->>'revisionId')::uuid;
 IF envelope->>'format' IS DISTINCT FROM 'slopboy-cloud-snapshot-v1' OR envelope->>'gameId' IS DISTINCT FROM game::text
 OR envelope->>'hardwareId' IS DISTINCT FROM 'slopboy-1000' OR envelope->>'hardwareVersion' IS DISTINCT FROM '0.1.0'
 OR s->>'kind' IS DISTINCT FROM 'auto' OR source_revision IS NULL OR jsonb_typeof(s->'data') IS DISTINCT FROM 'string'
 OR (s->>'bytes')::integer IS DISTINCT FROM octet_length(s->>'data')
 OR s->>'digest' IS DISTINCT FROM encode(sha256(convert_to(s->>'data','UTF8')),'hex')
 OR NOT EXISTS(SELECT 1 FROM public.game_revisions WHERE id=source_revision AND game_id=game AND status='published' AND engine_id='pixel-v1')
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 bytes:=octet_length(raw); digest_hex:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 SELECT id,payload_text INTO previous FROM public.managed_auto_snapshots
 WHERE account_id=account AND game_id=game AND device_id=device AND digest=digest_hex;
 IF FOUND THEN
  IF previous.payload_text IS DISTINCT FROM raw THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
  RETURN public.list_managed_auto_snapshots(account,game,device)||jsonb_build_object('outcome','replayed');
 END IF;
 -- Global cap is a deliberate prelaunch safety limit, not a provider quota.
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-atomic-autosave-global',0));
 SELECT coalesce(sum(byte_size),0),count(*) INTO evicted_bytes,evicted_count
 FROM (SELECT byte_size FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device
 AND payload_text IS NOT NULL ORDER BY insertion_order DESC OFFSET 4) AS obsolete;
 IF (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)
 +(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)
 +(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account)
 -evicted_bytes+bytes>10485760
 OR (SELECT count(*) FROM public.managed_auto_snapshots WHERE account_id=account)-evicted_count+1>100
 OR (SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE storage_key IS NULL)-evicted_bytes+bytes>16777216
 OR (SELECT count(*) FROM public.managed_auto_snapshots WHERE storage_key IS NULL)-evicted_count+1>1000
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 stamp:=clock_timestamp();
 INSERT INTO public.managed_auto_snapshots(account_id,game_id,device_id,hardware_id,slot_id,slot_name,snapshot_id,snapshot_name,
 kind,revision_id,release_version,save_schema,snapshot_created_ms,payload_bytes,payload_digest,storage_key,byte_size,digest,status,created_at,ready_at,last_attempt_at,payload_text)
 VALUES(account,game,device,'slopboy-1000@0.1.0',(envelope->>'slotId')::uuid,envelope->>'slotName',(s->>'id')::uuid,s->>'name',
 'auto',source_revision,s->>'releaseVersion',(s->>'schemaVersion')::integer,(s->>'createdAt')::bigint,(s->>'bytes')::integer,s->>'digest',
 NULL,bytes,digest_hex,'ready',stamp,stamp,stamp,raw);
 -- The new verified row and rotation commit together; rollback retains all previous rows.
 DELETE FROM public.managed_auto_snapshots WHERE id IN (
 SELECT id FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device AND payload_text IS NOT NULL
 ORDER BY insertion_order DESC OFFSET 5);
 RETURN public.list_managed_auto_snapshots(account,game,device)||jsonb_build_object('outcome','stored');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation
 THEN RETURN jsonb_build_object('outcome','invalid');
END;
$$;
CREATE FUNCTION public.read_atomic_managed_autosave(account uuid,game uuid,device uuid,backup uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',id,'digest',digest,'bytes',byte_size,'snapshot',payload_text)
 FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device AND id=backup
 AND payload_text IS NOT NULL AND public.list_managed_auto_snapshots(account,game,device) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.store_atomic_managed_autosave(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_atomic_managed_autosave(uuid,uuid,uuid,uuid) FROM PUBLIC;
