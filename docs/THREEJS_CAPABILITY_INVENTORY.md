# BloodBound — Native Three.js Capability Inventory

**Audit date:** 2026-11-26 (revised)  
**Installed Three.js:** `0.187.0` (`REVISION = '187'`)  
**Related libraries:** `postprocessing@6.39.6` (pmndrs), `@dimforge/rapier3d-compat@0.21.0`  
**Document type:** Capability inventory + implementation status.  
**Milestone:** Complete the base **geometry and environment authoring** layer.  
**Batch 1 status:** **Implemented** (World Settings environment / sky / background / LightProbe / outputColorSpace / PCFSoft cleanup).  
**Batch 2 status:** **Implemented** (Materials Workspace shading models + full Standard/Physical maps/flags; Basic/Toon/Matcap).  
**Batch 3 status:** **Implemented** (Hemisphere/RectArea/Ambient toolbar, shadow bias/camera, targets, spot map, Lensflare, helpers).  
**Batch 4 status:** **Implemented** (Water/Water2, Reflector, Refractor, Decal, Sprite billboard, placeable Sky).  
**Batch 5 status:** **Implemented** (native PrimitiveMesh + procedural props).  
**Batch 6 status:** **Implemented** (StaticMesh collision / materials / LOD / opt-in InstancedMesh).  
**Batch 7 status:** **Complete** (multi-format import/export, SimplifyModifier, auto LOD, local DRACO/Meshopt/KTX2 decode, Asset Viewer tools). Encode authoring deferred.  
**Batch 7 verification:** final acceptance closure measured DRACO/KTX2 sample decode, FBX/Collada/GLTF/USDZ import, GLTF/USDZ export/reimport, Asset Viewer/editor/Play renders; USDZ `parseAsync` + `USDLoader` defects fixed. See `docs/ACCEPTANCE_ASSET_TOOLS.md`.  
**Batch 7.1 status:** **Complete** — actor + asset pivot editing (`contentOffset`), Asset Viewer interactive pivot gizmo, presets, local/world, undo, acceptance level. See `docs/ACCEPTANCE_PIVOT_EDITING.md`.  
**Pre-Batch 8 performance:** **Stabilized** — multi-viewport shadow reuse, lit display short-circuit, ortho RT skip, profiling median/p95 + `info.reset`. Quad ≥30 FPS target not met (architectural). See `docs/ACCEPTANCE_PERFORMANCE_STABILIZATION.md`.

### Principles

- Native Three.js first → official addons → existing integrated libraries → custom only when necessary.
- Do **not** integrate the Three.js Editor; do **not** introduce WebGPU; do **not** upgrade dependencies.
- Preserve engine-neutral JSON schemas, actor/component architecture, shared scene + single renderer, multi-viewport isolation, pmndrs postprocessing, constructive brushes, atmosphere, and custom gizmos.
- Defer **gameplay / character animation / dialogue / AI characters** — not environment dressing.

### Status legend

| Status | Meaning |
|--------|---------|
| **Complete** | Fully integrated and exposed |
| **Partial** | Integrated but missing properties or fidelity |
| **Missing** | Available natively / via WebGL-compatible addon; not integrated |
| **Internal** | Used internally; no authoring UI required |
| **Redundant** | Custom path that overlaps native — keep unless benefit proven |
| **Incompatible** | Unsupported on current WebGL / single-renderer architecture |
| **Deferred** | Explicitly outside this milestone (gameplay / WebGPU / etc.) |
| **N/A** | No meaningful BloodBound application |

### Complexity / value

- Complexity: **S** small · **M** medium · **L** large  
- Value: **H** / **M** / **L** within the **geometry + environment** milestone

---

## Revision summary (vs first draft)

### Additions

- Environmental object types restored to milestone scope: **Lensflare**, **DecalGeometry**, **Reflector**, **Refractor**, **Water / Water2**, **Sprite / billboards**, **Sky**, **GroundedSkybox**.
- Native **primitive mesh actors** and procedural geometries treated as **additional tools**, not replacements for constructive brushes.
- Full **MeshStandard / MeshPhysical / Basic / Toon / Matcap** property coverage called out.
- **Editor authoring layers** (Architecture, Furniture, Props, Lighting, Collision, Reference, Gameplay) — independent of cells, prefabs, hierarchy, and `THREE.Layers`.
- Asset tools: **SimplifyModifier**, **BufferGeometryUtils**, exporters, DRACO / KTX2 / Meshopt, normals/tangents/bounds diagnostics, centering/pivot.
- Texture asset-level sampling props; StaticMesh render/LOD/instance/batch/collision expansions.
- Backlog reorganized into **nine cohesive batches** with P0–P2 inside each and cross-batch dependencies.

### Omissions corrected

| Earlier mistake | Correction |
|-----------------|------------|
| Lensflare / Water / Reflector / Decals deferred as “gameplay” | **In milestone** — environment authoring |
| Native primitives “N/A” because brushes exist | **Missing** authoring tools — different purpose |
| Sky / GroundedSkybox under-represented | Explicit inventory + Map Settings batch |
| MeshBasic / Toon / Matcap omitted | Materials batch |
| Editor organization / layers omitted | New Batch 9 |
| Asset diagnostics / exporters thin | Batch 7 expanded |
| `GroundedSkybox` listed under `environments/` | Confirmed under `examples/jsm/objects/GroundedSkybox.js` |
| Meshopt as missing loader file | Decoder at `examples/jsm/libs/meshopt_decoder.module.js` (wire via GLTFLoader) |

### Priority changes

- Environment maps, Sky, Hemisphere/RectArea, Physical materials, Decals/Reflector/Water, and native primitives move **into** the active backlog (not deferred).
- WebGPU-only `*Mesh` variants (`SkyMesh`, `WaterMesh`, `LensflareMesh`, …) marked **Incompatible** for this stack — use WebGL classes (`Sky`, `Water`/`Water2`, `Lensflare`).
- Official Three `EffectComposer` remains **N/A** (pmndrs retained).
- Multi-viewport fog/PP isolation remains **Complete** — maintain only; not re-planned.

### Compatibility findings (r187, WebGL)

| API | WebGL path | Notes |
|-----|------------|-------|
| Sky | `objects/Sky.js` | Do not use `SkyMesh` |
| Water | `Water.js` / `Water2.js` | Do not use `WaterMesh` / `Water2Mesh` |
| Lensflare | `Lensflare.js` | Do not use `LensflareMesh` |
| Reflector / Refractor | Own `WebGLRenderTarget` | Per-object RT; resize with viewport/DPR; dispose on actor remove; multi-pane must not assume full-canvas size |
| RectAreaLight | + `RectAreaLightUniformsLib.init()` once | WebGL required |
| HDR / EXR | `HDRLoader`, `EXRLoader` | Prefer `HDRLoader` over deprecated `RGBELoader` |
| DRACO / Basis / Meshopt | `libs/draco`, `libs/basis`, `libs/meshopt_decoder.module.js` | Bundle or CDN decoder assets |
| `PCFSoftShadowMap` | Deprecated → behaves as PCF | Relabel UI |
| `scene.backgroundBlurriness` / `backgroundRotation` | Confirmed on `Scene` | Blur needs texture/env background |
| `environmentIntensity` / `environmentRotation` | Confirmed on `Scene` | |

