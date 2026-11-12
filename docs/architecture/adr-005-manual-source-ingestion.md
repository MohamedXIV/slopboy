# ADR-005 — Manual Paste-to-Private Draft and First-Line Upload Safety

**Date:** 2026-11-08  
**Status:** Approved product fallback; implementation pending authentication, secure ingestion, isolated runtime.  
**Delivery:** [Issue #49](https://github.com/MohamedXIV/slopboy/issues/49) · [Secure cartridge Epic #18](https://github.com/MohamedXIV/slopboy/issues/18) · [Framework Epic #43](https://github.com/MohamedXIV/slopboy/issues/43)

## Why

ChatGPT and Claude plugin listing approval or Remote MCP availability may take time. People should still be able to ask their preferred assistant for Slopboy-compatible source, **copy/paste it into their own Slopboy account** and save it as a private game draft. This is a first-class creator pathway, not a separate engine or weaker uploader. The web and MCP clients share the **same authorization, validation, storage, build and review services**.

## Product contract

- User signs in using a real account. Guest play and local saves continue, but anonymous public source uploads are not available in this first release.
- In `/dashboard` → `My Games` → `New game` → **Paste code**, choose an approved device and engine version/template, supply a title, and paste a single `.ts`/`.js` module. First slice is **one source file** plus server-generated metadata. Multi-file editing/assets and ZIP import are future enhancements with independent validation. No general `index.html`/CSS website uploads.
- The server assigns immutable UUID game/revision IDs and the *actual session owner*. The creator cannot select an arbitrary user ID to seize another person's game. Do not reuse a title/slug as identity.
- Save uploads as **private source-only drafts immediately after basic server validation**, with explicit states. User may safely view/edit text or retry after validation failures. Never execute a saved draft just by displaying it in an HTML text editor.
- **Private is not inherently safe.** A deliberately malicious draft can threaten its own creator, other users, accounts, the browser, infrastructure, costs and privileged services if executed outside a robust sandbox. Do not use “the uploader only hurts themselves” as a safety premise.
- An uploaded draft is **not playable** until it passes engine and source validation, reproducible build, and sandbox compatibility/security gates. In an early MVP we may offer **save-only private drafts** with a disabled Preview control rather than claim unsafe previews work.
- A verified owner-only preview does not publish the game. Friend sharing requires explicit access grants. Public publication requires a separate **submit for human review** action and approval of an immutable revision.

## Initial UI states

`Editing` → `Private draft (unvalidated)` → `Rejected by validation` / `Validated` → `Queued for isolated build` → `Build failed` / `Private preview ready` → `Submitted for public review` → `Approved and published` (or rejected/revoked).

Represent server states honestly: showing `Private draft` only means persisted source/ownership, **not** that the code ran or passed security review. Any preview failure must remain recoverable without changing ownership.

## Layered security controls

1. **UI preflight (UX, not security):** warn about invalid syntax, unknown engine, missing lifecycle entrypoint, unexpected import, unsupported file; show exact line diagnostics when available. Attackers bypass UI easily. Never treat regex scanning as an execution sandbox.
2. **Authenticated POST and authorization:** verified session, CSRF protection where needed, account-based draft/revision identity, idempotency keys, per-user upload limits. No anonymous upload or caller-controlled `ownerId`.
3. **Strict server ingestion:** approved `.ts`/`.js` source and exact engine manifest, fixed allowlisted imports/versions, vetted asset formats, safe canonical relative filenames, path traversal prevention, raw + expanded size and file count ceilings, content-type/magic verification where relevant, rate limits and quotas, content digest and audit log. Reject arbitrary URLs, CDN references, custom HTML shell and unreviewed dependencies. Disallow embedding secrets and direct cloud credentials; report actionable errors.
4. **Quarantined private storage:** store source/artifacts with server-owned random keys, no public bucket/URL, no executable webroot, least-privilege access controls, encryption/provider security as available. Static checks or an antivirus are **defense in depth**, not proof that game source is harmless.
5. **Untrusted build boundary:** compile/package in a resource-limited isolated process (CPU, memory, time, filesystem/network), with no app database secrets and no game code execution in Next.js/Neon/MCP API handlers. Build output immutable and tied to owner/version/checksum. Define safe handling for toolchain parsers as attack surface.
6. **Browser preview boundary:** only after validation/build gates; isolated site/opaque-origin sandbox with strict CSP and denied credentials/network by default, no combined `allow-scripts allow-same-origin` for same-origin games, no privileged parent DOM access. Validate every host bridge message and enforce capability-limited input/save calls. Browser hangs/CPU DoS may not be fully containable by iframes alone; resource protection and cross-browser QA are independent blockers.
7. **Moderation/publication:** admins inspect *non-executing* source/report UIs and sandboxed previews, audit approvals and revocations, block cross-user data access. Human review for public releases is **not** a replacement for runtime isolation.

## Common path for manual and MCP ingestion

```text
ChatGPT / Claude / other AI assistant generates Slopboy framework code
        |                                |
        | user copy/pastes                 | OAuth MCP sends files
        v                                v
Dashboard Paste Code                   Remote MCP tools
        +--------------+-----------------+
                       |
               Authenticated domain service
                       |
          server validation / private storage
                       |
       isolated build -> authorized private preview
                       |
                human public review
```

Both paths share the same engine registry, schema, file digest, quota accounting and per-user game access checks. This means accepting a user-pasted source file neither bypasses nor weakens the future AI plugin path.

## First implementation slice

- After real account #26 and ownership/catalog #27: allow **paste one template-conformant game file** in `/dashboard`; create a **private source-only draft**, provide validation diagnostics and let owner edit/retry.
- Link upload to #44 engine registry and #31 secure storage pipeline; add dry-run tests for DOM/XSS and excessive payloads.
- Gate **Run / Preview** behind #32 reproducible isolated build and #4/#33 hostile-code acceptance. KAPLAY #45 remains experimental until those gates are satisfied.
- After preview is safe, support friend access #35 and public human review #38. No fake server-side malware verdict or account-independent source execution.

## Verified security references

- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- MDN iframe sandbox: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- Existing [ADR-004](adr-004-approved-game-frameworks.md): approved framework templates, immutable runtime/engine version and host API
