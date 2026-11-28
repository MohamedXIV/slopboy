-- #36: discover only this account's transactional autosave streams for a published game.
CREATE FUNCTION public.list_atomic_managed_devices(account uuid,game uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('deviceId',device_id,'count',n,'lastSavedAt',latest) ORDER BY latest DESC,device_id),'[]'::jsonb)
 FROM (
  SELECT device_id,count(*) AS n,max(ready_at) AS latest
  FROM public.managed_auto_snapshots
  WHERE account_id=account AND game_id=game AND payload_text IS NOT NULL AND status='ready' AND retired_at IS NULL
  GROUP BY device_id
 ) AS streams
 HAVING EXISTS(SELECT 1 FROM public.users WHERE id=account AND role='admin')
 AND EXISTS(SELECT 1 FROM public.published_playable_games WHERE id=game);
$$;
REVOKE ALL ON FUNCTION public.list_atomic_managed_devices(uuid,uuid) FROM PUBLIC;
