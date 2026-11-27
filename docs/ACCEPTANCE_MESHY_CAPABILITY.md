# Acceptance — Meshy Capability Expansion

**Date:** 2026-11-26  
**CLI under test:** meshy-cli 0.8.8  
**Inventory:** [`MESHY_CAPABILITY_INVENTORY.md`](./MESHY_CAPABILITY_INVENTORY.md)

## Goals

1. Expose Image-to-3D generation settings aligned with official API + installed CLI.
2. Capability-gate unavailable options with visible reasons; reject invalid selections.
3. Inspect PBR maps from completed jobs without spending generation credits; preview/import maps.
4. Document additional Meshy operations without implementing character/animation runtimes.
5. Preserve existing estimate → approve → generate gates.

## Results

| Item | Status | Evidence |
| --- | --- | --- |
| Pose Default / T / A | **Pass** | Already present; history shows props-first then Character pose — **not removed** |
| Geometry resolution / remesh / decimation / topology / polycount | **Pass** | UI + `validateImageTo3dSettings` + CLI argv / `--data` |
| Image enhancement / remove lighting | **Pass** | Gated; Smart Topology / n1 / 6-lite rejected with codes |
| Auto size / origin / formats / texture prompt | **Pass** | Validated + forwarded |
| Confirmation lists all settings | **Pass** | `summarizeImageTo3dSettings` in Generate confirm |
| Credit estimate includes ultra | **Pass** | Existing `estimateImageTo3dCredits` ultra +5 |
| Dry-run / mocked argv | **Pass** | Unit tests build argv without network spend |
| PBR maps on completed job | **Pass** | `--all-assets` yielded base_color, normal, metallic, roughness; no emission on meshy-7 |
| Map preview + import | **Pass** | `fetch-texture-maps` / `import-texture-map` API; Results panel |
| Extra ops inventory | **Pass** | Documented; not implemented as editor flows |
| Academy / Help | **Pass** | Lesson 18 + hover help ids |
| No silent param drop | **Pass** | Validation errors for unsupported combos |

## Explicit non-goals (this pass)

- Text-to-3D / multi-image / retexture / standalone remesh / UV / rig / animate / text-to-motion editor UIs
- Animation or character runtime systems
- Spending credits without user confirmation

## Verification commands

```bash
meshy --version
npm test -- --run src/tests/meshyImageTo3d.test.js src/tests/meshyCapabilities.test.js src/tests/hoverHelp.test.js
npm run lint
npm run build
```