### Remaining uncertainties

- Reflector/Refractor quality vs cost with **multi-pane scissor** + shared scene (may need RT sized to active pane or max pane, and disable in ortho).
- Water2 vs Water — which default for interior/exterior mansions (recommend Water2 for visuals, gate behind creation tool).
- Whether native primitive actors share `StaticMesh`-like collision or a new `PrimitiveMesh` component — recommend new component or `StaticMesh` with `primitive:` payload to keep GLTF path clean.
- Authoring-layer persistence: editor preference vs level JSON (recommend **level-authored** layer membership on actors + editor visibility prefs).
- MeshPhysical transmission + pmndrs DoF/SSAO interaction — verify when implementing Physical materials.

---

## 0. Package surface

| Export | Role |
|--------|------|
| `three` | **Active** WebGL core |
| `three/addons/*` | Official addons (**partially** used) |
| `three/webgpu`, `three/tsl` | **Deferred / Incompatible** this milestone |
| npm `postprocessing` | **Complete** FX stack |

### 0.1 Addons / APIs already imported

| API | Files | Status |
|-----|-------|--------|
| `OrbitControls` | Viewport, mesh previews | Complete |
| `GLTFLoader` | `meshLoader.js` + `gltfCompression.js` | Complete (local DRACO/KTX2/Meshopt decode) |
| `RoomEnvironment` | `studioEnvironment.js` | Partial (fixed studio IBL) |
| `Line2` family | `SceneView.js` | Internal |

---

## 1. Coverage summary

| Category | Complete | Partial | Missing (milestone-relevant) |
|----------|----------|---------|------------------------------|
| Map / World | BG modes, fog, tone, shadows, ambient, atmosphere, HDRI/EXR env, Sky, GroundedSkybox, LightProbe, outputColorSpace | — | — (Batch 1 done) |
| Lighting | Point/Spot/Dir/Ambient/Hemi/RectArea + shadows/targets/flare | — | — (Batch 3 done) |
| Materials | Full Standard + Physical + Basic/Toon/Matcap + side/alpha | — | — (Batch 2 done) |
| Environmental objects | Atmosphere fog layers | — | Decal, Reflector, Refractor, Water/Water2, Sprite, Sky |
| Geometry | Constructive brushes + ConvexBrush + PrimitiveMesh props | — | Batch 5 complete (native + procedural props); brushes unchanged |
| Static meshes | GLTF + full collision / LOD / opt-in InstancedMesh | Batch 6 Done | BatchedMesh deferred |
| Textures | Asset refs; KTX2 decode via Batch 7 | Fixed sampler in adapter | Wrap/filter/mip/aniso/colorSpace/channel/transform (Batch 8) |
| Asset tools | Multi-format I/O, Simplify, auto LOD, decode DRACO/Meshopt/KTX2, inspect | Encode deferred | BufferGeometryUtils center/merge P1 residual |
| Editor organization | Cells/prefabs/hierarchy | — | Authoring layers + solo/lock/vis |
| Viewport | Multi-pane, fog/PP chips, ortho clear | — | ViewHelper, light helpers as opt-in |
| Post-processing | pmndrs catalog | Input-gated UX | Official Three passes = N/A |

---

## 2. Capability inventory

Columns: **API** · purpose · BloodBound · files · exposed · missing · editor location · schema · serialize · runtime · multi-viewport · GPU dispose · WebGL · Cx · Val · **Status**.

---

### 2.1 Map / World Settings

| Capability | API | BB today | Files | Exposed | Missing | Editor | Schema | Ser | RT | Multi-view | GPU | WebGL | Cx | Val | Status |
|------------|-----|----------|-------|---------|---------|--------|--------|-----|----|------------|-----|-------|----|-----|--------|
| Background color | `Scene.background` Color | Yes | World, SceneView, DetailsPanel | color, intensity | — | World → Scene | `scene.background*` | Y | Y | Ortho uses editor clear | N/A | Y | S | H | **Complete** |
| Background as env/sky texture | `background` Texture | Yes | WorldEnvironmentController | color/env/sky | — | World → Scene | `backgroundType` | Y | Y | Per-pane OK | tex dispose | Y | M | H | **Complete** |
| Background blurriness | `backgroundBlurriness` | Schema+UI | World | 0–1 | Wired for env BG | World → Scene | exists | Y | Y | OK | N/A | Y | S | M | **Complete** |
| Background rotation | `backgroundRotation` Euler | Yes | SceneView | degrees | — | World → Scene | `backgroundRotation` | Y | Y | OK | N/A | Y | S | M | **Complete** |
| Environment map (HDRI/EXR) | `HDRLoader`/`EXRLoader` + PMREM + `scene.environment` | Authored + RoomEnvironment fallback | environmentMapCache, WorldEnvironmentController | asset id, intensity, rotation | — | World → Scene | `environmentAssetId`, intensity, rotation | Y | Y | Shared env OK | PMREM RT dispose/rebuild | Y | M | H | **Complete** |
| Environment intensity | `environmentIntensity` | First-class when HDR assigned | WorldEnvironmentController | field | — | World → Scene | exists | Y | Y | OK | N/A | Y | S | H | **Complete** |
| Environment rotation | `environmentRotation` | Yes | WorldEnvironmentController | euler degrees | — | World → Scene | exists | Y | Y | OK | N/A | Y | S | H | **Complete** |
| Procedural sky | `addons/objects/Sky.js` | Yes (world) | WorldEnvironmentController | turbidity, mie, sun | placeable Sky actor = Batch 4 | World → Scene | `sky` | Y | Y | Hide in ortho | mat dispose | Y (not SkyMesh) | M | H | **Complete** |
| Grounded skybox | `addons/objects/GroundedSkybox.js` | Yes | WorldEnvironmentController | height, radius, map | — | World → Scene | `groundedSkybox` | Y | Y | Hide in ortho | geo/mat | Y | M | M | **Complete** |
| Light probe (scene) | `LightProbe` + `LightProbeGenerator` | Yes | WorldEnvironmentController | bake from PMREM | — | World → Scene | `lightProbeEnabled` | Y | Y | OK | N/A | Y | M | M | **Complete** |
| Fog linear / exp2 | `Fog` / `FogExp2` | Yes | World, SceneView | full | — | World → Scene | Y | Y | Y | Pane toggle | N/A | Y | S | H | **Complete** |
| Fog drift + atmosphere | custom | Yes | AtmosphereController | mist/noise/volumetric | True depth volume later | World → Scene | Y | Y | Y | Perspective layer | Y | Y | L | H | **Complete** |
| World ambient | AmbientLight + IBL scale | Yes | World | color, edit/play intensity | — | World → Ambient | Y | Y | Y | OK | N/A | Y | S | H | **Complete** |
| Tone mapping / exposure | renderer | Yes | World renderer | modes + exposure | PP override when active | World → Renderer | Y | Y | Y | Restored per pane | N/A | Y | S | H | **Complete** |
| Shadow map global | `shadowMap` | Yes | World renderer | enabled, type | Soft migrated→PCF | World → Renderer | Y | Y | Y | OK | N/A | Y | S | H | **Complete** |
| Output color space | `outputColorSpace` | Authored | SceneView | srgb / srgb-linear | — | World → Renderer | `outputColorSpace` | Y | Y | OK | N/A | Y | S | M | **Complete** |
| RoomEnvironment fallback | addon | Yes internal | studioEnvironment | — | Keep when no HDRI | — | — | — | — | rebuild on resize | Y | S | H | **Internal** |

