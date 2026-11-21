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
