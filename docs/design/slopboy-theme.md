# Slopboy V2 — HeroUI v3 theme contract

**Status:** Active design system for all modern routes on the Sprint 2 review stack; V1 /legacy is separate.

## Intent

Slopboy should feel like a little world of imaginary retro handhelds, not a generic developer dashboard. Reuse the product's existing midnight-petrol, LCD-lime and sage palette. Keep the UI calm, readable, compact and tactile without turning every surface into a pixel-art texture.

**Single source of truth:** [`apps/web/app/v2/slopboy-theme.css`](../../apps/web/app/v2/slopboy-theme.css), imported after `@heroui/styles` in `apps/web/app/v2/heroui.css`. All colors are **HeroUI v3 semantic CSS variables**. HeroUI's calculated variants and Tailwind `bg-surface`, `text-muted`, `bg-accent`, `border-border` utilities derive from these variables; do not paste these values into individual components.

## Palette

| Purpose | Dark | Light | Theme variables |
| --- | --- | --- | --- |
| App background | `#0d1719` midnight petrol | `#f4f0e5` cream | `--background` |
| Surface / cards | `#172a2d` | `#fffdf7` | `--surface` |
| Primary text | `#edf4e5` | `#304744` | `--foreground` |
| Secondary text | `#adbfba` | `#526d64` | `--muted` |
| Primary action | `#d1e99d` LCD lime | `#496f45` deep sage | `--accent` |
| Text on primary action | `#263d34` | `#fffdf5` | `--accent-foreground` |
| Card/element borders | `#405b56` | `#c6d0c3` | `--border` |
| Input backgrounds | `#203537` | `#f6f8f1` | `--field-background` |

Supporting semantic roles include `--default`, `--overlay`, `--success`, `--warning`, `--danger`, `--focus`, `--link`, `--separator` plus foreground pairs. **Status roles convey status, not branding**; do not color successful actions warning-yellow or errors lime-green.

## Design dimensions

- Base corner radius: `--radius: 0.875rem`; field radius: `--field-radius: 0.75rem`. Card, Button and Input components use native HeroUI rounding; no per-component forced `border-radius: ... !important`.
- Subtle surface and overlay shadows are shared through `--surface-shadow` and `--overlay-shadow`; neither the dark theme nor the light theme should fake a raised glass panel by default.
- Modern typography: system UI sans for legible controls, restrained monospaced labels for hardware serial numbers and tiny informational badges. Avoid importing fonts just for a theme.
- Both modes are available via the **existing** `slopboy:v2:theme` setting. The single `V2AppShell` applies `light`/`dark` plus `data-theme` on the modern-route wrapper. Avoid introducing another theme provider or duplicate light/dark toggle.
- Portaled HeroUI drawers receive their own `light`/`dark` class; some compound components do not forward custom `data-theme` props, so the class is the verified CSS selector. Portals do not inherit the V2 wrapper tokens when attached to `document.body`.
- Use semantic hover/focus states from HeroUI. Preserve sufficient contrast in light/dark. Keep keyboard focus clearly visible.

## Component ownership

Use native `@heroui/react` v3 `Button`, `Card`, `TextField`, `Label`, `Input`, `Alert`, `Drawer`, etc. Components should not have dedicated ad-hoc blue/gray/green skins. Tailwind layout utilities are fine; reimplementing form accessibility, focus rings, overlays, shadows or native form fields is not.

Shared header/footer are custom *structure* but their colors are token-based. Handheld chassis, cartridge illustrations, pixel canvases, display phosphor/filters and logical game palettes are deliberate exceptions: **changing site theme never changes a game's limited-color hardware output or runtime session**.

## Verification

`pnpm security:v2-browser` checks computed semantic colors and radius in dark/light, portal drawer inheritance, existing keyboard/gameplay behavior, and persistent palette across library navigation. `pnpm security:auth-routes`, `pnpm typecheck`, `pnpm lint`, `pnpm build` must pass too.

Official references: [HeroUI Colors](https://heroui.com/en/docs/react/getting-started/colors), [HeroUI Theming](https://heroui.com/en/docs/react/getting-started/theming). Future agents must update this contract and the central theme file together for deliberate design-system changes.