---

### 2.2 Lighting

| Capability | API | BB | Exposed | Missing | Editor | Schema | Ser/RT | Multi-view | GPU | Cx | Val | Status |
|------------|-----|----|---------|---------|--------|--------|--------|------------|-----|----|-----|--------|
| PointLight | core | Y | color, intensity, range, decay, power, castShadow, mapSize, shadow*, lensflare | — | Details / create | LightComponent | Y/Y | OK | light dispose w/ actor | S | H | **Complete** |
| SpotLight | core | Y | + angle, penumbra, targetActorId, spotMapId, decay, shadow* | — | Details | LightComponent | Y/Y | OK | +tex | M | H | **Complete** |
| DirectionalLight | core | Y | color, intensity, shadow cam/bias, targetActorId | — | Details | LightComponent | Y/Y | OK | — | M | H | **Complete** |
| AmbientLight actor | core | Y | color, intensity + toolbar | — | Details / create | exists | Y/Y | OK | — | S | M | **Complete** |
| HemisphereLight | core | Y | sky/ground color, intensity | — | Creation → Lights | `lightType: hemisphere` | Y/Y | OK | — | S | H | **Complete** |
| RectAreaLight | core + `RectAreaLightUniformsLib` | Y | width, height, intensity; init once | No shadows (native) | Creation → Lights | `lightType: rectArea` | Y/Y | OK | uniforms lib | M | H | **Complete** |
| Lensflare | `Lensflare` + elements | Y | presets, textures, sizes, distances | — | Light Details | lensflareElements[] | Y/Y | Hidden in ortho | textures | M | H | **Complete** |
| Shadow bias / normalBias / radius / blurSamples | `LightShadow` | Y | authorable; radius UI for PCF/VSM; blur for VSM | — | Details → Light | fields | Y/Y | OK | — | S | H | **Complete** |
| Shadow camera | `shadow.camera` | Y | near/far; dir ortho size | — | Details | fields | Y/Y | OK | — | S | M | **Complete** |
| Light decay / power | Point/Spot | Y | decay + power helper | — | Details | fields | Y/Y | OK | — | S | M | **Complete** |
| Light target | Object3D target | Y | targetActorId | — | Details | ref | Y/Y | OK | — | S | H | **Complete** |
| Spot projection map | `SpotLight.map` | Y | spotMapId | — | Details | ref | Y/Y | OK | tex | M | M | **Complete** |
| Light helpers | Point/Spot/Dir/Hemi/RectArea helpers | Y | per-light `showHelper` | — | Details | showHelper | Y/Y | Pane OK | helper dispose | S | M | **Complete** |
| LightProbe actor | LightProbe | N | — | SH from generator | Advanced | — | — | OK | — | M | M | **Missing** |
| CSM / IES | addons | N | — | — | — | — | — | — | — | L | L | **Deferred** (cost / niche) — *excluded with reason: outdoor CSM and IES are post-mansion-scale; not required for base env authoring* |
| Edit fill Directionals | custom | Y | — | non-authored | — | — | — | — | — | — | — | **Internal** |

---

### 2.3 Materials

| Capability | API | BB | Exposed | Missing | Editor | Schema | Cx | Val | Status |
|------------|-----|----|---------|---------|--------|--------|----|-----|--------|
| MeshStandardMaterial core | core | Y | baseColor, map, normal, rough/metal maps, emissive*, opacity, envMapIntensity, UV L2 | — | Materials Workspace | MaterialDefinition | — | H | **Complete** |
| aoMap / aoMapIntensity | Standard | Y | map id + intensity | — | Materials | fields | S | H | **Complete** |
| bumpMap / bumpScale | Standard | Y | map + scale | — | Materials | fields | S | M | **Complete** |
| displacementMap / scale / bias | Standard | Y | map + scale/bias | Prop tessellation via Batch 5; **brush** displacement tessellation still outstanding — see Batch 2 residuals | Materials | fields | S | M | **Complete** (maps); brush density **Outstanding** |
| alphaMap | Standard | Y | map id | — | Materials | fields | S | H | **Complete** |
| lightMap / intensity | Standard | Y | map + intensity on UV0 | Dedicated lightmap UV channel — see Batch 2 residuals (baked lighting) | Materials | fields | S | M | **Complete** (assign); UV2 **Deferred** |
| alphaTest / alphaHash / alphaToCoverage | Material | Y | cutoff + toggles | A2C × MSAA/PP interaction — see Batch 2 residuals | Materials | fields | S | H | **Complete** (authored); A2C verify **Pending** |
| side / flatShading / wireframe / fog / toneMapped | Material | Y | front/back/double + flags | — | Materials | fields | S | H | **Complete** |
| transparent / opacity / depthWrite | Material | Y | opacity/transparent/depthWrite | — | Materials | fields | S | M | **Complete** |
| MeshPhysicalMaterial | core | Y | clearcoat*, transmission*, thickness, attenuation*, ior, sheen*, specular*, iridescence*, anisotropy*, dispersion + maps | — | Materials | `shadingModel: physical` | M | H | **Complete** |
| MeshBasicMaterial | core | Y | unlit + reflectivity/maps | — | Materials | `basic` | S | M | **Complete** |
| MeshToonMaterial | core | Y | gradientMap + shared maps | — | Materials | `toon` | M | M | **Complete** |
| MeshMatcapMaterial | core | Y | matcap map | — | Materials | `matcap` | S | M | **Complete** |
| Actor/face UV L1 | custom | Y | Details/Surface | — | Details | component | — | H | **Complete** |
| PBR generator | custom | Y | normal/roughness | AO generate | Materials | pbrGenerator | M | M | **Partial** |
| Node/TSL materials | three/tsl | N | — | — | — | — | L | — | **Deferred** (WebGPU) |

