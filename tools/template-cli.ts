/**
 * Offline CLI for AI Coding Agents and local developers.
 *
 * Implements offline template generation, engine discovery, and validation.
 * Outputs machine-readable JSON for integration into agent workflows.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  listSupportedEngines,
  getEngineCapabilities,
  recommendEngine,
  getGameTemplate,
  validateGameSource,
  type EngineId,
} from '../packages/cartridge/src/index.ts';

async function main(args: string[]): Promise<void> {
  const [command, arg1, arg2, arg3] = args;

  switch (command) {
    case 'engines': {
      const engines = listSupportedEngines();
      console.log(JSON.stringify({ ok: true, engines }, null, 2));
      break;
    }

    case 'capabilities': {
      if (!arg1) {
        throw new Error('Usage: pnpm template:cli capabilities <engine-id>');
      }
      const caps = getEngineCapabilities({ engineId: arg1 });
      console.log(JSON.stringify({ ok: true, capabilities: caps }, null, 2));
      break;
    }

    case 'recommend': {
      if (!arg1) {
        throw new Error('Usage: pnpm template:cli recommend <game-genre-or-prompt>');
      }
      const rec = recommendEngine(arg1);
      console.log(JSON.stringify({ ok: true, recommendation: rec }, null, 2));
      break;
    }

    case 'template': {
      if (!arg1) {
        throw new Error('Usage: pnpm template:cli template <engine-id> [title]');
      }
      const tpl = getGameTemplate({ engineId: arg1, title: arg2 });
      console.log(JSON.stringify({ ok: true, template: tpl }, null, 2));
      break;
    }

    case 'scaffold': {
      if (!arg1 || !arg2) {
        throw new Error('Usage: pnpm template:cli scaffold <engine-id> <target-directory> [title]');
      }
      const tpl = getGameTemplate({ engineId: arg1, title: arg3 });
      const targetDir = resolve(process.cwd(), arg2);

      await mkdir(targetDir, { recursive: true });
      for (const [relPath, content] of Object.entries(tpl.files)) {
        const fullPath = join(targetDir, relPath);
        await mkdir(resolve(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, content, 'utf8');
      }

      console.log(JSON.stringify({
        ok: true,
        projectDir: targetDir,
        engineId: tpl.engineId,
        engineVersion: tpl.engineVersion,
        files: Object.keys(tpl.files),
      }, null, 2));
      break;
    }

    case 'validate': {
      if (!arg1) {
        throw new Error('Usage: pnpm template:cli validate <source-file> [engine-id] [manifest-file]');
      }
      const sourcePath = resolve(process.cwd(), arg1);
      const sourceCode = await readFile(sourcePath, 'utf8');
      const engineId = arg2 || 'kaplay';

      let manifest: Record<string, unknown> | undefined = undefined;
      if (arg3) {
        const manifestPath = resolve(process.cwd(), arg3);
        const manifestRaw = await readFile(manifestPath, 'utf8');
        manifest = JSON.parse(manifestRaw);
      }

      const report = validateGameSource({
        engineId,
        sourceCode,
        manifest: manifest as never,
      });

      console.log(JSON.stringify({ ok: report.valid, report }, null, 2));
      if (!report.valid) {
        process.exitCode = 1;
      }
      break;
    }

    default:
      console.error(JSON.stringify({
        ok: false,
        error: 'UNKNOWN_COMMAND',
        message: 'Commands: engines | capabilities <id> | recommend <prompt> | template <id> [title] | scaffold <id> <dir> [title] | validate <file> [engine] [manifest]',
      }, null, 2));
      process.exitCode = 1;
      break;
  }
}

main(process.argv.slice(2)).catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err instanceof Error ? err.name : 'ERROR',
    message: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exitCode = 1;
});
