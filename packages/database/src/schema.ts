/**
 * Slopboy Database Schema Types and Contracts.
 *
 * All primary keys for games, revisions, users, and grants are server-issued UUIDs.
 * Titles, descriptions, and metadata are mutable display properties.
 * Game and revision identities are strictly immutable.
 */

export type UserRole = 'player' | 'creator' | 'admin' | 'system';
export type GameGenre = 'Arcade' | 'Shooter' | 'Puzzle' | 'Action' | 'Adventure' | 'Strategy' | 'Other';
export type GameVisibility = 'private' | 'unlisted' | 'public';
export type GameStatus = 'draft' | 'review_pending' | 'published' | 'archived' | 'curated';
export type RevisionStatus = 'draft' | 'review_pending' | 'approved' | 'rejected' | 'published' | 'archived';
export type GrantType = 'owner' | 'collaborator' | 'tester' | 'friend';
export type ArtifactType = 'entrypoint' | 'asset' | 'bundle' | 'preview_html';
export type AuditTargetType = 'game' | 'revision' | 'user' | 'access' | 'library';

export interface UserRecord {
  id: string; // UUID v4
  email: string | null;
  display_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface GameRecord {
  id: string; // Server-assigned UUID v4
  owner_id: string; // User UUID v4
  title: string;
  tagline: string | null;
  description: string | null;
  genre: GameGenre;
  visibility: GameVisibility;
  status: GameStatus;
  current_published_revision_id: string | null; // Revision UUID v4
  legacy_slug: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface GameRevisionRecord {
  id: string; // Immutable Revision UUID v4
  game_id: string; // Game UUID v4
  revision_number: number;
  engine_id: string;
  engine_version: string;
  device_profile: string;
  manifest: Record<string, unknown>;
  content_digest: string; // SHA-256 hex
  storage_key: string;
  byte_size: number;
  status: RevisionStatus;
  created_by: string; // User UUID v4
  created_at: Date;
}

export interface CartridgeArtifactRecord {
  id: string; // UUID v4
  revision_id: string; // Revision UUID v4
  artifact_type: ArtifactType;
  path: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
  storage_key: string;
  created_at: Date;
}

export interface GameAccessRecord {
  id: string; // UUID v4
  game_id: string;
  user_id: string;
  grant_type: GrantType;
  granted_by: string;
  created_at: Date;
  expires_at: Date | null;
}

export interface UserLibraryRecord {
  id: string; // UUID v4
  user_id: string;
  game_id: string;
  installed_offline: boolean;
  added_at: Date;
  last_played_at: Date | null;
  play_count: number;
  total_playtime_ms: number;
}

export interface AuditEventRecord {
  id: string; // UUID v4
  actor_id: string | null;
  action: string;
  target_type: AuditTargetType;
  target_id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: Date;
}

export const SYSTEM_CURATOR_USER_ID = '00000000-0000-4000-a000-000000000001';

export const CURATED_GAME_FIXTURES: ReadonlyArray<{
  readonly gameId: string;
  readonly revisionId: string;
  readonly legacySlug: string;
  readonly title: string;
  readonly genre: GameGenre;
}> = [
  {
    gameId: '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    revisionId: '107d59b4-03d5-4a29-be33-f8246a2c4caa',
    legacySlug: 'tiny-catcher',
    title: 'Tiny Catcher',
    genre: 'Arcade',
  },
  {
    gameId: 'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
    revisionId: '38ecff6f-6b60-40d1-81ab-c07ad0dc928e',
    legacySlug: 'star-patrol',
    title: 'Star Patrol',
    genre: 'Shooter',
  },
  {
    gameId: '3ce74eec-ca3c-484b-8d16-2af4840c539b',
    revisionId: '8b2c6f40-4684-4e6f-95d4-ce7cfca730f2',
    legacySlug: 'circuit-slide',
    title: 'Circuit Slide',
    genre: 'Puzzle',
  },
];
