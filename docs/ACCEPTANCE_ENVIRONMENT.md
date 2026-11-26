# Batch 4 — Environmental objects acceptance

**Level:** `public/levels/acceptance-environment.json`  
**Academy:** lesson 24 (`environmental-objects`)  
**Date:** 2026-11-26  
**Baseline:** Batch 1 HDRI + Batch 2 materials + Batch 3 lights  
**Hardware:** NVIDIA GeForce RTX 5080 (ANGLE D3D11), Cursor/Electron Chromium  
**Viewport (single pane):** 1719×1362 (canvas), CSS ~1146×908 @ 1.5 DPR

## Demonstrated

| Feature | Actor |
| --- | --- |
| Water2 pool (flow + reflection/refraction) | Pool Water |
| Water.js basin | Fountain Basin |
| Reflector mirror | Wall Mirror |
| Refractor glass | Glass Panel |
| Decal on brush | Stain Decal → Decal Pillar |
| Decal on static mesh | Sign Decal → Decal Mesh |
| Authored billboard (Sprite) | Billboard Sign |
| Placeable Sky (suppresses World Sky mesh) | Placeable Sky |
| HDRI / fog / materials / lighting | scene + Key Light + Batch 2 mats |

## Water normals (local CC0 procedural)

| Id | Role |
| --- | --- |
| `tex_water_normal_0` | Water2 / Water normal A |
| `tex_water_normal_1` | Water2 normal B |

## Browser checklist

| Check | Result |
| --- | --- |
| Water2 / Water render in perspective | Pass |
| Mirror + refractor from moving camera | Pass |
| Decals on brush + static mesh | Pass |
| Billboard faces camera; fog optional | Pass |
| Placeable Sky visible; World Sky suppressed | Pass |
| Placeable Sky delete restores HDRI (`backgroundType=environment`) | Pass |
| Ortho panes use proxy planes (no RT) | Pass |
| Multi-pane perspective isolation (Fog/PP per pane) | Pass |
| Layouts: 1 / 2 side / 2 stack / 3 / 4 + Max/Restore | Pass |
| Save/reload + legacy levels without Environment | Pass |
| Scrub → one Undo entry | Pass |
| Duplicate / delete dispose (owned RTs) | Pass |
| Place/delete water2 ×3 — no texture accumulation | Pass |
| Play/Stop; viewport/scissor restored; `envPassDepth` idle = 0 | Pass |

### Screenshots

`docs/acceptance-environment/` (captured 2026-11-26 from live editor):

1. `01-water-mirror-lineup.png` — water reflection + wall mirror + glass  
2. `02-decals-billboard.png` — brush/mesh decals + billboard, Fog+PP on  
3. `03-placeable-sky.png` — placeable sky dome with scene props  

## Performance (editor, Fog+PP on)

Single perspective pane @ 1719×1362 (vsync-capped ~60 FPS / ~16.7 ms median):

| Setup | FPS | Frame ms (med / p95) | Draw calls | Textures |
| --- | --- | --- | --- | --- |
| Baseline (env RT actors disabled) | 60 | 16.7 / 16.8 | 43 | 44 |
| Water2 only | 62 | 16.7 / 16.8 | 41 | 43 |
| Water only | 60 | 16.7 / 16.8 | 41 | 43 |
| Reflector only | 61 | 16.7 / 16.8 | 41 | 43 |
| Refractor only | 61 | 16.7 / 16.8 | 42 | 43 |
| Combined water2 + mirror + refractor | 61 | 16.7 / 16.8 | 43 | 43 |
| Mirror quality low | 60 | 16.6 / 16.8 | 42 | 43 |
| Mirror quality medium | 60 | 16.7 / 16.8 | 43 | 43 |
| Mirror quality high | 60 | 16.7 / 16.8 | 42 | 43 |
| Dual perspective + PP | 31* | 16.7 / 16.8 | 59 | 57 |

\*Dual-pane sample reports ~half the frame counter rate while still vsync-limited per pane; draw calls rise as expected.

| Setup | Notes |
| --- | --- |
| Water2 @ 512 | One Reflector + one Refractor RT update per frame while visible |
| Reflector @ 512 | One virtual-camera scene pass |
| Combined | Nested env passes blocked (`envPassDepth`); other mirrors hidden during RT |
| Ortho panes | Proxies only — no RT cost; Fog/PP released on ortho chrome |

## Resource lifecycle

| Check | Evidence |
| --- | --- |
| Place water2 → delete ×3 | textures 54→56→54 each cycle; no progressive leak |
| Duplicate Wall Mirror → delete copy | textures 58→57, geometries 52→49 after dispose |
| Placeable Sky delete | `_placeableSkyActive=false`; HDRI texture background restored |
| Play → Stop | mode edit restored; GL viewport full canvas; scissorTest false |
| Nested recursion | `envPassDepth` idle = 0 |

## Native / documented limits

| Item | Note |
| --- | --- |
| Nested mirror recursion | Blocked — secondary Reflector/Refractor/Water hidden during env RT pass |
| Ortho | Perspective-only RT; colored proxy planes in ortho |
| Decal corners | Official DecalGeometry distortion on sharp edges |
| Placeable vs World Sky | Placeable wins while present; `world.scene.sky` JSON kept; with `backgroundType=environment`, delete restores HDRI (World Sky mesh stays off) |
| GroundedSkybox placeable | Not in Batch 4 (world-only) |
| Gameplay water | No swimming / buoyancy |

## Gates

| Gate | Result |
| --- | --- |
| Unit (Batch 4 + viewport + world env) | Pass — 32 tests |
| Lint | Pass (`oxlint`; pre-existing warnings only) |
| Build | Pass (`vite build`) |