---

### 2.4 Environmental object types

| Capability | API (WebGL) | BB | Editor location | Schema idea | Multi-view / GPU | Cx | Val | Status |
|------------|-------------|----|-----------------|-------------|------------------|----|-----|--------|
| Decal | `DecalGeometry` | N | Creation → Environment | DecalComponent: target, size, orientation, materialId | Shared geo; dispose on edit | M | H | **Missing** |
| Reflector (mirror) | `Reflector` | N | Creation → Environment | MirrorComponent: size, color, textureSize, multisample | **Own RT** — resize DPR; prefer perspective only; dispose RT | M | H | **Missing** |
| Refractor | `Refractor` | N | Creation → Environment | similar | Own RT; same constraints | M | H | **Missing** |
| Water | `Water.js` | N | Creation → Environment | WaterComponent | Shader uniforms update; dispose | M | H | **Missing** |
| Water2 | `Water2.js` | N | Creation → Environment | preferred default candidate | Needs normal/reflectivity maps as assets | M | H | **Missing** |
| Sprite / billboard | `Sprite` + `SpriteMaterial` | N | Creation → Props/Environment | SpriteComponent: mapId, center, sizeAttenuation | Cheap; OK all panes | S | H | **Missing** |
| Sky | `Sky.js` | N | World or Creation | see Map Settings | Optional hide ortho | M | H | **Missing** |
| GroundedSkybox | `GroundedSkybox.js` | N | World | — | — | M | M | **Missing** |
| Lensflare | `Lensflare.js` | N | under Light | elements[] | Disable ortho; texture ownership | M | H | **Missing** |
| ShadowMesh | addon | N | — | — | Niche | S | L | **N/A** unless soft contact shadows requested — *exclusion: niche demo helper; atmosphere/PP cover soft contact needs for now* |
| WaterMesh/SkyMesh/LensflareMesh | WebGPU | — | — | — | — | — | — | **Incompatible** |

---

### 2.5 Geometry (native tools — additive to brushes)

Constructive brushes remain primary architecture tools. Native primitives are **prop / kit** meshes.

| Capability | API | BB | Editor | Schema | Cx | Val | Status |
|------------|-----|----|--------|--------|----|-----|--------|
| Box/Sphere/Cylinder/Cone/Plane/Capsule/Torus/Ring/Circle + polyhedra | core geometries | Y | Creation → Geometry (props) | `PrimitiveMesh` `{ primitive, params, materialId, segments… }` | S | H | **Complete** |
| RoundedBoxGeometry | addon | Y | Geometry props | params | S | M | **Complete** |
| LatheGeometry | core | Y | Geometry props | profile points | M | M | **Complete** |
| TubeGeometry | core | Y | Geometry props | path + radius | M | M | **Complete** |
| ExtrudeGeometry | core | Y | Geometry props | shape + extrude/bevel | M | M | **Complete** |
| ShapeGeometry | core | Y | Geometry props | profile | M | M | **Complete** |
| TextGeometry | addon + local font | Y | Geometry props | fontId, text, size | M | M | **Complete** |
| ParametricGeometry | addon | Y | Geometry props | fn id / slices | M | L | **Complete** |
| ConvexGeometry | addon | Y as prop tool | Geometry props | point cloud — not a ConvexBrush replacement | M | L | **Complete** |
| Architecture brushes | custom | Y | Creation → Geometry | existing | — | H | **Complete** |
| ConvexBrush edits | custom | Y | Face/Edge/Vertex | existing | — | H | **Complete** / **Redundant** vs ConvexGeometry for architecture — **keep custom** |

---

### 2.6 Static meshes

| Capability | API | BB | Missing | Editor | Schema | Cx | Val | Status |
|------------|-----|----|---------|--------|--------|----|-----|--------|
| GLTF place | GLTFLoader | Y | encode deferred | Creation | assetId | — | H | **Complete** (decode) |
| castShadow / receiveShadow | Mesh flags | Hardcoded on | toggles | Details | fields | S | H | **Missing** |
| Material overrides | swap materials | Face mats on brushes + StaticMesh slots | per-slot override on GLTF | Details | overrides{} | M | H | **Done** (Batch 6) |
| LOD | `LOD` | Y | — | Details | lod levels | M | M | **Done** (Batch 6/7) |
| Instancing | `InstancedMesh` | Internal batch only | authorable instance sets | Creation/Details | instance transforms | L | M | **Missing** |
| Batching | `BatchedMesh` | Experimental solids | expose later | — | — | L | M | **Partial** / Internal |
| renderOrder | Object3D | N | number | Details | field | S | M | **Missing** |
| frustumCulled | Object3D | default true | toggle | Details | field | S | L | **Missing** |
| Collision box | Rapier | Y | — | Details | collisionType box/none | — | H | **Complete** |
| Collision convex / trimesh | Rapier | N | hull/trimesh from mesh | Details | collisionType | M | H | **Missing** |

---

### 2.7 Asset Viewer / Content Browser / tools

| Capability | API | BB | Editor | Cx | Val | Status |
|------------|-----|----|--------|----|-----|--------|
| Import texture/mesh | loaders + registry | Y | Asset Viewer | — | H | **Complete** |
| Thumbs | custom bake | Y | Asset Viewer | — | H | **Complete** |
| SimplifyModifier | addon | Y | Asset Viewer mesh tools | M | H | **Done** (Batch 7) |
| BufferGeometryUtils | addon | Partial | merge/index used by Simplify; dedicated UI deferred | M | H | **Partial** |
| GLTFExporter / OBJExporter (+ STL/PLY/USDZ) | addons | Y | Asset Viewer export | M | H | **Done** (Batch 7) |
| FBX/OBJ/STL/PLY/Collada/USDZ import | loaders | Y | Import → GLB normalize | M | M | **Done** (Batch 7) |
| DRACO | DRACOLoader + `/vendor/draco` | Y | meshLoader / GLTF | M | H | **Done** (decode) |
| KTX2 | KTX2Loader + `/vendor/basis` | Y | GLTF + fixtures | M | H | **Done** (decode) |
| Meshopt | meshopt_decoder + `/vendor/meshopt` | Y | meshLoader / GLTF | M | H | **Done** (decode) |
| computeVertexNormals / tangents | BufferGeometry / utils | Internal ad hoc | Tool buttons + helpers | S | H | **Partial** |
| VertexNormalsHelper / VertexTangentsHelper | addons | N | Viewport diagnostic | S | M | **Missing** |
| Box3Helper / bounds display | core | Selection + inspect bounds | Mesh diagnostics | S | M | **Partial** |
| Geometry center / pivot | Actor.contentOffset + Asset Viewer gizmo | Y | Details / toolbar / Asset Viewer | S | H | **Done** (Batch 7.1) |
| HDR/EXR import | HDRLoader/EXRLoader | Y | Asset Viewer → Environment | M | H | **Done** (Batch 1) |

