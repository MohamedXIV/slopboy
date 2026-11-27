-- #36: managed autosave metadata, separate from pinned explicit backups.
-- No app grants, object deletion or active automatic sync in this migration.
CREATE TABLE public.managed_auto_snapshots (
 LIKE public.named_cloud_snapshots INCLUDING DEFAULTS INCLUDING CONSTRAINTS,
 device_id uuid NOT NULL,
 insertion_order bigint GENERATED ALWAYS AS IDENTITY,
 retired_at timestamptz,
 PRIMARY KEY(id),
 UNIQUE(storage_key),
 UNIQUE(account_id,game_id,device_id,digest),
 FOREIGN KEY(account_id) REFERENCES public.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE RESTRICT,
 CHECK(kind='auto'),
 CHECK(retired_at IS NULL OR status='ready')
);
CREATE INDEX managed_auto_account_stream ON public.managed_auto_snapshots(account_id,game_id,device_id,insertion_order);
CREATE UNIQUE INDEX managed_auto_one_pending ON public.managed_auto_snapshots(account_id,game_id,device_id) WHERE status='pending';
REVOKE ALL ON public.managed_auto_snapshots FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_cloud_save_backups(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'usedBytes',((SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account)),
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
 OR ((SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account))+bytes>10485760
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.cloud_save_backups(id,account_id,game_id,digest,byte_size,storage_key)
 VALUES(reserved_id,account,game,digest_hex,bytes,reserved_key);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_named_cloud_snapshots(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('usedBytes',(SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account),'snapshots',
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'slotId',slot_id,'slotName',slot_name,'snapshotId',snapshot_id,
    'snapshotName',snapshot_name,'kind',kind,'revisionId',revision_id,
    'releaseVersion',release_version,'schemaVersion',save_schema,'hardwareId',hardware_id,
    'snapshotCreatedAt',snapshot_created_ms,'payloadBytes',payload_bytes,'payloadDigest',payload_digest,
    'bytes',byte_size,'digest',digest,'storedAt',ready_at) ORDER BY ready_at DESC,id),'[]'::jsonb)
   FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game AND status='ready'))
 WHERE EXISTS(SELECT 1 FROM public.users WHERE id=account AND role='admin')
 AND EXISTS(SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;

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
 SELECT id,status,storage_key,byte_size,last_attempt_at INTO previous FROM public.named_cloud_snapshots
 WHERE account_id=account AND game_id=game AND digest=digest_hex;
 IF FOUND THEN
  IF previous.status='ready' THEN RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','replayed'); END IF;
  IF previous.byte_size<>bytes THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
  IF previous.last_attempt_at>clock_timestamp()-interval '60 seconds' THEN
   RETURN jsonb_build_object('outcome','in_progress');
  END IF;
  -- Same digest, same reserved bytes and same immutable key. No new quota,
  -- no deletion; conditional PUT/readback makes a delayed older writer safe.
  UPDATE public.named_cloud_snapshots SET last_attempt_at=clock_timestamp() WHERE id=previous.id;
  RETURN jsonb_build_object('outcome','resumed','backupId',previous.id,'storageKey',previous.storage_key);
 END IF;
 IF (SELECT count(*) FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game)>=5
 OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account)+bytes>10485760 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
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

