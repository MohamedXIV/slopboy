DROP FUNCTION public.release_cloud_save_backup(uuid,uuid,uuid);
DROP FUNCTION public.confirm_cloud_save_backup(uuid,uuid,uuid);
DROP FUNCTION public.reserve_cloud_save_backup(uuid,uuid,text,integer);
DROP FUNCTION public.list_cloud_save_backups(uuid,uuid);
-- Destructive: requires explicit retention and object cleanup decision.
DROP TABLE public.cloud_save_backups;
