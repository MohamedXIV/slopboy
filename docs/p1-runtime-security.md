# P1 browser runtime security spike — initial implementation

The host uses a fixed `srcdoc` in an iframe with `sandbox="allow-scripts"` **without** `allow-same-origin`. A restrictive CSP blocks network requests, remote scripts, images, frames and form submission, while allowing a Blob-backed **classic** Worker that imports the cartridge ES module. Creator JS runs in the Worker, **never** in the Next.js application origin. No secret, authenticated identity or privileged capability is passed to it.

The parent-to-iframe protocol uses a random per-session key and verifies `event.source` plus opaque `event.origin === "null"`. The iframe forwards bounded 160x144 indexed frames (checked for length and palette) and short errors; the parent validates frames again. Game hangs trigger a 1500 ms Worker watchdog; users can restart an isolated frame.

## Local Chromium security spike, 2026-10-29

Using headless Chromium and an isolated iframe browser harness, observed:
- Normal 4x4 test game: loaded, ready, correct pixel frame.
- Worker attempting `fetch('https://example.com/anything')`: fetch rejected, no network access.
- Worker checking `typeof document` and `typeof parent`: neither present.
- Invalid fifth pixel shade: runtime rejected with 'Invalid pixel shade'.
- Infinite loop inside `update`: stopped by watchdog with 'Game frame timeout' without freezing parent.

A module-type Worker **failed to load** in this opaque-origin scenario on tested Chromium; switching the Worker bootstrap to `type:'classic'` fixed it while permitting the dynamic Blob module import. The test environment was container-headless Chromium. The same behavior must be reproduced in production Chrome/Android and Firefox/Safari before public untrusted upload is enabled.

## Residual risks and next gates

This is an isolation prototype, **not a certified sandbox**. Browser flaws, memory exhaustion, resource pressure, side channels and untested browser variance remain. The `srcdoc` CSP uses `unsafe-inline` for a constant trusted bootstrap; harden it with a script hash or a dedicated origin later. AST filtering is advisory, not security isolation.

No public upload, global currency, account access, trusted publishing or arbitrary game code is enabled. Need automated browser regression checks on target browsers, Android acceptance, abusive messages and navigation cases, low-end memory/performance testing and content moderation before closing #4 and accepting public creator submissions.

The host only verifies visual frame payloads, not whether a game is honest about achievements. Spendable global currency requires a server-side ledger in P3.
