import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  loadMigrationFiles,
  migrateUp,
  migrateDown,
  executePsql,
  type DatabaseConnectionConfig,
  MigrationError,
} from '../packages/database/src/migrator.ts';
import {
  CURATED_GAME_FIXTURES,
  SYSTEM_CURATOR_USER_ID,
} from '../packages/database/src/schema.ts';

const root = resolve(import.meta.dirname, '..');
const migrationsDir = resolve(root, 'packages/database/migrations');

function runProc(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('close', code => {
      if (code === 0) res();
      else rej(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', rej);
  });
}

test('migration files load cleanly with matching checksums', async () => {
  const { up, down } = await loadMigrationFiles(migrationsDir);
  assert.equal(up.length, 2);
  assert.equal(down.length, 2);

  assert.equal(up[0].version, 1);
  assert.equal(up[0].name, 'initial_schema');
  assert.equal(up[1].version, 2);
  assert.equal(up[1].name, 'seed_curated_games');

  assert.equal(down[0].version, 2);
  assert.equal(down[1].version, 1);
});

test('ephemeral postgres: fresh migration, constraints, seeding, and rollback', async (t) => {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'slopboy-pg-'));
  const dataDir = resolve(tempDir, 'data');
  const port = 5434;
  let pgBinDir: string | undefined;

  const config: DatabaseConnectionConfig = {
    host: tempDir,
    port,
    user: 'antigravity',
    database: 'postgres',
  };

  try {
    // Prefer configured binary path, otherwise discover the installed
    // PostgreSQL version rather than hardcoding v15 on CI/Neon dev hosts.
    const pgRoot = process.env.SLOPBOY_PG_BIN_DIR || '/usr/lib/postgresql';
    const versions = process.env.SLOPBOY_PG_BIN_DIR ? [] : await readdir(pgRoot).catch(() => []);
    const newest = versions.filter(v => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))[0];
    const binDir = process.env.SLOPBOY_PG_BIN_DIR || (newest ? resolve(pgRoot, newest, 'bin') : undefined);
    if (!binDir || await access(resolve(binDir, 'initdb')).then(() => false, () => true)) {
      t.skip('PostgreSQL server binaries unavailable; run with SLOPBOY_PG_BIN_DIR for real DB integration');
      return;
    }
    pgBinDir = binDir;
    // 1. Initialize cluster
    await runProc(resolve(binDir, 'initdb'), [
      '-D', dataDir,
      '-A', 'trust',
      '-U', 'antigravity',
      '--no-locale',
      '-E', 'UTF8',
    ]);

    // 2. Start PostgreSQL server on unix socket
    await runProc(resolve(binDir, 'pg_ctl'), [
      '-D', dataDir,
      '-o', `-k ${tempDir} -p ${port}`,
      '-l', resolve(tempDir, 'pg.log'),
      'start',
    ]);

    // 3. Test fresh migration UP
    const upResult = await migrateUp(config, migrationsDir);
    assert.equal(upResult.applied, 2);
    assert.deepEqual(upResult.versions, [1, 2]);

    // 4. Verify migration idempotency (re-running applies 0)
    const secondUp = await migrateUp(config, migrationsDir);
    assert.equal(secondUp.applied, 0);

    // 5. Verify system curator user
    const userRes = await executePsql(config, {
      sql: `SELECT id, email, role FROM users WHERE id = '${SYSTEM_CURATOR_USER_ID}';`,
    });
    assert.ok(userRes.stdout.includes('curator@slopboy.internal'));
    assert.ok(userRes.stdout.includes('system'));

    // 6. Verify 3 curated games seeded with exact immutable UUIDs
    for (const fixture of CURATED_GAME_FIXTURES) {
      const gameRes = await executePsql(config, {
        sql: `SELECT id, title, legacy_slug, visibility, status, current_published_revision_id FROM games WHERE id = '${fixture.gameId}';`,
      });
      assert.ok(gameRes.stdout.includes(fixture.title));
      assert.ok(gameRes.stdout.includes(fixture.legacySlug));
      assert.ok(gameRes.stdout.includes('draft'));
      assert.ok(gameRes.stdout.includes('private'));
      assert.ok(!gameRes.stdout.includes(fixture.revisionId), 'Do not publish an unverified revision');

      const revRes = await executePsql(config, {
        sql: `SELECT id FROM game_revisions WHERE id = '${fixture.revisionId}';`,
      });
      assert.equal(revRes.stdout.trim(), '', 'No fabricated content digest or artifact record');
    }

    // 7. Verify Schema Constraints:

    // 7a. Check user role constraint
    await assert.rejects(
      () => executePsql(config, {
        sql: `INSERT INTO users (display_name, role) VALUES ('Bad Role', 'superhero');`,
      }),
      (err: unknown) => err instanceof MigrationError && err.message.includes('check constraint')
    );

    // 7b. Check title constraint (empty title rejected)
    await assert.rejects(
      () => executePsql(config, {
        sql: `INSERT INTO games (id, owner_id, title, genre) VALUES (gen_random_uuid(), '${SYSTEM_CURATOR_USER_ID}', '   ', 'Arcade');`,
      }),
      (err: unknown) => err instanceof MigrationError && err.message.includes('check constraint')
    );

    // 7c. Check foreign key (non-existent owner_id rejected)
    const fakeOwnerId = '99999999-9999-4999-a999-999999999999';
    await assert.rejects(
      () => executePsql(config, {
        sql: `INSERT INTO games (id, owner_id, title, genre) VALUES (gen_random_uuid(), '${fakeOwnerId}', 'Orphan Game', 'Arcade');`,
      }),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );

    // 7d. Check unique revision constraint (game_id, revision_number)
    const existingGameId = CURATED_GAME_FIXTURES[0].gameId;
    // Create a real constraint-test fixture after seeding; published release
    // records are deliberately absent until verified bundle import.
    await executePsql(config, {
      sql: `INSERT INTO game_revisions (id, game_id, revision_number, engine_id,
        engine_version, manifest, content_digest, storage_key, byte_size, created_by)
        VALUES ('${CURATED_GAME_FIXTURES[0].revisionId}', '${existingGameId}',
          1, 'pixel-v1', '0.1.0', '{}'::jsonb,
          encode(digest('constraint-test-source', 'sha256'), 'hex'),
          '/fixtures/constraint-test.slop', 22, '${SYSTEM_CURATOR_USER_ID}');`,
    });
    await assert.rejects(
      () => executePsql(config, {
        sql: `
          INSERT INTO game_revisions (
            id, game_id, revision_number, engine_id, engine_version,
            manifest, content_digest, storage_key, byte_size, created_by
          ) VALUES (
            gen_random_uuid(), '${existingGameId}', 1, 'pixel-v1', '0.1.0',
            '{}'::jsonb, 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', '/cart/dup.slop', 100, '${SYSTEM_CURATOR_USER_ID}'
          );
        `,
      }),
      (err: unknown) => err instanceof MigrationError && err.message.includes('duplicate key value')
    );

    // 7e. Title changes do NOT alter game identity or revision ID
    await executePsql(config, {
      sql: `UPDATE games SET title = 'Tiny Catcher Deluxe' WHERE id = '${existingGameId}';`,
    });
    const updatedGame = await executePsql(config, {
      sql: `SELECT id, title, current_published_revision_id FROM games WHERE id = '${existingGameId}';`,
    });
    assert.ok(updatedGame.stdout.includes('Tiny Catcher Deluxe'));
    assert.ok(updatedGame.stdout.includes(existingGameId));
    const unchangedRevision = await executePsql(config, {
      sql: `SELECT id FROM game_revisions WHERE game_id = '${existingGameId}';`,
    });
    assert.ok(unchangedRevision.stdout.includes(CURATED_GAME_FIXTURES[0].revisionId));

    // 8. Test Rollback DOWN:

    // 8a. Roll back migration 2 (seed data)
    const rollback2 = await migrateDown(config, migrationsDir, 1);
    assert.equal(rollback2.rolledBack, 1);
    assert.deepEqual(rollback2.versions, [2]);

    const gamesAfterRollback = await executePsql(config, {
      sql: `SELECT count(*) FROM games;`,
    });
    assert.ok(gamesAfterRollback.stdout.includes('0'));

    // 8b. Roll back migration 1 (initial schema)
    const rollback1 = await migrateDown(config, migrationsDir, 0);
    assert.equal(rollback1.rolledBack, 1);
    assert.deepEqual(rollback1.versions, [1]);

    // Check table no longer exists
    const regRes = await executePsql(config, {
      sql: `SELECT to_regclass('games');`,
    });
    assert.ok(!regRes.stdout.includes('games'));

    // 8c. Re-run migrations UP on clean database to confirm clean repeatability
    const reMigrate = await migrateUp(config, migrationsDir);
    assert.equal(reMigrate.applied, 2);
    assert.deepEqual(reMigrate.versions, [1, 2]);

  } finally {
    // Stop server and clean up temporary cluster
    try {
      if (pgBinDir) await runProc(resolve(pgBinDir, 'pg_ctl'), ['-D', dataDir, 'stop', '-m', 'immediate']);
    } catch {
      // Ignore if already stopped
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('migration CLI wraps SQL and version bookkeeping in one psql transaction', async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'slopboy-psql-argv-'));
  const psql = resolve(tempDir, 'psql');
  const oldPath = process.env.PATH;
  try {
    await writeFile(psql, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n", { mode: 0o755 });
    process.env.PATH = `${tempDir}:${oldPath || ''}`;
    const out = await executePsql({}, {
      file: '/example/test-migration.sql',
      sqlAfterFile: 'INSERT INTO schema_migrations VALUES (99);',
    });
    assert.ok(out.stdout.includes('--single-transaction'));
    assert.ok(out.stdout.includes('/example/test-migration.sql'));
    assert.ok(out.stdout.includes('INSERT INTO schema_migrations VALUES (99);'));
    assert.ok(out.stdout.includes('-A'));
    assert.ok(out.stdout.includes('-t'));
  } finally {
    process.env.PATH = oldPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});
