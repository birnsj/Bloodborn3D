# Batch 2 — Materials acceptance

**Level:** `public/levels/acceptance-materials.json`  
**Academy:** lesson 22 (`materials-shading`) / `public/levels/tutorials/materials-shading.json`  
**Date:** 2026-11-26  
**Depends on:** Batch 1 HDRI (`tex_batch1_studio`) for Physical glass/clearcoat response.

## Shading models demonstrated

| Id | Model | Role |
| --- | --- | --- |
| `mat_batch2_standard` | Standard | Stone floor baseline |
| `mat_batch2_metal` | Standard | Polished metal |
| `mat_batch2_glass` | Physical | Transmission / IOR / attenuation |
| `mat_batch2_clearcoat` | Physical | Clearcoat paint |
| `mat_batch2_sheen` | Physical | Sheen cloth |
| `mat_batch2_foliage` | Standard | Alpha map + double-sided + alphaTest |
| `mat_batch2_basic` | Basic | Unlit (toneMapped/fog off) |
| `mat_batch2_toon` | Toon | Gradient map |
| `mat_batch2_matcap` | Matcap | Matcap map |
| `mat_batch1_metal` / `mat_batch1_rough` | Standard (legacy) | Unchanged Batch 1 reference |

## Supporting textures

| Id | Role |
| --- | --- |
| `tex_batch2_foliage_alpha` | Leaf alpha map |
| `tex_batch2_toon_gradient` | Cel gradient LUT |
| `tex_batch2_matcap` | Generated matcap |

## Browser visual checklist

Verified in editor against `acceptance-materials.json` with Batch 1 studio HDRI:

| Check | Result |
| --- | --- |
| Standard metal / stone under HDRI | Pass |
| Physical glass transmission + IOR | Pass |
| Clearcoat lacquer response | Pass |
| Sheen cloth highlight | Pass |
| Foliage alpha / double-sided | Pass |
| Basic unlit ignores lighting | Pass |
| Toon / Matcap shading | Pass |
| Batch 1 chrome/matte unchanged | Pass |
| Materials Workspace model selector + collapsible groups | Pass |
| Draft scrub Undo (one entry per finished numeric) | Pass |
| Duplicate / Save / Cancel / dirty tracking | Pass |
| Multi-viewport + Play/Stop | Pass |
| Post-processing + fog toggles still work with Physical | Pass |

### Screenshots

Stored under `docs/acceptance-materials/`:

1. `01-shading-lineup.png` — all models under HDRI  
2. `02-glass-clearcoat.png` — glass + clearcoat close-up  
3. `03-materials-workspace.png` — Materials Workspace Physical groups  

## Automated gates

| Gate | Command |
| --- | --- |
| Unit | `npm test` (includes `batch2Materials.test.js`) |
| Lint | `npm run lint` |
| Production build | `npm run build` |

## Known / residual

- Light maps need a second UV set on geometry for full effect; brushes currently share UV0 (map still assigns).
- Displacement is authorable; brush tessellation is not increased automatically — relief is subtle on low-poly brushes.
- `alphaToCoverage` requires MSAA-friendly framebuffer settings; harmless when unsupported.
- Material draft Undo is workspace-local (not level `HistoryStack`); intentional for asset editing.
