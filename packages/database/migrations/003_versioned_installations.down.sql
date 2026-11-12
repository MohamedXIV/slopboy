-- Development / disposable database rollback of migration 003.
-- WARNING: drops device-install metadata and release_version strings.
-- Back up and reconcile existing records before use against a populated DB.
DROP TRIGGER trg_cartridge_artifact_immutable ON public.cartridge_artifacts;
DROP FUNCTION public.slopboy_reject_artifact_payload_change();
DROP TRIGGER trg_game_revision_immutable ON public.game_revisions;
DROP FUNCTION public.slopboy_reject_revision_payload_change();

DROP TABLE public.user_installations;
ALTER TABLE public.cartridge_artifacts
  DROP CONSTRAINT uq_cartridge_artifacts_bundle_identity;

ALTER TABLE public.games
  DROP CONSTRAINT fk_games_current_revision_same_game;

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_current_revision
  FOREIGN KEY (current_published_revision_id)
  REFERENCES public.game_revisions(id)
  ON DELETE SET NULL;

ALTER TABLE public.game_revisions
  DROP CONSTRAINT uq_game_revisions_id_game;

DROP INDEX public.uq_game_revisions_release_version;
ALTER TABLE public.game_revisions
  DROP CONSTRAINT ck_game_revisions_release_version;
ALTER TABLE public.game_revisions
  DROP COLUMN release_version;

COMMENT ON COLUMN public.user_library.installed_offline IS NULL;