---

### 2.8 Texture properties

| Capability | API | BB | Missing | Editor | Schema | Status |
|------------|-----|----|---------|--------|--------|--------|
| Asset record | registry | Y | sampler fields | Content Browser | meta | **Partial** |
| wrapS / wrapT | Texture | Fixed Repeat | enum | Texture inspector | meta | **Missing** |
| minFilter / magFilter | Texture | default | enum | inspector | meta | **Missing** |
| generateMipmaps | Texture | default true | bool | inspector | meta | **Missing** |
| anisotropy | Texture | 8 fixed | number | inspector | meta | **Missing** |
| colorSpace | Texture | set in adapter | enum | inspector | meta | **Missing** |
| channel (UV set) | Texture.channel | N | 0..N | inspector / material | meta + mat | **Missing** |
| offset / repeat / rotation / center | Texture | via material UV L2 | optional tex-level | inspector | meta | **Partial** |
| Compression (KTX2) | compressed textures | Y (decode) | encode deferred | Asset Viewer / GLTF | kind | **Done** (Batch 7 decode) |

---

### 2.9 Editor organization — authoring layers

**Distinct from** cells, prefabs, actor hierarchy, and `THREE.Layers` (rendering bitmasks; atmosphere already uses layer 2 internally).

| Capability | Proposal | BB | Status |
|------------|----------|----|--------|
| Layer set | Architecture, Furniture, Props, Lighting, Collision, Reference, Gameplay | N | **Missing** |
| Actor → layer membership | `actor.editorLayers: string[]` or primary `editorLayer` | N | **Missing** |
| Visibility / lock / solo | Editor prefs or session UI; do not bake into Play unless tagged | N | **Missing** |
| Outliner filter by layer | Scene Outliner | N | **Missing** |
| Independence | Must not replace Cell/prefab/parentId | — | constraint |
| THREE.Layers mapping | Optional later for perf; **not** required for authoring layers v1 | — | avoid conflating |

---

### 2.10 Viewport / helpers / diagnostics

| Capability | API | BB | Status |
|------------|-----|----|--------|
| Multi-pane, display modes, fog/PP chips, ortho clear | custom | Y | **Complete** |
| OrbitControls | addon | Y | **Complete** |
| BrushGizmo | custom | Y | **Complete** / keep vs TransformControls |
| ViewHelper | addon | N | **Missing** |
| Light helpers opt-in | core/addon | Partial spheres | **Missing** |
| TextureHelper | addon | N | **Missing** (debug) |
| GridHelper | core | Y | **Complete** |

---

### 2.11 Post-processing / rendering (brief)

| Capability | Status | Note |
|------------|--------|------|
| pmndrs full catalog | **Complete** | Retain |
| Official Three passes | **N/A** | Do not dual-stack |
| Multi-viewport PP/fog isolation | **Complete** | Separate track |
| WebGPURenderer | **Deferred** | Out of milestone |
| outputColorSpace authoring | **Missing** | World renderer |

---

## 3. Recently integrated features — wiring check

| Feature | UI | Data | Undo | Ser | Prefab | Adapter | Edit+Play | GPU | Gaps |
|---------|----|------|------|-----|--------|---------|-----------|-----|------|
| World BG + fog | Y | Y | Y | Y | N/A | SceneView | Y | N/A | Blur/rotation; Soft shadow label |
| Atmosphere | Y | Y | Y | Y | N/A | AtmosphereController | Perspective | Y | Soft depth only |
| World renderer | Y | Y | Y | Y | N/A | SceneView | Y | N/A | outputColorSpace |
| PP catalog | Y | Y | Y | Y | N/A | PP controller | Y | Y | Input-gated effects |
| MeshStandard | Y | Y | Y | Y | Y | materialFactory | Y | Y | Maps/models incomplete |
| Lights | Y | Y | Y | Y | Y | SceneView | Y | Y | Advanced props |
| GLTF StaticMesh | Y | Y | Y | Y | Y | meshLoader | Y | Y | shadows/LOD/collision/overrides **Done** (Batch 6); compression decode + Simplify/auto LOD **Done** (Batch 7); encode deferred |

---

## 4. Implementation backlog (batches)

Priorities **P0–P2 within each batch**. Implement batches in order where possible; dependencies noted.

### Batch 1 — Map Settings (environment, sky, background) — **DONE**

| Pri | Item | API | Schema | Status |
|-----|------|-----|--------|--------|
| P0 | Authored HDRI/EXR → PMREM → `scene.environment` | HDRLoader/EXRLoader | `environmentAssetId`, intensity, rotation | **Done** |
| P0 | `environmentIntensity` / `environmentRotation` | Scene | fields | **Done** |
| P0 | Background type color \| env \| sky; wire blurriness/rotation when non-color | Scene | `backgroundType`, rotation | **Done** |
| P0 | Keep RoomEnvironment fallback when no env | existing | — | **Done** |
| P1 | Procedural Sky world | Sky.js | sky params | **Done** (world; placeable = Batch 4) |
| P1 | GroundedSkybox option | GroundedSkybox.js | groundedSkybox | **Done** |
| P2 | LightProbe bake from env | LightProbeGenerator | lightProbeEnabled | **Done** |
| P2 | `outputColorSpace` | renderer | field | **Done** |
| P2 | Shadow type UI: remove Soft deprecation footgun | enum | PCFSoft→PCF | **Done** |

**Acceptance level:** `public/levels/acceptance-world-settings.json`  
**Acceptance report:** `docs/ACCEPTANCE_WORLD_SETTINGS.md`  
**HDRI:** Poly Haven `studio_small_09` 1k (CC0) as `tex_batch1_studio`  
**Corrections (post Batch 1):** numeric World Settings scrub → one `HistoryStack.record` undo entry; real licensed HDRI + browser visual pass.  
**Unlocks:** Physical materials response to real env; Batch 3 RectArea look.

### Batch 2 — Materials — **Implemented**

