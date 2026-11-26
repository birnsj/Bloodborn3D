# Batch 4 — Environmental objects acceptance

**Level:** `public/levels/acceptance-environment.json`  
**Academy:** lesson 24 (`environmental-objects`)  
**Date:** 2026-11-26  
**Baseline:** Batch 1 HDRI + Batch 2 materials + Batch 3 lights

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
| Ortho panes use proxy planes (no RT) | Pass |
| Multi-pane perspective isolation | Pass |
| Save/reload + legacy levels without Environment | Pass |
| Scrub → one Undo entry | Pass |
| Duplicate / delete dispose (owned RTs) | Pass |
| Play/Stop | Pass |

### Screenshots

`docs/acceptance-environment/`:

1. `01-water-mirror-lineup.png`  
2. `02-decals-billboard.png`  
3. `03-placeable-sky.png`  

## Performance (measured in editor, single perspective pane)

| Setup | Notes |
| --- | --- |
| Water2 @ 512 | One Reflector + one Refractor RT update per frame while visible |
| Reflector @ 512 | One virtual-camera scene pass |
| Combined water2 + mirror + refractor | Nested env passes blocked (`envPassDepth`); other mirrors hidden during RT |
| Ortho panes | Proxies only — no RT cost |

Exact ms/frame varies by GPU; quality presets (`low`/`medium`/`high`) clamp RT size.

## Native / documented limits

| Item | Note |
| --- | --- |
| Nested mirror recursion | Blocked — secondary Reflector/Refractor/Water hidden during env RT pass |
| Ortho | Perspective-only RT; colored proxy planes in ortho |
| Decal corners | Official DecalGeometry distortion on sharp edges |
| Placeable vs World Sky | Placeable wins while present; `world.scene.sky` JSON kept |
| GroundedSkybox placeable | Not in Batch 4 (world-only) |
| Gameplay water | No swimming / buoyancy |

## Gates

| Gate | Result |
| --- | --- |
| Unit | Pass — 1000 tests (`batch4Environment.test.js`) |
| Lint | Pass (`oxlint`; pre-existing warnings only) |
| Build | Pass (`vite build`) |
