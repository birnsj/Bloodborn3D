# Meshy Capability Inventory

**Date:** 2026-11-26  
**Installed CLI:** `meshy-cli` **0.8.8** (`meshy --version`)  
**API docs audited:** [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d), [Models](https://docs.meshy.ai/en/api/models), [Remesh](https://docs.meshy.ai/en/api/remesh), [Retexture](https://docs.meshy.ai/en/api/retexture), CLI `meshy resources` / `*-create --help`

BloodBound Image-to-3D uses the **official Meshy CLI** only (no direct REST from the browser). Credentials stay in the CLI store.

---

## Pose selection history

| Finding | Detail |
| --- | --- |
| **Not removed** | `pose_mode` (Default / T-pose / A-pose) is present in `meshyModels.js`, CLI argv (`--pose-mode`), Character UI, spend confirmation, and tests. |
| **Initial commit** | `011a5be` (Meshy import) shipped **Game Prop** Image-to-3D without Character pose — scope was “static environment props”. |
| **Character + pose** | Same era / follow-on added `MESHY_POSE_MODES`, Character category, and `--pose-mode` forwarding. Empty / Default **omits** the flag (API: no pose constraint). CLI also documents `auto`; we map `auto` → omit. |

---

## Image-to-3D — editor vs API vs CLI

| Setting | API | CLI 0.8.8 | BloodBound UI | Notes |
| --- | --- | --- | --- | --- |
| `model_type` | yes | `--model-type` | yes | `standard` \| `smart-topology` |
| `ai_model` | yes | `--ai-model` / `--data` | yes | Deprecated `meshy-7` geometry rejected |
| `geometry_resolution` | yes | `--geometry-resolution` | yes | Ultra 2k/4k → meshy-7.1 only; +5 credits |
| `should_remesh` | yes | `--data` | yes | Ignored / gated off on Smart Topology |
| `topology` | yes | via `--data` on remesh | yes | Triangle-only on Smart Topology |
| `target_polycount` | yes | flag / `--data` | yes | Smart Topology native; Standard needs remesh |
| `decimation_mode` | yes | `--data` | yes | 1–4; overrides polycount; remesh only |
| `save_pre_remeshed_model` | yes | `--data` | yes | Remesh only |
| `should_texture` | yes | `--should-texture` | yes | |
| `texture_model` | yes | `--texture-model` | yes | n1 / 7 / 6-lite (+ meshy-6 with geo 6) |
| `texture_resolution` | yes | `--texture-resolution` | yes | 2k/4k/8k by model |
| `enable_pbr` | yes | `--enable-pbr` | yes | 400 with n1 |
| `texture_prompt` | yes | `--texture-prompt` | yes | Max 800; not with n1 |
| `pose_mode` | yes | `--pose-mode` | Character only | Default omits flag |
| `image_enhancement` | yes | `--image-enhancement` | yes | **400** on Smart Topology / 6-lite |
| `remove_lighting` | yes | `--remove-lighting` | yes | **400** on Smart Topology / n1 / 6-lite |
| `auto_size` | yes | `--data` | yes | |
| `origin_at` | yes | `--data` | yes | `bottom` \| `center` |
| `alpha_thumbnail` | yes | `--data` | yes | |
| `multi_view_thumbnails` | yes | `--data` | yes | Requires `auto_size` |
| `target_formats` | yes | `--target-formats` | yes | GLB required for import |
| `texture_image_url` | yes | via `--data` / URL | **not in UI** | Prefer reference image path |
| `moderation` | yes | `--data` | **not in UI** | Optional content screen |
| `include_objects` | **no** | n/a | Character reminder only | Not an API field |

Capability gates live in `src/dev/meshy/meshyCapabilities.js`. Validation **rejects** unsupported combinations with explicit codes (never silently drops a selected flag).

---

## PBR output (completed jobs, no spend)

Inspected staging task `01a2166f-8302-7268-9294-791fd048bd23` (`enable_pbr: true`, `texture_model: meshy-7`):

| Map | In `texture_urls` | Separate file via `--all-assets` | Notes |
| --- | --- | --- | --- |
| Albedo / base_color | yes | `texture_0_base_color.png` | Also embedded in GLB |
| Normal | yes | `texture_0_normal.png` | |
| Metallic | yes | `texture_0_metallic.png` | |
| Roughness | yes | `texture_0_roughness.png` | |
| Emission | **no** | **no** | Meshy 7 does not emit emission; Meshy 6 texture may below 8K |

Default download previously skipped maps (`reason: embedded_textures`). **Fetch PBR maps** runs `meshy image-to-3d get <id> -o … --all-assets` (asset download only). UI previews + **Import** per map into the texture registry; staging originals retained.

---

## Additional operations (inventory only — not implemented as editor flows)

| Operation | CLI resource | API | BloodBound | Credit note |
| --- | --- | --- | --- | --- |
| Text-to-3D | `text-to-3d` | v2 | **Unsupported in editor** | Preview + refine; pose on preview |
| Multi-image-to-3D | `multi-image-to-3d` | v1 | **Unsupported in editor** | 1–4 views; Ultra 2k geometry |
| Retexture | `retexture` | v1 | **Unsupported in editor** | PBR, resolution, remove-lighting |
| Remesh (standalone) | `remesh` | v1 | **Unsupported in editor** (inline remesh on Image-to-3D Standard only) | topology, polycount, decimation 1–4 |
| UV unwrap | `uv-unwrap` | v1 | **Unsupported in editor** | GLB ≤40k faces |
| Rigging | `rigging` | v1 | **Unsupported in editor** | Humanoid + height-meters; no runtime |
| Animation library | `animate` | v1 | **Unsupported in editor** | action-id(s) / motion-task; no runtime |
| Text-to-Motion | `text-to-motion` | v1 | **Unsupported in editor** | prime/swift; duration 2–10s |
| Convert / resize / print / Creative Lab | various | yes | **Unsupported in editor** | See `meshy resources` |

**CLI-only / local helpers** (not generation APIs): `auth *`, `doctor`, `make`, `api`, `resources`, `delete`, download `-o` / `--all-assets`.

Documented pricing for Image-to-3D mesh+texture remains in `estimateImageTo3dCredits` (mesh 5–20 + texture 10/15 + ultra +5). Other resources: see [Meshy Pricing](https://docs.meshy.ai/en/api/pricing) — not hard-coded here until those flows exist.

---

## Spend / safety

- Paid Image-to-3D still requires estimate → explicit `confirmSpend: true`.
- Confirmation dialog lists **all selected settings** via `summarizeImageTo3dSettings`.
- Fetch PBR maps / import maps do **not** create generation tasks.
- Character/animation **runtimes** are out of scope for this pass.
