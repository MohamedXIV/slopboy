LOCK TABLE public.named_cloud_snapshots,public.named_cloud_deleted_snapshots IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.named_cloud_snapshots WHERE payload_text IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.named_cloud_deleted_snapshots) THEN RAISE EXCEPTION 'Transactional named saves or deletion history retained'; END IF; END $$;
DROP FUNCTION public.list_deleted_named_snapshot_ids(uuid,uuid);
DROP FUNCTION public.read_atomic_named_snapshot(uuid,uuid,uuid);
DROP FUNCTION public.delete_atomic_named_snapshot(uuid,uuid,uuid,text);
DROP FUNCTION public.store_atomic_named_snapshot(uuid,uuid,text,uuid,text);
DROP TABLE public.named_cloud_deleted_snapshots;
ALTER TABLE public.named_cloud_snapshots DROP CONSTRAINT named_cloud_storage_mode;
ALTER TABLE public.named_cloud_snapshots ALTER COLUMN storage_key SET NOT NULL;
ALTER TABLE public.named_cloud_snapshots DROP COLUMN payload_text;