CREATE OR REPLACE FUNCTION public.list_managed_auto_snapshots(account uuid,game uuid,device uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('usedBytes',(SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account),'snapshots',
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'slotId',slot_id,'slotName',slot_name,'snapshotId',snapshot_id,
    'snapshotName',snapshot_name,'kind',kind,'revisionId',revision_id,
    'releaseVersion',release_version,'schemaVersion',save_schema,'hardwareId',hardware_id,
    'snapshotCreatedAt',snapshot_created_ms,'payloadBytes',payload_bytes,'payloadDigest',payload_digest,
    'bytes',byte_size,'digest',digest,'storedAt',ready_at) ORDER BY ready_at DESC,id),'[]'::jsonb)
   FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device AND status='ready' AND retired_at IS NULL))
 WHERE EXISTS(SELECT 1 FROM public.users WHERE id=account AND role='admin')
 AND EXISTS(SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;

CREATE OR REPLACE FUNCTION public.reserve_managed_auto_snapshot(account uuid,game uuid,device uuid,digest_hex text,bytes integer,meta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous record; reserved_id uuid; reserved_key text; source_revision uuid;
BEGIN
 IF device IS NULL OR digest_hex IS NULL OR digest_hex !~ '^[a-f0-9]{64}$' OR bytes IS NULL OR bytes NOT BETWEEN 1 AND 262144
 OR jsonb_typeof(meta) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 IF NOT (meta ?& ARRAY['slotId','slotName','snapshotId','snapshotName','kind','revisionId','releaseVersion','schemaVersion','hardwareId','snapshotCreatedAt','payloadBytes','payloadDigest'])
 OR (SELECT count(*) FROM jsonb_object_keys(meta))<>12 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_managed_auto_snapshots(account,game,device) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF meta->>'kind' IS DISTINCT FROM 'auto' OR meta->>'revisionId' IS NULL THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 source_revision:=(meta->>'revisionId')::uuid;
 IF source_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.game_revisions
 WHERE id=source_revision AND game_id=game AND status='published' AND engine_id='pixel-v1')
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 SELECT id,status,storage_key,byte_size,last_attempt_at,retired_at INTO previous FROM public.managed_auto_snapshots
 WHERE account_id=account AND game_id=game AND device_id=device AND digest=digest_hex;
 IF FOUND THEN
  IF previous.byte_size<>bytes THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
  IF previous.retired_at IS NOT NULL THEN RETURN jsonb_build_object('outcome','retired'); END IF;
  IF previous.status='ready' THEN RETURN public.list_managed_auto_snapshots(account,game,device)||jsonb_build_object('outcome','replayed'); END IF;
  IF previous.last_attempt_at>clock_timestamp()-interval '60 seconds' THEN
   RETURN jsonb_build_object('outcome','in_progress');
  END IF;
  -- Same digest, same reserved bytes and same immutable key. No new quota,
  -- no deletion; conditional PUT/readback makes a delayed older writer safe.
  UPDATE public.managed_auto_snapshots SET last_attempt_at=clock_timestamp() WHERE id=previous.id;
  RETURN jsonb_build_object('outcome','resumed','backupId',previous.id,'storageKey',previous.storage_key);
 END IF;
 IF EXISTS(SELECT 1 FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game AND device_id=device AND status='pending') THEN RETURN jsonb_build_object('outcome','in_progress'); END IF;
 -- Bound metadata as well as physical bytes. Retired objects stay charged.
 IF (SELECT count(*) FROM public.managed_auto_snapshots WHERE account_id=account)>=100
 OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account)+bytes>10485760 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.managed_auto_snapshots(id,account_id,game_id,device_id,hardware_id,slot_id,slot_name,snapshot_id,snapshot_name,
 kind,revision_id,release_version,save_schema,snapshot_created_ms,payload_bytes,payload_digest,storage_key,byte_size,digest)
 VALUES(reserved_id,account,game,device,meta->>'hardwareId',(meta->>'slotId')::uuid,meta->>'slotName',
 (meta->>'snapshotId')::uuid,meta->>'snapshotName',meta->>'kind',source_revision,meta->>'releaseVersion',
 (meta->>'schemaVersion')::integer,(meta->>'snapshotCreatedAt')::bigint,(meta->>'payloadBytes')::integer,
 meta->>'payloadDigest',reserved_key,bytes,digest_hex);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation
 THEN RETURN jsonb_build_object('outcome','invalid');
END;
$$;

CREATE FUNCTION public.confirm_managed_auto_snapshot(account uuid,game uuid,device uuid,backup uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_managed_auto_snapshots(account,game,device) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 SELECT status,retired_at INTO previous FROM public.managed_auto_snapshots
 WHERE id=backup AND account_id=account AND game_id=game AND device_id=device FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF previous.retired_at IS NOT NULL THEN RETURN jsonb_build_object('outcome','retired'); END IF;
 IF previous.status='ready' THEN RETURN public.list_managed_auto_snapshots(account,game,device)||jsonb_build_object('outcome','replayed'); END IF;
 -- Trusted caller must verify the newly uploaded object before confirmation.
 UPDATE public.managed_auto_snapshots SET status='ready',ready_at=clock_timestamp() WHERE id=backup;
 -- Logical retirement only. All object bytes remain charged and retained.
 UPDATE public.managed_auto_snapshots SET retired_at=clock_timestamp()
 WHERE id IN (SELECT id FROM public.managed_auto_snapshots WHERE account_id=account AND game_id=game
 AND device_id=device AND status='ready' AND retired_at IS NULL ORDER BY insertion_order DESC OFFSET 5);
 RETURN public.list_managed_auto_snapshots(account,game,device)||jsonb_build_object('outcome','stored');
END;
$$;

REVOKE ALL ON FUNCTION public.list_managed_auto_snapshots(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_managed_auto_snapshot(uuid,uuid,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_managed_auto_snapshot(uuid,uuid,uuid,uuid) FROM PUBLIC;
