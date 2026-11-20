# AI game builder — first public game-idea entry point

**Issue:** [#102](https://github.com/MohamedXIV/slopboy/issues/102) · **Status:** Draft PR only, no production release.

The `/ai` page turns a free-form player idea into a prompt for ChatGPT or Claude. Genre and challenge are optional. Someone who has never heard of “platformer,” “engine” or “cartridge” can write a game idea, copy a complete versioned device guide and start iterating in their preferred AI chat.

## Routes and behavior

| Route | Purpose |
| --- | --- |
| `/ai` | Player-friendly idea, optional Genre/difficulty, copy and provider buttons |
| `/ai/game-guide/v1.md` | Public Markdown instructions for agents; primary versioned reference |
| `/ai/game-guide/v1.json` | Public structured device/engine version/status snapshot |
| `/llms.txt` | Optional discoverability index; not an authentication or guaranteed auto-discovery protocol |

- **Open in ChatGPT:** browser URL `https://chatgpt.com/?q=<encoded prompt>`.
- **Open in Claude:** browser URL `https://claude.ai/new?q=<encoded prompt>`.
- Both open from a deliberate player click in a new tab. The outbound URL includes the player's idea and the same-origin public guide URL; only click if you're comfortable sending that idea to the selected provider.
- **Copy full prompt** copies the same versioned Markdown guide and the complete idea from the page's bundled guide contract; works as a fallback when AI clients cannot retrieve the URL or ignore `q`.
- This page itself needs no sign-in, paid model API, OAuth, MCP connection or backend mutation.

## Actual supported architecture

This guide uses **V2 framework cartridges**, `packages/hardware/src/v2.ts` and the current version-pinned engine registry/agent templates from #44/#46. KAPLAY is an **experimental** adapter; Phaser and Pixi are planned; pixel-v1 is compatibility only. No untrusted engine is labeled production-ready.

`docs/creator-kit.md` describes the **separate legacy local Creator Kit** (`GameModule` plus `creations/<slug>/manifest.json`) and must not be treated as the V2 framework manifest. No software copies the old Creator Kit limits into the V2 fantasy hardware contract.

A generator can suggest `src/game.ts` using the real `get_game_template` contract; manifest UUID game/revision identity belongs to the server on account-backed submission. New uploads are private source-only drafts (#49); safe build and preview remain gated by #31/#32/#33/#4. Any sharing or public listing is a separate authorization/moderation operation. The guide never tells the AI to report a build or game launch that it has not verified.

## Privacy, validation and rollback

- User idea is local browser state until clicking an external provider or copying it. The page never posts it to Slopboy.
- Markdown and JSON content are generated from the same contract; automated tests compare device and engine data directly with source-of-truth packages, test optional Genre and query encoding, and assert HTTP content types.
- No database tables, OAuth settings, service secrets, uploads, runtime execution or Production flags change. Rollback is removing the standalone `/ai` and public guide routes; existing players, local saves, creator drafts and integrations are unaffected.
- The page is a prototype-facing companion to the core authenticated MCP flow (#28–#30), not evidence of an end-to-end ChatGPT/Claude game creation or real friend sharing.
