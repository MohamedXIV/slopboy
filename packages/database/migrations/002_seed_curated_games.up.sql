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
        'private',
        'draft',
        'tiny-catcher'
    ),
    (
        'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
        '00000000-0000-4000-a000-000000000001',
        'Star Patrol',
        'Hold the line in deep space.',
        'Dodge incoming ships and blast them with your pulse cannon. A tiny, fast arcade shooter.',
        'Shooter',
        'private',
        'draft',
        'star-patrol'
    ),
    (
        '3ce74eec-ca3c-484b-8d16-2af4840c539b',
        '00000000-0000-4000-a000-000000000001',
        'Circuit Slide',
        'Solve the scrambled grid.',
        'Slide numbered circuit tiles into order in an original little logic puzzle. Press A to reshuffle.',
        'Puzzle',
        'private',
        'draft',
        'circuit-slide'
    )
ON CONFLICT (id) DO NOTHING;

-- 3. Curated game metadata is seeded without fabricated release digests.
-- The canonical revision UUIDs remain in @slopboy/catalog. The real artifact
-- importer (#27/#32) must calculate SHA-256 from actual immutable bundle bytes
-- and attach an approved revision before DB-driven public publication.
-- Until then these DB rows are private drafts; existing bundled guest games
-- remain playable through the separate reviewed static catalog.

-- 4. Audit seed event
INSERT INTO audit_events (action, target_type, target_id, metadata)
VALUES (
    'catalog.seed',
    'game',
    '5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    '{"reason":"Curated launch fixtures seeded with stable UUID identities"}'::jsonb
);
