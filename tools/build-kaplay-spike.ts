/**
 * Self-host the exact pinned KAPLAY ESM runtime inside a fixed opaque iframe
 * document. No CDN, runtime JS imports, arbitrary source compilation or eval.
 * This builds a FIRST-PARTY feasibility cartridge, not a public upload path.
 */
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, dirname} from "node:path";
import {createHash} from "node:crypto";
import ts from "typescript";
import {validateManifestV2, validateCartridgeSource} from "../packages/cartridge/src/manifest-v2.ts";
import {V2_DEVICE_1000, matchesCartridgeRequirements} from "../packages/hardware/src/v2.ts";

const root = resolve(import.meta.dirname, "..");
const engineVersion = "3001.0.19";
const output = resolve(root, "apps/web/public/v2/kaplay-spike.html");
const literal = (source: string) => JSON.stringify(source)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

export async function buildKaplaySpike(): Promise<{bytes:number; codeBytes:number; runtimeBytes:number; sha256:string}> {
  const [manifestText, game, shell, engine] = await Promise.all([
    readFile(resolve(root, "examples/kaplay-spike/manifest.json"), "utf8"),
    readFile(resolve(root, "examples/kaplay-spike/game.mjs"), "utf8"),
    readFile(resolve(root, "tools/kaplay-spike-document.html"), "utf8"),
    readFile(resolve(root, "node_modules/kaplay/dist/kaplay.mjs"), "utf8")
  ]);
  const manifest = JSON.parse(manifestText);
  const hardware = V2_DEVICE_1000;
  if (manifest.format !== "slopboy-v2-spike-cartridge" || manifest.engine !== "kaplay" ||
      manifest.engineVersion !== engineVersion || manifest.hardware?.id !== hardware.id ||
      manifest.hardware?.revision !== hardware.revision ||
      !matchesCartridgeRequirements(hardware, manifest.requirements)) {
    throw Error("KAPLAY spike cartridge is incompatible with the versioned hardware");
  }
  const codeBytes = Buffer.byteLength(game);
  // No retro CPU/RAM/ROM/code/save/audio limits. Any size ceilings below are
  // temporary platform build-safety guards, not virtual-device rules.
  const runtimeBytes = Buffer.byteLength(engine);
  // Shared engine is not charged against individual game's cartridge limit.
  if (runtimeBytes > 5 * 1024 * 1024) throw Error("KAPLAY dependency unexpectedly large for spike build");
  if (!shell.includes("__KAPLAY_ENGINE_SOURCE__") || !shell.includes("__SLOPBOY_CARTRIDGE_SOURCE__")) {
    throw Error("Spike sandbox template is incomplete");
  }
  const html = shell.replace("__KAPLAY_ENGINE_SOURCE__", literal(engine))
    .replace("__SLOPBOY_CARTRIDGE_SOURCE__", literal(game));
  if (Buffer.byteLength(html) > 8 * 1024 * 1024) throw Error("Sandbox test bundle exceeds platform safety ceiling");
  await mkdir(dirname(output), {recursive:true});
  await writeFile(output, html, "utf8");
  return {bytes:Buffer.byteLength(html), codeBytes, runtimeBytes, sha256:createHash("sha256").update(html).digest("hex")};
}
async function buildGemMiner(): Promise<void> {
  // This is a vetted, bundled local example, not a user-upload compiler.
  const [manifestText, source, shell, engine] = await Promise.all([
    readFile(resolve(root, "examples/kaplay-gem-miner/manifest.json"), "utf8"),
    readFile(resolve(root, "examples/kaplay-gem-miner/src/game.ts"), "utf8"),
    readFile(resolve(root, "tools/kaplay-spike-document.html"), "utf8"),
    readFile(resolve(root, "node_modules/kaplay/dist/kaplay.mjs"), "utf8")
  ]);
  const { engine: descriptor } = validateManifestV2(JSON.parse(manifestText));
  if (descriptor.id !== "kaplay" || descriptor.version !== engineVersion) throw Error("Unexpected Gem Miner engine");
  validateCartridgeSource(source, descriptor);
  const output = ts.transpileModule(source, {
    fileName: "game.ts",
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }
  }).outputText;
  if (/\\bfrom\\s*["']|\\bimport\\s*\\(/.test(output)) throw Error("Gem Miner output contains unresolved imports");
  const html = shell.replace("__KAPLAY_ENGINE_SOURCE__", literal(engine))
    .replace("__SLOPBOY_CARTRIDGE_SOURCE__", literal(output));
  if (Buffer.byteLength(html) > 8 * 1024 * 1024) throw Error("Gem Miner sandbox exceeds size limit");
  const path = resolve(root, "apps/web/public/v2/kaplay-gem-miner.html");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
}
Promise.all([buildKaplaySpike(), buildGemMiner()]).then(([meta]) => console.log("KAPLAY pinned sandboxes", meta))
  .catch(error => {console.error(error); process.exitCode = 1;});
