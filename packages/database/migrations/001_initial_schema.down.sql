-- Slopboy Database Schema Migration 001 (DOWN)
-- Rollback initial schema cleanly in reverse order of foreign key dependencies

DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS user_library CASCADE;
DROP TABLE IF EXISTS game_access CASCADE;
DROP TABLE IF EXISTS cartridge_artifacts CASCADE;

-- Drop circular FK before dropping tables
ALTER TABLE IF EXISTS games DROP CONSTRAINT IF EXISTS fk_games_current_revision;

DROP TABLE IF EXISTS game_revisions CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
