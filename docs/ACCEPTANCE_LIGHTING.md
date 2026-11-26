# Batch 3 — Lighting acceptance

**Level:** `public/levels/acceptance-lighting.json`  
**Academy:** lesson 23 (`lighting-advanced`)  
**Date:** 2026-11-26  
**Baseline:** Batch 1 HDRI (`tex_batch1_studio`) + Batch 2 materials (standard / metal / clearcoat / glass)

## Demonstrated

| Feature | Actor / asset |
| --- | --- |
| Point + lensflare soft preset | Point Key |
| Spot + gobo + targetActorId + shadows | Spot Gobo → Metal Pillar |
| Directional + shadow camera/bias + target | Directional Sun → Clearcoat |
| Hemisphere sky/ground | Hemisphere Fill |
| RectArea softbox | Rect Area Softbox |
| Ambient actor | Ambient Actor |
| Batch 2 materials under lights | Floor / metal / clearcoat / glass |

## Flare textures (local CC0 procedural)

| Id | Role |
| --- | --- |
| `tex_flare_main` | Soft disc |
| `tex_flare_hex` | Hexagon glint |
| `tex_flare_ring` | Outer ring |
| `tex_batch3_spot_gobo` | Spot projection map |

## Browser checklist

| Check | Result |
| --- | --- |
| All light types render under Batch 1 HDRI | Pass |
| RectArea response on Standard/Physical | Pass |
| Lensflare visible in perspective; hidden in ortho | Pass |
| Spot gobo + aim-at-actor | Pass |
| Shadow bias/radius/camera authorable | Pass |
| Save/reload + legacy light look defaults | Pass |
| Light scrub → one Undo entry | Pass |
| Duplicate / create/delete dispose | Pass |
| Multi-pane + Fog/PP | Pass |
| Play/Stop | Pass |

### Screenshots

`docs/acceptance-lighting/`:

1. `01-light-types-lineup.png`  
2. `02-spot-gobo-flare.png`  
3. `03-light-details-shadows.png`  

## Native / tracked limits

See inventory **Batch 3 residuals**: RectArea no shadows; area lighting primarily for Standard/Physical; World Ambient Undo still pre-existing.

## Gates

| Gate | Result |
| --- | --- |
| Unit | `npm test` (includes `batch3Lighting.test.js`) |
| Lint | `npm run lint` |
| Build | `npm run build` |
