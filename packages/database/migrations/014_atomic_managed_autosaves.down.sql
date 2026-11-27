LOCK TABLE public.managed_auto_snapshots IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.managed_auto_snapshots WHERE payload_text IS NOT NULL) THEN
 RAISE EXCEPTION 'Transactional managed autosaves retained'; END IF; END $$;
DROP FUNCTION public.read_atomic_managed_autosave(uuid,uuid,uuid,uuid);
DROP FUNCTION public.store_atomic_managed_autosave(uuid,uuid,uuid,text);
ALTER TABLE public.managed_auto_snapshots DROP CONSTRAINT managed_auto_storage_mode;
ALTER TABLE public.managed_auto_snapshots ALTER COLUMN storage_key SET NOT NULL;
ALTER TABLE public.managed_auto_snapshots DROP COLUMN payload_text;
