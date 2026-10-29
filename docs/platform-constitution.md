# Slopboy Platform Constitution — v0.1

**Status:** Initial proposed project contract (2026-10-29). **Brand:** Slopboy is a temporary codename. **Scope:** MVP and compatibility principles, not final hardware numbers.

## 1. Mission and identity

Slopboy is a platform for **original, fictional virtual gaming devices** and community-created, playable small games. The platform must feel like a game collection, not a generic web dashboard. Inspiration from retro hardware is welcome; copying the protected trade dress, trademarks, logos, game assets, or copyrighted art of commercial products is not.

Slopboy is **not** a Game Boy emulator, a real CPU simulator, or a TIC-80 reimplementation. TIC-80 is a reference for explicit limits, simple cartridges, and developer ergonomics.

## 2. Non-negotiable principles

1. The **platform** is distinct from each **console**, each **game**, and each **shell skin**.
2. A console is defined by a versioned **Hardware Profile**; the runtime must enforce meaningful capabilities, not just suggest them to creators.
3. A **single versioned TypeScript SDK** is available equally to human developers and AI assistants. No model-specific game format.
4. Games run **locally in a restricted browser environment**. No remote gameplay code execution on the platform backend and no ordinary game-server requirement.
5. **Offline-first gameplay** and optional PWA installation are goals; online account features must degrade gracefully.
6. The full-console UI and fullscreen/maximized game view must show the same live game session; preserve logical display size, aspect ratio, and pixel fidelity.
7. Keep the initial deployment within a **$0/month operating-cost target**, subject to provider quotas; do not pretend that free tiers offer unlimited scale.
8. Every publicly listed game needs automated validation **and human content/security/rights review**. AI-generated output is not exempt.
9. No game can directly mint platform currency, modify player entitlements, or freely access account data.
10. Scope grows through tested contracts and accepted milestones, not speculative feature proliferation.

## 3. Consoles and controls

Future models may be vertical, landscape, clamshell, wide-screen, asymmetrical, or entirely new shapes. Supported input capabilities are declared, not presumed: directional pad, 2/4/6 face buttons, one/two analog sticks, shoulder buttons, triggers, and alternatives are allowed per model.

The **Hardware Profile** defines: ID/version, logical resolution, color or palette rules, display behavior, supported inputs, audio limits, storage/save limits, cartridge limits, and measurable frame-budget expectations. A shell appearance/skin changes no hardware capability.

Compatibility is **capability-based and testable**. A game needing two sticks cannot automatically run on a D-pad-only console. Backward compatibility, adapters, or enhanced editions require explicit specification.

## 4. Display modes and accessibility

- **Console Mode:** show the complete, responsive physical shell, with interactive controls and visual press feedback.
- **Game Mode:** remove the decorative shell and maximize the playable screen within available space; maintain the console's aspect ratio and no distortion. Prefer integer pixel scaling when practical; offer sharp nearest-neighbor scaling and optional display filters.
- Touch, keyboard and physical controllers map into one normalized input API. Touch control layouts should adapt to the device and user preferences; do not hide all controls when touch is the only available input.
- Support reduced motion, visible focus, accessible control labels, remappable keyboard/controller input where feasible, and comfortable screen contrast.

## 5. Cartridge contract

A cartridge is a **portable, versioned, self-contained bundle** built from the official SDK. It declares a target hardware contract and contains all runtime assets; no remote dependencies or downloads that bypass size budgets.

The proposed extension is `.slop`; exact binary/container details remain **provisional** until the loader prototype. Cartridges provide lifecycle callbacks, resource declarations, permissions (default none), game metadata, and achievement definitions. Firmware/launcher is separate from game cartridges.

A cartridge must not control the platform's player records or privileges. Its sandbox interface is a minimal graphics/input/audio/save bridge only.

## 6. Achievements and currency

- Each game may define **unique, themed achievements**, artwork and testable conditions. The creator/AI can propose them; the platform validates the schema and retains approval.
- A player receives **one earned currency** (working label: Slop Coins). There is no separate XP and coin economy in the MVP.
- Currency eventually unlocks games, new virtual consoles, shell colors, stickers, limited editions, boot animations, and other cosmetics; design for generous starter access and no forced grind.
- **Trust boundary:** local, client-only game events are **not authoritative proof** for spendable global currency. No real cross-user economy goes live until server-side grant limits, idempotency, anti-abuse controls and a reviewable ledger exist. Offline/local achievements are allowed as unverified drafts.
- Games cannot set their own exchange rates or grant arbitrary spendable points. Prevent rewards that encourage spam or trivial infinite loops.

## 7. Creators and publication

Creation must work for humans and AI assistants with the **same SDK, project manifest, CLI validator and test runner**. A future Remote MCP integration can expose specs, creation, upload, validation, preview and **submit for review**, but cannot bypass gates.

The manual path (local ZIP/cartridge creation and upload, or GitHub contribution) remains available independent of AI provider plans and tool permissions. ChatGPT Free and Claude Free connectivity is an **experiment to validate**, not a guaranteed universal publishing feature.

Public submissions must be reviewed for technical compliance, runtime safety, illegal/inappropriate content, plagiarism, IP rights, quality, and misleading metadata. Provide reporting/takedown and publisher ownership policies before opening public UGC.

## 8. Content and intellectual property

No unlicensed game characters, soundtracks, console logos, recognizable copied industrial designs, or titles suggesting official affiliation. Generic styles/color combinations may be used carefully, but likeness and marketing context matter. Developers attest that they hold the necessary rights. Content rules and age ratings must be documented before public marketplace submissions.

## 9. Infrastructure and privacy

Platform web shell uses Next.js + TypeScript, with a static-first deployment and PWA strategy. SDK/runtime are standalone packages. GitHub is source of truth for code, issues, release checks and initial cartridge review. Costs, usage limits and abuse safeguards are first-class considerations.

Account identities, durable coin balances, cross-device saves and ownership records require a trusted backend; Neon/Supabase remain **undecided**. Do not put secrets in frontend bundles or untrusted GitHub workflows.

## 10. Change control

Version Hardware Profiles, cartridge schemas and SDK APIs. Changing a profile's limits must not silently reinterpret published cartridges. Prefer compatibility adapters/migrations and clear unsupported-version errors. Every exception to the constitution needs a documented rationale, tests, and review.

## Explicitly deferred from MVP

Multiple console generations, public game uploads at scale, social features, cloud saves, paid transactions, real-time multiplayer, creator monetization, arbitrary JS execution, the MCP plugin, and the final brand.

## MVP exit criteria

A separate cartridge can be built, validated, loaded and played on a single imaginary device; resource limits and isolation checks reject incompatible/malicious test fixtures; both display modes and touch/keyboard work; the demo runs as a static/PWA-capable build without credentials or paid services.
