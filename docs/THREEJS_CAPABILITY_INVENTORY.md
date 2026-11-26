# BloodBound — Native Three.js Capability Inventory

**Audit date:** 2026-11-26 (revised)  
**Installed Three.js:** `0.187.0` (`REVISION = '187'`)  
**Related libraries:** `postprocessing@6.39.6` (pmndrs), `@dimforge/rapier3d-compat@0.21.0`  
**Document type:** Audit and planning only. No application or dependency changes until this revision is approved.  
**Milestone:** Complete the base **geometry and environment authoring** layer.

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
| `GLTFLoader` | `meshLoader.js` | Partial (no DRACO/KTX2/Meshopt yet) |
| `RoomEnvironment` | `studioEnvironment.js` | Partial (fixed studio IBL) |
| `Line2` family | `SceneView.js` | Internal |

---

## 1. Coverage summary

| Category | Complete | Partial | Missing (milestone-relevant) |
|----------|----------|---------|------------------------------|
| Map / World | BG color, fog, tone, shadows, ambient fill, atmosphere | Env via RoomEnvironment; blurriness on Color | HDRI/EXR env, env intensity/rotation, Sky, GroundedSkybox, LightProbe, outputColorSpace |
| Lighting | Point/Spot/Dir/Ambient | Shadow/decay hardcoded | Hemisphere, RectArea, Lensflare, shadow props, targets, spot map, helpers |
| Materials | Standard core maps | — | Full Standard maps; Physical; Basic/Toon/Matcap; side/alpha |
| Environmental objects | Atmosphere fog layers | — | Decal, Reflector, Refractor, Water/Water2, Sprite, Sky |
| Geometry | Constructive brushes + ConvexBrush | — | Native primitives + RoundedBox/Lathe/Tube/Extrude/Shape/Text/Parametric/ConvexGeometry tools |
| Static meshes | GLTF + box collision | — | Shadows toggles, overrides, LOD, instance/batch, renderOrder, collision varieties |
| Textures | Asset refs | Fixed sampler in adapter | Wrap/filter/mip/aniso/colorSpace/channel/transform/compression |
| Asset tools | Import texture/mesh, thumbs | — | Simplify, BufferGeometryUtils, exporters, DRACO/KTX2/Meshopt, diagnostics |
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
| Background as env/sky texture | `background` Texture | No | — | — | equirect/cube as BG | World → Scene | `backgroundType` | — | — | Per-pane OK | tex dispose | Y | M | H | **Missing** |
| Background blurriness | `backgroundBlurriness` | Schema+UI | World | 0–1 | Needs tex/env BG | World → Scene | exists | Y | Y | OK | N/A | Y | S | M | **Partial** |
| Background rotation | `backgroundRotation` Euler | No | Scene.js confirmed | — | euler degrees | World → Scene | add | — | — | OK | N/A | Y | S | M | **Missing** |
| Environment map (HDRI/EXR) | `HDRLoader`/`EXRLoader` + PMREM + `scene.environment` | Fixed RoomEnvironment | studioEnvironment.js | ambient-linked intensity only | Asset id, intensity, rotation | World → Environment | `environmentAssetId`, intensity, rotation | — | — | Shared env OK | PMREM RT dispose/rebuild | Y | M | H | **Missing** |
| Environment intensity | `environmentIntensity` | Via ambient fill approx | SceneView | — | First-class | World → Environment | add | — | — | OK | N/A | Y | S | H | **Missing** |
| Environment rotation | `environmentRotation` | No | — | — | euler | World → Environment | add | — | — | OK | N/A | Y | S | H | **Missing** |
| Procedural sky | `addons/objects/Sky.js` | No | — | — | turbidity, mie, sun position | World / Creation | sky component or world.sky | — | — | Hide in ortho optional | mat dispose | Y (not SkyMesh) | M | H | **Missing** |
| Grounded skybox | `addons/objects/GroundedSkybox.js` | No | — | — | height, radius, map | World | — | — | — | OK | geo/mat | Y | M | M | **Missing** |
| Light probe (scene) | `LightProbe` + `LightProbeGenerator` | No | — | — | bake from env cubemap | World → Environment | probe SH coeffs or bake flag | — | — | OK | N/A | Y | M | M | **Missing** |
| Fog linear / exp2 | `Fog` / `FogExp2` | Yes | World, SceneView | full | — | World → Scene | Y | Y | Y | Pane toggle | N/A | Y | S | H | **Complete** |
| Fog drift + atmosphere | custom | Yes | AtmosphereController | mist/noise/volumetric | True depth volume later | World → Scene | Y | Y | Y | Perspective layer | Y | Y | L | H | **Complete** |
| World ambient | AmbientLight + IBL scale | Yes | World | color, edit/play intensity | — | World → Ambient | Y | Y | Y | OK | N/A | Y | S | H | **Complete** |
| Tone mapping / exposure | renderer | Yes | World renderer | modes + exposure | PP override when active | World → Renderer | Y | Y | Y | Restored per pane | N/A | Y | S | H | **Complete** |
| Shadow map global | `shadowMap` | Yes | World renderer | enabled, type | Drop Soft label | World → Renderer | Y | Y | Y | OK | N/A | Y | S | H | **Partial** |
| Output color space | `outputColorSpace` | Assumed sRGB | SceneView | — | enum | World → Renderer | add | — | — | OK | N/A | Y | S | M | **Missing** |
| RoomEnvironment fallback | addon | Yes internal | studioEnvironment | — | Keep when no HDRI | — | — | — | — | rebuild on resize | Y | S | H | **Internal** |

