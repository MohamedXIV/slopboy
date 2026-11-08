# ADR-003 — Agent-native Slopboy: MCP creation, multi-sided dashboards and hosting

**Date:** 2026-11-08  
**Status:** Proposed for review; supersedes ADR-002's assumption that the on-site Studio is a priority.  
**Product:** Slopboy is a multi-sided creator/game platform. **Creating games from ChatGPT and Claude using the user's own subscriptions and accounts is the core user journey**, not a future assistant feature.

## Product roles and interfaces

One Slopboy account can be **player and creator simultaneously**; reviewer/operator powers are separate privileged roles, not a second identity.

| Surface | Primary audience | Real responsibilities |
|---|---|---|
| Home / public Library | Guests and players | Discover approved public titles, device families, ratings and non-spoiler metadata; play guest/offline where possible |
| Player/Creator Dashboard (`/dashboard`) | Signed-in users | My Games (drafts, private, shared, public); edit title/art/description/permissions, version history, publishing status, load/save sync, play history, creator analytics, ratings/comments, storage quota and linked integrations |
| In-game quick Library | Playing users | Switch permitted installed games without losing device workspace; source of truth is access-filtered server catalog with offline cache |
| Admin Dashboard (`/admin`) | Operators / reviewers only | Moderation queue, automated scan reports, approve/reject public releases, reports/appeals, user bans/permissions, ratings/comments moderation, operational storage quotas, audit logs, abuse investigations |
| ChatGPT Plugin | Creators | Authenticated Slopboy tools to create, update, test, preview and privately publish games from chats |
| Claude Remote MCP Connector | Creators | The same Slopboy tool semantics/permissions via OAuth and an independent client |
| Future AI clients | Creators | Same versioned remote MCP server; no separate backend per vendor |

**There is no web-based game code editor in initial scope.** Replace the old (`/studio`) route proposal with (`/dashboard`) and a game's manage page. A future web creator studio is optional, not a dependency. Slopboy itself does **not** need paid model APIs; the user creates code in ChatGPT/Claude and sends it using the authenticated connector.

## Core end-to-end flow

1. Creator signs into Slopboy and connects the Slopboy plugin/remote MCP connector from **their own ChatGPT/Claude account**.
2. OAuth 2.1 Authorization Code + PKCE exchanges consent for narrowly scoped tokens; the MCP request identifies the *authenticated Slopboy subject* with issuer, audience and scopes verified on every request. Never accept a (`user_id`) supplied by the model as proof of ownership.
3. Creator prompts “Make a tiny game on Slopboy 1000.” The agent queries device specifications, creates a draft, submits source/assets in bounded chunks or signed uploads, requests validation/build, previews, iterates and submits a final immutable draft revision.
4. **Ownership is bound to the authenticated Slopboy subject server-side.** The draft appears immediately in the user's **My Games**, but is **private by default**. Friend access requires explicit per-game grants; a game does not automatically appear for all of the creator's friends.
5. Preview is allowed only through the **approved isolated execution boundary**, never by evaluating the submitted JS/TS inside a privileged web app or server. Static scanning is not itself a sandbox.
6. Creator may share an authorized revision with selected friends (friend preview/private), but **only operator-reviewed and approved content** can be added to the public Library.
7. The owner manages drafts, revisions, privacy, invitations, analytics and comments from their Slopboy Dashboard; operators process the public queue from (`/admin`).

## One shared Remote MCP server

- Preferred stable public HTTPS endpoint: (`/mcp`) with Streamable HTTP transport. The ChatGPT Plugin packages skills, tool metadata and OAuth-backed MCP connection; Claude uses an authenticated custom remote MCP connector. Make endpoint origin stable before publishing because changing a published ChatGPT plugin MCP origin can require creating a new listing.
- Implement a versioned tool contract on the server, not provider-specific game uploading logic. Candidate v1 tools:
  - (`get_my_profile`), (`list_device_specs`), (`list_my_games`), (`get_game_draft`)
  - (`create_game_draft`), (`update_game_metadata`)
  - (`put_game_file`) (small, bounded updates) / (`request_upload`) (validated staged upload path, never arbitrary URL fetch)
  - (`validate_game`), (`build_revision`), (`get_build_status`), (`get_preview_link`)
  - (`share_game_with_friend`), (`submit_for_public_review`) (explicit, audited owner intent)
