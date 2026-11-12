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

## Home and shared navigation — HeroUI source audit (November 12, 2026)

The original V2 hub had custom CSS imitating Buttons and Cards, while the shared HeroUI styles were already loaded. This is now corrected: **native HeroUI v3 `Link` components with official `buttonVariants`** render semantic Next.js anchors for the CTA, play actions and top navigation (buttons are not semantically appropriate for page navigation). Footer text uses HeroUI `Link` styling. The theme switch remains a native HeroUI `Button` because it changes local state. The home game shelf uses real `Card` with compound Header/Title/Description/Footer.

`V2RouteControls.tsx` uses HeroUI's official `render` prop and `buttonVariants` to integrate Next.js routing. It does not duplicate Button markup, interaction state, focus CSS or color tokens. Home CSS controls layout and decorative **noninteractive** device artwork only; it must never create a second button style. A Chromium smoke test guards rendered classes, semantic links, theme treatment and all three canonical game destinations. No login, auth backend or cartridge execution changes.