---

### 2.2 Lighting

| Capability | API | BB | Exposed | Missing | Editor | Schema | Ser/RT | Multi-view | GPU | Cx | Val | Status |
|------------|-----|----|---------|---------|--------|--------|--------|------------|-----|----|-----|--------|
| PointLight | core | Y | color, intensity, range, castShadow, mapSize | decay, power, shadow bias/cam | Details / create | LightComponent | Y/Y | OK | light dispose w/ actor | S | H | **Partial** |
| SpotLight | core | Y | + angle, penumbra | targetActorId, map (proj tex), decay, shadow* | Details | extend | Y/Y | OK | +tex | M | H | **Partial** |
| DirectionalLight | core | Y | color, intensity, shadow | target, shadow cam size/near/far, bias* | Details | extend | Y/Y | OK | — | M | H | **Partial** |
| AmbientLight actor | core | Y | color, intensity | toolbar create | Details | exists | Y/Y | OK | — | S | M | **Partial** |
| HemisphereLight | core | N | — | sky/ground color, intensity | Creation → Lights | `lightType: hemisphere` | — | OK | — | S | H | **Missing** |
| RectAreaLight | core + `RectAreaLightUniformsLib` | N | — | width, height, intensity; init once | Creation → Lights | `lightType: rectArea` | — | OK | uniforms lib | M | H | **Missing** |
| Lensflare | `Lensflare` + elements | N | — | textures, distances, sizes; attach to light | Light Details / child | Lensflare elements[] | — | May disable ortho | textures | M | H | **Missing** |
| Shadow bias / normalBias / radius / blurSamples | `LightShadow` | Hardcoded | — | authorable | Details → Light | fields | N/Y today | OK | — | S | H | **Missing** |
| Shadow camera | `shadow.camera` | Dir ±20 fixed | — | near/far/ortho size | Details | fields | N/Y | OK | — | S | M | **Missing** |
| Light decay / power | Point/Spot | decay=2 fixed | — | decay, power helpers | Details | fields | — | OK | — | S | M | **Missing** |
| Light target | Object3D target | No | — | targetActorId | Details | ref | — | OK | — | S | H | **Missing** |
| Spot projection map | `SpotLight.map` | No | — | textureAssetId | Details | ref | — | OK | tex | M | M | **Missing** |
| Light helpers | Point/Spot/Dir/Hemi/RectArea helpers | Range spheres only | — | opt-in helpers | Viewport overlay | editor pref | — | Pane OK | helper dispose | S | M | **Missing** |
| LightProbe actor | LightProbe | N | — | SH from generator | Advanced | — | — | OK | — | M | M | **Missing** |
| CSM / IES | addons | N | — | — | — | — | — | — | — | L | L | **Deferred** (cost / niche) — *excluded with reason: outdoor CSM and IES are post-mansion-scale; not required for base env authoring* |
| Edit fill Directionals | custom | Y | — | non-authored | — | — | — | — | — | — | — | **Internal** |