| Pri | Item | API | Schema | Status |
|-----|------|-----|--------|--------|
| P0 | aoMap + aoMapIntensity | Standard | map ids | **Done** |
| P0 | alphaMap + alphaTest/alphaHash/alphaToCoverage + side | Standard/Material | fields | **Done** |
| P1 | bump + displacement maps | Standard | fields | **Done** |
| P1 | lightMap | Standard | fields | **Done** |
| P0 | MeshPhysicalMaterial opt-in + clearcoat/transmission/thickness/ior/attenuation/sheen/specular/iridescence/anisotropy/dispersion | Physical | `shadingModel` + props | **Done** |
| P1 | MeshBasicMaterial / MeshMatcapMaterial | core | type | **Done** |
| P2 | MeshToonMaterial + gradientMap | core | type | **Done** |
| P2 | depthWrite / wireframe / flatShading / toneMapped / fog | Material | fields | **Done** |

**Acceptance:** `public/levels/acceptance-materials.json` + `docs/ACCEPTANCE_MATERIALS.md`  
**Academy:** lesson 22 (`materials-shading`)  
**Depends on:** Batch 1 env for Physical transmission/clearcoat to look correct.  
**Unlocks:** Decals/Water materials; richer StaticMesh overrides.

#### Batch 2 residuals (tracked — Batch 2 remains **Implemented**)

These are known follow-ups or accepted design decisions. They do **not** reopen Batch 2 scope.

| Item | Status | Dependency | Acceptance criteria | Cross-ref |
|------|--------|------------|---------------------|-----------|
| Dedicated lightmap UV channel (`geometry.attributes.uv2` / second UV set for `lightMap`) | **Deferred** | Baked lighting implementation (not in current Batch 1–9 geometry/env milestone until baking lands); texture UV-channel authoring in **Batch 8** may feed sampling UI | Brushes/meshes expose an authored or generated lightmap UV set; `createThreeMaterial` binds `lightMap` to UV2 without stealing UV0 albedo; acceptance level shows non-overlapping lightmap vs base UV | Future baked-lighting work; **Batch 8** (UV channel selection); material assign path already **Complete** |
| Geometry subdivision for displacement | **Partial** — props **Done**; brush tessellation **Outstanding** | Batch 5 `PrimitiveMesh` Plane/Sphere `displacementSegments` (+ width/height segments). Architectural brushes remain fixed-topology BoxGeometry / parametric solids and are **not** retessellated | (1) Dense prop Plane/Sphere show usable displacement with Batch 2 maps; soft-caps + dispose verified. (2) Brush solids still will not show displacement relief without a future brush-density design that preserves CSG authorship | **Batch 5** props path; Batch 2 residual **not** fully resolved until brush path exists or is explicitly Accepted by design |
| Alpha-to-coverage compatibility with MSAA and post-processing | **Pending** (rendering verification) | Shared WebGL renderer + pmndrs post-processing path (Batch 1 world/renderer + existing PP stack); may need MSAA/RT policy documented or adjusted | Documented pass/fail matrix: `alphaToCoverage` on/off × MSAA on/off × Fog/PP pane toggles; foliage/alpha materials show no unexplained discard or edge artifacts; multi-pane isolation unchanged | Rendering verify (not a new materials feature); Batch 2 A2C authoring **Complete** |
| Draft-local material undo (Materials Workspace scrub stack, not level `HistoryStack`) | **Accepted** (architectural decision — not a defect) | Materials are project assets edited as drafts until Save; level history owns actor/world commands only | One undo entry per finished numeric scrub in Materials; Cancel restores saved baseline; level Undo does not mutate material JSON; documented in Academy/help | Batch 2 editor design; keep — do not “fix” by wiring materials into `HistoryStack` |

### Batch 3 — Lighting — **Implemented**

| Pri | Item | API | Schema | Status |
|-----|------|-----|--------|--------|
| P0 | HemisphereLight + toolbar | core | lightType | **Done** |
| P0 | Shadow bias/normalBias/radius (+ blurSamples) | LightShadow | fields | **Done** |
| P0 | Directional shadow camera size/near/far | shadow.camera | fields | **Done** |
| P1 | RectAreaLight + UniformsLib.init | core+addon | lightType, width/height | **Done** |
| P1 | Light targets (spot/dir) | target | targetActorId | **Done** |
| P1 | decay / power | Point/Spot | fields | **Done** |
| P1 | Lensflare on lights | Lensflare.js | elements[] | **Done** |
| P2 | Spot projection map | SpotLight.map | spotMapId | **Done** |
| P2 | Opt-in light helpers | helpers | showHelper | **Done** |
| P2 | Ambient on creation toolbar | existing type | — | **Done** |

**Acceptance:** `public/levels/acceptance-lighting.json` + `docs/ACCEPTANCE_LIGHTING.md`  
**Academy:** lesson 23 (`lighting-advanced`)  
**Depends on:** Batch 1 for area lights in HDR environments; Batch 2 materials for RectArea response.  
**Note:** CSM/IES deferred with reason (scale/niche).

#### Batch 3 residuals / native limits

| Item | Status | Dependency | Acceptance criteria | Cross-ref |
|------|--------|------------|---------------------|-----------|
| RectAreaLight shadows | **N/A (native)** | Three.js WebGL RectAreaLight does not cast shadows | Documented in Details + acceptance; no false UI affordance | Three.js limitation |
| RectArea + Basic/Toon/Matcap | **Documented** | Batch 2 shading models | Softbox visible on Standard/Physical in acceptance; Basic/Toon/Matcap may not receive area lighting | Batch 2 materials |
| Lensflare occlusion fidelity | **Accepted** | Official Lensflare depth test vs scene | Perspective visibility + ortho hide verified; deep occlusion edge cases follow Three.js addon | Batch 3 Lensflare |
| World Ambient Undo | **Done** | Same World Settings `HistoryStack` as Scene/Renderer (`SetWorldAmbientCommand`) | Live preview while scrubbing; one undo entry per completed intensity gesture; Escape cancels; color changes undoable; dirty + save/reload verified | Batch 3 Acceptance Correction |

### Batch 4 — Environmental objects — **Implemented**

| Pri | Item | API | Schema | Status |
|-----|------|-----|--------|--------|
| P0 | Decal tool | DecalGeometry | Environment.decal | **Done** |
| P0 | Reflector (mirror) | Reflector | Environment.reflector | **Done** |
| P1 | Refractor | Refractor | Environment.refractor | **Done** |
| P0 | Water2 creation tool | Water2.js shader + Reflector/Refractor | Environment.water2 | **Done** |
| P1 | Water (simpler) | Water.js | Environment.water | **Done** |
| P0 | Sprite / billboard | Sprite / SpriteMaterial | Environment.sprite | **Done** |
| P1 | Sky as placeable | Sky.js | Environment.sky | **Done** |
| P2 | GroundedSkybox placeable | objects/ | — | **Deferred** (world-only) |

