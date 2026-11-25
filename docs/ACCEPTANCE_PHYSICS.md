# Phase 2F.7F — Physics and Collision Hardening

## Baseline

| Item | Value |
| --- | --- |
| Main tip (pre-stabilization) | `3463629` |
| Tests before final gate | **605 / 605** |
| Scope | Fixed-timestep sim, collision/render agreement, StaticMesh bounds+center, player grounding/jump/stair-assist |

## Changes

### 1. Fixed-timestep simulation

| Setting | Value |
| --- | --- |
| Rate | **60 Hz** (`PHYSICS_FIXED_DT = 1/60`) |
| Max catch-up substeps | **5** (`PHYSICS_MAX_SUBSTEPS`) |
| Gravity | unchanged (`-9.81` m/s²) |
| Player moveSpeed / eyeHeight | unchanged |

`PhysicsWorld.step(frameDt)` accumulates frame time and runs zero-or-more fixed Rapier steps. Rendering remains on `requestAnimationFrame`. Accumulator resets on Play start and when a hidden tab resumes (no catch-up spike).

### 2. Collision / render agreement

| Construction | Status |
| --- | --- |
| Additive brushes | Shared `getBrushRenderSolids` → same solids for SceneView + PhysicsWorld |
| Door / window openings | Collider count = solid count (verified) |
| Subtractive cutters | No colliders (verified) |
| World Solid (subtractive) | Collision = carved AABB solids; render = exposed face clips (intentional; see face-clip acceptance) |
| ConvexBrush / stairs / ramps / columns / arches / curved / mitered walls | Existing shared geometry helpers unchanged |
| Parented uniform scale | Cuboid half-extents include world scale (verified) |

No visual geometry pipeline changes.

### 3. Imported mesh collision (M10 + off-center origins)

| Before | After |
| --- | --- |
| Hardcoded 1 m cube (`0.5³` half-extents) | Asset `meta.boundingBoxMeters` via resolver / live glTF cache |
| Origin assumed at mesh root | Collider translated by `boundingBoxCenterMeters` (registry or live load meta) |
| Non-collidable / `collisionType: 'none'` | Still skipped |
| Missing bounds | Fallback to 1 m cube at local origin (legacy-safe) |

Actor world scale still multiplies half-extents and the local center offset in `_addBoxCollider`.

### 4. Player grounding / jump / stair-assist (final stabilization)

| Behavior | Prototype |
| --- | --- |
| Grounding | Downward feet ray (`isPlayerGrounded`); excludes player collider |
| Jump | Space **press edge** + grounded → `vy = 4.5`; hold / key-repeat does not re-fire |
| Stair assist | Only while grounded; forward+down ledge probe (`canStairAssist`, max rise ~0.28 m); tall walls fail the probe |
| Wall climb | Assist gated off when airborne / no short riser — verified no Y climb while holding into walls |

Movement speed, player scale, and camera look controls are unchanged.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **612 / 612** (+7 stabilization in `phase2f7fStabilization.test.js`; stair assist mock updated) |
| Lint (`oxlint`) | exit 0 (warnings only; no new errors) |
| Production build | Pass |
| FPS displacement unit test | ~1 s sim at 30 / 60 / 144 Hz → X travel within 0.15 m |
| Play/Stop / hidden-tab | Accumulator reset on resume; 3× Play/Stop on Gothic restored edit + grounded spawn |

### Browser (actual traversal — 2026-11-25)

Harness via live editor (`localhost:5175`) + `window.__bloodboundViewport.getRuntime()`.

| Level | Result |
| --- | --- |
| `acceptance-gothic-mansion.json` | Grounded spawn; walked ~6.7 m; **wall-hold ΔY = 0**; jump `vy = 4.5`; hold-Space does not re-queue; stair-assist into tall wall = false; 24 colliders; 3× Play/Stop OK |
| `acceptance-convex-brushes.json` | 11 colliders; stand grounded; jump `vy = 4.5` and land grounded; walking off open demo pads falls (no continuous floor — expected showcase layout, not penetration) |
| `acceptance-subtractive.json` | Grounded; walk + jump OK; no wall climb; Stop restores edit |
| `subractive-halls.json` | Grounded; walk + jump OK; no wall climb |
| `subractive.json` | Grounded; walk + jump OK; no wall climb |
| Hidden-tab recovery | `_handleVisibilityChange` resume clears accumulator (`10 → 0`) while Play running |
| Editor after Stop | Mode `edit`, Play re-enabled, geometry/outliner intact |

## Confirmed fixes (this gate)

1. **Repeated jumping** — Space edge trigger + grounded gate (no bunny-hop / hold-repeat).
2. **Unintended climbing** — Stair assist only when grounded and a short forward riser exists; tall walls no longer launch the capsule.
3. **Off-center mesh colliders** — Box colliders use AABB center, not just size; live glTF meta preferred when registry lacks center.
4. **Frame-rate consistency** — Existing 60 Hz fixed step + unit check across 30/60/144 Hz frame delivery.

## Remaining limitations

- World Solid gameplay collision remains full carved AABB solids (not face-clipped patches).
- Non-uniform scale + rotation (hierarchy shear) can still diverge for AABB cuboids (spec R10); not addressed here.
- Mitered walls **with** openings fall back to AABB solids (shared render+physics limitation).
- Mesh collision is still primitive box only (no convex hull / trimesh).
- Convex / open showcase maps can drop the player when walking off pad edges (layout, not a physics redesign item).

Phase **2F.7G** not started.