---

### 2.3 Materials

| Capability | API | BB | Exposed | Missing | Editor | Schema | Cx | Val | Status |
|------------|-----|----|---------|---------|--------|--------|----|-----|--------|
| MeshStandardMaterial core | core | Y | baseColor, map, normal, rough/metal maps, emissive*, opacity, envMapIntensity, UV L2 | see maps/controls below | Materials Workspace | MaterialDefinition | — | H | **Partial** |
| aoMap / aoMapIntensity | Standard | N | — | map id + intensity | Materials | add | S | H | **Missing** |
| bumpMap / bumpScale | Standard | N | — | — | Materials | add | S | M | **Missing** |
| displacementMap / scale / bias | Standard | N | — | — | Materials | add | S | M | **Missing** |
| alphaMap | Standard | N | — | — | Materials | add | S | H | **Missing** |
| lightMap / intensity | Standard | N | — | — | Materials | add | S | M | **Missing** |
| alphaTest / alphaHash / alphaToCoverage | Material | N | — | cutoff controls | Materials | add | S | H | **Missing** |
| side / flatShading / wireframe / fog / toneMapped | Material | N (side only in factory opts) | — | DoubleSide etc. | Materials | add | S | H | **Missing** |
| transparent / opacity / depthWrite | Material | opacity/transparent | — | depthWrite toggle | Materials | add | S | M | **Partial** |
| MeshPhysicalMaterial | core | N | — | clearcoat*, transmission*, thickness, attenuation*, ior, sheen*, specular*, iridescence*, anisotropy*, dispersion | Materials type | `shadingModel: physical` + fields | M | H | **Missing** |
| MeshBasicMaterial | core | N | — | unlit props/maps | Materials type | `basic` | S | M | **Missing** |
| MeshToonMaterial | core | N | — | gradientMap | Materials | `toon` | M | M | **Missing** |
| MeshMatcapMaterial | core | N | — | matcap map | Materials | `matcap` | S | M | **Missing** |
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
| Box/Sphere/Cylinder/Cone/Plane/Capsule/Torus/Ring/Circle | core geometries | N as actors | Creation → Primitives | PrimitiveMeshComponent `{ primitive, params, materialId }` | S | H | **Missing** |
| RoundedBoxGeometry | addon | N | Primitives | params | S | M | **Missing** |
| LatheGeometry | core | N | Primitives / advanced | points profile | M | M | **Missing** |
| TubeGeometry | core | N | Primitives | path/radius | M | M | **Missing** |
| ExtrudeGeometry | core | N | Primitives | shape + extrude settings | M | M | **Missing** |
| ShapeGeometry | core | N | Primitives | shape | M | M | **Missing** |
| TextGeometry | addon + fonts | N | Primitives | font, text, size | M | M | **Missing** |
| ParametricGeometry | addon | N | Advanced | fn id / samples | M | L | **Missing** — include; lower priority |
| ConvexGeometry | addon | N as tool | — | From point cloud | M | L | **Missing** — note overlap with ConvexBrush; tool for props only |
| Architecture brushes | custom | Y | Creation → Geometry | existing | — | H | **Complete** |
| ConvexBrush edits | custom | Y | Face/Edge/Vertex | existing | — | H | **Complete** / **Redundant** vs ConvexGeometry for architecture — **keep custom** |

---

### 2.6 Static meshes

