-- Export private projects before rollback. Migration 005 is unaffected.
DROP FUNCTION public.staged_game_artifact(uuid,uuid,uuid,text,jsonb,bytea);
DROP TABLE public.staged_game_files;
DROP TABLE public.staged_game_projects;
