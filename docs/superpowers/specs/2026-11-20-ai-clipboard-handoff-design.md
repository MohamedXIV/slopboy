# AI clipboard handoff and private source history — design

## Intent

Players who ask ChatGPT or Claude to generate a Slopboy game need an understandable, low-cost path to save the result in their Slopboy account and return to earlier versions. Genre is optional in the AI prompt; the saving flow uses the platform's generic `Other` genre until editing is supported. Neither source-only drafts nor their revisions are playable yet.

## Requirements and non-goals

- New public `/import` route: explain the expected single `src/game.ts`/`.js` KAPLAY module, offer a user-clicked **Paste from Clipboard** action with manual textarea fallback, collect title/optional description, validate and save **only** after deliberate clicks.
- Never embed source in an AI deep link, query string, logs, analytics, localStorage, or another origin. The UI renders untrusted source as plain textarea text, never HTML or executed JavaScript.
- Use the existing `POST /api/manage/source` service from #98 so its verified-session, same-origin, engine validation, quota, idempotency, and immutable storage guarantees remain authoritative. Handle 401/403/422/429/503 honestly.
- Add a new owner-scoped read-only source-history API and `/manage/[gameId]/history` UI. Display latest 50 revision metadata entries; load a past revision's source into an inert editor, then require an explicit **Save as new version** action via #98's existing `POST /api/manage/games/[gameId]/source`. Do not mutate or delete old rows.
- No preview, build, publication, GitHub Actions, public storage, MCP writes, Neon migration, Production changes or merge in this slice.
- Keep this work isolated from #98's owned implementation files and review it as a stacked Draft PR based on exact `c092b1ee89507be20f6d13943e51eecf3c172377`.

## Approaches

1. **Chosen: Neon append-only rows plus clipboard flow.** Reuse #98's private source POST and database columns; add an isolated read API and UI. Least new infrastructure, straightforward access control, immutable revisions.
2. Browser-local history only. Cheapest prototype but disappears on device reset and cannot be trusted as version history.
3. Git/GitHub per player's draft. Unnecessary repository management, complex confidentiality, and broader infrastructure/automation exposure for the current single-file source MVP.

## Details and acceptance

- Clipboard read must originate in the player's button click; on denial or no API, show an actionable message and keep manual paste working. Do not auto-read on page load.
- Accept raw single-file source. If content is a single explicitly tagged TypeScript/JavaScript Markdown code block, unwrap it for convenience; ambiguous/multiple code blocks are not silently reduced to one. All source validation still happens on the server.
- Refreshing or re-submitting an unchanged save after network uncertainty must reuse the same UUID idempotency key; editing clears that key.
- History API needs an actual verified session and same owner/admin-on-platform condition as #98; unknown, archived, nonprivate or foreign game returns no source. Responses have `Cache-Control: private, no-store` and `nosniff`.
- Older migration-004 rows with no validated manifest may be inspected as text but should be identified as legacy and require ordinary validation on attempted save.
- Routes fail safely while #98's migration/grants/live authorization are unavailable on dev. A successful local test does not certify hosted acceptance.

## Dependencies

Issue #104 follows #102 AI guide, and stacks on unmerged Draft PR #98 (#49/#31). Applying migration 005 and the live verified-account checks belong to #98's owner. Private preview remains blocked by #32/#33/#4/#45. Update the AI guide's handoff URL after integration without changing #103 from this branch.
