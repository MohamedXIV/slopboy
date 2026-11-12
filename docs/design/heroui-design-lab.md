# Approved HeroUI v3 Design Lab

Visit `/labs/design-system` to compare native HeroUI v3 components side by side.
Left: original baseline. Right: approved shared theme. The login-looking sample
is an **inert, local composition demo** with no authentication calls.

The approved shared theme is now used by modern routes on this isolated branch.
This PR extracts approved visuals from Draft PR #80 without importing the pending
authentication logic from Draft PR #79. CI must verify TypeScript, Next build,
real Chromium responsive/device/legacy routes, sandbox and offline PWA.
Do not close outstanding Auth or public-game safety issues based on these results.
