# Owner-approved HeroUI v3 — UI-only promotion

Approved Slopboy styling, including dark background `#16282d`, native HeroUI v3 components, warm cream Light surfaces, border-first Cards, and shadow-free headers.

- Semantic colors and fonts: `apps/web/app/v2/slopboy-theme.css`.
- Shared BEM component styling: `apps/web/app/v2/slopboy-components.css`.
- Canonical modern pages opt in using `.sb-heroui-live`; portal Drawers also opt in.
- `/labs/design-system` deliberately keeps the historical left column unstyled by the new component treatment, while the approved right column uses `.sb-heroui-preview`.
- The theme imports Outfit with next/font; fonts are bundled for offline access. Game display palettes and runtime are independent.
- This UI-only branch is built from the integrated KAPLAY/MCP/Postgres baseline PR #78. It excludes all Neon Auth logic, login UI, account actions and backend changes.
- Live email/password and account isolation acceptance remain pending on Draft PR #79. Do not ship backend or claim sign-in works by merging this PR.
- Promotion to Production still requires release acceptance and safe deployment/rollback.
