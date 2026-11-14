-- Rolling back removes private source drafts; export them before applying this rollback.
DROP VIEW public.published_playable_games;
DROP TABLE public.game_source_drafts;
DROP FUNCTION public.slopboy_source_draft_immutable();
