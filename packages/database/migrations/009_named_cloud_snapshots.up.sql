-- #36: additive named snapshot metadata. Objects remain private, never SQL payloads.
CREATE TABLE public.named_cloud_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 hardware_id text NOT NULL CHECK (hardware_id='slopboy-1000@0.1.0'),
 slot_id uuid NOT NULL,
 slot_name text NOT NULL CHECK (length(slot_name) BETWEEN 1 AND 80 AND slot_name=btrim(slot_name) AND slot_name !~ '[[:cntrl:]]'),
 snapshot_id uuid NOT NULL,
 snapshot_name text NOT NULL CHECK (length(snapshot_name) BETWEEN 1 AND 80 AND snapshot_name=btrim(snapshot_name) AND snapshot_name !~ '[[:cntrl:]]'),
 kind text NOT NULL CHECK (kind IN ('auto','manual','backup','fork','legacy')),
 revision_id uuid,
 release_version text CHECK (length(release_version) BETWEEN 1 AND 80 AND release_version=btrim(release_version) AND release_version !~ '[[:cntrl:]]'),
 save_schema integer NOT NULL CHECK (save_schema BETWEEN 1 AND 9999),
 snapshot_created_ms bigint CHECK (snapshot_created_ms BETWEEN 1 AND 9007199254740991),
 payload_bytes integer NOT NULL CHECK (payload_bytes BETWEEN 0 AND 262144),
 payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
 storage_key text NOT NULL UNIQUE CHECK (storage_key LIKE 'backups/%' AND length(storage_key)<=512),
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 262144 AND payload_bytes<=byte_size),
 digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ready_at timestamptz,
 CHECK ((status='ready')=(ready_at IS NOT NULL)),
 CHECK (kind<>'legacy' OR (revision_id IS NULL AND release_version IS NULL AND snapshot_created_ms IS NULL)),
 CHECK (kind NOT IN ('auto','manual') OR (revision_id IS NOT NULL AND snapshot_created_ms IS NOT NULL)),
 UNIQUE(account_id,game_id,digest)
);
CREATE INDEX named_cloud_account_quota ON public.named_cloud_snapshots(account_id,game_id);
REVOKE ALL ON public.named_cloud_snapshots FROM PUBLIC;

-- Both lanes share the same account lock and byte quota. Legacy listings and
-- five-record limit remain separate; no legacy row or object is rewritten.
CREATE OR REPLACE FUNCTION public.list_cloud_save_backups(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'usedBytes',((SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)),
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
 OR ((SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account))+bytes>10485760
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 reserved_id:=gen_random_uuid();
 reserved_key:=format('backups/%s/%s/%s/%s.json',account,game,reserved_id,digest_hex);
 INSERT INTO public.cloud_save_backups(id,account_id,game_id,digest,byte_size,storage_key)
 VALUES(reserved_id,account,game,digest_hex,bytes,reserved_key);
 RETURN jsonb_build_object('outcome','reserved','backupId',reserved_id,'storageKey',reserved_key);
END;
$$;

CREATE FUNCTION public.list_named_cloud_snapshots(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('usedBytes',(SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)+(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account),'snapshots',
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

-- The trusted web server validates the canonical envelope and derives metadata.
-- No client account ID, object key or payload is accepted by this function.
CREATE FUNCTION public.reserve_named_cloud_snapshot(account uuid,game uuid,digest_hex text,bytes integer,meta jsonb)
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

CREATE FUNCTION public.confirm_named_cloud_snapshot(account uuid,game uuid,backup uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_named_cloud_snapshots(account,game) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 SELECT status INTO row_state FROM public.named_cloud_snapshots
 WHERE id=backup AND account_id=account AND game_id=game FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF row_state='ready' THEN RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','replayed'); END IF;
 UPDATE public.named_cloud_snapshots SET status='ready',ready_at=clock_timestamp()
 WHERE id=backup AND account_id=account AND game_id=game AND status='pending';
 RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','stored');
END;
$$;

-- Only for the restricted server role. Never return this object key to a client.
CREATE FUNCTION public.lookup_named_cloud_snapshot(account uuid,game uuid,backup uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',id,'storageKey',storage_key,'digest',digest,'bytes',byte_size)
 FROM public.named_cloud_snapshots WHERE id=backup AND account_id=account AND game_id=game AND status='ready'
 AND public.list_named_cloud_snapshots(account,game) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.list_named_cloud_snapshots(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_named_cloud_snapshot(uuid,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_named_cloud_snapshot(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_named_cloud_snapshot(uuid,uuid,uuid) FROM PUBLIC;
