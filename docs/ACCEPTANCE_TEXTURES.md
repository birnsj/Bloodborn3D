# Batch 8 — Textures acceptance

**Baseline:** `c20031a` (1,085 tests) + Batches 1–7.1 / performance stabilization preserved  
**Level:** `public/levels/acceptance-textures.json`  
**Academy:** lesson 29 (`textures`)  
**Date:** 2026-11-26  
**Screenshots:** `docs/acceptance-textures/` (browser captures when available)

## Architecture (layers)

| Layer | Owner | Role |
| --- | --- | --- |
| Asset `meta.sampler` / `meta.transform` | Texture asset | Wrap, filter, mipmaps, anisotropy, colorSpace, repeat/offset/rotation/center/flipY |
| Material `uvScale` / `uvOffset` / `uvRotation` | Material definition | Layer 2 — multiplies once on top of asset transform |
| Material `mapChannels` | Material definition | Per-slot `Texture.channel` (UV0–UV3); AO/lightMap default UV1 |
| Surface / face UV | Brush / surface edit | Layer 1 — unchanged by Batch 8 |
| Geometry UVs | Mesh / brush / GLB | Layer 0 — preserved |

Sampling is **asset-id scoped**. Materials that share one texture id share wrap/filter. Independent sampling requires separate texture assets (Batch 8 ships `tex_batch8_wood_nearest` / `tex_batch8_wood_linear` pointing at the same PNG with different sampler meta).

Owned texture clones per material prevent Layer-2 UV from mutating the shared GPU cache. Preview drafts clone similarly until Apply.

## Level contents

| Actor | Purpose |
| --- | --- |
| Aniso Floor (`mat_batch8_tiled`) | High anisotropy + asset/material transform |
| Nearest / Linear Demo walls | Mag/min nearest vs linear+mip |
| Shared Image A / B | Same `tex_hall_stone`, different material UV |
| KTX2 Panel | Compressed fixture decode |
| Door Cut (subtract) | Subtractive brush regression |
| Furniture Cube + Imported Mesh | Overrides + GLB materials |
| Key/Fill lights + Player Start | Lit playthrough |

## Checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| Nearest vs linear filtering | **Passed** | Distinct texture assets + unit apply |
| Mipmap behavior at distance / oblique | **Passed** (visual) | Linear wall + aniso floor |
| Anisotropic filtering | **Passed** | Cap by renderer max; meta anisotropy |
| Wrap clamp / repeat / mirrored | **Passed** | Inspector + `applyTextureSampling` |
| Repeat / offset / rotation | **Passed** | Asset transform + Layer-2 compose once |
| Color space color vs data maps | **Passed** | `auto` → sRGB color / NoColorSpace data |
| Independent settings sharing source image | **Passed** | Separate asset ids OR material UV only |
| UV channel selection (multi-UV) | **Passed** (UI + bind) | Materials form; imported multi-UV mesh visual **Unverified** if GLB lacks uv1 |
| Missing UV channel warnings | **Passed** | `warnMissingUvChannel` unit + bind-time |
| World-aligned / surface UV | **Passed** | Unchanged Layer 1 |
| Compressed KTX2 | **Passed** | Fixture + decode path; generateMipmaps/flipY constrained |
| Prefab / material override persistence | **Passed** (schema) | Overrides + material JSON; full prefab round-trip **Unverified** in browser this run |
| Additive / subtractive brush | **Passed** | Subtract door in level |
| Undo/redo + save/reload | **Passed** (API) | Texture meta patch + material draft history; interactive undo entry **Passed** for material scrub; texture Apply is one discrete save |
| Perspective / orthographic | **Passed** | No Batch 8 viewport fork |
| Play/Stop parity | **Passed** | Same materialFactory path |
| No unbounded cache growth on draft edits | **Passed** | Preview uses identity cache key + owned clones |
| VideoTexture authoring | **Deferred** | Inventory P2 |
| KTX2 encode | **Deferred** | Batch 7 residual |
| Baked lightmap system | **Deferred** | Channel UI only |
| Browser screenshot set | **Passed** | `docs/acceptance-textures/01–03` |
| GPU texture count (level load) | **Passed** | `renderer.info.memory.textures = 45` after load (single pane) |
| Draw calls / tris (reset snapshot) | **Passed** | calls 639 · triangles 12,338 (includes helpers/overlays) |
| FPS median under automation | **Unverified** | `measureFrameTimes` returned empty samples in CDP tab (throttle); interactive FPS not blocked |

## Measured / tooling

- Unit tests: `src/tests/batch8Textures.test.js` (sampling, UV channels, acceptance artifacts). Full suite **1,094** passing.
- Browser: loaded `acceptance-textures.json` (13 actors); Texture Inspector verified for nearest wood + KTX2 (generateMipmaps/flipY disabled).
- GPU memory estimate: `estimateTextureGpuBytes` — clearly labeled estimate (RGBA8×4/3 or compressed payload×1.05). 2048² RGBA8+mips ≈ **21.33 MB** est. for Hall wood albedo.
- Texture cache key: `textureSamplerCacheKey(meta)` isolates divergent samplers; Apply → `clearTextureCache()`. Preview drafts use identity cache key + owned clones.

## Genuine limitations

1. Sampling is not a per-material override — duplicate the texture asset for divergent filters.
2. Compressed textures cannot generate mipmaps or reliably flipY after upload.
3. Anisotropy is capped by `renderer.capabilities.getMaxAnisotropy()`.
4. UV channel selection does not create or bake UV sets.
5. VideoTexture and KTX2 encode remain out of scope.

## Automated gates

- Full Vitest suite, lint, production build (see commit).
- Academy lesson 29 registered.
- Capability inventory Batch 8 marked Complete (VideoTexture Deferred).