| Capability | API | BB | Missing | Editor | Schema | Cx | Val | Status |
|------------|-----|----|---------|--------|--------|----|-----|--------|
| GLTF place | GLTFLoader | Y | DRACO/KTX2/Meshopt | Creation | assetId | — | H | **Partial** |
| castShadow / receiveShadow | Mesh flags | Hardcoded on | toggles | Details | fields | S | H | **Missing** |
| Material overrides | swap materials | Face mats on brushes only | per-slot override on GLTF | Details | overrides{} | M | H | **Missing** |
| LOD | `LOD` | N | distances + child meshes | Details | lod levels | M | M | **Missing** |
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
| SimplifyModifier | addon | N | Asset tools / mesh inspector | M | H | **Missing** |
| BufferGeometryUtils | addon | N | merge, index, normals, center | M | H | **Missing** |
| GLTFExporter / OBJExporter | addons | N | Export selected / asset | M | H | **Missing** |
| FBX/OBJ/STL/PLY import | loaders | N | Import | M | M | **Missing** |
| DRACO | DRACOLoader + libs/draco | N | meshLoader | M | H | **Missing** |
| KTX2 | KTX2Loader + basis | N | textures/meshes | M | H | **Missing** |
| Meshopt | meshopt_decoder.module.js + GLTF | N | meshLoader | M | H | **Missing** |
| computeVertexNormals / tangents | BufferGeometry / utils | Internal ad hoc | Tool buttons + helpers | S | H | **Missing** |
| VertexNormalsHelper / VertexTangentsHelper | addons | N | Viewport diagnostic | S | M | **Missing** |
| Box3Helper / bounds display | core | Selection box only | Mesh diagnostics | S | M | **Partial** |
| Geometry center / pivot | utils / manual | N | Asset tool | S | H | **Missing** |
| HDR/EXR import | HDRLoader/EXRLoader | N | Asset Viewer → Environment | M | H | **Missing** |

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
| Compression (KTX2) | compressed textures | N | import path | Asset Viewer | kind | **Missing** |

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
| GLTF StaticMesh | Y | Y | Y | Y | Y | meshLoader | Y | Y | Compression / shadows |

---

## 4. Implementation backlog (batches)

Priorities **P0–P2 within each batch**. Implement batches in order where possible; dependencies noted.

### Batch 1 — Map Settings (environment, sky, background)

| Pri | Item | API | Schema | Deps |
|-----|------|-----|--------|------|
| P0 | Authored HDRI/EXR → PMREM → `scene.environment` | HDRLoader/EXRLoader | `environmentAssetId`, intensity, rotation | Asset import |
| P0 | `environmentIntensity` / `environmentRotation` | Scene | fields | P0 HDRI |
| P0 | Background type color \| env \| sky; wire blurriness/rotation when non-color | Scene | `backgroundType`, rotation | HDRI/Sky |
| P0 | Keep RoomEnvironment fallback when no env | existing | — | — |
| P1 | Procedural Sky actor/world | Sky.js | sky params | — |
| P1 | GroundedSkybox option | GroundedSkybox.js | | HDRI map |
| P2 | LightProbe bake from env | LightProbeGenerator | bake data | HDRI |
| P2 | `outputColorSpace` | renderer | field | — |
| P2 | Shadow type UI: remove Soft deprecation footgun | enum | — | — |

**Depends on:** Batch 8 (HDR asset) ideally parallel.  
**Unlocks:** Physical materials response to real env; Batch 3 RectArea look.

### Batch 2 — Materials

| Pri | Item | API | Schema |
|-----|------|-----|--------|
| P0 | aoMap + aoMapIntensity | Standard | map ids |
| P0 | alphaMap + alphaTest/alphaHash + side | Standard/Material | fields |
| P1 | bump + displacement maps | Standard | fields |
| P1 | lightMap | Standard | fields |
| P0 | MeshPhysicalMaterial opt-in + clearcoat/transmission/thickness/ior/attenuation/sheen/specular/iridescence/anisotropy | Physical | `shadingModel` + props |
| P1 | MeshBasicMaterial / MeshMatcapMaterial | core | type |
| P2 | MeshToonMaterial + gradientMap | core | type |
| P2 | depthWrite / wireframe / flatShading / toneMapped | Material | fields |

**Depends on:** Batch 1 env for Physical transmission/clearcoat to look correct.  
**Unlocks:** Decals/Water materials; richer StaticMesh overrides.

### Batch 3 — Lighting

