import {claimFixture,enqueueFixture,finishFixture,fixtureStatus,runNextFixtureBuild} from '../tools/fixture-build-queue.ts';
import {produceFixtureArtifact,runTrustedFixtureChild} from '../tools/fixture-build-worker.ts';
import {createHash, randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve,dirname } from 'node:path';
import {LIST_PUBLIC_GAMES_SQL,READ_VISIBLE_GAME_SQL} from '../apps/web/server/catalog-queries.ts';
import {LIST_OWNED_GAMES_WITH_DRAFT_SQL,LIST_OWNED_GAMES_SQL,READ_OWNED_REVISIONS_SQL} from '../apps/web/server/owner-revision-queries.ts';
import {CREATE_GAME_SQL,UPDATE_GAME_SQL} from '../apps/web/server/game-management-queries.ts';
import {READ_PLAYABLE_GAME_SQL} from '../apps/web/server/playable-catalog-query.ts';
import {READ_SOURCE_DRAFT_SQL,CREATE_SOURCE_DRAFT_SQL} from '../apps/web/server/source-draft-queries.ts';
import {LIST_SOURCE_HISTORY_SQL, READ_SOURCE_REVISION_SQL} from '../apps/web/server/source-history-queries.ts';
import {READ_OWNED_BUILD_SOURCE_SQL} from '../apps/web/server/build-inputs.ts';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, writeFile, access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  loadMigrationFiles,
  migrateUp,
  migrateDown,
  executePsql,
  type DatabaseConnectionConfig,
  MigrationError,
} from '../packages/database/src/migrator.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
import {compileGameSource,packCartridge,validateManifest}
  from '../packages/cartridge/src/index.ts';
