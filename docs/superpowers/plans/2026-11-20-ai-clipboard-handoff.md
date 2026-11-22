# AI Clipboard Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an intentional AI-to-Slopboy private source import and immutable source-history experience on a stacked dev-only branch.

**Architecture:** The new frontend uses #98's existing authenticated create/update endpoints and never runs game source. A new read-only source history API enforces the same account/owner boundary; historical source can be loaded as text and re-saved as a new revision.

**Tech Stack:** Next.js 16 App Router, React 19, HeroUI v3, TypeScript, Neon Postgres, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-20-ai-clipboard-handoff-design.md`

## Global Constraints

- Do not edit #98-owned files, apply migration 005, merge, or change Production.
- KAPLAY pinned `PRIVATE_SOURCE_TEMPLATE`, 65,536-byte maximum; source-only drafts remain unplayable.
- Only user gesture clipboard reads and explicit authenticated source saves; no source in URL/storage/logs.
- Source-history query limits to 50 and scopes every row to owner/admin and private draft.

## Review Focus

- Clipboard denied/unavailable → editable manual paste remains usable (Task 1).
- Multiple Markdown code blocks and arbitrary HTML → no silent/unsafe interpretation (Task 1).
- Foreign/private game UUID and unverified actor → source never returned (Task 3).
- Old unvalidated revision → visible legacy label, server validation needed before save (Task 4).
- Duplicate save after network timeout → same submission UUID until payload changes (Task 2/4).

---

### Task 1: Clipboard handoff parsing

**Files:**
- Create: `apps/web/lib/ai/source-import.ts`
- Test: `tests/ai-clipboard-handoff.test.ts`

**Interfaces:**
- Produces `normalizePastedSource(text: string): {source: string; language: 'typescript' | 'javascript' | null; warning: string | null}`.

- [ ] Write tests for raw code, a single TS/JS fenced block, multiple fences, and HTML/no detected language.
- [ ] Run `node --experimental-strip-types --test tests/ai-clipboard-handoff.test.ts` and observe missing implementation failure.
- [ ] Implement minimal pure normalization with no automatic source execution, persistence or network calls.
- [ ] Re-run focused test; expect 0 failing.
- [ ] Commit task source and test.

### Task 2: Create/import UI

**Files:**
- Create: `apps/web/app/(modern)/import/page.tsx`
- Create: `apps/web/components/ai/ImportGameForm.tsx`
- Test: `tests/ai-clipboard-handoff.test.ts`

**Interfaces:**
- Consumes `normalizePastedSource`, `PRIVATE_SOURCE_TEMPLATE`, and existing `POST /api/manage/source`.
- Produces a new private-game link to `/manage/<game UUID>/history` only after confirmed server response.

- [ ] Add static boundary tests for manual clipboard click, source-only `<TextArea>`, explicit authenticated save, and no local/session storage or auto-read.
- [ ] Run focused tests and observe failure due missing UI/route.
- [ ] Implement HeroUI form, deliberate validate/save buttons, diagnostics, error states and stable submission UUID.
- [ ] Focused tests and `pnpm typecheck`; expect passing.
- [ ] Commit UI and tests.

### Task 3: Owner-scoped immutable history read API

**Files:**
- Create: `apps/web/server/source-history-queries.ts`
- Create: `apps/web/app/api/manage/games/[gameId]/source-history/route.ts`
- Test: `tests/ai-source-history.test.ts`

**Interfaces:**
- `GET /api/manage/games/<gameId>/source-history` returns `{revisions: [{id, language, checksum, createdAt, validated}]}` latest 50.
- `GET /api/manage/games/<gameId>/source-history?revision=<uuid>` returns `{revision: {id, source, language, checksum, createdAt, validated}}`.

- [ ] Test SQL against real disposable Postgres when available; otherwise enforce exact owner/visibility predicates and that list never returns source body. Test route no-store and verified session guards.
- [ ] Run focused test; confirm missing route/query failure.
- [ ] Implement strictly read-only authorized SQL and route; invalid UUID or access return 404, backend unavailable 503.
- [ ] Focused test and `pnpm typecheck`; expect passing.
- [ ] Commit API/tests.

### Task 4: Version history and restore UX

**Files:**
- Create: `apps/web/app/(modern)/manage/[gameId]/history/page.tsx`
- Create: `apps/web/components/ai/SourceHistory.tsx`
- Test: `tests/ai-source-history.test.ts`

**Interfaces:**
- Consumes source-history GET and existing authenticated update POST from #98; produces a new immutable revision only after deliberate user Save.

- [ ] Test UI contract for inert textarea, owner-only history, save-as-new-revision, explicit source-only/unplayable status, no mutation DELETE/PUT.
- [ ] Run focused test and confirm failure due missing page/component.
- [ ] Implement loading/failure states, historical source read and explicit restore-as-new save with stable UUID.
- [ ] Run focused tests, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` (report any baseline/environment limits).
- [ ] Commit changes, document external migration/hosted acceptance blockers and open stacked Draft PR.