**Acceptance:** `public/levels/acceptance-environment.json` + `docs/ACCEPTANCE_ENVIRONMENT.md`  
**Academy:** lesson 24 (`environmental-objects`)  
**Depends on:** Batch 1 sky fields; Batch 2 materials; local CC0 water normals (`tex_water_normal_*`).  
**Multi-view:** RT surfaces perspective-only; ortho uses proxies; nested env RT recursion blocked.

#### Batch 4 residuals / native limits

| Item | Status | Dependency | Acceptance criteria | Cross-ref |
|------|--------|------------|---------------------|-----------|
| Nested mirror recursion | **Accepted** | Env RT pass depth guard | Secondary mirrors/water hidden during RT update | Reflector/Water2 |
| Ortho RT | **N/A (policy)** | Multi-pane shared scene | Proxy planes in ortho; RT in perspective | Pane isolation |
| Decal corner distortion | **Accepted** | Three.js DecalGeometry | Documented; stains/signage still usable | DecalGeometry issue |
| Placeable vs World Sky | **Done** | WorldEnvironmentController | Placeable suppresses WorldSky; JSON preserved | Batch 1 sky |
| GroundedSkybox placeable | **Deferred** | Batch 4 P2 | Remains world setting | Batch 1 |
| Gameplay water | **Out of scope** | — | No swimming/buoyancy | Batch 4 brief |

### Batch 5 — Geometry (native primitives & procedural) — **Complete**

| Pri | Item | API | Status |
|-----|------|-----|--------|
| P0 | Primitive mesh actors: box, sphere, cylinder, cone, plane, capsule, torus, ring, circle, polyhedra | core | **Done** |
| P1 | RoundedBoxGeometry | addon | **Done** |
| P1 | Lathe / Tube / Extrude / Shape | core | **Done** |
| P2 | TextGeometry | addon + local Helvetiker | **Done** |
| P2 | ParametricGeometry | addon | **Done** |
| P2 | ConvexGeometry prop tool | addon — not a ConvexBrush replacement | **Done** |
| P1 | Displacement tessellation on Plane/Sphere props | segments + soft caps | **Done** (brushes unchanged) |

**Acceptance:** `docs/ACCEPTANCE_GEOMETRY.md`, `public/levels/acceptance-geometry.json`, Academy lesson 25.  
**Depends on:** Batch 2 materials. Collision integrated with Rapier (auto primitives + convex/trimesh).  
**Do not** replace Brush/ConvexBrush workflows.

#### Batch 5 residuals / accepted limits

| Item | Status | Dependency | Acceptance criteria | Cross-ref |
|------|--------|------------|---------------------|-----------|
| Approximate auto collision shapes (cone→cylinder, polyhedra→sphere, text→AABB, complex→convex) | **Accepted** for Batch 5; **Batch 6 Done** for richer StaticMesh / explicit collider authoring | Rapier collider authoring on StaticMesh / PrimitiveMesh | Visual vs collision table retained; explicit modes + dims/offsets/helpers shipped in Batch 6 | — |
| Brush displacement tessellation | **Outstanding** (Batch 2 residual) | Future brush-density design that preserves CSG | Brush solids show displacement without rewriting authored topology — **not** claimed Done by Batch 5 | Batch 2 residuals |
| Full curve / path editor UI | **Deferred** | Dedicated editor UX | Profile/path/hull points editable in a first-class curve UI | Batch 5 schema fields exist |
| Procedural subtractive geometry | **Accepted restriction** | CSG brush pipeline | Procedural PrimitiveMesh must not silently become valid subtractive brushes | Architecture |

### Batch 6 — Static meshes (render + collision) — **Done** (acceptance `docs/ACCEPTANCE_STATIC_MESHES.md`)

| Pri | Item | Status |
|-----|------|--------|
| P0 | castShadow / receiveShadow on StaticMesh (+ optional solids) | **Done** — StaticMesh Rendering group; PrimitiveMesh retained Batch 5 shadows |
| P0 | Rapier convex hull collision option | **Done** — StaticMesh + PrimitiveMesh; Play preloads GLB for hull extract |
| P1 | Trimesh collision option (cost-warn) | **Done** — fixed-body only; Details notes cost; AABB fallback if unload |
| P1 | Material slot overrides on GLTF | **Done** — slot keys `meshName:matIndex`; restore originals; GLB not rewritten |
| P1 | renderOrder / frustumCulled | **Done** |
| P2 | LOD component | **Done** — THREE.LOD; distances + hysteresis + editor preview; triangle counts; collision independent |
| P2 | InstancedMesh authoring (prop scatters) | **Done** (opt-in) — default **off**; `auto` ≥3 / `force`; measure before auto-default; BatchedMesh **deferred** |

**Also shipped:** none/auto/box/sphere/capsule/cylinder colliders; editable dims/offsets; collision helpers; Details Collision/Materials/LOD/Rendering; undo gestures; Academy lesson 26; `acceptance-static-meshes.json`.

**Gap closure (2026-11-26):** player capsule push probes vs all StaticMesh collider modes + Batch 5 primitives; no-collision traversal; LOD-independent collision; prefab create/instance overrides/save-load for StaticMesh+PrimitiveMesh — see `docs/ACCEPTANCE_STATIC_MESHES.md` / `docs/ACCEPTANCE_GEOMETRY.md`. **No new defects.**

**Batch 5 residuals updated:** richer StaticMesh / primitive collision authoring + live collision/prefab verification **Done**. **Brush displacement tessellation** remains Outstanding (Batch 2).

**Depends on:** Batch 7 compression / SimplifyModifier for heavy meshes and automatic LOD generation; Batch 2 materials.

### Batch 7 — Asset tools — **COMPLETE** (encode deferred)

| Pri | Item | API | Status |
|-----|------|-----|--------|
| P0 | DRACO + KTX2 + Meshopt in GLTFLoader path | loaders + local `/vendor` | **Complete** (decode verified with licensed fixtures) |
| P0 | HDR/EXR import to texture/env assets | HDRLoader/EXRLoader | **Done** (Batch 1 / Content Browser) |
| P1 | BufferGeometryUtils center/merge/index/normals | utils | **Partial** — used internally by SimplifyModifier; dedicated authoring UI deferred |
| P1 | SimplifyModifier tool | modifier | **Done** — Asset Viewer + derived assets |
| P1 | GLTFExporter / OBJExporter (+ STL/PLY/USDZ) | exporters | **Complete** — USDZ via `parseAsync`; GLTF/USDZ reimport verified |
| P2 | FBX/OBJ/STL/PLY/Collada/USDZ import → GLB normalize | loaders | **Complete** — USDLoader; fixtures + CDP evidence |
| P2 | Normals/tangents helpers + bounds viz | helpers | **Partial** — bounds/inspect in Asset Viewer; dedicated helpers deferred |
| P2 | Pivot/center utilities | Actor.contentOffset + Asset Viewer interactive gizmo | **Done** (Batch 7.1) |
| P1 | Auto LOD generation → Batch 6 `lodLevels` | SimplifyModifier | **Done** |
| — | Compression **encode** (Draco/Basis/meshopt) | encoders | **Deferred** — no official encoders bundled; decode-only documented |

