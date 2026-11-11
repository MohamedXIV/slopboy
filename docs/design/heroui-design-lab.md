# Slopboy / HeroUI Design Lab — review contract

## Base and isolation

This is a non-destructive visual experiment on branch feat/heroui-design-lab, based on
PR #79 at commit 4298d4204f6b0a02d56f8211c826c5eb505154d2.
PR #79, main, and production must not be changed by this experiment.

Review URL: /labs/design-system (under existing modern V2 AppShell).
- LEFT: real HeroUI v3 components with the current production-candidate theme.
- RIGHT: the exact same HeroUI components with proposed local scoped styles.
- Both columns stay interactive; dark/light uses the existing global toggle.
- Shared opt-in HeroUI BEM rules live in app/v2/slopboy-components-preview.css; gallery and composition CSS remains in components/design/*.css.
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

## Experiment 003 — border-first direction

The owner has chosen **borders instead of card drop shadows**. Remove the
border/shadow toggle, keep normal outlined surfaces and keep light cards warm
white. A prior header elevation was tried and then **rejected**: the accepted header has a subtle bottom border with no drop shadow.

Header comparison is deliberately page-scoped:
- Light: existing warm-white header surface and subtle bottom border, no shadow.
- Dark: existing dark header surface, bottom border `#272b2a`, no shadow.
- Dark lab body canvas is lighter petrol `#16282d` rather than `#0d1719`;
  this is a lab-only candidate, not a global change.
- Coral is still a secondary, sparing hardware-inspired accent.

Do not change the original current/baseline column, the actual `main`/PR #79
theme tokens or the live product routes. The change is not approved for
global adoption yet.


## Batch 2 — extended component gallery and composed authentication

**Status:** Design Lab only, Draft PR #80; not a production adoption.

Nine additional side-by-side HeroUI v3 examples: Select/ListBox, TextArea,
Switch, RadioGroup, Modal, Popover, Dropdown, Tooltip, and TextField/FieldError
validation. Both columns use native HeroUI behavior and retain keyboard,
focus, selected, disabled and invalid states.

Below the gallery, a composed authentication preview compares the CURRENT
sign-in structure against the proposed pocket-hardware aesthetic. The user
can select desktop or 375px mobile composition without resizing the browser.
The page inherits the existing Light/Dark toggle and respects the agreed
cream/white light cards, border-only card design, shadow-free shared header,
lighter petrol dark Lab background and restrained coral accents.

**Safety and review constraints:**
- The preview uses native HeroUI Card, Form, Button, TextField, Input,
  Label, FieldError, Alert and Chip components.
- No authentication client, network calls, account credentials, URL
  navigation, enabled sign-up, passkeys, ROM Dock actions, or real game data.
  Form submission explicitly prevents navigation and shows demo-only feedback.
- Create account remains disabled during the private rollout.
- Generic HeroUI styles live in the opt-in shared preview file; gallery and Auth composition styles stay in dedicated design files.
  Do NOT import them from the canonical live theme or sign-in page yet.
- Continue to protect PR #79, main, production and game runtime from edits.
- Review Light/Dark + Desktop/Mobile and all native interactions before
  deciding what to promote into shared HeroUI tokens.

## Shared HeroUI foundation — pending visual approval

The latest isolated batch consolidates 18 native HeroUI component families using
`apps/web/app/v2/slopboy-components-preview.css`, explicitly opted into via
`.sb-heroui-preview`. Proposed palette, BEM selectors, focus/selected states
and reduced-motion styles now have one reusable source. Auth composition and
two-column Lab layout remain separate. Portaled HeroUI overlays opt in
independently with their correct light/dark classes.

Consolidated review feedback: no header shadow (1px bottom border remains);
proposed frame uses `border:1px solid var(--border)`; no redundant frame
`box-shadow:none`; exact requested Auth heading typography; native full-width
HeroUI Tabs in the auth preview with the create-account option disabled.

The browser smoke covers desktop/mobile tab geometry and disabled semantics,
including dark/mobile, while existing sign-in, library and game checks remain.

**Next gate:** review the new PR #80 Preview in Light/Dark and Desktop/Mobile.
No live theme import or promotion, no production edits, and no automatic PR merge.


### Client-only mounting note

The expanded nine-family gallery uses Next dynamic loading with SSR disabled,
inside the existing client-rendered Design Lab. The original nine-family
comparison continues to SSR normally. This deliberate Lab-only decision avoids
React hydration mismatches from experimental overlay composition, keeps portal
controls client-owned, and does not alter any actual product route. Browser
tests wait for all nine new families and both auth previews to mount and then
verify the real Mobile toggle.


## Approval and shared promotion — November 11, 2026

Owner-approved: dark body `#16282d`, warm-white cards, border-first surfaces,
shadow-free 1px header border, restrained coral and balanced native auth Tabs.
Reusable rules move to the canonical `app/v2/slopboy-components.css` stylesheet;
live modern routes opt in while the old Lab baseline stays isolated. The real
sign-in page now uses the approved composition without changing the auth backend.
All modifications remain on Draft PR #80; no merge or production deployment.
