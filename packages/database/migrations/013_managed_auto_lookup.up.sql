-- #36: owner-only lookup of a ready, non-retired managed autosave.
CREATE FUNCTION public.lookup_managed_auto_snapshot(account uuid,game uuid,device uuid,backup uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',id,'storageKey',storage_key,'digest',digest,'bytes',byte_size)
 FROM public.managed_auto_snapshots WHERE id=backup AND account_id=account AND game_id=game AND device_id=device
 AND status='ready' AND retired_at IS NULL AND public.list_managed_auto_snapshots(account,game,device) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.lookup_managed_auto_snapshot(uuid,uuid,uuid,uuid) FROM PUBLIC;
