-- Private source-only drafts are untrusted data. They are never executable artifacts.
CREATE TABLE public.game_source_drafts (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id),
  language TEXT NOT NULL CHECK (language IN ('typescript','javascript')),
  source_text TEXT NOT NULL CHECK (octet_length(source_text) BETWEEN 1 AND 65536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_game_source_drafts_game ON public.game_source_drafts(game_id,created_at DESC,id DESC);
COMMENT ON TABLE public.game_source_drafts IS 'Private untrusted source data; not a revision, bundle, or permission to execute.';
CREATE FUNCTION public.slopboy_source_draft_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Source drafts are immutable; create a new draft' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER trg_game_source_draft_immutable BEFORE UPDATE ON public.game_source_drafts
  FOR EACH ROW EXECUTE FUNCTION public.slopboy_source_draft_immutable();

-- A narrowly scoped publication boundary for the application's read role.
-- Grant SELECT on this view explicitly after reviewing the deployment role;
-- no grant is made by this migration. Draft/private rows remain inaccessible
-- through this view even if the caller knows a UUID or artifact digest.
CREATE VIEW public.published_playable_games WITH (security_barrier=true) AS
SELECT g.id,g.title,g.tagline,g.description,g.genre,g.legacy_slug,
  r.id AS revision_id,r.manifest,r.content_digest,r.storage_key
FROM public.games g
JOIN public.game_revisions r ON r.id=g.current_published_revision_id AND r.game_id=g.id AND r.status='published'
JOIN public.cartridge_artifacts a ON a.revision_id=r.id AND a.artifact_type='bundle'
  AND a.sha256=r.content_digest AND a.storage_key=r.storage_key
WHERE g.visibility='public' AND g.status='published' AND r.engine_id='pixel-v1';
