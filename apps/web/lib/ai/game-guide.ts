import {V2_DEVICE_1000} from '../../../../packages/hardware/src/v2.ts';
import {ENGINE_REGISTRY} from '../../../../packages/cartridge/src/engine-registry.ts';

/** Public documentation contract. No account details, experimental features or secrets. */
export const GAME_GUIDE_VERSION = 1;
export const GAME_GUIDE_PATH = '/ai/game-guide/v1.md';
export const GAME_GUIDE_JSON_PATH = '/ai/game-guide/v1.json';

export function getGameGuideContract() {
  return {
    schemaVersion: GAME_GUIDE_VERSION,
    title: 'Slopboy AI game authoring guide',
    device: {
      id: V2_DEVICE_1000.id,
      revision: V2_DEVICE_1000.revision,
      display: V2_DEVICE_1000.display,
      inputs: V2_DEVICE_1000.inputs,
    },
    engines: Object.values(ENGINE_REGISTRY).map(engine => ({
      id: engine.id,
      name: engine.name,
      version: engine.version,
      status: engine.status,
      adapterProtocol: engine.adapterProtocol,
      allowedImports: engine.allowedImports,
    })),
    defaultEngineCandidate: 'kaplay',
    entrypoint: 'src/game.ts',
    manifestSchemaVersion: 1,
    genreRequired: false,
    publishAutomatically: false,
    instructionsSource: 'packages/cartridge/src/agent-templates.ts',
    validationSource: 'packages/cartridge/src/manifest-v2.ts',
    authoringWorkflow: 'source generation → private source draft → isolated build/sandbox gates → owner preview → explicit sharing/review',
  } as const;
}

export function getGameGuideMarkdown(): string {
  const guide = getGameGuideContract();
  const engineRows = guide.engines.map(engine =>
    `| \`${engine.id}\` | \`${engine.version}\` | ${engine.status} | ${engine.allowedImports.map(name => `\`${name}\``).join(', ')} |`
  ).join('\n');

  return `# Slopboy game guide for ChatGPT, Claude and other AI assistants

Version: **v${guide.schemaVersion}** · Public reference for source generation, not an authenticated connector.

## Start with the player's idea

The player may describe a game in any language and **does not need to know the Genre**. Genre is optional. If absent, infer a suitable feel and game loop from the idea; ask only essential clarifying questions, or make modest, clearly stated assumptions. Do not gate generation on genre selection.

Make an original, small, fun-to-test prototype with clear controls, goals, feedback, a restart path and an achievable first session. Prefer a simple, complete game loop over overambitious scope. Ask about sharing only when the player wants to publish or invite friends.

## Target device: ${guide.device.id}

- Device profile: \`${guide.device.id}\`, revision \`${guide.device.revision}\`.
- Logical screen: **${guide.device.display.width} × ${guide.device.display.height}** pixels, aspect ratio **10:9**.
- Display output: **${guide.device.display.indexedColors} indexed colors**. Render within this logical frame and quantize the final display output; palette cosmetics do not increase color count.
- Physical inputs: ${guide.device.inputs.map(input => `\`${input}\``).join(', ')}. Explain the mapping to the player.
- Do **not** invent hardware CPU/RAM/ROM capacity, FPS, audio voices, save capacity, or cartridge size limits. Service/build quotas are different from fantasy hardware.
- Other device families are concepts, not selectable active targets.

## Engine registry: exact pinned versions and honest readiness

| Engine ID | Version | Current status | Allowed source imports |
| --- | --- | --- | --- |
${engineRows}

\`kaplay\` is the **first experimental adapter candidate**, *not* approved for arbitrary user-game execution. \`phaser\` and \`pixi\` are planned; \`pixel-v1\` only preserves legacy compatibility. Do not promise a playable preview or choose a planned engine as if its adapter were ready. Engine selection follows the game needs and actual runtime approval; Genre never hard-locks an engine.

## Authoring contract

1. Create a Slopboy cartridge source module, **not** an \`index.html\` / standalone website, custom DOM shell, CDN script, or random package install.
2. For a KAPLAY-based first draft, use the exact **\`kaplay@${ENGINE_REGISTRY.kaplay.version}\`** template from \`get_game_template\` / \`packages/cartridge/src/agent-templates.ts\`. Keep its default-exported setup function and host-provided canvas/context; use the real pinned API, never invent lifecycle methods.
3. Produce \`src/game.ts\` and a \`manifest.json\` with \`schemaVersion: ${guide.manifestSchemaVersion}\`, \`deviceProfile: "${guide.device.id}"\`, \`engine: { id, version, adapterProtocol }\`, \`entrypoint: "${guide.entrypoint}"\`, and \`assets: []\` for a one-file starting point. Required \`gameId\` and \`revisionId\` are **distinct server-issued UUIDs**, not generated from the game's name and not a client-selected identity. Treat locally generated test IDs as non-authoritative placeholders until the server creates the actual draft.
4. Restrict imports to the selected engine's exact allowlist. No \`fetch\`, \`XMLHttpRequest\`, \`WebSocket\`, \`window\`, \`document\`, \`localStorage\`, workers, \`eval\`, dynamic imports, remote URLs, or direct backend/secret access. Use the host input/storage lifecycle only where the selected maintained template supports it.
5. Favor short sessions, immediate feedback, touch/controller-friendly controls, original art/logic and one source file until multi-file assets are supported by the secure pipeline.
6. Explain how to run the real source/manifest validation. If no tooling was run, say **"not validated"**. Do not claim a build, safe preview, account connection, private upload or published game succeeded without corresponding evidence.

## How to deliver the generated game

- Return the proposed title, two-sentence gameplay explanation, controls, pinned engine choice and status, and complete \`src/game.ts\` source. Include a matching draft manifest only if the receiving workflow requires it; never fabricate authenticated server IDs.
- If a supported authenticated Slopboy MCP connection exists, discover the template and let the actual server assign identity/owner. Otherwise the user may copy one template-conformant source file to the signed-in **Dashboard → My Games → New Game → Paste Code** path as a **private source-only draft**, where available.
- Saving a private draft does **not** make it runnable. Isolated builds and safe previews depend on #31, #32, #33 and #4; sharing with friends depends on explicit permissions, and public listing depends on human review.
- The separate **legacy Creator Kit v0.1** uses \`creations/<slug>/manifest.json\`, \`GameModule\` and \`pnpm creator:*\` commands. Its manifest/API is **not interchangeable** with this V2 framework cartridge format. See \`docs/creator-kit.md\` for that local-only compatibility workflow.

## Official, versioned source-of-truth references

- \`packages/hardware/src/v2.ts\` — display and inputs.
- \`packages/cartridge/src/engine-registry.ts\` — pinned engines and status.
- \`packages/cartridge/src/agent-templates.ts\` — maintained framework starter and coding instructions.
- \`packages/cartridge/src/manifest-v2.ts\` — V2 manifest and source validation.
- \`docs/architecture/adr-004-approved-game-frameworks.md\` — engine decisions.
- \`docs/architecture/adr-005-manual-source-ingestion.md\` — private source-only draft safety boundary.

Machine-readable version: \`${GAME_GUIDE_JSON_PATH}\`. This page is a specification; it does **not** perform OAuth, MCP submission, source upload, code execution or publication.
`;
}
