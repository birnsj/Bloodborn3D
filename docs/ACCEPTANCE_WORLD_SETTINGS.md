# Batch 1 — World Settings acceptance

**Level:** `public/levels/acceptance-world-settings.json`  
**Academy:** lesson 21 (`world-environment`) / `public/levels/tutorials/world-environment.json`  
**Date:** 2026-11-26

## Corrections closed (acceptance gaps)

| Gap | Resolution |
| --- | --- |
| Numeric World Settings undo | `ScrubNumberInput` gesture hooks + `HistoryStack.record` / `commitWorldSceneGesture` / `commitWorldRendererGesture`. Live preview uses `undoable: false`; one undo entry on commit (blur/Enter/scrub end). Esc restores via `replace: true`. |
| Minimal stub HDR | Replaced with Poly Haven **studio_small_09** 1k HDR (~1.6 MB), CC0. Asset id unchanged: `tex_batch1_studio`. |

## HDRI license

| Field | Value |
| --- | --- |
| Source | https://polyhaven.com/a/studio_small_09 |
| License | CC0 |
| File | `public/assets/textures/tex_batch1_studio.hdr` (+ `originals/`) |
| Registry name | Poly Haven Studio Small 09 |

## Materials for visual check

| Id | Role |
| --- | --- |
| `mat_batch1_metal` | Chrome pillar (`metalness` 1 / `roughness` 0.12) |
| `mat_batch1_rough` | Matte wall (`metalness` 0 / `roughness` 0.95) |

## Browser visual checklist

Verified in editor against `acceptance-world-settings.json` (Vite `:5181`):

| Check | Result |
| --- | --- |
| Environment lighting on metal / rough | Pass — metal meshes `metalness=1`, rough `0.95`; IBL reflections visible on pillar |
| Independent bg / env intensity & rotation | Pass — World Settings controls; scene.environmentIntensity / background* applied |
| Background blurriness | Pass — enabled for Environment bg; disabled for color/sky |
| Procedural sky | Pass — `WorldSky` present; sky param UI when Background = Procedural sky |
| GroundedSkybox | Pass — `WorldGroundedSkybox` with authored HDR; UI gated without env asset |
| LightProbe on/off | Pass — `WorldLightProbe` when enabled + HDR; cleared on RoomEnvironment |
| RoomEnvironment fallback | Pass — empty env map → studio PMREM; authored PMREM disposed (`_authoredPmrem` false) |
| Perspective / ortho isolation | Pass — one-pane + two-pane layouts; ortho remains editor clear (existing behavior) |
| Post-processing compatibility | Pass — Fog/PP viewport toggles remain pressed with env/sky |
| Editor / Play parity | Pass — Play/Stop; Mode play shows env; World Settings read-only in Play |
| Repeated env switching / GPU dispose | Pass — HDR ↔ RoomEnvironment clears authored PMREM; probe removed |

### Screenshots

Stored under `docs/acceptance-world-settings/`:

1. `01-hdri-env-baseline.png` — authored HDRI + metal pillar  
2. `02-procedural-sky.png` — procedural sky background mode  
3. `03-play-mode-roomenv.png` — Play with RoomEnvironment fallback  

## Numeric undo checklist

| Check | Result |
| --- | --- |
| Live scrub preview | Pass — intermediate values apply without history spam |
| One undo per completed gesture | Pass — `HistoryStack.record` after commit; unit test covers no re-`do()` |
| Direct numeric entry + Enter | Pass — focus begins gesture; blur/Enter commits |
| Esc cancel | Pass — restores snapshot via replace |
| Undo / Redo | Pass — toolbar Undo restores intensity after gesture commit |
| Dirty tracking | Pass — `recordCommand` → `afterWorldMutation` (same path as execute) |
| Save / load | Pass — acceptance level round-trip test + prior Batch 1 serialize suite |

**Note:** Ambient Light intensity still uses direct mutation (pre-existing; no `SetWorldAmbientCommand`). Scene/renderer numeric fields are the Batch 1 correction scope.

## Automated gates

| Gate | Command / result |
| --- | --- |
| Unit | `npm test` (includes `worldEnvironment` scrub-record test) |
| Lint | `npm run lint` |
| Production build | `npm run build` |

## Known / residual

- Grounded skybox checkbox stays checked in data when switching to RoomEnvironment; UI disables the control. Runtime may keep a grounded mesh while studio env is active if `enabled` remains true — visual is soft studio, not a hard failure.
- Ambient numeric fields are not yet on the gesture undo path.
- Ortho panes intentionally do not show authored environment backgrounds (editor clear).
