-- Restore previous fail-closed pending semantics; no snapshot or object removed.
CREATE OR REPLACE FUNCTION public.reserve_named_cloud_snapshot(account uuid,game uuid,digest_hex text,bytes integer,meta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous record; reserved_id uuid; reserved_key text; source_revision uuid;
BEGIN
 IF digest_hex IS NULL OR digest_hex !~ '^[a-f0-9]{64}$' OR bytes IS NULL OR bytes NOT BETWEEN 1 AND 262144
 OR jsonb_typeof(meta) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 IF NOT (meta ?& ARRAY['slotId','slotName','snapshotId','snapshotName','kind','revisionId','releaseVersion','schemaVersion','hardwareId','snapshotCreatedAt','payloadBytes','payloadDigest'])
 OR (SELECT count(*) FROM jsonb_object_keys(meta))<>12 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_named_cloud_snapshots(account,game) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 source_revision:=(meta->>'revisionId')::uuid;
 IF source_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.game_revisions
 WHERE id=source_revision AND game_id=game AND status='published' AND engine_id='pixel-v1')
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 SELECT id,status INTO previous FROM public.named_cloud_snapshots
 WHERE account_id=account AND game_id=game AND digest=digest_hex;
 IF FOUND THEN
  IF previous.status='ready' THEN RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','replayed'); END IF;
  RETURN jsonb_build_object('outcome','in_progress');
 END IF;
 IF (SELECT count(*) FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game)>=5
 OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+bytes>10485760 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.named_cloud_snapshots(id,account_id,game_id,hardware_id,slot_id,slot_name,snapshot_id,snapshot_name,
 kind,revision_id,release_version,save_schema,snapshot_created_ms,payload_bytes,payload_digest,storage_key,byte_size,digest)
 VALUES(reserved_id,account,game,meta->>'hardwareId',(meta->>'slotId')::uuid,meta->>'slotName',
 (meta->>'snapshotId')::uuid,meta->>'snapshotName',meta->>'kind',source_revision,meta->>'releaseVersion',
 (meta->>'schemaVersion')::integer,(meta->>'snapshotCreatedAt')::bigint,(meta->>'payloadBytes')::integer,
 meta->>'payloadDigest',reserved_key,bytes,digest_hex);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation
 THEN RETURN jsonb_build_object('outcome','invalid');
END;
$$;

ALTER TABLE public.named_cloud_snapshots DROP COLUMN last_attempt_at;
DROP FUNCTION public.consume_named_cloud_request(uuid);
DROP TABLE public.named_cloud_request_budget,public.named_cloud_global_budget;
