# Slopboy 1000 — Hardware Profile Draft

**Status:** PROVISIONAL design target; verify budgets on mobile hardware before freezing v1. Slopboy 1000 is the first test device, not a template every future model must copy.

## Proposed capabilities

| Capability | Preliminary target |
| --- | --- |
| Hardware ID | `slopboy-1000` |
| Profile version | `0.1.0` |
| Logical screen | 160 × 144 pixels |
| Pixel colors | Four indexed shades; optional host-side LCD palettes |
| Target refresh | 60 logical updates/second, without assuming every device achieves it |
| Controls | D-pad, A, B, Start, Select |
| Audio | Up to four synthesized voices; capability-limited API |
| Cartridge compressed size | <= 512 KiB |
| Maximum total extracted files | <= 2 MiB |
| Compiled game code | <= 64 KiB |
| Persistent game save | <= 8 KiB per cartridge/profile |
| Network and DOM | Not available to cartridge |
| External dependencies/assets | Not allowed at runtime |

Numbers are hypotheses, **not implementation claims**. A developer should not claim hardware compatibility until the validator and runtime enforce these limits.

## Hardware interface sketch

```json
{
  "id": "slopboy-1000",
  "version": "0.1.0",
  "display": { "width": 160, "height": 144, "indexedColors": 4 },
  "input": { "dpad": true, "faceButtons": ["A", "B"], "systemButtons": ["START", "SELECT"] },
  "audio": { "voices": 4 },
  "budgets": { "compressedBytes": 524288, "extractedBytes": 2097152, "codeBytes": 65536, "saveBytes": 8192 }
}
```

The real typed schema must be defined in code once, validated by schema tests, and consumed consistently by SDK, build tool, runtime, UI and catalog.

## Display rules

- Index values 0–3 only; palettes are a host-side display treatment, not additional game colors.
- Hardware logical framebuffer does **not** resize when the web page or shell resizes.
- Console Mode and Game Mode use the same framebuffer and same running game state.
- Nearest-neighbor scaling; letterbox/pillarbox instead of stretching. Integer scale where practical.
- Presentation effects, if any, cannot let game code bypass the declared logical capabilities.

## Initial acceptance tests

1. Refuse a five-color output request.
2. Reject missing target version and incorrect hardware IDs.
3. Refuse oversized compressed, extracted or code payloads; reject path traversal and archive bombs.
4. Reject unsupported inputs or capabilities in declarations and SDK usage.
5. Enforce save quotas and reject restricted network/DOM access.
6. Run sample game with both keyboard and responsive touch controls.
7. Preserve aspect ratio and game state switching between shell and fullscreen modes.
8. Confirm low-end mobile performance with repeatable, recorded test fixtures (thresholds to be selected after measurement).

**Not yet decided:** precise sprite/tile/palette memory allocation, frame-time policy, analog future hardware mapping, synthesized voice specification, and final cartridge file encoding.
