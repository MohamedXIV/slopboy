# ADR-006 — AI clipboard handoff and private source history

- **Date:** 2026-11-20
- **Status:** Accepted for a dev-only implementation slice; live hosted acceptance pending
- **Issue:** [#104](https://github.com/MohamedXIV/slopboy/issues/104)
- **Dependencies:** #102 AI guide, #49/#31 private source storage (Draft PR #98), #32/#33/#4 safe preview gates

## Decision

Start with a cheap, explicit clipboard handoff from ChatGPT, Claude and other AI clients to a canonical Slopboy `/import` route. Do not place source text or credentials into deep-link query parameters, prompts masquerading as action buttons, browser storage or public GitHub repositories. A browser can only read the clipboard after an explicit user action; manual paste always works when permission is denied.

Use the authenticated `POST /api/manage/source` and `POST /api/manage/games/:id/source` contracts from #98. Save one pinned KAPLAY `.ts`/`.js` module after server validation to immutable, private `game_source_drafts` rows in Neon. The owner chooses when to validate and save. No code runs as part of upload, source listing, or restore.

Expose a separate private read-only source-history API with verified session, matching game ownership/platform-admin permission, draft-only/private-only filters, strict game/revision UUIDs, and `private, no-store` responses. List 50 metadata records per page without source text. Older pages use the last revision UUID as an exclusive cursor, scoped to the same game and ordered by timestamp and UUID. Fetch a selected revision's source only on owner action and render in a text editor. **Restore means POST a new immutable revision**, preserving the old content and digest. Unvalidated pre-migration source must pass current checks before being re-saved.

## Alternatives rejected for this phase

- Client-only history disappears when users switch devices and cannot substantiate saved version claims.
- GitHub per-player repositories, Git history and Actions-based untrusted builds introduce overhead and confidentiality/abuse risks that a one-file private draft does not require. Repo-owned CI remains separate from customer/game execution.
- Browser URL payloads and automatically copying/pasting from AI chats risk leaking source and bypassing meaningful user consent.

## Consequences and follow-ups

- Each stored version consumes bounded per-owner source storage. Existing #98 quotas and idempotency stay authoritative; `source-history` is not a duplicate write path.
- Untrusted source never executes in Next, Neon, MCP or a privileged CI worker. **Preview, share, publish and builds remain disabled** pending #32/#33/#4/#45.
- The integration is responsible for migration 005, grants and dev account acceptance. History routes fail closed if the schema or session is unavailable.
- Large multi-file assets, diff UI, branching/merging, friend grants and publishing are deferred, not represented as implemented capabilities.
- The integrated #102 guide links to `/import` on the same origin. The import form keeps pasted text in memory and opens sign-in in a separate tab.
