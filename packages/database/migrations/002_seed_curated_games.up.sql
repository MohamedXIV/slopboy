-- Slopboy Database Schema Migration 002 (UP)
-- Scope: Seed system curator account and 3 curated games with exact immutable UUIDs

-- 1. System Curator User
INSERT INTO users (id, email, display_name, role)
VALUES (
    '00000000-0000-4000-a000-000000000001',
    'curator@slopboy.internal',
    'Slopboy Curators',
    'system'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Curated Games (Tiny Catcher, Star Patrol, Circuit Slide)
INSERT INTO games (id, owner_id, title, tagline, description, genre, visibility, status, legacy_slug)
VALUES
    (
        '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
        '00000000-0000-4000-a000-000000000001',
        'Tiny Catcher',
        'Catch the falling pixels.',
        'Chase little falling squares across a tiny monochrome screen. Catch as many as you can!',
        'Arcade',
        'public',
        'curated',
        'tiny-catcher'
    ),
    (
        'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
        '00000000-0000-4000-a000-000000000001',
        'Star Patrol',
        'Hold the line in deep space.',
        'Dodge incoming ships and blast them with your pulse cannon. A tiny, fast arcade shooter.',
        'Shooter',
        'public',
        'curated',
        'star-patrol'
    ),
    (
        '3ce74eec-ca3c-484b-8d16-2af4840c539b',
        '00000000-0000-4000-a000-000000000001',
        'Circuit Slide',
        'Solve the scrambled grid.',
        'Slide numbered circuit tiles into order in an original little logic puzzle. Press A to reshuffle.',
        'Puzzle',
        'public',
        'curated',
        'circuit-slide'
    )
ON CONFLICT (id) DO NOTHING;

-- 3. Initial Curated Game Revisions
INSERT INTO game_revisions (
    id, game_id, revision_number, engine_id, engine_version, device_profile,
    manifest, content_digest, storage_key, byte_size, status, created_by
)
VALUES
    (
        '107d59b4-03d5-4a29-be33-f8246a2c4caa',
        '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
        1,
        'pixel-v1',
        '0.1.0',
        'slopboy-1000',
        '{"id":"tiny-catcher","title":"Tiny Catcher","hardware":{"id":"slopboy-1000","version":"0.1.0"},"controls":["LEFT","RIGHT","A"]}'::jsonb,
        '107d59b403d54a29be33f8246a2c4caa107d59b403d54a29be33f8246a2c4caa',
        '/cartridges/tiny-catcher.slop',
        579,
        'published',
        '00000000-0000-4000-a000-000000000001'
    ),
    (
        '38ecff6f-6b60-40d1-81ab-c07ad0dc928e',
        'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
        1,
        'pixel-v1',
        '0.1.0',
        'slopboy-1000',
        '{"id":"star-patrol","title":"Star Patrol","hardware":{"id":"slopboy-1000","version":"0.1.0"},"controls":["LEFT","RIGHT","A","START"]}'::jsonb,
        '38ecff6f6b6040d181abc07ad0dc928e38ecff6f6b6040d181abc07ad0dc928e',
        '/cartridges/star-patrol.slop',
        1094,
        'published',
        '00000000-0000-4000-a000-000000000001'
    ),
    (
        '8b2c6f40-4684-4e6f-95d4-ce7cfca730f2',
        '3ce74eec-ca3c-484b-8d16-2af4840c539b',
        1,
        'pixel-v1',
        '0.1.0',
        'slopboy-1000',
        '{"id":"circuit-slide","title":"Circuit Slide","hardware":{"id":"slopboy-1000","version":"0.1.0"},"controls":["UP","DOWN","LEFT","RIGHT","A","START"]}'::jsonb,
        '8b2c6f4046844e6f95d4ce7cfca730f28b2c6f4046844e6f95d4ce7cfca730f2',
        '/cartridges/circuit-slide.slop',
        1413,
        'published',
        '00000000-0000-4000-a000-000000000001'
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Set current_published_revision_id on games
UPDATE games
SET current_published_revision_id = '107d59b4-03d5-4a29-be33-f8246a2c4caa'
WHERE id = '5b0edbf4-644d-43f4-9ad3-5506eacd05d3' AND current_published_revision_id IS NULL;

UPDATE games
SET current_published_revision_id = '38ecff6f-6b60-40d1-81ab-c07ad0dc928e'
WHERE id = 'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc' AND current_published_revision_id IS NULL;

UPDATE games
SET current_published_revision_id = '8b2c6f40-4684-4e6f-95d4-ce7cfca730f2'
WHERE id = '3ce74eec-ca3c-484b-8d16-2af4840c539b' AND current_published_revision_id IS NULL;

-- 5. Audit seed event
INSERT INTO audit_events (action, target_type, target_id, metadata)
VALUES (
    'catalog.seed',
    'game',
    '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    '{"reason":"Curated launch fixtures seeded with stable UUID identities"}'::jsonb
);