import {prepareImmutableCuratedAssets} from '../tools/build-curated-immutable.ts';
import {buildCuratedDraftImportSql,planCuratedDraftImport}
  from '../tools/curated-draft-import.ts';
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
  assert.equal(up.length, 15);
  assert.equal(down.length, 15);

  assert.equal(up[0].version, 1);
  assert.equal(up[0].name, 'initial_schema');
  assert.equal(up[1].version, 2);
  assert.equal(up[1].name, 'seed_curated_games');

  assert.equal(up[2].version, 3);
  assert.equal(up[2].name, 'versioned_installations');

  assert.equal(up[3].version, 4);
  assert.equal(up[3].name, 'source_drafts');
  assert.deepEqual(down.map(file => file.version), [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
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
    assert.equal(upResult.applied, 15);
    assert.deepEqual(upResult.versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

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
      sql: `INSERT INTO game_revisions (id, game_id, revision_number, release_version, engine_id,
        engine_version, manifest, content_digest, storage_key, byte_size, created_by)
        VALUES ('${CURATED_GAME_FIXTURES[0].revisionId}', '${existingGameId}',
          1, '1.0.0', 'pixel-v1', '0.1.0', '{}'::jsonb,
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

    // 7f. Keyset catalog queries must never leak private or unreviewed metadata.
    // Create a reviewed release ONLY in the ephemeral PostgreSQL test cluster.
    // Published visibility alone must not pass without a published revision.
    await executePsql(config,{sql:`
      UPDATE games SET visibility='public', status='published',
        current_published_revision_id='${CURATED_GAME_FIXTURES[0].revisionId}'
      WHERE id='${CURATED_GAME_FIXTURES[0].gameId}';
    `});
    const pgQueryRows=(output:string)=>output.split(/\r?\n/).filter(line=>line.trim()&&line.trim()!=='PREPARE');
    const preparedPage=(extra:string)=>`
      PREPARE qa_catalog(timestamptz,uuid,int) AS ${LIST_PUBLIC_GAMES_SQL};
      EXECUTE qa_catalog(NULL,NULL,${extra});
    `;
    const unreleased=await executePsql(config,{sql:preparedPage('24')});
    assert.equal(pgQueryRows(unreleased.stdout).length,0,'Do not expose a public-labeled game before revision approval');

    await executePsql(config,{sql:`
      UPDATE game_revisions SET status='published'
      WHERE id='${CURATED_GAME_FIXTURES[0].revisionId}';
    `});
    const released=await executePsql(config,{sql:preparedPage('24')});
    assert.ok(released.stdout.includes('Tiny Catcher Deluxe'));
    assert.ok(!released.stdout.includes('Star Patrol'),'Private drafts must not appear in public discovery');

    // A second independent published row proves limit/order and next cursor behavior.
    await executePsql(config,{sql:`
      INSERT INTO game_revisions(id,game_id,revision_number,release_version,engine_id,engine_version,
       manifest,content_digest,storage_key,byte_size,created_by,status)
      VALUES ('${CURATED_GAME_FIXTURES[1].revisionId}','${CURATED_GAME_FIXTURES[1].gameId}',
        1,'1.0.0','pixel-v1','0.1.0','{}'::jsonb,
        repeat('b',64),'qa-only/second.slop',22,'${SYSTEM_CURATOR_USER_ID}','published');
      UPDATE games SET status='published',visibility='public',
        current_published_revision_id='${CURATED_GAME_FIXTURES[1].revisionId}'
      WHERE id='${CURATED_GAME_FIXTURES[1].gameId}';
    `});
    const full=await executePsql(config,{sql:preparedPage('24')});
    assert.ok(full.stdout.includes('Tiny Catcher Deluxe')&&full.stdout.includes('Star Patrol'));
    const single=await executePsql(config,{sql:preparedPage('1')});
    const firstPage=pgQueryRows(single.stdout);
    assert.equal(firstPage.length,1,'Limit 1 returns one row');
    const firstCells=firstPage[0].split('|');
    assert.equal(firstCells.length,14,'Public catalog exposes only approved metadata columns including owner kind');
    assert.equal(firstCells[8],'platform');
    // Reuse the *exact* database timestamp, including microsecond precision,
    // rather than rounding it through JavaScript Date and skipping tied rows.
    const firstId=firstCells[0],firstTimestamp=firstCells[7];
    const second=await executePsql(config,{sql:`
      PREPARE qa_catalog(timestamptz,uuid,int) AS ${LIST_PUBLIC_GAMES_SQL};
      EXECUTE qa_catalog('${firstTimestamp}','${firstId}',1);
    `});
    const secondPage=pgQueryRows(second.stdout);
    assert.equal(secondPage.length,1,'Keyset cursor reaches the second reviewed game');
    assert.notEqual(secondPage[0].split('|')[0],firstId,'Cursor pagination must not repeat first-page entries');
    // Metadata edits are read on every request: the immutable UUID is stable,
    // and no CDN or Next.js cache may pin an old title.
    await executePsql(config,{sql:`
      UPDATE games SET title='Star Patrol Retitled' WHERE id='${CURATED_GAME_FIXTURES[1].gameId}';
    `});
    const afterRename=await executePsql(config,{sql:preparedPage('24')});
    assert.ok(afterRename.stdout.includes('Star Patrol Retitled'),'Renamed metadata is readable without a rebuild');
    assert.ok(afterRename.stdout.includes(CURATED_GAME_FIXTURES[1].gameId),'Renaming must not change a game UUID');

    // Owner-only metadata access to third, still-private curated draft.
    const privateId=CURATED_GAME_FIXTURES[2].gameId;
    const identitySql=(actor:string)=>`
      PREPARE qa_detail(uuid,uuid) AS ${READ_VISIBLE_GAME_SQL};
      EXECUTE qa_detail('${privateId}',${actor});
    `;
    const guest=await executePsql(config,{sql:identitySql('NULL')});
    const stranger=await executePsql(config,{sql:identitySql("'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'")});
    const owner=await executePsql(config,{sql:identitySql("'"+SYSTEM_CURATOR_USER_ID+"'")});
    assert.equal(pgQueryRows(guest.stdout).length,0,'Guest must not read a private draft by UUID');
    assert.equal(pgQueryRows(stranger.stdout).length,0,'An arbitrary actor may not read another owner draft');
    assert.ok(owner.stdout.includes('Circuit Slide'),'Only its database owner can read private draft metadata');
    // This test only touches the disposable local cluster; rollback below
    // removes these temporary reviewed revision statuses and fixture revisions.


    // 7g. The published pointer must reference a revision from the SAME game,
    // not just any existing UUID (a gap in the original single-column FK).
    await assert.rejects(
      () => executePsql(config,{sql:`
        UPDATE games SET current_published_revision_id='${CURATED_GAME_FIXTURES[1].revisionId}'
        WHERE id='${CURATED_GAME_FIXTURES[0].gameId}';
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );

    // 7h. Display release versions are separate from engine versions and unique
    // per game; the immutable revision cannot be silently repackaged.
    const firstRevision=CURATED_GAME_FIXTURES[0].revisionId;
    const firstGame=CURATED_GAME_FIXTURES[0].gameId;
    await assert.rejects(
      () => executePsql(config,{sql:`
        UPDATE game_revisions SET content_digest=repeat('c',64)
        WHERE id='${firstRevision}';
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('Immutable revision payload')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        UPDATE game_revisions SET release_version='2.0.0'
        WHERE id='${firstRevision}';
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('Immutable revision payload')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO game_revisions(id,game_id,revision_number,release_version,engine_id,
         engine_version,manifest,content_digest,storage_key,byte_size,created_by)
        VALUES(gen_random_uuid(),'${firstGame}',2,'1.0.0','pixel-v1','0.1.0',
         '{}'::jsonb,repeat('d',64),'qa/duplicate-version.slop',12,'${SYSTEM_CURATOR_USER_ID}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('duplicate key value')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO game_revisions(id,game_id,revision_number,release_version,engine_id,
         engine_version,manifest,content_digest,storage_key,byte_size,created_by)
        VALUES(gen_random_uuid(),'${firstGame}',2,'v2','pixel-v1','0.1.0',
         '{}'::jsonb,repeat('d',64),'qa/invalid-version.slop',12,'${SYSTEM_CURATOR_USER_ID}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('check constraint')
    );
    await executePsql(config,{sql:`
      INSERT INTO game_revisions(id,game_id,revision_number,release_version,engine_id,
        engine_version,manifest,content_digest,storage_key,byte_size,created_by)
      VALUES(gen_random_uuid(),'${firstGame}',2,'1.1.0-beta.1','pixel-v1','0.1.0',
        '{}'::jsonb,repeat('d',64),'qa/prerelease.slop',12,'${SYSTEM_CURATOR_USER_ID}');
    `});

    // 7i. Per-device installs require an actual library membership, a matching
    // game/revision and a real bundle artifact from that same revision.
    const a='77777777-7777-4777-8777-777777777777';
    const b='88888888-8888-4888-8888-888888888888';
    const device='99999999-9999-4999-8999-999999999999';
    const otherDevice='99999999-9999-4999-8999-999999999998';
    const gameB=CURATED_GAME_FIXTURES[1].gameId;
    const revB=CURATED_GAME_FIXTURES[1].revisionId;
    await executePsql(config,{sql:`
      INSERT INTO cartridge_artifacts(id,revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)
      VALUES
       ('${a}','${firstRevision}','bundle','game-a.slop',repeat('a',64),50,
        'application/octet-stream','qa/game-a.slop'),
       ('${b}','${revB}','bundle','game-b.slop',repeat('b',64),50,
        'application/octet-stream','qa/game-b.slop');
      INSERT INTO user_library(user_id,game_id)
      VALUES ('${SYSTEM_CURATOR_USER_ID}','${firstGame}');
      INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
      VALUES ('${SYSTEM_CURATOR_USER_ID}','${device}','${firstGame}','${firstRevision}','${a}');
    `});
    // Asset records from the correct revision still cannot masquerade as an
    // installable cartridge: only artifact_type=bundle is an install target.
    const nonBundle='66666666-6666-4666-8666-666666666666';
    await executePsql(config,{sql:`
      INSERT INTO cartridge_artifacts(id,revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)
      VALUES('${nonBundle}','${firstRevision}','asset','assets/texture.png',
        repeat('f',64),10,'image/png','qa/texture.png');
    `});
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
        VALUES ('${SYSTEM_CURATOR_USER_ID}','${otherDevice}','${firstGame}','${firstRevision}','${nonBundle}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        UPDATE cartridge_artifacts SET storage_key='qa/rewritten.slop' WHERE id='${a}';
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('Immutable cartridge artifact')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
        VALUES ('${SYSTEM_CURATOR_USER_ID}','${otherDevice}','${firstGame}','${firstRevision}','${b}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
        VALUES ('${SYSTEM_CURATOR_USER_ID}','${otherDevice}','${firstGame}','${revB}','${b}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
        VALUES ('${SYSTEM_CURATOR_USER_ID}','${otherDevice}','${gameB}','${revB}','${b}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('violates foreign key constraint')
    );
    await assert.rejects(
      () => executePsql(config,{sql:`
        INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
        VALUES ('${SYSTEM_CURATOR_USER_ID}','${device}','${firstGame}','${firstRevision}','${a}');
      `}),
      (err: unknown) => err instanceof MigrationError && err.message.includes('duplicate key value')
    );
    await executePsql(config,{sql:`
      INSERT INTO user_installations(user_id,device_id,game_id,revision_id,artifact_id)
      VALUES ('${SYSTEM_CURATOR_USER_ID}','${otherDevice}','${firstGame}','${firstRevision}','${a}');
    `});
    const installed=await executePsql(config,{sql:`
      SELECT count(*) FROM user_installations WHERE game_id='${firstGame}';
    `});
    assert.equal(installed.stdout.trim(),'2','Each device has its own installation row');
    await executePsql(config,{sql:`
      DELETE FROM user_library WHERE user_id='${SYSTEM_CURATOR_USER_ID}' AND game_id='${firstGame}';
    `});
    const afterLibraryRemoval=await executePsql(config,{sql:`
      SELECT count(*) FROM user_installations WHERE game_id='${firstGame}';
    `});
    assert.equal(afterLibraryRemoval.stdout.trim(),'0','Removing library membership cascades device install mirrors only');

    // 8. Test Rollback DOWN:

    // 8a. Roll back additive migration 3 first (fixtures only).
    const rollback3 = await migrateDown(config, migrationsDir, 2);
    assert.equal(rollback3.rolledBack, 13);
    assert.deepEqual(rollback3.versions, [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    const noInstallTable=await executePsql(config,{sql:"SELECT to_regclass('user_installations');"});
    assert.equal(noInstallTable.stdout.trim(),'');
    const noVersionColumn=await executePsql(config,{sql:`
      SELECT count(*) FROM information_schema.columns
      WHERE table_name='game_revisions' AND column_name='release_version';
    `});
    assert.equal(noVersionColumn.stdout.trim(),'0');

    // 8b. Roll back migration 2 (seed data)
    const rollback2 = await migrateDown(config, migrationsDir, 1);
    assert.equal(rollback2.rolledBack, 1);
    assert.deepEqual(rollback2.versions, [2]);

    const gamesAfterRollback = await executePsql(config, {
      sql: `SELECT count(*) FROM games;`,
    });
    assert.ok(gamesAfterRollback.stdout.includes('0'));

    // 8c. Roll back migration 1 (initial schema)
    const rollback1 = await migrateDown(config, migrationsDir, 0);
    assert.equal(rollback1.rolledBack, 1);
    assert.deepEqual(rollback1.versions, [1]);

    // Check table no longer exists
    const regRes = await executePsql(config, {
      sql: `SELECT to_regclass('games');`,
    });
    assert.ok(!regRes.stdout.includes('games'));

    // 8d. Re-run migrations UP on clean database to confirm clean repeatability
    const reMigrate = await migrateUp(config, migrationsDir);
    assert.equal(reMigrate.applied, 15);
    assert.deepEqual(reMigrate.versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);


    // 8e. Issue #27 Phase 2C: prove the guarded import against the ACTUAL
    // ephemeral PostgreSQL schema. Real Neon Development remains untouched.
    const importRoot=resolve(tempDir,'verified-curated-import');
    for(const game of GAMES){
      for(const name of [game.source.manifest,game.source.game]){
        const destination=resolve(importRoot,name);
        await mkdir(dirname(destination),{recursive:true});
        await copyFile(resolve(root,name),destination);
      }
      const manifest=validateManifest(JSON.parse(
        await readFile(resolve(importRoot,game.source.manifest),'utf8'))).manifest;
      const code=compileGameSource(await readFile(resolve(importRoot,game.source.game),'utf8'));
      const bytes=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
      const destination=resolve(importRoot,'apps/web/private'+game.cartridge);
      await mkdir(dirname(destination),{recursive:true});
      await writeFile(destination,bytes);
    }
    await prepareImmutableCuratedAssets({rootDir:importRoot,mode:'build'});
    const privatePlan=await planCuratedDraftImport(importRoot);
    const importSql=buildCuratedDraftImportSql(privatePlan);
    assert.equal(privatePlan.revisions.length,GAMES.length);
    assert.ok(privatePlan.revisions.every(r=>r.storage_key.startsWith(
      'static-public-v1:/cartridges/by-sha256/')));

    // The first row might insert before an invalid second row; the SINGLE SQL
    // transaction must still leave no partial imported revision or artifact.
    await executePsql(config,{sql:
      "UPDATE games SET status='archived' WHERE id='"+GAMES[1].gameId+"';"
    });
    await assert.rejects(()=>executePsql(config,{sql:importSql}),
      (err:unknown)=>err instanceof MigrationError&&
        err.message.includes('Curated game changed owner or release state'));
    const emptyAfterFailure=await executePsql(config,{sql:
      'SELECT (SELECT count(*) FROM game_revisions),'+
             '(SELECT count(*) FROM cartridge_artifacts);'
    });
    assert.equal(emptyAfterFailure.stdout.trim(),'0|0','A failed import is all-or-nothing');
    await executePsql(config,{sql:
      "UPDATE games SET status='draft' WHERE id='"+GAMES[1].gameId+"';"
    });

    await executePsql(config,{sql:importSql});
    const imported=await executePsql(config,{sql:
      "SELECT (SELECT count(*) FROM game_revisions),"+
             "(SELECT count(*) FROM cartridge_artifacts),"+
             "(SELECT count(*) FROM game_revisions"+
             " WHERE status='draft' AND release_version IS NULL),"+
             "(SELECT count(*) FROM games WHERE visibility='private'"+
             " AND status='draft' AND current_published_revision_id IS NULL),"+
             "(SELECT count(*) FROM user_library);"
    });
    assert.equal(imported.stdout.trim(),'3|3|3|3|0',
      'Exactly three immutable private drafts and artifacts; no publication/memberships');
    const artifactIds=(await executePsql(config,{sql:
      'SELECT id,revision_id,sha256,storage_key FROM cartridge_artifacts ORDER BY revision_id;'
    })).stdout.trim();
    for(const item of privatePlan.revisions){
      const record=await executePsql(config,{sql:
        "SELECT game_id,revision_number,content_digest,byte_size,engine_id,"+
        "engine_version,device_profile,storage_key FROM game_revisions WHERE id='"+
        item.revision_id+"';"
      });
      assert.equal(record.stdout.trim(),[
        item.game_id,'1',item.content_digest,String(item.byte_size),
        item.engine_id,item.engine_version,item.device_profile,item.storage_key
      ].join('|'));
    }
    await executePsql(config,{sql:importSql});
    assert.equal((await executePsql(config,{sql:
      'SELECT id,revision_id,sha256,storage_key FROM cartridge_artifacts ORDER BY revision_id;'
    })).stdout.trim(),artifactIds,
      'Idempotent import preserves all actual artifact UUIDs and digests');

    // A competing extra artifact must not silently get blessed as reviewed.
    await executePsql(config,{sql:
      "INSERT INTO cartridge_artifacts"+
      " (revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)"+
      " VALUES ('"+GAMES[1].revisionId+"','asset','assets/rogue.txt',repeat('e',64),"+
      " 12,'text/plain','qa/rogue.txt');"
    });
    await assert.rejects(()=>executePsql(config,{sql:importSql}),
      (err:unknown)=>err instanceof MigrationError&&
        err.message.includes('Conflicting or extra curated cartridge artifacts'));
    await executePsql(config,{sql:
      "DELETE FROM cartridge_artifacts WHERE revision_id='"+
      GAMES[1].revisionId+"' AND path='assets/rogue.txt';"
    });
    await executePsql(config,{sql:importSql});

    // Neither draft visibility nor status can be switched to public by import.
    assert.equal((await executePsql(config,{sql:
      "SELECT count(*) FROM games WHERE visibility='public' OR status='published';"
    })).stdout.trim(),'0');


    // 8f. An imported, still-private revision is visible to the database owner
    // but NEVER a guest, a random UUID, or any ordinary other owner. The
    // internet-facing route separately requires a Neon-verified session.
    const privateGameId=GAMES[0].gameId;
    const curator=SYSTEM_CURATOR_USER_ID;
    const unknownSubject='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const detailFor=(actor:string)=>'PREPARE owner_detail(uuid,uuid) AS '+READ_VISIBLE_GAME_SQL+
      "; EXECUTE owner_detail('"+privateGameId+"',"+actor+');';
    const ownerDetail=await executePsql(config,{sql:detailFor("'"+curator+"'")});
    assert.ok(ownerDetail.stdout.includes(GAMES[0].revisionId),
      'Private game owner detail includes imported, unpublished revision');
    assert.ok(ownerDetail.stdout.includes('draft'));
    const guestDetail=await executePsql(config,{sql:detailFor('NULL')});
    assert.equal(pgQueryRows(guestDetail.stdout).length,0,
      'Guest cannot learn private draft revision metadata');
    const strangerDetail=await executePsql(config,{sql:detailFor("'"+unknownSubject+"'")});
    assert.equal(pgQueryRows(strangerDetail.stdout).length,0,
      'Unregistered stranger cannot learn private game metadata');

    const publicAfterImport=await executePsql(config,{sql:preparedPage('24')});
    assert.equal(pgQueryRows(publicAfterImport.stdout).length,0,
      'Import alone never makes any game public/discoverable');

    const owned=(actor:string)=>'PREPARE owner_listing(uuid,int) AS '+LIST_OWNED_GAMES_SQL+
      '; EXECUTE owner_listing('+"'"+actor+"'"+',50);';
    const curatorList=await executePsql(config,{sql:owned(curator)});
    assert.equal(pgQueryRows(curatorList.stdout).length,3);
    for(const game of GAMES){
      assert.ok(curatorList.stdout.includes(game.gameId));
      assert.ok(curatorList.stdout.includes(game.revisionId),
        'Owner list includes matching latest revision ID');
    }
    const foreignList=await executePsql(config,{sql:owned(unknownSubject)});
    assert.equal(pgQueryRows(foreignList.stdout).length,0);

    const revisionHistory=(id:string,subject:string)=>'PREPARE owned_history(uuid,uuid,int) AS '+
      READ_OWNED_REVISIONS_SQL+"; EXECUTE owned_history('"+id+"','"+subject+"',50);";
    const ownerHistory=await executePsql(config,{
      sql:revisionHistory(privateGameId,curator)
    });
    assert.equal(pgQueryRows(ownerHistory.stdout).length,1);
    assert.ok(ownerHistory.stdout.includes(GAMES[0].revisionId));
    assert.ok(!ownerHistory.stdout.includes('static-public-v1:'),
      'Owner metadata route cannot expose artifact storage keys');
    const foreignHistory=await executePsql(config,{
      sql:revisionHistory(privateGameId,unknownSubject)
    });
    assert.equal(pgQueryRows(foreignHistory.stdout).length,0,
      'The same UUID cannot disclose revision history to another owner');


    // 8g. A second immutable draft supersedes the first in owner-visible
    // metadata without changing the game's UUID or making either public.
    const nextRevision='44444444-4444-4444-8444-444444444444';
    await executePsql(config,{sql:
      "INSERT INTO game_revisions(id,game_id,revision_number,release_version,"+
      "engine_id,engine_version,device_profile,manifest,content_digest,"+
      "storage_key,byte_size,status,created_by) VALUES ('"+nextRevision+"','"+
      privateGameId+"',2,'1.1.0','pixel-v1','0.1.0','slopboy-1000',"+
      "'{}'::jsonb,repeat('f',64),'qa/revision-2.slop',22,'review_pending','"+
      curator+"');"
    });
    const newestDetail=await executePsql(config,{sql:detailFor("'"+curator+"'")});
    assert.ok(newestDetail.stdout.includes(nextRevision),
      'Owner metadata resolves the newest revision without a publish pointer');
    const refreshedList=await executePsql(config,{sql:owned(curator)});
    assert.ok(refreshedList.stdout.includes(nextRevision),
      'Owner Dashboard gets most recent revision from database');
    const newestHistory=await executePsql(config,{sql:revisionHistory(privateGameId,curator)});
    const historyRows=pgQueryRows(newestHistory.stdout);
    assert.equal(historyRows.length,2);
    assert.ok(historyRows[0].includes(nextRevision),
      'Revision history is sorted newest first');
    assert.ok(historyRows[1].includes(GAMES[0].revisionId));
    assert.equal(pgQueryRows((await executePsql(config,{
      sql:detailFor('NULL')
    })).stdout).length,0,'Second private revision is still invisible to guests');

    // 9. Two independent owners: the same SQL predicate used by the account
    // data access layer MUST never return another owner's private game.
    const alice='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const bob='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
    const aliceGame='11111111-1111-4111-8111-111111111111';
    const bobGame='22222222-2222-4222-8222-222222222222';
    await executePsql(config, {sql:`
      INSERT INTO public.users(id,email,display_name,role) VALUES
      ('${alice}','alice@example.invalid','Alice','player'),
      ('${bob}','bob@example.invalid','Bob','player');
      INSERT INTO public.games(id,owner_id,title,genre,visibility,status) VALUES
      ('${aliceGame}','${alice}','Alice private game','Arcade','private','draft'),
      ('${bobGame}','${bob}','Bob private game','Puzzle','private','draft');
    `});
    const ownedByAlice=await executePsql(config,{sql:`
      SELECT id,title,status,visibility FROM public.games
      WHERE owner_id='${alice}'::uuid ORDER BY created_at DESC,id DESC LIMIT 50;
    `});
    const ownedByBob=await executePsql(config,{sql:`
      SELECT id,title,status,visibility FROM public.games
      WHERE owner_id='${bob}'::uuid ORDER BY created_at DESC,id DESC LIMIT 50;
    `});
    assert.ok(ownedByAlice.stdout.includes(aliceGame));
    assert.ok(!ownedByAlice.stdout.includes(bobGame));
    assert.ok(ownedByBob.stdout.includes(bobGame));
    assert.ok(!ownedByBob.stdout.includes(aliceGame));

    // Scoped DB credentials can read only the required columns and cannot
    // promote a user by updating role, or DELETE their games.
    await executePsql(config,{sql:`
      CREATE ROLE slopboy_test_web;
      GRANT USAGE ON SCHEMA public TO slopboy_test_web;
      GRANT SELECT(id,email,display_name,role), INSERT(id,email,display_name),
        UPDATE(email,display_name) ON public.users TO slopboy_test_web;
      GRANT SELECT(id,owner_id,title,status,visibility,created_at)
        ON public.games TO slopboy_test_web;
    `});
    const grants=await executePsql(config,{sql:`
      SELECT has_column_privilege('slopboy_test_web','public.users','role','UPDATE'),
        has_table_privilege('slopboy_test_web','public.games','DELETE'),
        has_column_privilege('slopboy_test_web','public.users','display_name','UPDATE'),
        has_column_privilege('slopboy_test_web','public.users','role','INSERT');
    `});
    assert.equal(grants.stdout.trim(),'f|f|t|f');

    // Exercise the same parameterized mutation statements used by the API.
    const admin='cccccccc-cccc-4ccc-accc-cccccccccccc';
    const created='33333333-3333-4333-8333-333333333333';
    const platformGame='44444444-4444-4444-8444-444444444444';
    await executePsql(config,{sql:`INSERT INTO public.users(id,display_name,role) VALUES ('${admin}','Admin','admin');`});
    const create=(actor:string,id:string,platform:boolean)=>
      `PREPARE manage_create(uuid,uuid,uuid,boolean,text,text,text,text) AS ${CREATE_GAME_SQL};`+
      `EXECUTE manage_create('${actor}','${curator}','${id}',${platform},'Created',NULL,NULL,'Puzzle');`;
    const update=(actor:string,id:string)=>
      `PREPARE manage_update(uuid,uuid,uuid,text,text,text,text) AS ${UPDATE_GAME_SQL};`+
      `EXECUTE manage_update('${actor}','${curator}','${id}','Edited',NULL,NULL,'Puzzle');`;
    assert.ok((await executePsql(config,{sql:create(alice,created,false)})).stdout.includes(created));
    assert.ok(!(await executePsql(config,{sql:create(alice,platformGame,true)})).stdout.includes(platformGame));
    assert.ok((await executePsql(config,{sql:create(admin,platformGame,true)})).stdout.includes(platformGame));
    assert.ok(!(await executePsql(config,{sql:update(bob,created)})).stdout.includes(created));
    assert.ok(!(await executePsql(config,{sql:update(admin,created)})).stdout.includes(created));
    assert.ok((await executePsql(config,{sql:update(alice,created)})).stdout.includes(created));
    assert.ok((await executePsql(config,{sql:update(admin,platformGame)})).stdout.includes(platformGame));
    const beforeRevision=(await executePsql(config,{sql:`SELECT row_to_json(r)::text FROM game_revisions r WHERE r.id='${GAMES[0].revisionId}';`})).stdout;
    assert.ok((await executePsql(config,{sql:update(admin,GAMES[0].gameId)})).stdout.includes(GAMES[0].gameId));
    const afterRevision=(await executePsql(config,{sql:`SELECT row_to_json(r)::text FROM game_revisions r WHERE r.id='${GAMES[0].revisionId}';`})).stdout;
    assert.equal(afterRevision,beforeRevision,'Metadata changes cannot rewrite an immutable revision');
    const audit=await executePsql(config,{sql:`SELECT count(*) FROM audit_events WHERE target_id IN ('${created}','${platformGame}');`});
    assert.equal(audit.stdout.trim(),'4');

    // An imported draft is not playable until both the game and its own
    // immutable revision are explicitly published (in this disposable DB).
    const playable=(id:string)=>`PREPARE qa_playable(text,boolean) AS ${READ_PLAYABLE_GAME_SQL}; EXECUTE qa_playable('${id}',${/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)});`;
    const reviewed=GAMES[1];
    assert.equal(pgQueryRows((await executePsql(config,{sql:playable(reviewed.gameId)})).stdout).length,0);
    await executePsql(config,{sql:`UPDATE game_revisions SET status='published' WHERE id='${reviewed.revisionId}';
      UPDATE games SET visibility='public',status='published',current_published_revision_id='${reviewed.revisionId}' WHERE id='${reviewed.gameId}';`});
    assert.equal(pgQueryRows((await executePsql(config,{sql:playable(reviewed.gameId)})).stdout).length,1);
    assert.equal(pgQueryRows((await executePsql(config,{sql:playable(reviewed.legacySlug)})).stdout).length,1);
    assert.equal(pgQueryRows((await executePsql(config,{sql:playable(created)})).stdout).length,0);
    const collisionGame='77777777-7777-4777-8777-777777777777';
    const collisionRevision='88888888-8888-4888-8888-888888888888';
    await executePsql(config,{sql:`
      INSERT INTO games(id,owner_id,title,genre,legacy_slug) VALUES ('${collisionGame}','${curator}','Collision','Puzzle','${reviewed.gameId}');
      INSERT INTO game_revisions(id,game_id,revision_number,engine_id,engine_version,device_profile,manifest,content_digest,storage_key,byte_size,status,created_by)
      SELECT '${collisionRevision}','${collisionGame}',1,engine_id,engine_version,device_profile,manifest,content_digest,storage_key,byte_size,'published','${admin}'
      FROM game_revisions WHERE id='${reviewed.revisionId}';
      INSERT INTO cartridge_artifacts(revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)
      SELECT '${collisionRevision}',artifact_type,path,sha256,byte_size,mime_type,storage_key FROM cartridge_artifacts WHERE revision_id='${reviewed.revisionId}';
      UPDATE games SET visibility='public',status='published',current_published_revision_id='${collisionRevision}' WHERE id='${collisionGame}';
    `});
    assert.equal(pgQueryRows((await executePsql(config,{sql:playable(reviewed.gameId)})).stdout)[0].split('|')[0],reviewed.gameId,
      'A UUID-shaped legacy slug cannot shadow the canonical game UUID');
    assert.equal(pgQueryRows((await executePsql(config,{sql:update(admin,reviewed.gameId)})).stdout).length,0,
      'Published metadata cannot bypass review through the management endpoint');
    await executePsql(config,{sql:'GRANT SELECT ON public.published_playable_games TO slopboy_test_web;'});
    const viewAccess=await executePsql(config,{sql:`SET ROLE slopboy_test_web;
      SELECT count(*) FROM public.published_playable_games WHERE id='${reviewed.gameId}';`});
    assert.equal(viewAccess.stdout.trim().split('\n').at(-1),'1','A role granted the view can read reviewed releases');
    const privateViewAccess=await executePsql(config,{sql:`SET ROLE slopboy_test_web;
      SELECT count(*) FROM public.published_playable_games WHERE id='${created}';`});
    assert.equal(privateViewAccess.stdout.trim().split('\n').at(-1),'0','The public view excludes private games');

    // Upgrade 003 -> 004 preserves imported games and revisions.
    const downgrade4=await migrateDown(config,migrationsDir,3);
    assert.deepEqual(downgrade4.versions,[15,14,13,12,11,10,9,8,7,6,5,4]);
    assert.equal((await migrateUp(config,migrationsDir)).applied,12);
    assert.equal((await executePsql(config,{sql:`SELECT count(*) FROM games WHERE id='${GAMES[0].gameId}';`})).stdout.trim(),'1');
    const sourceId='55555555-5555-4555-8555-555555555555';
    const writeSource=(actor:string,game:string)=>`PREPARE source_write(uuid,uuid,uuid,uuid,text,text) AS ${CREATE_SOURCE_DRAFT_SQL};`+
      `EXECUTE source_write('${actor}','${game}','${curator}','${sourceId}','typescript','private source');`;
    const readSource=(actor:string,game:string)=>`PREPARE source_read(uuid,uuid,uuid) AS ${READ_SOURCE_DRAFT_SQL};`+
      `EXECUTE source_read('${actor}','${game}','${curator}');`;
    assert.equal(pgQueryRows((await executePsql(config,{sql:writeSource(bob,created)})).stdout).length,0);
    assert.ok((await executePsql(config,{sql:writeSource(alice,created)})).stdout.includes(sourceId));
    assert.ok((await executePsql(config,{sql:readSource(alice,created)})).stdout.includes('private source'));
    assert.equal(pgQueryRows((await executePsql(config,{sql:readSource(bob,created)})).stdout).length,0);
    assert.equal(pgQueryRows((await executePsql(config,{sql:readSource(admin,created)})).stdout).length,0);
    await assert.rejects(()=>executePsql(config,{sql:`UPDATE game_source_drafts SET source_text='modified' WHERE id='${sourceId}';`}));
    const platformSourceId='66666666-6666-4666-8666-666666666666';
    const platformWrite=writeSource(admin,platformGame).replace(sourceId,platformSourceId);
    assert.ok((await executePsql(config,{sql:platformWrite})).stdout.includes(platformSourceId));
    assert.ok((await executePsql(config,{sql:readSource(admin,platformGame)})).stdout.includes('private source'));
    assert.equal(pgQueryRows((await executePsql(config,{sql:readSource(alice,platformGame)})).stdout).length,0);

    const gameUuid='91919191-9191-4191-8191-919191919191';
    const revisionUuid='92929292-9292-4292-8292-929292929292';
    const submission='93939393-9393-4393-8393-939393939393';
    const validated=(actor=alice, target='NULL', fingerprint='a', key=submission, id=revisionUuid)=>`
      SELECT outcome,game_id,revision_id,checksum FROM public.save_validated_source(
        '${actor}','${curator}',${target},'${gameUuid}','${id}','${key}',
        repeat('${fingerprint}',64),'{"title":"Validated draft","genre":"Puzzle"}',
        '{"engine":{"id":"kaplay","version":"3001.0.19"}}','typescript','export default {}');`;
    await assert.rejects(()=>executePsql(config,{sql:validated().replace("'typescript'","'invalid-language'")}));
    assert.equal((await executePsql(config,{sql:`SELECT count(*) FROM games WHERE id='${gameUuid}'`})).stdout.trim(),'0',
      'A failed source insert rolls back game creation');
    await executePsql(config,{sql:`
      GRANT INSERT(id,owner_id,title,tagline,description,genre),UPDATE(title)
        ON public.games TO slopboy_test_web;
      GRANT SELECT(id,game_id,created_by,created_at,language,source_text,engine_manifest,request_key,request_digest,source_digest),
        INSERT(id,game_id,created_by,language,source_text,engine_manifest,source_digest,request_key,request_digest)
        ON public.game_source_drafts TO slopboy_test_web;
      GRANT INSERT(actor_id,action,target_type,target_id) ON public.audit_events TO slopboy_test_web;
      GRANT EXECUTE ON FUNCTION public.save_validated_source(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text)
        TO slopboy_test_web;`});
    const writeAsApp=()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;'+validated()});
    const results=await Promise.all([writeAsApp(),writeAsApp()]);

    assert.deepEqual(results.map(r=>r.stdout.trim().split('\n').at(-1)!.split('|')[0]).sort(),['replayed','stored']);
    for(const {stdout} of results){
      const [,game,revision,digest]=stdout.trim().split('\n').at(-1)!.split('|');
      assert.equal(game,gameUuid);
      assert.equal(revision,revisionUuid);
      assert.match(digest,/^[0-9a-f]{64}$/);
    }
    assert.match((await executePsql(config,{sql:validated(alice,'NULL','b')})).stdout,/^conflict/);
    assert.match((await executePsql(config,{sql:validated(bob,"'"+gameUuid+"'")})).stdout,/^not_found/);
    assert.match((await executePsql(config,{sql:validated(admin,"'"+gameUuid+"'")})).stdout,/^not_found/);
    assert.equal((await executePsql(config,{sql:`SELECT owner_id,visibility,status FROM games WHERE id='${gameUuid}'`})).stdout.trim(),
      alice+'|private|draft');
    assert.match((await executePsql(config,{sql:readSource(alice,gameUuid)})).stdout,/export default/);
    const editKey='98989898-9898-4898-8898-989898989898';
    const editRevision='97979797-9797-4797-8797-979797979797';
    assert.match((await executePsql(config,{sql:validated(alice,"'"+gameUuid+"'",'d',editKey,editRevision)
      .replace('export default {}','export default { /* edit */ }')})).stdout,/^stored/);
    assert.match((await executePsql(config,{sql:readSource(alice,gameUuid)})).stdout,/\/\* edit \*\//);
    const restoreKey = '96969696-9696-4696-8696-969696969696';
    const restoreRevision = '97979797-9797-4797-8797-979797979798';
    const restore = validated(alice, "'" + gameUuid + "'", 'e', restoreKey, restoreRevision);
    assert.match((await executePsql(config, {sql: 'SET ROLE slopboy_test_web;' + restore})).stdout, /stored/);
    assert.match((await executePsql(config, {sql: 'SET ROLE slopboy_test_web;' + restore})).stdout, /replayed/);

    await executePsql(config,{sql:`
      GRANT SELECT(id,game_id,revision_number,release_version,status,engine_id,engine_version)
        ON public.game_revisions TO slopboy_test_web;`});
    const draftListing = (actor:string) => executePsql(config,{sql:`
      SET ROLE slopboy_test_web;
      PREPARE draft_listing(uuid,int) AS ${LIST_OWNED_GAMES_WITH_DRAFT_SQL};
      EXECUTE draft_listing('${actor}',50);`});
    const ownerDraft = pgQueryRows((await draftListing(alice)).stdout).find(row=>row.startsWith(gameUuid+'|'));
    assert.ok(ownerDraft);
    assert.match(ownerDraft,/\|[0-9]{4}-[0-9]{2}-[0-9]{2}[^|]*\|t$/);
    assert.doesNotMatch(ownerDraft,/export default|source_digest|adapterProtocol/);
    assert.ok(!pgQueryRows((await draftListing(bob)).stdout).some(row=>row.startsWith(gameUuid+'|')));
    assert.ok(!pgQueryRows((await draftListing(admin)).stdout).some(row=>row.startsWith(gameUuid+'|')));

    const history = (actor: string, before: string | null = null) => executePsql(config, {sql:
      `SET ROLE slopboy_test_web;
      PREPARE source_history(uuid,uuid,uuid,uuid) AS ${LIST_SOURCE_HISTORY_SQL};
      EXECUTE source_history('${actor}','${gameUuid}','${curator}',${before ? "'" + before + "'" : 'NULL'});`});
    const historicalSource = (actor: string, id: string) => executePsql(config, {sql:
      `SET ROLE slopboy_test_web;
      PREPARE source_version(uuid,uuid,uuid,uuid) AS ${READ_SOURCE_REVISION_SQL};
      EXECUTE source_version('${actor}','${gameUuid}','${curator}','${id}');`});
    const sourceVersionRows = (stdout: string) => pgQueryRows(stdout).filter(row => row !== 'SET');
    const firstHistory = sourceVersionRows((await history(alice)).stdout);
    assert.deepEqual(firstHistory.map(row => row.split('|')[0]), [restoreRevision, editRevision, revisionUuid]);
    for (const id of [revisionUuid, restoreRevision]) {
      assert.match((await historicalSource(alice, id)).stdout, /export default \{\}/);
    }
    assert.deepEqual(sourceVersionRows((await history(bob)).stdout), []);
    assert.deepEqual(sourceVersionRows((await historicalSource(bob, revisionUuid)).stdout), []);
    assert.deepEqual(sourceVersionRows((await history(alice, sourceId)).stdout), [], 'A cursor from another game is rejected');

    await executePsql(config,{sql:`INSERT INTO game_source_drafts(id,game_id,created_by,language,source_text)
      SELECT gen_random_uuid(), '${gameUuid}', '${alice}', 'typescript', 'old draft' FROM generate_series(1,55)`});
    const latestLegacyDraft = pgQueryRows((await draftListing(alice)).stdout)
      .find(row=>row.startsWith(gameUuid+'|'));
    assert.match(latestLegacyDraft ?? '',/\|f$/,'The latest unvalidated draft supersedes older validated summaries');
    const page = sourceVersionRows((await history(alice)).stdout).map(row => row.split('|')[0]);
    assert.equal(page.length, 51);
    const older = sourceVersionRows((await history(alice, page[49])).stdout).map(row => row.split('|')[0]);
    assert.equal(older.length, 8);
    assert.equal(older[0], page[50]);
    assert.equal(new Set([...page.slice(0,50), ...older]).size, 58);
    assert.match((await executePsql(config,{sql:validated(alice,"'"+gameUuid+"'",'a','94949494-9494-4494-8494-949494949494','95959595-9595-4595-8595-959595959595')})).stdout,/^quota/);
    assert.match((await executePsql(config,{sql:validated()})).stdout,/^replayed/,'Retry does not spend quota');
    const buildSource = (id: string) => executePsql(config,{sql:`
      SET ROLE slopboy_test_web;
      PREPARE build_source(uuid,uuid,uuid) AS ${READ_OWNED_BUILD_SOURCE_SQL};
      EXECUTE build_source('${id}','${gameUuid}','${revisionUuid}');`});
    const [ownedInput] = sourceVersionRows((await buildSource(alice)).stdout);
    assert.match(ownedInput,/kaplay.*typescript\|[a-f0-9]{64}\|17$/);
    assert.deepEqual(sourceVersionRows((await buildSource(bob)).stdout),[]);
    assert.deepEqual(sourceVersionRows((await buildSource(admin)).stdout),[]);

    // Stage uploads through the restricted app role, exercising the actual transaction and byte store.
    await executePsql(config,{sql:`GRANT EXECUTE ON FUNCTION
      public.staged_game_artifact(uuid,uuid,uuid,text,jsonb,bytea) TO slopboy_test_web`});
    const path = 'src/game.ts';
    const bytes = 'export default function setup() {}';
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const pngPath = 'assets/sprite.png';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=','base64');
    const pngHash = createHash('sha256').update(png).digest('hex');
    const capacity = Buffer.byteLength(bytes)+png.length;
    const manifest = {files:[
      {path,bytes:Buffer.byteLength(bytes),sha256,mime:'text/typescript'},
      {path:pngPath,bytes:png.length,sha256:pngHash,mime:'image/png'},
    ]};
    const stageKey = randomUUID();
    const stagedCall = async (op:string, input:object={}, project:string|null=null, caller=alice, body:string|Buffer|null=null) => {
      const quote = (v:string) => "'" + v.replaceAll("'", "''") + "'";
      const args = [quote(caller),quote(gameUuid),project ? quote(project) : 'NULL',quote(op),
        quote(JSON.stringify(input)),body === null ? 'NULL' : `decode('${Buffer.from(body).toString('hex')}','hex')`];
      const r = await executePsql(config,{sql:`SET ROLE slopboy_test_web;
        SELECT public.staged_game_artifact(${args.join(',')})`});
      return JSON.parse(r.stdout.trim().split('\n').at(-1)!);
    };
    const input = {key:stageKey,manifest,quota:capacity};
    const [reserved,replayed] = await Promise.all([stagedCall('initiate',input),stagedCall('initiate',input)]);
    assert.ok(reserved.id && reserved.id === replayed.id);
    const stage = reserved.id;
    assert.equal((await stagedCall('initiate',{...input, key:randomUUID()})).error,'QUOTA');
    assert.equal((await stagedCall('initiate',{...input,manifest:{files:[{...manifest.files[0],mime:'wrong'},manifest.files[1]]}})).error,'CONFLICT');
    assert.equal((await stagedCall('finalize',{},stage,bob)).error,'NOT_FOUND');
    assert.equal((await stagedCall('read',{path},stage)).error,'NOT_FOUND');
    assert.equal((await stagedCall('finalize',{},stage)).error,'INCOMPLETE');
    assert.equal((await stagedCall('upload',{path},stage,alice,bytes.replace('setup','other'))).error,'DIGEST_MISMATCH');
    for (const result of await Promise.all([
      stagedCall('upload',{path},stage,alice,bytes),stagedCall('upload',{path},stage,alice,bytes),
    ])) assert.equal(result.stored,true);
    assert.equal((await stagedCall('finalize',{},stage)).error,'INCOMPLETE','A missing asset blocks finalization');
    assert.equal((await stagedCall('upload',{path:pngPath},stage,alice,png)).stored,true);
    const finalized = await stagedCall('finalize',{},stage);
    assert.ok(finalized.finalizedAt);
    assert.deepEqual(await stagedCall('finalize',{},stage),finalized);
    assert.equal((await stagedCall('upload',{path},stage,alice,bytes)).error,'FINALIZED');
    assert.equal((await stagedCall('read',{path},stage,bob)).error,'NOT_FOUND');
    const artifact = await stagedCall('read',{path},stage);
    assert.equal(artifact.sha256,sha256);
    const sprite = await stagedCall('read',{path:pngPath},stage);
    assert.equal(sprite.sha256,pngHash);
    assert.deepEqual(Buffer.from(sprite.body,'base64'),png);
    assert.equal(Buffer.from(artifact.body,'base64').toString(),bytes);
    await assert.rejects(() => executePsql(config,{sql:
      'SET ROLE slopboy_test_web; SELECT body FROM public.staged_game_files'}));
    await assert.rejects(() => executePsql(config,{sql:
      `UPDATE public.staged_game_files SET body='modified' WHERE project_id='${stage}'`}));
    const abandoned = await stagedCall('initiate',{...input,key:randomUUID(),quota:1024});
    await executePsql(config,{sql:`UPDATE public.staged_game_projects SET expires_at=clock_timestamp()-interval '1 second'
      WHERE id='${abandoned.id}'`});
    assert.equal((await stagedCall('upload',{path},abandoned.id,alice,bytes)).error,'EXPIRED');
    assert.ok((await stagedCall('initiate',{...input,key:randomUUID(),quota:capacity*2})).id);
    assert.equal((await stagedCall('describe',{},abandoned.id)).error,'NOT_FOUND');

    // Real durable jobs for the fixture-only CLI/worker, with no grants to the web role.
    await assert.rejects(() => executePsql(config,{sql:
      'SET ROLE slopboy_test_web; SELECT * FROM public.claim_fixture_build_job()'}));
    const key = randomUUID();
    const [firstJob,duplicateJob] = await Promise.all([enqueueFixture(config,key),enqueueFixture(config,key)]);
    assert.ok(firstJob && duplicateJob);
    assert.equal(firstJob.id,duplicateJob.id);
    const [claimOne,claimTwo] = await Promise.all([claimFixture(config),claimFixture(config)]);
    assert.equal(Number(Boolean(claimOne))+Number(Boolean(claimTwo)),1);
    const claim = claimOne ?? claimTwo;
    assert.ok(claim?.lease);
    await executePsql(config,{sql:"UPDATE public.fixture_build_jobs SET lease_until=clock_timestamp()-interval '1 second'"});
    const fresh = await claimFixture(config);
    assert.ok(fresh?.lease);
    assert.equal(fresh.id,claim.id);
    assert.notEqual(fresh.lease,claim.lease);
    const output = await produceFixtureArtifact();
    assert.equal(output.status,'ready');
    assert.equal(await finishFixture(config,claim.id,claim.lease,output),null);
    assert.equal((await finishFixture(config,fresh.id,fresh.lease,output))?.status,'ready');

    const secondKey = randomUUID();
    await enqueueFixture(config,secondKey);
    assert.equal((await runNextFixtureBuild(config)).status,'ready');
    assert.equal((await fixtureStatus(config,key))?.sha256,(await fixtureStatus(config,secondKey))?.sha256);
    assert.equal((await enqueueFixture(config,key))?.status,'ready');

    const failedKey = randomUUID();
    await enqueueFixture(config,failedKey);
    for (const expected of ['queued','queued','failed']) {
      assert.equal((await runNextFixtureBuild(config,() => runTrustedFixtureChild('timeout',50))).status,expected);
    }
    assert.equal((await fixtureStatus(config,failedKey))?.attempts,3);
    assert.equal((await fixtureStatus(config,failedKey))?.error,'TIMEOUT');
    const expiredKey = randomUUID();
    await enqueueFixture(config,expiredKey);
    const abandonedJob = await claimFixture(config);
    assert.ok(abandonedJob?.lease);
    await executePsql(config,{sql:`UPDATE public.fixture_build_jobs SET attempts=3,
      lease_until=clock_timestamp()-interval '1 second' WHERE id='${abandonedJob.id}'`});
    assert.equal((await runNextFixtureBuild(config)).status,'failed');
    assert.equal((await fixtureStatus(config,expiredKey))?.error,'LEASE_EXPIRED');
    assert.equal((await runNextFixtureBuild(config)).status,'idle');

    await executePsql(config,{sql:`
      GRANT EXECUTE ON FUNCTION public.list_cloud_save_backups(uuid,uuid),
      public.reserve_cloud_save_backup(uuid,uuid,text,integer),
      public.confirm_cloud_save_backup(uuid,uuid,uuid),
      public.release_cloud_save_backup(uuid,uuid,uuid) TO slopboy_test_web;`});
    const cloud=async(query:string)=>JSON.parse((await executePsql(config,{
      sql:'SET ROLE slopboy_test_web;'+query,
    })).stdout.trim().split('\n').at(-1)!);
    const reserve=(account:string,payloadExpr:string,game=reviewed.gameId)=>
      cloud(`SELECT public.reserve_cloud_save_backup('${account}','${game}',
        encode(sha256(convert_to(${payloadExpr},'UTF8')),'hex'),octet_length(${payloadExpr}));`);
    const list=(account:string,game=reviewed.gameId)=>
      cloud(`SELECT public.list_cloud_save_backups('${account}','${game}');`);
    const first=await reserve(alice,"'puzzle position'");
    assert.equal(first.outcome,'reserved');
    assert.match(first.storageKey,/^backups\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64}\.json$/);
    assert.deepEqual((await list(alice)).backups,[],'pending save must stay hidden');
    assert.equal((await list(alice)).usedBytes,15,'pending quota is reserved');
    assert.equal((await reserve(alice,"'puzzle position'")).outcome,'in_progress');
    // A stale reservation still owns its bytes and key. Release cannot race a delayed PUT.
    await executePsql(config,{sql:`UPDATE public.cloud_save_backups SET created_at=clock_timestamp()-interval '2 hours',last_attempt_at=clock_timestamp()-interval '61 seconds' WHERE id='${first.backupId}'`});
    await executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.release_cloud_save_backup('${alice}','${reviewed.gameId}','${first.backupId}');`});
    assert.equal((await list(alice)).usedBytes,15);
    await assert.rejects(()=>migrateDown(config,migrationsDir,10),/Pending legacy cloud reservations retained/);
    assert.deepEqual((await migrateUp(config,migrationsDir)).versions,[12,13,14,15]);
    const legacyRetries=await Promise.all([reserve(alice,"'puzzle position'"),reserve(alice,"'puzzle position'"),reserve(alice,"'puzzle position'")]);
    assert.equal(legacyRetries.filter(x=>x.outcome==='reserved').length,1);
    assert.equal(legacyRetries.filter(x=>x.outcome==='in_progress').length,2);
    const retried=legacyRetries.find(x=>x.outcome==='reserved');
    assert.equal(retried.backupId,first.backupId);
    assert.equal(retried.storageKey,first.storageKey);
    assert.equal((await list(alice)).usedBytes,15);
    assert.equal((await cloud(`SELECT public.confirm_cloud_save_backup('${bob}','${reviewed.gameId}','${first.backupId}');`)).outcome,'not_found');
    const confirmed=await cloud(`SELECT public.confirm_cloud_save_backup('${alice}','${reviewed.gameId}','${first.backupId}');`);
    assert.equal(confirmed.outcome,'stored');
    assert.equal(confirmed.backups.length,1);
    assert.equal((await reserve(alice,"'puzzle position'")).outcome,'replayed');
    assert.deepEqual(await list(bob),{usedBytes:0,backups:[]});
    assert.ok(!JSON.stringify(await list(alice)).includes('puzzle position'));
    assert.equal((await reserve(alice,"repeat('é',131073)")).outcome,'invalid');
    assert.equal((await reserve(alice,"'private draft'",gameUuid)).outcome,'not_found');
    await assert.rejects(()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;SELECT storage_key FROM public.cloud_save_backups'}));
    await assert.rejects(()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;SELECT payload FROM public.cloud_save_backups'}));
    const competing=await Promise.all(Array.from({length:6},(_,i)=>reserve(alice,`'new position ${i}'`)));
    assert.equal(competing.filter(item=>item.outcome==='reserved').length,4);
    assert.equal(competing.filter(item=>item.outcome==='quota').length,2);
    for(const item of competing.filter(row=>row.outcome==='reserved')){
      await cloud(`SELECT public.confirm_cloud_save_backup('${alice}','${reviewed.gameId}','${item.backupId}');`);
    }
    assert.equal((await list(alice)).backups.length,5);
    await executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.release_cloud_save_backup('${alice}','${reviewed.gameId}','${first.backupId}');`});
    assert.equal((await list(alice)).backups.length,5,'releasing cannot delete ready save');

    // Trusted test-only metadata inserts cover the 10 MiB cap across distinct games.
    await executePsql(config,{sql:`
      WITH archived AS (
        INSERT INTO public.games(id,owner_id,title,genre)
        SELECT gen_random_uuid(),'${bob}','Archived quota fixture','Puzzle'
        FROM generate_series(1,8) RETURNING id
      ), keyed AS (
        SELECT id AS game_id,row_number() OVER() AS game_number FROM archived
      ), expanded AS (
        SELECT gen_random_uuid() AS backup_id,game_id,game_number,n
        FROM keyed CROSS JOIN generate_series(1,5) n
      )
      INSERT INTO public.cloud_save_backups(id,account_id,game_id,storage_key,byte_size,digest,status,ready_at)
      SELECT backup_id,'${bob}',game_id,'backups/${bob}/'||game_id||'/'||backup_id||'/'||
        lpad(to_hex((game_number*10+n)::bigint),64,'0')||'.json',262144,
        lpad(to_hex((game_number*10+n)::bigint),64,'0'),'ready',clock_timestamp()
      FROM expanded;`});
    assert.deepEqual(await list(bob),{usedBytes:10485760,backups:[]});
    assert.equal((await reserve(bob,"'new position'")).outcome,'quota');


    // Named snapshots stay separate from legacy listings and share account quota.
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.list_named_cloud_snapshots('${admin}','${reviewed.gameId}')`}));
    await executePsql(config,{sql:`GRANT EXECUTE ON FUNCTION public.list_named_cloud_snapshots(uuid,uuid),
      public.reserve_named_cloud_snapshot(uuid,uuid,text,integer,jsonb),
      public.confirm_named_cloud_snapshot(uuid,uuid,uuid),
      public.lookup_named_cloud_snapshot(uuid,uuid,uuid) TO slopboy_test_web;`});
    const meta=JSON.stringify({slotId:'11111111-1111-4111-8111-111111111111',slotName:'Adventure',
      snapshotId:'22222222-2222-4222-8222-222222222222',snapshotName:'Before boss',
      kind:'manual',revisionId:reviewed.revisionId,releaseVersion:null,schemaVersion:2,
      hardwareId:'slopboy-1000@0.1.0',snapshotCreatedAt:1234,payloadBytes:10,payloadDigest:'c'.repeat(64)});
    const namedReserve=(actor:string,digest='d',metadata=meta)=>cloud(`SELECT public.reserve_named_cloud_snapshot('${actor}','${reviewed.gameId}',repeat('${digest}',64),500,'${metadata}'::jsonb);`);
    const namedList=(actor:string)=>cloud(`SELECT coalesce(public.list_named_cloud_snapshots('${actor}','${reviewed.gameId}'),'null'::jsonb);`);
    const namedLookup=(actor:string,id:string)=>cloud(`SELECT coalesce(public.lookup_named_cloud_snapshot('${actor}','${reviewed.gameId}','${id}'),'null'::jsonb);`);
    assert.equal(await namedList(alice),null);
    assert.equal((await namedReserve(alice)).outcome,'not_found');
    assert.equal((await namedReserve(admin,'e',JSON.stringify({...JSON.parse(meta),data:'not metadata'}))).outcome,'invalid');
    assert.equal((await namedReserve(admin,'e',JSON.stringify({...JSON.parse(meta),revisionId:collisionRevision}))).outcome,'invalid');
    const named=await namedReserve(admin);
    assert.equal(named.outcome,'reserved');
    assert.equal((await namedList(admin)).usedBytes,500);
    assert.deepEqual((await namedList(admin)).snapshots,[]);
    assert.equal(await namedLookup(admin,named.backupId),null);
    assert.equal((await namedReserve(admin)).outcome,'in_progress');
    await executePsql(config,{sql:`UPDATE public.named_cloud_snapshots SET last_attempt_at=clock_timestamp()-interval '61 seconds' WHERE id='${named.backupId}'`});
    const resumed=await namedReserve(admin);
    assert.equal(resumed.outcome,'resumed');
    assert.equal(resumed.backupId,named.backupId);
    assert.equal(resumed.storageKey,named.storageKey);
    assert.equal((await namedList(admin)).usedBytes,500);
    assert.equal((await namedReserve(admin)).outcome,'in_progress');
    assert.equal(await namedLookup(admin,named.backupId),null);
    // Only one concurrent retry obtains a lease for the same immutable object.
    await executePsql(config,{sql:`UPDATE public.named_cloud_snapshots SET last_attempt_at=clock_timestamp()-interval '61 seconds' WHERE id='${named.backupId}'`});
    const retries=await Promise.all([namedReserve(admin),namedReserve(admin),namedReserve(admin)]);
    assert.equal(retries.filter(x=>x.outcome==='resumed').length,1);
    assert.equal(retries.filter(x=>x.outcome==='in_progress').length,2);
    assert.equal((await cloud(`SELECT public.confirm_named_cloud_snapshot('${alice}','${reviewed.gameId}','${named.backupId}');`)).outcome,'not_found');
    assert.equal((await cloud(`SELECT public.confirm_named_cloud_snapshot('${admin}','${reviewed.gameId}','${named.backupId}');`)).outcome,'stored');
    const namedListing=await namedList(admin);
    assert.equal(namedListing.snapshots[0].snapshotName,'Before boss');
    assert.equal(namedListing.snapshots[0].schemaVersion,2);
    assert.ok(!JSON.stringify(namedListing).includes('storageKey'));
    assert.equal((await namedLookup(admin,named.backupId)).storageKey,named.storageKey);
    assert.equal(await namedLookup(bob,named.backupId),null);
    assert.deepEqual(await list(admin),{usedBytes:500,backups:[]});
    assert.equal((await namedReserve(admin)).outcome,'replayed');
    await assert.rejects(()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;SELECT storage_key FROM public.named_cloud_snapshots'}));
    // Persistent rate limits apply across requests/instances, not across identities.
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web; SELECT public.consume_named_cloud_request('${admin}')`}));
    await executePsql(config,{sql:'GRANT EXECUTE ON FUNCTION public.consume_named_cloud_request(uuid) TO slopboy_test_web'});
    const consume=(actor:string)=>cloud(`SELECT to_jsonb(public.consume_named_cloud_request('${actor}'));`);
    assert.equal(await consume(alice),false);
    assert.equal(await consume(admin),true);
    await assert.rejects(()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;SELECT * FROM public.named_cloud_request_budget'}));
    await executePsql(config,{sql:`UPDATE public.named_cloud_request_budget SET minute_window=-1,day_count=198 WHERE account_id='${admin}'`});
    const budget=await Promise.all([consume(admin),consume(admin),consume(admin),consume(admin)]);
    assert.equal(budget.filter(Boolean).length,2);
    assert.equal(await consume(admin),false);
    await executePsql(config,{sql:`UPDATE public.named_cloud_request_budget SET minute_window=-1,day_window=-1 WHERE account_id='${admin}';
      UPDATE public.named_cloud_global_budget SET day_count=1000 WHERE singleton;`});
    assert.equal(await consume(admin),false);
    await executePsql(config,{sql:'UPDATE public.named_cloud_global_budget SET day_window=-1 WHERE singleton'});
    assert.equal(await consume(admin),true);
    {
    // Owner-only managed lane: no permissions granted to the application.
    const device=randomUUID(),otherDevice=randomUUID();
    const managed=async(query:string)=>JSON.parse((await executePsql(config,{sql:query})).stdout.trim().split('\n').at(-1)!);
    const managedList=(deviceId:string,actor=admin)=>managed(`SELECT coalesce(public.list_managed_auto_snapshots('${actor}','${reviewed.gameId}','${deviceId}'),'null'::jsonb)`);
    const managedReserve=(deviceId:string,n:number,actor=admin,kind='auto')=>managed(`SELECT public.reserve_managed_auto_snapshot('${actor}','${reviewed.gameId}','${deviceId}',lpad(to_hex(${n}),64,'0'),500,'${JSON.stringify({...JSON.parse(meta),kind,snapshotId:randomUUID()})}'::jsonb)`);
    const managedConfirm=(deviceId:string,id:string,actor=admin)=>managed(`SELECT public.confirm_managed_auto_snapshot('${actor}','${reviewed.gameId}','${deviceId}','${id}')`);
    const managedLookup=(deviceId:string,id:string,actor=admin)=>managed(`SELECT coalesce(public.lookup_managed_auto_snapshot('${actor}','${reviewed.gameId}','${deviceId}','${id}'),'null'::jsonb)`);
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.list_managed_auto_snapshots('${admin}','${reviewed.gameId}','${device}')`}));
    await assert.rejects(()=>executePsql(config,{sql:'SET ROLE slopboy_test_web;SELECT * FROM public.managed_auto_snapshots'}));
    assert.equal(await managedList(device,alice),null);
    assert.equal((await managedReserve(device,1,alice)).outcome,'not_found');
    assert.equal((await managedReserve(device,1,admin,'manual')).outcome,'invalid');
    const ids:string[]=[];
    for(let n=1;n<=6;n++){
      const next=await managedReserve(device,n);
      assert.equal(next.outcome,'reserved');ids.push(next.backupId);
      assert.equal((await managedReserve(device,100+n)).outcome,'in_progress');
      assert.equal((await managedList(device)).snapshots.length,Math.min(n-1,5),'pending must not retire ready entries');
      assert.equal(await managedLookup(device,next.backupId),null);
      assert.equal((await managedConfirm(otherDevice,next.backupId)).outcome,'not_found');
      assert.equal((await managedConfirm(device,next.backupId,alice)).outcome,'not_found');
      assert.equal((await managedConfirm(device,next.backupId)).outcome,'stored');
    }
    const latest=await managedList(device);
    assert.equal(latest.snapshots.length,5);
    assert.deepEqual(latest.snapshots.map((x:{id:string})=>x.id).sort(),ids.slice(1).sort());
    assert.equal(latest.usedBytes,3500,'retired object remains charged with pinned backup');
    assert.equal(await managedLookup(device,ids[0]),null);
    assert.equal((await managedLookup(device,ids[5])).id,ids[5]);
    assert.equal(await managedLookup(otherDevice,ids[5]),null);
    assert.equal(await managedLookup(device,ids[5],alice),null);
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.lookup_managed_auto_snapshot('${admin}','${reviewed.gameId}','${device}','${ids[5]}')`}));
    assert.equal((await managedConfirm(device,ids[0])).outcome,'retired');
    assert.equal((await managedReserve(device,1)).outcome,'retired');
    assert.equal((await managedList(otherDevice)).snapshots.length,0);
    const other=await managedReserve(otherDevice,1);
    assert.equal(other.outcome,'reserved');
    assert.equal((await managedConfirm(otherDevice,other.backupId)).outcome,'stored');
    assert.equal((await namedList(admin)).snapshots.length,1);
    assert.equal((await namedList(admin)).usedBytes,4000);
    assert.equal((await list(admin)).usedBytes,4000);
    const atomicDevice=randomUUID(),atomicOther=randomUUID();
    const makeRaw=(n:number)=>{
      const data='state '+n;
      return JSON.stringify({format:'slopboy-cloud-snapshot-v1',gameId:reviewed.gameId,hardwareId:'slopboy-1000',hardwareVersion:'0.1.0',slotId:randomUUID(),slotName:'Run',
        snapshot:{id:randomUUID(),name:'Autosave',kind:'auto',revisionId:reviewed.revisionId,releaseVersion:null,schemaVersion:1,createdAt:1234+n,data,bytes:Buffer.byteLength(data),digest:createHash('sha256').update(data).digest('hex')}});
    };
    const atomicStore=(raw:string,dev=atomicDevice,actor=admin)=>managed(`SELECT public.store_atomic_managed_autosave('${actor}','${reviewed.gameId}','${dev}',$fixture$${raw}$fixture$)`);
    const atomicRead=(id:string,dev=atomicDevice,actor=admin)=>managed(`SELECT coalesce(public.read_atomic_managed_autosave('${actor}','${reviewed.gameId}','${dev}','${id}'),'null'::jsonb)`);
    const raws=Array.from({length:7},(_,i)=>makeRaw(i));
    assert.equal((await atomicStore(raws[0],device)).outcome,'in_progress');
    assert.equal((await atomicStore(raws[0],atomicDevice,alice)).outcome,'not_found');
    assert.equal((await atomicStore(raws[0].replace('state 0','broken!'))).outcome,'invalid');
    const firstAtomic=await atomicStore(raws[0]);
    assert.equal(firstAtomic.outcome,'stored');
    const firstId=firstAtomic.snapshots[0].id;
    assert.equal((await atomicStore(raws[0])).outcome,'replayed');
    for(const raw of raws.slice(1))assert.equal((await atomicStore(raw)).outcome,'stored');
    const ring=await managedList(atomicDevice);
    assert.equal(ring.snapshots.length,5);
    assert.equal(ring.usedBytes,4000+raws.slice(-5).reduce((n,raw)=>n+Buffer.byteLength(raw),0));
    assert.equal(await atomicRead(firstId),null);
    const current=ring.snapshots.find((row:{digest:string})=>row.digest===createHash('sha256').update(raws[6]).digest('hex'));
    assert.equal((await atomicRead(current.id)).snapshot,raws[6]);
    assert.equal(await atomicRead(current.id,atomicOther),null);
    assert.equal(await atomicRead(current.id,atomicDevice,alice),null);
    assert.equal((await atomicStore(raws[0],atomicOther)).outcome,'stored');
    assert.equal((await managedList(atomicDevice)).snapshots.length,5);
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.read_atomic_managed_autosave('${admin}','${reviewed.gameId}','${atomicDevice}','${current.id}')`}));
    const discover=(actor=admin,gameId=reviewed.gameId)=>managed(`SELECT coalesce(public.list_atomic_managed_devices('${actor}','${gameId}'),'null'::jsonb)`);
    const streams=await discover();
    assert.equal(streams.length,2);
    assert.deepEqual(streams.map((row:{deviceId:string;count:number})=>[row.deviceId,row.count]).sort(),[[atomicDevice,5],[atomicOther,1]].sort());
    assert.equal(await discover(alice),null);
    assert.equal(await discover(admin,randomUUID()),null);
    await assert.rejects(()=>executePsql(config,{sql:`SET ROLE slopboy_test_web;SELECT public.list_atomic_managed_devices('${admin}','${reviewed.gameId}')`}));
    await assert.rejects(()=>migrateDown(config,migrationsDir,13),/Transactional managed autosaves retained/);
    // Only the disposable test database: clear transactional fixtures before testing old rollback.
    await executePsql(config,{sql:'DELETE FROM public.managed_auto_snapshots WHERE storage_key IS NULL'});
    await assert.rejects(()=>migrateDown(config,migrationsDir,11),/Managed autosaves retained/);
    // Disposable PostgreSQL test fixture only; never a hosted cleanup path.
    await executePsql(config,{sql:'DELETE FROM public.managed_auto_snapshots'});

    }
    // Each migration rolls back independently. 010 removes only budget/attempt metadata;
    // 009 must still refuse to drop a retained named snapshot.
    await assert.rejects(()=>migrateDown(config,migrationsDir,8),/Named cloud snapshots retained/);
    // Disposable fixture cleanup only, not an application or hosted deletion path.
    await executePsql(config,{sql:'DELETE FROM public.named_cloud_snapshots'});

    assert.deepEqual((await migrateDown(config,migrationsDir,4)).versions,[9,8,7,6,5]);
    assert.match((await executePsql(config,{sql:`SELECT source_text FROM game_source_drafts WHERE id='${revisionUuid}'`})).stdout,/export default/);
    assert.deepEqual((await migrateUp(config,migrationsDir)).versions,[5,6,7,8,9,10,11,12,13,14,15]);

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
