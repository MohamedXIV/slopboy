-- #36: bounded request accounting and non-destructive exact-payload recovery.
ALTER TABLE public.named_cloud_snapshots ADD COLUMN last_attempt_at timestamptz;
UPDATE public.named_cloud_snapshots SET last_attempt_at=created_at;
ALTER TABLE public.named_cloud_snapshots ALTER COLUMN last_attempt_at SET DEFAULT clock_timestamp(),
 ALTER COLUMN last_attempt_at SET NOT NULL;

-- One bounded row per authorized account, plus one global row. No unbounded
-- request logs, external rate-limit service or per-instance memory.
CREATE TABLE public.named_cloud_request_budget (
 account_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 minute_window bigint NOT NULL, minute_count integer NOT NULL CHECK (minute_count BETWEEN 1 AND 30),
 day_window bigint NOT NULL, day_count integer NOT NULL CHECK (day_count BETWEEN 1 AND 200)
);
CREATE TABLE public.named_cloud_global_budget (
 singleton boolean PRIMARY KEY CHECK (singleton),
 day_window bigint NOT NULL, day_count integer NOT NULL CHECK (day_count BETWEEN 1 AND 1000)
);
REVOKE ALL ON public.named_cloud_request_budget,public.named_cloud_global_budget FROM PUBLIC;
CREATE FUNCTION public.consume_named_cloud_request(account uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE now_seconds bigint; current_minute bigint; current_day bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=account AND role='admin') THEN RETURN false; END IF;
 now_seconds:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 current_minute:=now_seconds/60; current_day:=now_seconds/86400;
 -- Atomic upserts across all server instances. Charge account first; global
 -- denial may still consume an account attempt, conservatively fail closed.
 INSERT INTO public.named_cloud_request_budget AS budget(account_id,minute_window,minute_count,day_window,day_count)
 VALUES(account,current_minute,1,current_day,1)
 ON CONFLICT(account_id) DO UPDATE SET
 minute_window=current_minute,minute_count=CASE WHEN budget.minute_window=current_minute THEN budget.minute_count+1 ELSE 1 END,
 day_window=current_day,day_count=CASE WHEN budget.day_window=current_day THEN budget.day_count+1 ELSE 1 END
 WHERE (budget.minute_window<>current_minute OR budget.minute_count<30)
 AND (budget.day_window<>current_day OR budget.day_count<200);
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.named_cloud_global_budget AS budget(singleton,day_window,day_count)
 VALUES(true,current_day,1)
 ON CONFLICT(singleton) DO UPDATE SET day_window=current_day,
 day_count=CASE WHEN budget.day_window=current_day THEN budget.day_count+1 ELSE 1 END
 WHERE budget.day_window<>current_day OR budget.day_count<1000;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_named_cloud_request(uuid) FROM PUBLIC;

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