| Pri | Item | API | Schema |
|-----|------|-----|--------|
| P0 | HemisphereLight + toolbar | core | lightType |
| P0 | Shadow bias/normalBias/radius (+ blurSamples) | LightShadow | fields |
| P0 | Directional shadow camera size/near/far | shadow.camera | fields |
| P1 | RectAreaLight + UniformsLib.init | core+addon | lightType, width/height |
| P1 | Light targets (spot/dir) | target | targetActorId |
| P1 | decay / power | Point/Spot | fields |
| P1 | Lensflare on lights | Lensflare.js | elements[] |
| P2 | Spot projection map | SpotLight.map | textureAssetId |
| P2 | Opt-in light helpers | helpers | editor pref |
| P2 | Ambient on creation toolbar | existing type | — |

**Depends on:** Batch 1 for area lights in HDR environments.  
**Note:** CSM/IES deferred with reason (scale/niche).

### Batch 4 — Environmental objects

| Pri | Item | API | Notes |
|-----|------|-----|-------|
| P0 | Decal tool | DecalGeometry | project onto brushes/meshes |
| P0 | Reflector (mirror) | Reflector | RT lifecycle; perspective-first |
| P1 | Refractor | Refractor | same RT rules |
| P0 | Water2 creation tool | Water2.js | asset normals |
| P1 | Water (simpler) | Water.js | fallback |
| P0 | Sprite / billboard | Sprite | props/fx |
| P1 | Sky as placeable or world toggle | Sky.js | overlap Batch 1 — coordinate |
| P2 | GroundedSkybox | objects/ | |

**Depends on:** Batch 2 materials; Batch 8 textures for water normals.  
**Multi-view:** mirrors/refractors expensive — document pane policy (e.g. active perspective only).

### Batch 5 — Geometry (native primitives & procedural)

| Pri | Item | API |
|-----|------|-----|
| P0 | Primitive mesh actors: box, sphere, cylinder, cone, plane, capsule, torus | core geometries |
| P1 | RoundedBoxGeometry | addon |
| P1 | Lathe / Tube / Extrude / Shape | core |
| P2 | TextGeometry | addon + font |
| P2 | ParametricGeometry | addon |
| P2 | ConvexGeometry prop tool | addon — not a ConvexBrush replacement |

**Depends on:** Batch 2 for materials; collision via Batch 6 patterns.  
**Do not** replace Brush/ConvexBrush workflows.

### Batch 6 — Static meshes (render + collision)

| Pri | Item |
|-----|------|
| P0 | castShadow / receiveShadow on StaticMesh (+ optional solids) |
| P0 | Rapier convex hull collision option |
| P1 | Trimesh collision option (cost-warn) |
| P1 | Material slot overrides on GLTF |
| P1 | renderOrder / frustumCulled |
| P2 | LOD component |
| P2 | InstancedMesh authoring (prop scatters) |

**Depends on:** Batch 7 compression for heavy meshes; Batch 2 overrides.

### Batch 7 — Asset tools

| Pri | Item | API |
|-----|------|-----|
| P0 | DRACO + KTX2 + Meshopt in GLTFLoader path | loaders + libs |
| P0 | HDR/EXR import to texture/env assets | HDRLoader/EXRLoader |
| P1 | BufferGeometryUtils center/merge/index/normals | utils |
| P1 | SimplifyModifier tool | modifier |
| P1 | GLTFExporter / OBJExporter | exporters |
| P2 | FBX/OBJ/STL/PLY import | loaders |
| P2 | Normals/tangents helpers + bounds viz | helpers |
| P2 | Pivot/center utilities | utils |

**Depends on:** none hard; **feeds** Batches 1, 4, 6.

### Batch 8 — Textures

| Pri | Item |
|-----|------|
| P0 | Texture inspector: wrap, min/mag filter, anisotropy, colorSpace, generateMipmaps |
| P1 | UV channel selection |
| P1 | Texture-level offset/repeat/rotation (optional vs material UV) |
| P0 | KTX2 compressed texture import | 
| P2 | VideoTexture authoring (optional env screens) — *include with note: useful for diegetic screens; low priority* |

**Depends on:** Batch 7 KTX2. **Feeds** Batch 2/4.

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
| `StaticMeshComponent` | cast/receive shadow, renderOrder, frustumCulled, collisionType, materialOverrides, lod |
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
