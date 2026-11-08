/**
 * Slopboy Database Migrator.
 *
 * Runs versioned PostgreSQL migrations (.up.sql / .down.sql) in transactionally safe order.
 * Tracks applied migrations, checksums, and execution timestamps in schema_migrations.
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export interface MigrationFile {
  version: number;
  name: string;
  type: 'up' | 'down';
  filename: string;
  filepath: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

export interface DatabaseConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
}

export class MigrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'MigrationError';
    this.code = code;
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Loads and parses all migration files from the migrations directory.
 */
export async function loadMigrationFiles(migrationsDir: string): Promise<{
  up: MigrationFile[];
  down: MigrationFile[];
}> {
  const entries = await readdir(migrationsDir);
  const up: MigrationFile[] = [];
  const down: MigrationFile[] = [];

  const pattern = /^(\d+)_(.+)\.(up|down)\.sql$/;

  for (const file of entries) {
    const match = file.match(pattern);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const name = match[2];
    const type = match[3] as 'up' | 'down';
    const filepath = join(migrationsDir, file);
    const content = await readFile(filepath, 'utf8');
    const checksum = sha256(content);

    const record: MigrationFile = {
      version,
      name,
      type,
      filename: file,
      filepath,
      checksum,
    };

    if (type === 'up') up.push(record);
    else down.push(record);
  }

  up.sort((a, b) => a.version - b.version);
  down.sort((a, b) => b.version - a.version);

  return { up, down };
}

/**
 * Executes a SQL command or file using psql CLI.
 */
export function executePsql(
  config: DatabaseConnectionConfig,
  args: { sql?: string; file?: string }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolvePsql, rejectPsql) => {
    const psqlArgs: string[] = ['-X', '-v', 'ON_ERROR_STOP=1'];

    if (config.connectionString) {
      psqlArgs.push('-d', config.connectionString);
    } else {
      if (config.host) psqlArgs.push('-h', config.host);
      if (config.port) psqlArgs.push('-p', String(config.port));
      if (config.user) psqlArgs.push('-U', config.user);
      if (config.database) psqlArgs.push('-d', config.database);
    }

    if (args.file) {
      psqlArgs.push('-f', args.file);
    } else if (args.sql) {
      psqlArgs.push('-c', args.sql);
    }

    const env = { ...process.env };
    if (config.password) {
      env.PGPASSWORD = config.password;
    }

    const proc = spawn('psql', psqlArgs, { env });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      if (code === 0) {
        resolvePsql({ stdout, stderr, code: 0 });
      } else {
        rejectPsql(new MigrationError('PSQL_ERROR', `psql exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', err => {
      rejectPsql(new MigrationError('SPAWN_ERROR', err.message));
    });
  });
}

/**
 * Applies pending migrations up to optional targetVersion.
 */
export async function migrateUp(
  config: DatabaseConnectionConfig,
  migrationsDir: string,
  targetVersion?: number
): Promise<{ applied: number; versions: number[] }> {
  const { up } = await loadMigrationFiles(migrationsDir);

  // Ensure schema_migrations table exists
  await executePsql(config, {
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
    `,
  });

  // Query already applied versions
  const result = await executePsql(config, {
    sql: `SELECT version, checksum FROM schema_migrations ORDER BY version ASC;`,
  });

  const appliedMap = new Map<number, string>();
  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split('|').map(s => s.trim());
    if (parts.length >= 2) {
      const v = parseInt(parts[0], 10);
      if (!isNaN(v)) appliedMap.set(v, parts[1]);
    }
  }

  const appliedVersions: number[] = [];

  for (const migration of up) {
    if (targetVersion !== undefined && migration.version > targetVersion) break;

    if (appliedMap.has(migration.version)) {
      // Check for checksum drift
      const previousChecksum = appliedMap.get(migration.version);
      if (previousChecksum && previousChecksum !== migration.checksum) {
        throw new MigrationError(
          'CHECKSUM_DRIFT',
          `Migration ${migration.version}_${migration.name} checksum has changed since it was applied!`
        );
      }
      continue;
    }

    // Apply migration
    await executePsql(config, { file: migration.filepath });

    // Record migration
    const escape = (s: string) => s.replace(/'/g, "''");
    await executePsql(config, {
      sql: `INSERT INTO schema_migrations (version, name, checksum) VALUES (${migration.version}, '${escape(migration.name)}', '${migration.checksum}');`,
    });

    appliedVersions.push(migration.version);
  }

  return { applied: appliedVersions.length, versions: appliedVersions };
}

/**
 * Rolls back applied migrations down to targetVersion.
 */
export async function migrateDown(
  config: DatabaseConnectionConfig,
  migrationsDir: string,
  targetVersion = 0
): Promise<{ rolledBack: number; versions: number[] }> {
  const { down } = await loadMigrationFiles(migrationsDir);

  // Check if schema_migrations table exists
  try {
    const checkResult = await executePsql(config, {
      sql: `SELECT to_regclass('schema_migrations');`,
    });
    if (!checkResult.stdout.includes('schema_migrations')) {
      return { rolledBack: 0, versions: [] };
    }
  } catch {
    return { rolledBack: 0, versions: [] };
  }

  const result = await executePsql(config, {
    sql: `SELECT version FROM schema_migrations ORDER BY version DESC;`,
  });

  const appliedVersions: number[] = [];
  for (const line of result.stdout.split('\n')) {
    const v = parseInt(line.trim(), 10);
    if (!isNaN(v)) appliedVersions.push(v);
  }

  const rolledBack: number[] = [];
  const downMap = new Map(down.map(d => [d.version, d]));

  for (const version of appliedVersions) {
    if (version <= targetVersion) break;

    const migration = downMap.get(version);
    if (!migration) {
      throw new MigrationError('MISSING_DOWN_MIGRATION', `Missing rollback file for version ${version}`);
    }

    // Execute down file
    await executePsql(config, { file: migration.filepath });

    // Check if schema_migrations still exists before deleting record
    try {
      await executePsql(config, {
        sql: `DELETE FROM schema_migrations WHERE version = ${version};`,
      });
    } catch {
      // If the migration dropped schema_migrations (e.g. migration 001 rollback), ignore
    }

    rolledBack.push(version);
  }

  return { rolledBack: rolledBack.length, versions: rolledBack };
}
