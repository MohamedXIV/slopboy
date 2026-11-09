-- Slopboy Database Schema Migration 002 (DOWN)
-- Rollback curated fixtures seed

DELETE FROM audit_events WHERE action = 'catalog.seed';

UPDATE games
SET current_published_revision_id = NULL
WHERE id IN (
    '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
    '3ce74eec-ca3c-484b-8d16-2af4840c539b'
);

DELETE FROM game_revisions
WHERE game_id IN (
    '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
    '3ce74eec-ca3c-484b-8d16-2af4840c539b'
);

DELETE FROM games
WHERE id IN (
    '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
    '3ce74eec-ca3c-484b-8d16-2af4840c539b'
);

DELETE FROM users
WHERE id = '00000000-0000-4000-a000-000000000001';
