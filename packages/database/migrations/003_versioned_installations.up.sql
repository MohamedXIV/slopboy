-- Slopboy schema migration 003: version identity, same-game release pointers,
-- device-scoped installation metadata, and immutable release bytes.
-- Additive to 001/002: never change checksums of historical migrations.
--
-- release_version is nullable ONLY for imported pre-version records. New releases
-- should set a public-facing SemVer separately from engine_version.
ALTER TABLE public.game_revisions
  ADD COLUMN release_version TEXT;

ALTER TABLE public.game_revisions
  ADD CONSTRAINT ck_game_revisions_release_version
  CHECK (release_version IS NULL OR release_version ~
    '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$');

CREATE UNIQUE INDEX uq_game_revisions_release_version
  ON public.game_revisions(game_id, release_version)
  WHERE release_version IS NOT NULL;

-- The old FK accepted revision X from game B as game A's current revision.
-- A composite FK enforces both revision identity and game ownership in Postgres.
ALTER TABLE public.game_revisions
  ADD CONSTRAINT uq_game_revisions_id_game UNIQUE (id, game_id);

ALTER TABLE public.games DROP CONSTRAINT fk_games_current_revision;

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_current_revision_same_game
  FOREIGN KEY (current_published_revision_id, id)
  REFERENCES public.game_revisions(id, game_id)
  ON DELETE SET NULL (current_published_revision_id);

-- An installation must name a bundle artifact that belongs to exactly its
-- revision, which in turn must belong to the library game.
ALTER TABLE public.cartridge_artifacts
  ADD CONSTRAINT uq_cartridge_artifacts_bundle_identity UNIQUE (id, revision_id, artifact_type);

CREATE TABLE public.user_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Opaque random ID created by the client, not a browser/device fingerprint.
  device_id UUID NOT NULL,
  game_id UUID NOT NULL,
  revision_id UUID NOT NULL,
  artifact_id UUID NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'bundle' CHECK (artifact_type = 'bundle'),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_user_installations_device_game UNIQUE (user_id, device_id, game_id),
  CONSTRAINT fk_user_installations_library
    FOREIGN KEY (user_id, game_id)
    REFERENCES public.user_library(user_id, game_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_installations_revision_same_game
    FOREIGN KEY (revision_id, game_id)
    REFERENCES public.game_revisions(id, game_id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_installations_artifact_same_revision
    FOREIGN KEY (artifact_id, revision_id, artifact_type)
    REFERENCES public.cartridge_artifacts(id, revision_id, artifact_type) ON DELETE RESTRICT,
  CONSTRAINT ck_user_installations_reported_time CHECK (last_reported_at >= installed_at)
);

CREATE INDEX idx_user_installations_user
  ON public.user_installations(user_id, device_id);
CREATE INDEX idx_user_installations_revision
  ON public.user_installations(revision_id);

COMMENT ON TABLE public.user_installations IS
  'Non-authoritative account sync of per-device installed revision/artifact. Browser CacheStorage is the installation truth; guest installs remain local.';
COMMENT ON COLUMN public.user_library.installed_offline IS
  'Legacy non-device-specific hint only; not the installation source of truth. Do not infer revision or actual offline availability from this boolean.';

-- A release is a new UUID + new digest, never an UPDATE of the old bytes.
-- Moderation can update status; it cannot rewrite the attested build identity.
CREATE FUNCTION public.slopboy_reject_revision_payload_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.id, OLD.game_id, OLD.revision_number, OLD.release_version,
         OLD.engine_id, OLD.engine_version, OLD.device_profile, OLD.manifest,
         OLD.content_digest, OLD.storage_key, OLD.byte_size, OLD.created_by,
         OLD.created_at)
     IS DISTINCT FROM
     ROW(NEW.id, NEW.game_id, NEW.revision_number, NEW.release_version,
         NEW.engine_id, NEW.engine_version, NEW.device_profile, NEW.manifest,
         NEW.content_digest, NEW.storage_key, NEW.byte_size, NEW.created_by,
         NEW.created_at) THEN
    RAISE EXCEPTION 'Immutable revision payload cannot be updated; create another revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_game_revision_immutable
  BEFORE UPDATE ON public.game_revisions
  FOR EACH ROW EXECUTE FUNCTION public.slopboy_reject_revision_payload_change();

CREATE FUNCTION public.slopboy_reject_artifact_payload_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.id, OLD.revision_id, OLD.artifact_type, OLD.path, OLD.sha256,
         OLD.byte_size, OLD.mime_type, OLD.storage_key, OLD.created_at)
     IS DISTINCT FROM
     ROW(NEW.id, NEW.revision_id, NEW.artifact_type, NEW.path, NEW.sha256,
         NEW.byte_size, NEW.mime_type, NEW.storage_key, NEW.created_at) THEN
    RAISE EXCEPTION 'Immutable cartridge artifact cannot be updated; create another revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cartridge_artifact_immutable
  BEFORE UPDATE ON public.cartridge_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.slopboy_reject_artifact_payload_change();
