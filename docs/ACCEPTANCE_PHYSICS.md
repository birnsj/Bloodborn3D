# Phase 2F.7F — Physics and Collision Hardening

## Baseline

| Item | Value |
| --- | --- |
| Main tip | `45779d3` |
| Tests before | **598 / 598** |
| Scope | Fixed-timestep sim, collision/render agreement, StaticMesh bounds colliders |

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

### 3. Imported mesh collision (M10)

| Before | After |
| --- | --- |
| Hardcoded 1 m cube (`0.5³` half-extents) | Asset `meta.boundingBoxMeters` via `assetResolver.getMeshBoundsMeters` |
| Non-collidable / `collisionType: 'none'` | Still skipped |
| Missing bounds | Fallback to 1 m cube (legacy-safe) |

Actor world scale still multiplies half-extents in `_addBoxCollider`.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **605 / 605** (+7 in `phase2f7fPhysics.test.js`) |
| Lint (`oxlint`) | exit 0 (warnings only) |
| Production build | Pass |
| Play/Stop / hidden-tab | Accumulator reset; existing lifecycle tests still pass |

### Browser (manual)

1. Play in `test-room.json` — movement speed / jump feel unchanged.
2. Hide tab ~10s during Play — resume without a physics jump.
3. Walk through a wall with a door opening — pass through the void, collide with jambs.
4. Place a non-1 m mesh with `collisionType: box` — collision matches asset bounds × actor scale.

## Remaining limitations

- World Solid gameplay collision remains full carved AABB solids (not face-clipped patches).
- Non-uniform scale + rotation (hierarchy shear) can still diverge for AABB cuboids (spec R10); not addressed here.
- Mitered walls **with** openings fall back to AABB solids (shared render+physics limitation).
- Mesh collision is still primitive box only (no convex hull / trimesh).

Phase **2F.7G+** not started (if reserved).
