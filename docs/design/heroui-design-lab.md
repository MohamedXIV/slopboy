# Slopboy / HeroUI Design Lab — review contract

## Base and isolation

This is a non-destructive visual experiment on branch feat/heroui-design-lab, based on
PR #79 at commit 4298d4204f6b0a02d56f8211c826c5eb505154d2.
PR #79, main, and production must not be changed by this experiment.

Review URL: /labs/design-system (under existing modern V2 AppShell).
- LEFT: real HeroUI v3 components with the current production-candidate theme.
- RIGHT: the exact same HeroUI components with proposed local scoped styles.
- Both columns stay interactive; dark/light uses the existing global toggle.
- The source for the experiment is components/design/design-lab.css only.
- No product component, global theme, auth behavior, or hardware runtime is modified.

## What we are preserving

- Existing Midnight Petrol (#0d1719), LCD Lime (#d1e99d), Sage (#496f45),
  Cream (#f4f0e5), existing Outfit font and technical monospace labels.
- Existing modern V2 header, navigation, games, device shells, cartridge art.
- HeroUI v3 owns UI behavior and accessibility: Button, Input/TextField,
  Card, Tabs, Chip, Alert, Checkbox, Spinner, and Drawer.
- Light/dark remains the current local preference; no new theme manager.

## What this first review covers

- A component-by-component side-by-side comparison in a responsive lab.
- States: emphasis/variant, field focus and typing, selected tabs/checkboxes,
  informative alerts, loading, and portal drawers.
- Soft rounded/tactile auth-inspired direction in the right column only.
- All sample actions are non-privileged demos. No fake sign-in or enabled registration.

## Explicit non-goals

- Do not copy the supplied HTML/Tailwind prototype into the product.
- Do not change live Sign-in, Dashboard, Library or the Next root layout.
- Do not add nonfunctional Passkey/ROM Dock or registration controls.
- Do not replace game-specific chassis/CSS/Canvas visuals with UI primitives.
- Do not force every Card to be a decorative handheld.

## Review/acceptance gate

1. Confirm the lab renders native HeroUI controls in both columns.
2. Desktop and narrow mobile layouts, dark and light, remain readable.
3. Buttons, tabs, checkbox, field focus and drawer work with mouse and keyboard.
4. No layout/color/behavior changes on existing Sign-in, Library or Play routes.
5. Only after visual approval, extract the approved subset into canonical
   apps/web/app/v2/slopboy-theme.css (or an imported component theme).
   Keep any auth-specific composition in a separate AuthPanel component.
6. Follow-up: extend the review with remaining HeroUI primitives before
   adopting them in production; this first page covers the core 9 families.

This document is a deliberate experiment scope, not a global design-system change.


## Experiment 002 — November 11, 2026

User review changes, preview-only:
- Light proposed panels are **warm white** (`#fffdf7`), not a darker cream fill.
- Lab **dark header only** replaces the bottom border with a soft drop shadow.
  This is explicitly scoped by `:has(.sb-design-lab)`; other app routes
  must keep existing navigation styling.
- Introduce a small **coral** device-face-button accent (`#c77361` light,
  `#dc917b` dark) for optional accents only: demonstration secondary action,
  edition Chip and proposed label dot. Primary actions remain Sage/LCD Lime.
- Proposed cards can be switched between **Border only** and **Soft shadow**
  through real HeroUI Buttons, with state stored only in the lab component.
- Current/baseline column is unchanged; dark/light state continues to use the
  existing V2 theme toggle. No production decision has been made.

Acceptance: white/near-white proposed light panel, dark floating header
on this route only, visible coral use in native HeroUI demos, live
elevation toggle, and no visual change to actual Library/Sign-in/Play.
