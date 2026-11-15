import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve,dirname } from 'node:path';
import {LIST_PUBLIC_GAMES_SQL,READ_VISIBLE_GAME_SQL} from '../apps/web/server/catalog-queries.ts';
import {LIST_OWNED_GAMES_SQL,READ_OWNED_REVISIONS_SQL} from '../apps/web/server/owner-revision-queries.ts';
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
  assert.equal(up.length, 3);
  assert.equal(down.length, 3);

  assert.equal(up[0].version, 1);
  assert.equal(up[0].name, 'initial_schema');
  assert.equal(up[1].version, 2);
  assert.equal(up[1].name, 'seed_curated_games');

  assert.equal(up[2].version, 3);
  assert.equal(up[2].name, 'versioned_installations');

  assert.equal(down[0].version, 3);
  assert.equal(down[1].version, 2);
  assert.equal(down[2].version, 1);
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
    assert.equal(upResult.applied, 3);
    assert.deepEqual(upResult.versions, [1, 2, 3]);

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
    assert.equal(firstCells.length,13,'Public catalog exposes only approved metadata columns');
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
    assert.equal(rollback3.rolledBack, 1);
    assert.deepEqual(rollback3.versions, [3]);
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
    assert.equal(reMigrate.applied, 3);
    assert.deepEqual(reMigrate.versions, [1, 2, 3]);


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
      const destination=resolve(importRoot,'apps/web/public'+game.cartridge);
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
