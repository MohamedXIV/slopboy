import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {V2_DEVICE_1000} from '../packages/hardware/src/v2.ts';
import {ENGINE_REGISTRY} from '../packages/cartridge/src/engine-registry.ts';
import {
  buildFullPrompt, buildLaunchPrompt, buildProviderUrl,
} from '../apps/web/lib/ai/game-prompt.ts';
import {getGameGuideContract, getGameGuideMarkdown} from '../apps/web/lib/ai/game-guide.ts';
import {GET as getMarkdown} from '../apps/web/app/ai/game-guide/v1.md/route.ts';
import {GET as getJson} from '../apps/web/app/ai/game-guide/v1.json/route.ts';
import {GET as getLlms} from '../apps/web/app/llms.txt/route.ts';

const GUIDE_URL = 'https://preview.example.test/ai/game-guide/v1.md';

test('an ordinary game idea is sufficient: Genre and difficulty stay optional', () => {
  const prompt = buildLaunchPrompt({idea:'  I want a tiny game about a lost robot  '}, GUIDE_URL);
  assert.match(prompt, /My game idea: I want a tiny game about a lost robot/);
  assert.match(prompt, /infer a suitable Genre/);
  assert.doesNotMatch(prompt, /Optional style\/Genre preference:/);
  assert.doesNotMatch(prompt, /Optional challenge preference:/);
  assert.ok(prompt.includes(GUIDE_URL));
  assert.match(prompt, /complete src\/game\.ts in a copyable code block/);
  assert.match(prompt, /Do not claim a link has auto-imported/);
  assert.throws(() => buildLaunchPrompt({idea:'  '}, GUIDE_URL), /describe your game idea/);
});

test('Genre guides the prompt when selected without hard-binding an engine', () => {
  const prompt = buildLaunchPrompt({idea:'A falling stars game',genre:'Puzzle',difficulty:'Relaxed'}, GUIDE_URL);
  assert.match(prompt, /Optional style\/Genre preference: Puzzle/);
  assert.match(prompt, /Optional challenge preference: Relaxed/);
  assert.doesNotMatch(prompt, /you must use Phaser/i);
});

test('ChatGPT and Claude links encode Unicode and special characters without losing the idea', () => {
  const prompt = buildLaunchPrompt({idea:'لعبة ألغاز مع أصحابي & 🎮? #1'}, GUIDE_URL);
  for (const provider of ['chatgpt','claude'] as const) {
    const url = new URL(buildProviderUrl(provider, prompt));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, provider === 'chatgpt' ? 'chatgpt.com' : 'claude.ai');
    assert.equal(url.pathname, provider === 'chatgpt' ? '/' : '/new');
    assert.equal(url.searchParams.get('q'), prompt);
    assert.equal([...url.searchParams.keys()].length, 1);
  }
});

test('full copy prompt includes canonical guide when available', () => {
  const markdown = getGameGuideMarkdown();
  const prompt = buildFullPrompt({idea:'A 2-player rhythm puzzle'}, GUIDE_URL, markdown);
  assert.match(prompt, /OFFICIAL GAME GUIDE/);
  assert.ok(prompt.includes(markdown.trim()));
  assert.match(prompt, /Genre is optional/);
});

test('versioned Markdown and JSON mirror the canonical V2 device and engine registry', async () => {
  const contract = getGameGuideContract();
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.genreRequired, false);
  assert.equal(contract.publishAutomatically, false);
  assert.equal(contract.delivery.currentMethod, 'copy-source-manually');
  assert.equal(contract.delivery.autoFilledImportAvailable, false);
  assert.equal(contract.delivery.playablePreviewAvailable, false);
  assert.equal(contract.delivery.versionPolicy, 'append-only-private-revisions-with-server-issued-identities');
  assert.deepEqual(contract.device.display, V2_DEVICE_1000.display);
  assert.deepEqual(contract.device.inputs, V2_DEVICE_1000.inputs);
  assert.equal(contract.device.revision, V2_DEVICE_1000.revision);
  assert.equal(contract.engines.length, Object.keys(ENGINE_REGISTRY).length);
  for (const engine of contract.engines) {
    const canonical = ENGINE_REGISTRY[engine.id];
    assert.equal(engine.version, canonical.version);
    assert.equal(engine.status, canonical.status);
    assert.equal(engine.adapterProtocol, canonical.adapterProtocol);
    assert.deepEqual(engine.allowedImports, canonical.allowedImports);
  }
  const md = await getMarkdown();
  assert.equal(md.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(md.headers.get('x-content-type-options'), 'nosniff');
  const markdown = await md.text();
  assert.match(markdown, /Genre is optional/);
  assert.match(markdown, /160 × 144/);
  assert.match(markdown, /`kaplay`.*experimental/);
  assert.match(markdown, /legacy Creator Kit v0\.1/i);
  assert.match(markdown, /Copy source/);
  assert.match(markdown, /Draft PR #98/);
  assert.match(markdown, /a link alone does not transfer or prefill the source/);
  assert.match(markdown, /save as a new private revision/);
  assert.match(markdown, /do not invent a prefilled Slopboy import URL/i);
  assert.doesNotMatch(markdown, /64 KiB|8 KiB|512 KiB|4 audio voices/i);
  const json = await getJson();
  assert.match(json.headers.get('content-type') || '', /application\/json/);
  assert.deepEqual(await json.json(), contract);
});

test('llms.txt points only to public documentation and never advertises ready uploads', async () => {
  const response = await getLlms();
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  const text = await response.text();
  assert.match(text, /\/ai\/game-guide\/v1\.md/);
  assert.match(text, /\/ai\/game-guide\/v1\.json/);
  assert.match(text, /Genre is optional/);
  assert.match(text, /experimental/);
});

test('UI defaults to no Genre, supports both providers and never uploads an idea to Slopboy', async () => {
  const component = await readFile(new URL('../apps/web/components/ai/AIGameBuilder.tsx', import.meta.url),'utf8');
  assert.match(component, /useState\(''\)/);
  assert.match(component, /\['','No preference — surprise me'\]/);
  assert.match(component, /isDisabled=\{!ready\}/);
  assert.match(component, /openIn\('chatgpt'\)/);
  assert.match(component, /openIn\('claude'\)/);
  assert.doesNotMatch(component, /fetch\('\/api\//);
});
