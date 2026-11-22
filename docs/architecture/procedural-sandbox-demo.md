# Client-only procedural sandbox demo

Open `/labs/procedural` on a local production build, then start the demo.
Move with the arrow keys or on-screen controls. The worker paints an indexed
160 × 144 board with four colors and derives the note from the new location.
Save position stores a small local snapshot. Mute stops the active tone.
Stop disposes the iframe and its worker, clears the display, and closes
the host audio context. Starting again reads the saved position.

The demo executes a fixed repository-owned source module in the existing
opaque-origin iframe and dedicated Worker. The frame has an offline CSP.
The host checks the frame, opaque origin, per-session key and frame structure.
An opt-in audio field allows a single integer note on the response to an
outstanding frame request. The host translates it to a synthesized tone and
controls its lifetime. No media uploads, account session, storage backend,
compiler or build worker are used. Local state is separate from existing
game saves.

The smoke test loads the page and scripts before switching real Chromium
offline. It then starts the sandbox, asserts pixels and input, instruments
real Web Audio oscillator starts and context closure, and checks mute, save,
frame teardown and restart. It does not require the PWA to preload the lab
page for an offline cold navigation.

```sh
pnpm build
node --experimental-strip-types tools/procedural-demo-browser-smoke.ts
```

This is a trusted compatibility prototype, not evidence for running
untrusted uploads or a KAPLAY/WebKit approval. Player preview and publication
remain gated by #4/#33/#45. The worker's note envelope and playback lifecycle
are host constraints, separate from the fantasy device profile. Roll back
by removing the lab and audio opt-in; no data migration is required.

## Cross-engine checks

Linux WebKit 27.2 initially stopped at startup with `blob:null` access errors.
Keeping the worker bootstrap object URL until readiness, error, or stop
resolved the failure without changing the iframe permissions or CSP. Existing
sandbox fixtures are served by a disposable loopback HTTP server, matching the
app's browser context. Chromium and Linux WebKit both passed all six fixtures:
valid frame, forged frame, blocked network operation, invalid palette, forged
readiness, and frame watchdog. The trusted demo also passed after switching
each browser offline, including tone playback, local save and stop/restart.

Install Playwright and its WebKit browser/dependencies in a separate test
environment. Set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs pnpm security:browser
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node --experimental-strip-types tools/procedural-demo-webkit-smoke.mjs
```

Linux WebKit is useful engine-level coverage. Actual Safari/iOS behavior,
broader hostile resource/navigation cases and arbitrary KAPLAY code remain
unverified. The untrusted player Preview stays gated.

The demo host also monitors startup and outstanding-frame deadlines. If the
iframe stops replying, the host removes it, clears the canvas and closes
Web Audio even if the iframe cannot report its own watchdog error. A new
session starts from the prior local snapshot. Both demo smoke tests simulate
missing frame responses in the host test harness and check this recovery.
This does not measure host responsiveness under browser process exhaustion.