- Every mutation checks actor scope and server-derived ownership, validates file/path/extension/type/count/total-byte ceilings and request idempotency. Don't expose raw object-store credentials or privileged database secrets.
- **Content ingestion is distinct from runtime:** AI agents generate code and assets, Slopboy *hosts* and builds only after safe validation. Build workers need OS/process isolation and resource limits. A KAPLAY iframe spike is not evidence of safe public arbitrary-code hosting.
- OAuth acceptance gate: actual OpenAI plugin and Claude connector compatibility, protected resource metadata, authorization server discovery, PKCE S256, token audience/resource and refresh/revoke, client registration (CIMD/DCR where supported), user consent, failure tests, no token exposure in client logs. **Neon Managed Better Auth may supply user login, but MCP-compliant OAuth authorization-server behavior is NOT assumed without testing it.**
- Start with custom/private MCP connections for hands-on testing; publishing in the ChatGPT plugin directory has an additional organization verification, review and approval process. Never promise automatic public distribution.

## Database / permissions shape

Entities from ADR-002 still apply, plus:

- (`oauth_clients`), (`oauth_grants`), (`linked_integrations`) or equivalent managed-Auth constructs: consent, scopes, client identity, token revocation (never store plaintext bearer tokens).
- (`game_files`), (`build_jobs`), (`game_revisions`), (`review_requests`), (`moderation_events`), (`audit_log`).
- (`friend_grants`) with creator-controlled invitation and revocation; private listings and builds are inaccessible to strangers.
- (`game_sessions`) / aggregated analytics counters with idempotency/deduplication; (`ratings`) (one active rating per user/game, edits allowed) and (`comments`) with reports/moderation. Never claim playtime/achievements measured in untrusted game JS are anti-cheat authoritative.
- (`user_roles`) managed by server-only authorization for moderators/admins; every admin mutation has a reason and audit record.
- Game IDs and revision IDs are immutable UUIDs; release visibility is stateful, not a boolean derived from a chat completion.

## Hosting: Render vs Vercel — decision deferred to performance/cost acceptance

**Verified current public docs (2026-11-08):**
- Render supports full Next.js Node web services and persistent HTTP endpoints. Its **free** web service spins down after 15 min without inbound messages and can take around 1 minute to wake. Free Render Postgres expires after 30 days. These are unacceptable as reliable production MCP/auth endpoints.
- Render's paid entry-level web service is currently **$7/month, 0.5 CPU / 512 MiB RAM**, plus bandwidth/other services. Render Hobby workspace itself can remain $0; compute is extra. Avoid relying on 512 MiB for heavy AI-generated game builds.
- Vercel's Hobby tier is limited to **personal or noncommercial use**. It is suitable for prototype preview, not an unrestricted SaaS with creator revenue, ads or subscriptions.
- Both can serve Next.js HTTP APIs. Render is attractive for a stable long-running MCP server and jobs; Vercel excels at the current preview/static frontend. Whether to combine them on one Render service or separate frontend/API is a trade-off, not a necessity.
- **Decision gate:** test full Next.js deployment + OAuth connector from ChatGPT and Claude, 95th percentile response latency after idle, real browser gameplay, build queue/resource isolation, mobile performance, egress/store quotas, deployment rollbacks and minimum sustainable operating cost. Keep the current Vercel preview until a candidate proves better.
- Avoid an unaffordable 24/7 service while the requirement remains truly $0. Do not silently deploy a paid instance. If testing Render Free, label it **experimental only**.

## Priority order (replaces ADR-002 Studio-first batch)

1. **Canonical routes + ID migration:** V2 UI becomes root; V1 under (`/legacy`); server-issued UUID IDs, preserve legacy demo/local saves.
2. **Auth + real persisted user/library/game drafts:** one user can play and own drafts; explicit permissions and real local-only/offline behavior.
3. **Remote MCP + OAuth first vertical slice:** connect **ChatGPT and Claude** with one tested account; create draft through chat, submit files, validate/build and make private game appear immediately in owner's My Games.
4. **Safe preview / share controls:** engine-agnostic cartridge format, isolated execution, friend permissions, build revisions and auditability.
5. **Player/Creator Dashboard + basic Admin Dashboard:** manage submissions, private/public statuses, analytics and moderation; defer complex visual polish.
6. **Cloud saves and public review flow:** real quota/conflict handling, approval gate, private artifact ACL and ratings/comments.
7. **Public plugin directory submission and scale:** real client review/verification, rate limits, abuse monitoring, retention/account deletion; then progressive production launch.

**Do not merge PR #14 unchanged.** The route promotion and true UUID dynamic backend gates from ADR-002 still apply. This document corrects the critical omission: remote agent creation is the product's primary write path, and web Studio is not in launch scope.

## Source references (checked 2026-11-08)

- OpenAI Plugin OAuth: https://developers.openai.com/plugins/build/auth
- OpenAI MCP plugin deployment/review: https://developers.openai.com/plugins/deploy/submission
- Claude custom connector: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Render Free terms: https://render.com/docs/free
- Render Next.js runtime: https://render.com/docs/deploy-nextjs-app
- Render current pricing: https://render.com/pricing
- Vercel Hobby ToS: https://vercel.com/legal/terms
