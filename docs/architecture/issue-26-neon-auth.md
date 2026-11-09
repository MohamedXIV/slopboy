# Issue #26 — Neon Managed Auth, protected account APIs (development)

## Baseline and state

- Source: #78 `integrate/sprint-2-baseline` (all engine, offline and PostgreSQL schema foundations), branch `feat/26-neon-auth-session`, PR #79.
- Isolated Neon **Free** project `slopboy-dev`, project ID `super-scene-57459190`, default branch `br-still-cell-bagkrhn2`, database `slopboy_dev`, PostgreSQL 18. Migrations **001/002 already applied**, all three reviewed static game IDs preserved as private/draft metadata only. Existing guest cartridges, IndexedDB saves, offline caches, `/legacy` and public routes remain untouched.
- Neon Managed Better Auth uses its native `neon_auth` schema; `neon_auth.user.id` is a UUID compatible with `public.users.id`. No special adapter tables or fake accounts are provisioned.
- Neon Auth public signup remains **disabled** for the private development rollout. It requires verified email when enabled. No production OAuth issuer / MCP token authorization is claimed.
- SDK: `@neondatabase/auth@0.7.0-beta` pinned. Serverless SQL driver: `@neondatabase/serverless@1.2.0`. Both must be in the frozen pnpm lockfile.

## Runtime and trust boundaries

- `/api/auth/[...path]` is the official Managed Neon Auth request proxy, disabled (503) if the origin URL or strong cookie secret is absent.
- `/auth/sign-in` is an actual email/password sign-in UI; no UI is shown in disabled deployments. `/dashboard` is an inert public HTML/client shell until `/api/account/me` verifies its session. The client approach avoids the beta SDK's session-cookie refresh write during React Server Component rendering.
- `/api/account/me` returns only verified subject and a DB-read profile; response is private/no-store. User ID, expiry, emailVerified must come from the trusted provider response. Never trust a supplied `userId` or `role` query/body field.
- `POST /api/account/bootstrap`: strict same-origin Origin requirement + session verification + verified email, then a parameterized, idempotent `public.users` INSERT/UPDATE that can **never set role to admin**. No guest save import or consent is implied.
- `GET /api/account/games`: reads only `games.owner_id=verifiedSessionUserId`; private/draft game records are never returned to another account through this route. It does not create, upload, execute or publish source code.
- `GET /api/admin/overview`: strictly requires a DB-proven `public.users.role='admin'`, not the Better Auth profile role or an MCP argument. Has no privileged mutation.
- Session expiry, invalid sessions and DB outages fail closed. Guest routes never redirect to sign-in. No personalized response/page is service-worker cached.

## Real Neon Preview credentials

Only `feat/26-neon-auth-session` **Vercel Preview** is configured. These are secret server-side variables, not source-controlled:
- `NEON_AUTH_BASE_URL`: managed development auth origin (HTTPS).
- `NEON_AUTH_COOKIE_SECRET`: private random cookie key (32+ bytes).
- `DATABASE_URL`: dedicated limited-role PostgreSQL URL.

The PostgreSQL role `slopboy_web_preview` was created scoped read-only to an empty `slopboy_runtime` schema, then explicitly granted narrowly scoped permissions to existing tables:
- `USAGE` on `public`.
- `public.users`: `SELECT(id,email,display_name,role)`, `INSERT(id,email,display_name,role)`, `UPDATE(email,display_name)`.
- `public.games`: `SELECT(id,owner_id,title,status,visibility,created_at)`.
- **No** `UPDATE(role)`, `DELETE` on games/users, private audit logs, or `neon_auth.user` SELECT. Verified via Neon permission introspection and role-specific `EXPLAIN` without executing inserts.
- The database owner/administrative connection string is **never** installed into Vercel. The restricted role is for #26; later #27 write endpoints will require explicit, reviewed privileges and authorization checks.

Avoid storing the Neon connection URL or auth cookie secret in GitHub Issues, CI logs or public documentation. Do not add them to Production/other Preview branches.

## Acceptance tests and limitations

Required: frozen install, unit tests including 2 independent PostgreSQL owner fixtures, session shape + expired/invalid claims, CSRF Origin negative tests, full Chromium sandbox, KAPLAY and offline/PWA regression, typecheck/lint/build; Vercel Preview READY at the same commit.

**Not yet proven** until two actual user-owned, verified Neon Auth identities can sign in from a browser:
1. Real sign-in/sign-out and refresh cookie flows against the Vercel Preview origin.
2. Profile bootstrap after email verification; repeated bootstraps never promote privileges.
3. Two-account 403/absence for unrelated private games, files and saves, including after sign-out, cookie revocation and session expiry.
4. Admin route denial for ordinary account; user-controlled role claims must not become privileges.
5. Only *explicit consent* may link or transfer guest data; never auto-import guest saves.
6. Provider throttling, recovery flows and browser-specific cookie behavior.

Do not close #26 or enable public account creation based on mocked sessions or SQL fixtures alone.

## Rollback

Keep PR #79 unmerged; remove its **branch-scoped Preview variables**, revoke the dedicated `slopboy_web_preview` credential if needed, disable beta Auth provisioning if rollback is approved. Never drop migration tables, delete guest storage or modify existing production service settings. `main` and Vercel Production are unchanged.
