# Slopboy 2.0 — Original Device Design Language

**Identity:** imaginary, nostalgic, tactile, cheerful, crafted hardware. Not replicas, not controllers with screens.

## Silhouette rules

All devices are fundamentally rectangular **slabs**; corners may be rounded, chamfered or beveled; proportions can change. Vertical-brick, wide-landscape, compact near-square and rectangular flip/clamshell are allowable families. Slight asymmetric offsets inside the rectangle are fine, but no triangular flared body, winged PS-style grips or copied recognizable commercial outlines.

- **1000:** vertical slab; matte toy-plastic shell; tactile D-pad and two face buttons; Start/Select; small monochrome screen; subtle speaker slots.
- **Wide:** landscape rectangle, centered wide display, four face buttons, optional shoulders, stereo grille. Not PSP or controller silhouette.
- **Pocket:** very small near-square shape with sensible thumb spacing. Smaller is not automatically more powerful.
- **Flip:** folding two-part rectangular geometry. Hinge and interior are original.

Variants are visual shells with consistent placement constraints; users can modify materials, tint, stickers, boot visuals and trim but cannot purchase higher resolution or new physical input via a cosmetic. Limited editions require an entitlement system, never a client-side boolean.

## Display-only fantasy hardware

Games are restricted only by a model's logical display dimensions and indexed color count. Shell geometry and controls express device identity; no fake CPU/RAM/audio-voice/FPS/code/ROM/save limits apply. Operational upload quotas and arbitrary-code security are platform policies, not simulated console specifications.

## Pixel identity

The gameplay framebuffer uses abstract indexed shades. Players may select Moss, Ocean, Amber or Graphite appearance. Tint changes do not change game logic, number of palette indices or screenshot validity. Scanlines and LCD noise are optional presentation overlays; reduced-motion and contrast needs outrank nostalgia.

## UI experience

Inspirations from Gemini's single-file prototype: tactile pressure feedback, colorful shell customization, segmented library and creator flows, pleasant studio displays. Reject in-page pseudo-auth, fake QA, new Function execution and unreviewed network code. The player's main interface should be simple; detailed hashes, RLS/OAuth settings and build diagnostics belong to Creator Studio or administration.

## V2 design lab

Visit `/v2` and `/v2/play/tiny-catcher` in the branch preview. These pages demonstrate one real profile and three playable compatibility games, not all device families or accounts. This document is a design rule, not permission to claim that conceptual hardware is implemented.

## Slopboy 1000 flagship polish (Gemini handoff, 2026-11-06)

The first device's 2D body and screen optics use the reviewed Gemini redesign on the isolated V2 branch: a sculpted rectangular slab, improved tactile control deck, recessed optical well, subdued stage, cartridge navigation, named shell finishes (Studio Bone / Field Moss / Lab Graphite / Signal Clay), and LCD palettes (Classic Moss / Pocket Warm / Terminal Green / Ink & Paper). The WebGL optical pass has multi-tap bloom, pixel-cell relief, curvature and temporal afterglow. These are presentation-only features. Clean / disabled bypass both GPU processing and the CSS glass overlay; virtual hardware still limits only resolution and indexed source colors.

The standalone 3,500-line demo's embedded mock game catalog, direct eval sandbox and fake save system were **not integrated**. The original catalog, strict iframe/Worker execution isolation, validation, navigation routes and save adapter remain authoritative. Any future 3D variant should reuse presentation contracts rather than copy the demo's simulated runtime.
