-- Slopboy Database Schema Migration 001 (UP)
-- Target: PostgreSQL 15+ / Neon Serverless Postgres
-- Scope: Users, Games, Immutable Revisions, Artifacts, Access Grants, Library, Audit Events

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Users / Profiles (compatible with Managed Better Auth / OAuth provider)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0 AND length(display_name) <= 100),
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'creator', 'admin', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Games (Server-issued immutable UUID primary keys; mutable titles)
CREATE TABLE games (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 80),
    tagline TEXT CHECK (tagline IS NULL OR length(tagline) <= 160),
    description TEXT CHECK (description IS NULL OR length(description) <= 2000),
    genre TEXT NOT NULL CHECK (genre IN ('Arcade', 'Shooter', 'Puzzle', 'Action', 'Adventure', 'Strategy', 'Other')),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review_pending', 'published', 'archived', 'curated')),
    current_published_revision_id UUID,
    legacy_slug TEXT UNIQUE CHECK (legacy_slug IS NULL OR legacy_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Game Revisions (Immutable builds once created)
CREATE TABLE game_revisions (
    id UUID PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    engine_id TEXT NOT NULL CHECK (engine_id IN ('kaplay', 'phaser', 'pixi', 'pixel-v1')),
    engine_version TEXT NOT NULL,
    device_profile TEXT NOT NULL DEFAULT 'slopboy-1000',
    manifest JSONB NOT NULL,
    content_digest TEXT NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
    storage_key TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review_pending', 'approved', 'rejected', 'published', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_game_revision_number UNIQUE (game_id, revision_number),
    CONSTRAINT uq_game_content_digest UNIQUE (game_id, content_digest)
);

-- Deferred circular foreign key from games to game_revisions
ALTER TABLE games
    ADD CONSTRAINT fk_games_current_revision
    FOREIGN KEY (current_published_revision_id)
    REFERENCES game_revisions(id)
    ON DELETE SET NULL;

-- Cartridge Artifacts (Metadata and digests; large files in Object Storage)
CREATE TABLE cartridge_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES game_revisions(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('entrypoint', 'asset', 'bundle', 'preview_html')),
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    mime_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_artifact_revision_path UNIQUE (revision_id, path)
);

-- Game Access Grants (Explicit private friend sharing and collaboration)
CREATE TABLE game_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grant_type TEXT NOT NULL CHECK (grant_type IN ('owner', 'collaborator', 'tester', 'friend')),
    granted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT uq_game_access UNIQUE (game_id, user_id)
);

-- User Library Membership
CREATE TABLE user_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    installed_offline BOOLEAN NOT NULL DEFAULT false,
    added_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_played_at TIMESTAMPTZ,
    play_count INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
    total_playtime_ms BIGINT NOT NULL DEFAULT 0 CHECK (total_playtime_ms >= 0),
    CONSTRAINT uq_user_library UNIQUE (user_id, game_id)
);

-- Audit Events (Security logging for authoring, access, moderation)
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('game', 'revision', 'user', 'access', 'library')),
    target_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexes for access control, search, and catalog queries
CREATE INDEX idx_games_owner ON games(owner_id);
CREATE INDEX idx_games_public_curated ON games(visibility, status) WHERE visibility = 'public';
CREATE INDEX idx_games_legacy_slug ON games(legacy_slug) WHERE legacy_slug IS NOT NULL;
CREATE INDEX idx_game_revisions_game ON game_revisions(game_id);
CREATE INDEX idx_game_access_user ON game_access(user_id);
CREATE INDEX idx_user_library_user ON user_library(user_id);
CREATE INDEX idx_audit_events_target ON audit_events(target_type, target_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
