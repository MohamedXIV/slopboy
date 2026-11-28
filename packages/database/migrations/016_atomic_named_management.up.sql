-- #36: transactional protected cloud copies, additive to the existing object lane.
ALTER TABLE public.named_cloud_snapshots ADD COLUMN payload_text text;
ALTER TABLE public.named_cloud_snapshots ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE public.named_cloud_snapshots ADD CONSTRAINT named_cloud_storage_mode CHECK (
 (payload_text IS NULL AND storage_key IS NOT NULL) OR
 (payload_text IS NOT NULL AND storage_key IS NULL AND status='ready'
 AND octet_length(payload_text)=byte_size AND encode(sha256(convert_to(payload_text,'UTF8')),'hex')=digest)
);
CREATE TABLE public.named_cloud_deleted_snapshots (
 account_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 snapshot_id uuid NOT NULL,
 backup_id uuid NOT NULL UNIQUE,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,game_id,snapshot_id)
);
REVOKE ALL ON public.named_cloud_deleted_snapshots FROM PUBLIC;

-- No destructive operations on object-backed rows. The named global lock bounds
-- transactional payloads and deletion metadata independently of managed autosaves.
CREATE FUNCTION public.store_atomic_named_snapshot(account uuid,game uuid,raw text,replace_id uuid DEFAULT NULL,replace_digest text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE envelope jsonb; s jsonb; source_revision uuid; source_snapshot uuid; digest_hex text; bytes integer;
 previous record; target record; reclaimed integer:=0; replaced_count integer:=0; stamp timestamptz;
BEGIN
 IF raw IS NULL OR octet_length(raw) NOT BETWEEN 1 AND 262144
 OR (replace_id IS NULL)<>(replace_digest IS NULL)
 OR (replace_digest IS NOT NULL AND replace_digest !~ '^[a-f0-9]{64}$')
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_named_cloud_snapshots(account,game) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 envelope:=raw::jsonb; s:=envelope->'snapshot';
 source_revision:=(s->>'revisionId')::uuid; source_snapshot:=(s->>'id')::uuid;
 IF envelope->>'format' IS DISTINCT FROM 'slopboy-cloud-snapshot-v1' OR envelope->>'gameId' IS DISTINCT FROM game::text
 OR envelope->>'hardwareId' IS DISTINCT FROM 'slopboy-1000' OR envelope->>'hardwareVersion' IS DISTINCT FROM '0.1.0'
 OR source_snapshot IS NULL OR jsonb_typeof(s->'data') IS DISTINCT FROM 'string'
 OR (s->>'bytes')::integer IS DISTINCT FROM octet_length(s->>'data')
 OR s->>'digest' IS DISTINCT FROM encode(sha256(convert_to(s->>'data','UTF8')),'hex')
 OR (source_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.game_revisions
 WHERE id=source_revision AND game_id=game AND status='published' AND engine_id='pixel-v1'))
 THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 IF EXISTS(SELECT 1 FROM public.named_cloud_deleted_snapshots WHERE account_id=account AND game_id=game AND snapshot_id=source_snapshot)
 THEN RETURN jsonb_build_object('outcome','deleted'); END IF;
 bytes:=octet_length(raw); digest_hex:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 SELECT id,status,payload_text,byte_size INTO previous FROM public.named_cloud_snapshots
 WHERE account_id=account AND game_id=game AND digest=digest_hex;
 IF FOUND THEN
  IF previous.byte_size<>bytes OR previous.status<>'ready' THEN RETURN jsonb_build_object('outcome','in_progress'); END IF;
  IF previous.payload_text IS NOT NULL AND previous.payload_text IS DISTINCT FROM raw THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
  -- A replacement retry only succeeds if the exact old target was tombstoned.
  IF replace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.named_cloud_deleted_snapshots
    WHERE account_id=account AND game_id=game AND backup_id=replace_id AND digest=replace_digest)
  THEN RETURN jsonb_build_object('outcome','changed'); END IF;
  RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','replayed');
 END IF;
 IF EXISTS(SELECT 1 FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game AND snapshot_id=source_snapshot)
 THEN RETURN jsonb_build_object('outcome','changed'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-atomic-named-global',0));
 IF replace_id IS NOT NULL THEN
  SELECT id,digest,snapshot_id,byte_size INTO target FROM public.named_cloud_snapshots
   WHERE account_id=account AND game_id=game AND id=replace_id AND payload_text IS NOT NULL;
  IF NOT FOUND OR target.digest<>replace_digest OR target.snapshot_id=source_snapshot
  THEN RETURN jsonb_build_object('outcome','changed'); END IF;
  IF (SELECT count(*) FROM public.named_cloud_deleted_snapshots WHERE account_id=account)>=1000
  OR (SELECT count(*) FROM public.named_cloud_deleted_snapshots)>=10000 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
  reclaimed:=target.byte_size; replaced_count:=1;
 END IF;
 IF (SELECT count(*) FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game)-replaced_count+1>5
 OR (SELECT coalesce(sum(byte_size),0) FROM public.cloud_save_backups WHERE account_id=account)
 +(SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE account_id=account)
 +(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE account_id=account)-reclaimed+bytes>10485760
 OR (SELECT coalesce(sum(byte_size),0) FROM public.named_cloud_snapshots WHERE payload_text IS NOT NULL)-reclaimed+bytes>16777216
 OR (SELECT count(*) FROM public.named_cloud_snapshots WHERE payload_text IS NOT NULL)-replaced_count+1>1000
 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 stamp:=clock_timestamp();
 IF replace_id IS NOT NULL THEN
  INSERT INTO public.named_cloud_deleted_snapshots(account_id,game_id,snapshot_id,backup_id,digest)
  VALUES(account,game,target.snapshot_id,target.id,target.digest);
  DELETE FROM public.named_cloud_snapshots WHERE id=target.id;
 END IF;
 INSERT INTO public.named_cloud_snapshots(account_id,game_id,hardware_id,slot_id,slot_name,snapshot_id,snapshot_name,
 kind,revision_id,release_version,save_schema,snapshot_created_ms,payload_bytes,payload_digest,storage_key,byte_size,digest,status,created_at,ready_at,last_attempt_at,payload_text)
 VALUES(account,game,'slopboy-1000@0.1.0',(envelope->>'slotId')::uuid,envelope->>'slotName',source_snapshot,s->>'name',
 s->>'kind',source_revision,s->>'releaseVersion',(s->>'schemaVersion')::integer,(s->>'createdAt')::bigint,(s->>'bytes')::integer,s->>'digest',
 NULL,bytes,digest_hex,'ready',stamp,stamp,stamp,raw);
 RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','stored');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR unique_violation
 THEN RETURN jsonb_build_object('outcome','invalid');
END;
$$;
CREATE FUNCTION public.delete_atomic_named_snapshot(account uuid,game uuid,backup uuid,digest_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target record;
BEGIN
 IF backup IS NULL OR digest_hex IS NULL OR digest_hex !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('outcome','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-cloud-save:'||account::text,0));
 IF public.list_named_cloud_snapshots(account,game) IS NULL THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.named_cloud_deleted_snapshots WHERE account_id=account AND game_id=game AND backup_id=backup AND digest=digest_hex)
 THEN RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','replayed'); END IF;
 SELECT id,digest,snapshot_id INTO target FROM public.named_cloud_snapshots
 WHERE account_id=account AND game_id=game AND id=backup AND payload_text IS NOT NULL;
 IF NOT FOUND OR target.digest<>digest_hex THEN RETURN jsonb_build_object('outcome','changed'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('slopboy-atomic-named-global',0));
 IF (SELECT count(*) FROM public.named_cloud_deleted_snapshots WHERE account_id=account)>=1000
 OR (SELECT count(*) FROM public.named_cloud_deleted_snapshots)>=10000 THEN RETURN jsonb_build_object('outcome','quota'); END IF;
 INSERT INTO public.named_cloud_deleted_snapshots(account_id,game_id,snapshot_id,backup_id,digest)
 VALUES(account,game,target.snapshot_id,target.id,target.digest);
 DELETE FROM public.named_cloud_snapshots WHERE id=target.id;
 RETURN public.list_named_cloud_snapshots(account,game)||jsonb_build_object('outcome','deleted');
END;
$$;
CREATE FUNCTION public.read_atomic_named_snapshot(account uuid,game uuid,backup uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',id,'digest',digest,'bytes',byte_size,'snapshot',payload_text)
 FROM public.named_cloud_snapshots WHERE account_id=account AND game_id=game AND id=backup
 AND payload_text IS NOT NULL AND public.list_named_cloud_snapshots(account,game) IS NOT NULL;
$$;
CREATE FUNCTION public.list_deleted_named_snapshot_ids(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(snapshot_id ORDER BY snapshot_id),'[]'::jsonb)
 FROM public.named_cloud_deleted_snapshots WHERE account_id=account AND game_id=game
 HAVING public.list_named_cloud_snapshots(account,game) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.store_atomic_named_snapshot(uuid,uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_atomic_named_snapshot(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_atomic_named_snapshot(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_deleted_named_snapshot_ids(uuid,uuid) FROM PUBLIC;