**Acceptance report:** `docs/ACCEPTANCE_ASSET_TOOLS.md` (implementation `8d5af2e` + gap closure `1897cfd` + final closure)  
**Academy:** lesson 27 (`asset-tools`)  
**Fixtures:** `public/assets/fixtures/` — Meshopt + Khronos DRACO Box/Duck + three.js KTX2 + FBX/Collada/GLTF samples  
**Depends on:** none hard; **feeds** Batches 1, 4, 6, 8.

### Batch 8 — Textures

| Pri | Item |
|-----|------|
| P0 | Texture inspector: wrap, min/mag filter, anisotropy, colorSpace, generateMipmaps |
| P1 | UV channel selection (incl. feeding lightmap UV2 when baked lighting exists — Batch 2 residual) |
| P1 | Texture-level offset/repeat/rotation (optional vs material UV) |
| P0 | KTX2 compressed texture import | 
| P2 | VideoTexture authoring (optional env screens) — *include with note: useful for diegetic screens; low priority* |

**Depends on:** Batch 7 KTX2. **Feeds** Batch 2/4.  
**Note:** Dedicated lightmap UV channel remains **Deferred** until baked lighting; Batch 8 UV-channel UI is a supporting dependency, not a substitute for baking.

### Batch 9 — Editor organization & viewport tools

| Pri | Item |
|-----|------|
| P0 | Authoring layers enum + actor assignment |
| P0 | Layer visibility / lock / solo in Outliner + viewport filter |
| P1 | Layer-aware creation default |
| P1 | ViewHelper |
| P2 | TextureHelper / advanced diagnostics |
| P2 | Optional mapping authoring layers → THREE.Layers for render perf (document carefully) |

**Depends on:** soft — can start early; avoid coupling to prefabs/cells.

### Cross-batch dependency graph

```
Batch 7 (Asset tools) ──┬──► Batch 1 (Map env)
                        ├──► Batch 8 (Textures) ──► Batch 2 (Materials) ──► Batch 4 (Env objects)
                        └──► Batch 6 (Static meshes)
Batch 1 ──► Batch 3 (Lighting look)
Batch 2 ──► Batch 5 (Primitives materials)
Batch 9 parallel (Editor layers)
```

---

## 5. Exclusions (explicit)

| Capability | Status | Reason |
|------------|--------|--------|
| Three.js Editor app | N/A | Brief forbids |
| WebGPU / TSL / *Mesh env objects | Incompatible / Deferred | WebGL renderer only |
| Official EffectComposer passes | N/A | pmndrs chosen; dual-stack harmful |
| CSM, VXGI, LightMapper | Deferred | Cost/complexity beyond base env layer |
| IES profiles | Deferred | Niche; WebGL path limited vs WebGPU IES |
| SkinnedMesh / AnimationMixer authoring | Deferred | Character milestone |
| Audio / PositionalAudio | Deferred | Gameplay/audio milestone |
| Gaussian splats | Deferred | Pipeline weight; not required for mansion env |
| Replacing constructive CSG with community CSG | Redundant keep custom | Working architecture tool |
| Replacing BrushGizmo with TransformControls | Keep custom | Unless feature gap proven |
| ShadowMesh addon | N/A for now | Niche; PP/atmosphere cover soft contact |

---

## 6. Suggested schema touchpoints (planning)

| Blob | Extensions |
|------|------------|
| `world.scene` | `environmentAssetId`, `environmentIntensity`, `environmentRotation`, `backgroundType`, `backgroundRotation`, sky block |
| `world.renderer` | `outputColorSpace`; shadow type without Soft |
| `LightComponent` | hemisphere/rectArea types; decay; shadow*; targetActorId; spotMapId; size; lensflare |
| New components | `PrimitiveMesh`, `Decal`, `Mirror`/`Reflector`, `Refractor`, `Water`, `Sprite`, optional `Sky` |
| `MaterialDefinition` | `shadingModel`, ao/bump/disp/alpha/light maps, physical fields, side/alphaTest |
| Texture asset `meta` | wrap, filter, mip, aniso, colorSpace, channel, transform |
| `StaticMeshComponent` | cast/receive shadow, renderOrder, frustumCulled, collisionType (+ dims/offset), materialOverrides, lodLevels, lodPreview, instancing |
| `Actor` | `editorLayer` / `editorLayers` |

Map to Three **only** in runtime adapters; keep JSON engine-neutral.

---

## 7. Multi-viewport & GPU ownership checklist (for implementers)

| Feature class | Rule |
|---------------|------|
| Scene fog / background / environment | Swap/restore per pane as today; don’t mutate authored objects |
| Atmosphere | Perspective layer only |
| Reflector/Refractor/Water | Own RTs; dispose on actor remove; resize on DPR/pane; consider perspective-only |
| Lensflare | Hide in ortho |
| HDRI PMREM | Shared; rebuild on env change; dispose old RT |
| DRACO/KTX2/Meshopt | Shared decoder modules; shared GPU textures with lifecycle epochs |
| Authoring layers | Filter outliner/pick lists; don’t rely on THREE.Layers for v1 |

---

## 8. Source index

| Concern | Path |
|---------|------|
| World schema | `src/core/World.js` |
| Scene adapter | `src/runtime/SceneView.js` |
| Atmosphere | `src/runtime/atmosphere/AtmosphereController.js` |
| Studio IBL | `src/runtime/studioEnvironment.js` |
| Materials | `src/materials/MaterialDefinition.js`, `src/runtime/materialFactory.js` |
| Lights | `src/components/LightComponent.js` |
| Meshes | `src/runtime/meshLoader.js`, `StaticMeshComponent.js` |
| PP | `src/runtime/postprocessing/*` |
| Viewport prefs | `src/editor/viewport/viewportPrefs.js` |
| Three addons (installed) | `node_modules/three/examples/jsm/**` |

---

## 9. Audit method (revision)

- Re-verified APIs against `three@0.187.0` (`src/scenes/Scene.js`, `MeshPhysicalMaterial.js`, `examples/jsm/objects|geometries|lights|loaders|libs|helpers|exporters|modifiers|utils`).
- Confirmed WebGL vs WebGPU class pairs for Sky/Water/Lensflare.
- Corrected milestone scope per design authority: environment dressing and native primitives are **in**.
- Did not modify application code or dependencies.

---

*End of revised inventory.*
