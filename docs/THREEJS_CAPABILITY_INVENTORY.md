# BloodBound — Native Three.js Capability Inventory

**Audit date:** 2026-11-26  
**Installed Three.js:** `0.187.0` (`REVISION = '187'`)  
**Related libraries:** `postprocessing@6.39.6` (pmndrs), `@dimforge/rapier3d-compat@0.21.0`  
**Scope:** Audit and planning only. No application code, dependency, or package changes in this task.  
**Milestone context:** Complete the base **geometry and environment authoring** layer. Multi-viewport fog/PP isolation is a separate completed track — do not re-plan it here.

### Principles (from brief)

- Native Three.js first → official addons → existing integrated libraries → custom only when necessary.
- Do **not** integrate the Three.js Editor.
- Preserve engine-neutral JSON schemas and actor/component architecture.
- Keep renderer-specific code behind `SceneView` / material / mesh adapters.
- Do not replace working custom systems without a clear benefit.

### Status legend

| Status | Meaning |
|--------|---------|
| **Complete** | Fully integrated and exposed |
| **Partial** | Integrated but missing properties, wiring, or fidelity |
| **Missing** | Available natively / via addon but not integrated |
| **Internal** | Used internally; no authoring UI required |
| **Redundant** | Custom path that may duplicate native capability |
| **Incompatible** | Unsupported by current WebGL / architecture choices |
| **Deferred** | Relevant later (gameplay / animation / WebGPU / etc.) |
| **N/A** | No meaningful BloodBound application |

---

## 0. Package surface

| Export | Path | Role in BloodBound |
|--------|------|------------------|
| `three` | `build/three.module.js` | **Active** — WebGL core |
| `three/addons/*` | `examples/jsm/*` | **Partial** — few imports (see §0.1) |
| `three/webgpu` | `build/three.webgpu.js` | **Deferred / Incompatible** for current WebGL editor |
| `three/tsl` | `build/three.tsl.js` | **Deferred** |
| npm `postprocessing` | pmndrs EffectComposer | **Complete** — chosen FX stack (not official Three passes) |

### 0.1 Official addons actually imported

| API | File(s) | Status |
|-----|---------|--------|
| `OrbitControls` | `Viewport.jsx`, `MeshPreviewCanvas.jsx`, `MeshyModelPreview.jsx` | Complete (editor nav) |
| `GLTFLoader` | `meshLoader.js` | Partial (GLB/GLTF only; no DRACO/KTX2/meshopt) |
| `RoomEnvironment` | `studioEnvironment.js` | Partial (fixed studio IBL; not user HDRI) |
| `Line2` / `LineGeometry` / `LineMaterial` | `SceneView.js` | Internal (selection / edge overlays) |

---

## 1. Coverage summary by category

| Category | Complete | Partial | Missing (high value) | Notes |
|----------|----------|---------|----------------------|-------|
| Map / World Settings | Background color, fog linear/exp2, tone map, shadow type, ambient fill | Env intensity via ambient; `backgroundBlurriness` on Color | Authored HDRI / `scene.environment`, outputColorSpace, renderer MSAA | Strong world schema |
| Object Types / Creation | Brush family, convex, arch/column/ramp/stair/curve, lights, spawn, static mesh | Ambient light not on toolbar | Hemisphere, RectArea, Sky, Water, Reflector, InstancedMesh actors | Architecture-first |
| Object Components / Details | Transform, visibility, materials/UV layers, light basics, mesh collidable | Shadow bias/camera, mesh animation | SkinnedMesh/Bone components | Engine-neutral OK |
| Lighting | Point/Spot/Dir/Ambient actors + world ambient | Shadow quality knobs hardcoded | Hemisphere, RectArea (+UniformsLib), LightProbe, CSM, IES | |
| Geometry | Procedural architecture + ConvexBrush edits | Native primitives as actors | DecalGeometry, TextGeometry, RoundedBox as tools | Custom CSG path intentional |
| Static Meshes | GLTF place + box collision | No format variety / GPU compression | FBX/OBJ/STL, DRACO, KTX2, mesh collider | |
| Materials Workspace | MeshStandard PBR core + 5 maps + UV L2 | No AO/disp/physical | MeshPhysical clearcoat/transmission/sheen; alphaMap | |
| Texture Properties | Asset registry + material map refs | Wrap/filter/colorSpace fixed in adapter | Per-texture authoring, VideoTexture | |
| Environmental Effects | Fog + drift + AtmosphereController | Studio RoomEnvironment only | HDRI, Sky, GroundedSkybox, height fog | Custom atmosphere complements fog |
| Post-Processing | Full pmndrs catalog in UI | Input-gated effects need actors/textures | Official Three passes (N/A — pmndrs chosen) | Isolation tracked separately |
| Asset Viewer | Texture/mesh/material import + thumbs | — | HDR/EXR preview as env | |
| Content Browser | Kind folders | — | — | |
| Viewport Settings | Multi-pane, display modes, fog/PP toggles, ortho clear | — | TransformControls addon, ViewHelper | |
| Editor Settings | Camera, grid, snap, viewport colors | — | — | Prefs localStorage |
| Rendering / Optimization | Incremental sync, world-solid batching, shadow types | BatchedMesh limited use | Meshopt, LOD actors, official SceneOptimizer | |

---

## 2. Categorized capability inventory

Each entry: **API** · purpose · BloodBound state · files · exposed / missing · editor location · serialize / runtime · deps · complexity · value · **Status**.

Complexity: **S** small · **M** medium · **L** large.  
Value: **H** high for current milestone · **M** medium · **L** low / later.

---

### 2.1 Map / World Settings

| Capability | Native API | BloodBound | Files | Exposed | Missing | Location | Ser / RT | Deps | Cx | Val | Status |
|------------|------------|----------|-------|---------|---------|----------|----------|------|----|-----|--------|
| Scene background color | `Scene.background` Color | Yes | `World.js`, `SceneView._syncSceneFromWorld`, DetailsPanel | color, intensity | env-as-background | World → Scene | Y / Y | — | S | H | **Complete** |
| Background blurriness | `backgroundBlurriness` | UI + schema | same | blurriness 0–1 | Only meaningful with texture/env background | World → Scene | Y / Y | — | S | M | **Partial** |
| Scene environment map | `Scene.environment` + PMREM | Fixed `RoomEnvironment` only | `studioEnvironment.js` | (via ambient intensity) | User HDRI asset, intensity/rotation as first-class | World → Scene / Environment | N / Y | HDRLoader, PMREM | M | H | **Partial** |
| Fog linear | `THREE.Fog` | Yes | World, SceneView, DetailsPanel | type, color, near, far (eu→m) | — | World → Scene | Y / Y | — | S | H | **Complete** |
| Fog exp2 | `THREE.FogExp2` | Yes | same | density | — | World → Scene | Y / Y | — | S | H | **Complete** |
| Fog drift | Custom modulation | Yes | `fogDriftFactor`, SceneView | drift, speed, amount | — | World → Scene | Y / Y | — | S | M | **Complete** (custom) |
| Atmosphere mist/noise/volumetric | Custom shaders/particles | Yes | `AtmosphereController.js` | mist/noise/volumetric fields | Depth-buffered volume (soft depth only) | World → Scene | Y / Y | — | L | H | **Complete** for milestone |
| World ambient fill | AmbientLight + IBL scale | Yes | World ambient, SceneView | color, edit/play intensity | Separate from Light actors | World → Ambient | Y / Y | RoomEnvironment | S | H | **Complete** |
| Tone mapping | `WebGLRenderer.toneMapping` | Yes | World renderer, SceneView | mode enum + exposure | PP may override when composing | World → Renderer | Y / Y | — | S | H | **Complete** |
| Shadow map global | `renderer.shadowMap` | Yes | World renderer | enabled, type Basic/PCF/PCFSoft/VSM | PCFSoft deprecated in r187 | World → Renderer | Y / Y | — | S | H | **Partial** |
| Output color space | `outputColorSpace` | Assumed sRGB | SceneView ctor | — | Authorable toggle | World → Renderer | N / Y | — | S | M | **Missing** |
| Renderer antialias / MSAA | ctor `antialias` / PP multisampling | PP multisampling only | PostProcessingSettings | 0/2/4/8 when PP on | WebGLRenderer MSAA independent of PP | World → PP / Renderer | Y / Y | — | S | M | **Partial** |
| Physically correct lights / legacy | removed / default | N/A modern three | — | — | — | — | — | — | — | — | **N/A** |

---

### 2.2 Object Types / Creation Toolbar

| Capability | Native API | BloodBound | Files | Exposed | Missing | Location | Ser / RT | Cx | Val | Status |
|------------|------------|----------|-------|---------|---------|----------|----------|----|-----|--------|
| Box / wall / floor / ceiling | Custom BufferGeometry | Yes | BrushComponent, brushFactory, brushGeometry | size, openings, miters, mats | — | Creation → Geometry | Y / Y | — | H | **Complete** |
| Convex solid | Custom + ConvexHull math | Yes | ConvexBrush, hull, edits | vertices/faces | — | Convert / geometry modes | Y / Y | — | H | **Complete** |
| Ramp / stair / column / arch / curve | Custom | Yes | *Factory, *Geometry | type params | — | Creation → Geometry | Y / Y | — | H | **Complete** |
| Subtractive brushes | Custom boolean | Yes | brushBoolean, world solid | operation | Three CSG addon unused (OK) | Creation | Y / Y | — | H | **Complete** |
| Point / spot / directional light | `PointLight` etc. | Yes | LightComponent, lightFactory | see Lighting | — | Creation → Lights | Y / Y | — | H | **Complete** |
| Ambient light actor | `AmbientLight` | Component yes; toolbar no | LightComponent, DetailsPanel select | type ambient | Toolbar create | Details / factory | Y / Y | S | L | **Partial** |
| Static mesh | `Mesh` from GLTF | Yes | StaticMeshComponent, meshFactory | assetId, collision | — | Creation → Assets | Y / Y | — | H | **Complete** |
| Player spawn | Marker + helper | Yes | PlayerSpawnComponent | — | — | Creation → Actors | Y / Y | — | H | **Complete** |
| Cell / prefab | Hierarchy | Yes | CellComponent, prefabs | — | — | Creation / Details | Y / Y | — | H | **Complete** |
| Hemisphere light | `HemisphereLight` | No | — | — | sky/ground color | Creation → Lights | — | S | H | **Missing** |
| Rect area light | `RectAreaLight` + `RectAreaLightUniformsLib` | No | — | — | width/height | Creation → Lights | — | M | H | **Missing** |
| Sky dome | `Sky` / `SkyMesh` addon | No | — | — | turbidity, sun position | World / Environment | — | M | M | **Missing** |
| Water | `Water` / `Water2` addon | No | — | — | — | Creation | — | L | L | **Deferred** |
| Reflector / Refractor | addons | No | — | — | — | Creation | — | M | L | **Deferred** |
| Lensflare | addon | No | — | — | — | Light attachment | — | S | L | **Deferred** |
| InstancedMesh actor | `InstancedMesh` | Internal batching only | brush batching experiments | — | Authorable prop instances | — | — | L | M | **Internal** / **Deferred** |
| Group / empty | `Group` | Actor hierarchy | hierarchy.js | parentId | Dedicated empty type | Outliner | Y / Y | S | M | **Partial** |
| Native primitive mesh actors | BoxGeometry etc. as props | No (architecture brushes instead) | — | — | Optional prop primitives | Creation | — | S | L | **N/A** (covered by brushes) |

---

### 2.3 Object Components / Details

| Capability | Native API | BloodBound | Files | Exposed | Missing | Location | Ser / RT | Status |
|------------|------------|----------|-------|---------|---------|----------|----------|--------|
| Transform | `Object3D` pose | `Transform` eu | Actor, DetailsPanel | pos/rot/scale | — | Details | Y / Y | **Complete** |
| Visibility / locked | `visible` | Actor flags | DetailsPanel | visible, locked | — | Details | Y / Y | **Complete** |
| Cast / receive shadow (mesh) | `castShadow` / `receiveShadow` | Mostly hardcoded true on solids | SceneView mesh build | Light castShadow only | Per-mesh toggles | Details | N / Y | **Partial** |
| Layers | `Layers` | Atmosphere layer 2 internal | AtmosphereController | — | Authorable render layers | — | — | **Internal** |
| UserData | `userData` | Limited | — | — | Generic key UI | — | — | **N/A** |
| Prefab overrides | Custom | Yes | prefabOps | — | — | Details | Y / Y | **Complete** |

---

### 2.4 Lighting

| Capability | Native API | BloodBound | Files | Exposed | Missing | Location | Ser / RT | Cx | Val | Status |
|------------|------------|----------|-------|---------|---------|----------|----------|----|-----|--------|
| Point light | `PointLight` | Yes | LightComponent, SceneView | color, intensity, range, castShadow, mapSize | decay (fixed 2), power | Details / create | Y / Y | S | H | **Partial** |
| Spot light | `SpotLight` | Yes | same | angle, penumbra + point props | target actor, map, shadow cam | Details | Y / Y | S | H | **Partial** |
| Directional light | `DirectionalLight` | Yes | same | color, intensity, shadow | target, shadow cam ±20 hardcoded, bias | Details | Y / Y | S | H | **Partial** |
| Ambient light actor | `AmbientLight` | Yes | same | color, intensity | — | Details | Y / Y | S | M | **Complete** |
| Shadow bias / normalBias / radius | `LightShadow` | Hardcoded in SceneView | SceneView._createLight | — | Authorable | Details → Light | N / Y | S | H | **Missing** |
| Shadow camera frustum | `shadow.camera` | Fixed dir ±20 | SceneView | — | near/far/size | Details | N / Y | S | M | **Missing** |
| Hemisphere light | `HemisphereLight` | No | — | — | sky/ground | Creation / Details | — | S | H | **Missing** |
| RectAreaLight | + `RectAreaLightUniformsLib` | No | — | — | Must call `init()` once | Creation | — | M | H | **Missing** |
| LightProbe | `LightProbe` + `LightProbeGenerator` | No | — | — | From HDR env | World / Light | — | M | M | **Missing** |
| CSM | `examples/jsm/csm` | No | — | — | Large outdoor | — | — | L | L | **Deferred** |
| IES profile | `IESLoader` / WebGPU IESSpot | No | — | — | WebGL limited | — | — | L | L | **Deferred** |
| Light helpers | core helpers | Edit range spheres only | SceneView | — | Selectable Three helpers | Viewport | — | S | L | **Internal** |
| Edit fill lights | Extra Directionals | Yes | SceneView | — | Non-authored | — | — | — | — | **Internal** |

---

### 2.5 Geometry

| Capability | Native API | BloodBound | Files | Status | Notes |
|------------|------------|----------|-------|--------|-------|
| Architecture solids | Custom BufferGeometry | Full pipeline | `src/runtime/*Geometry.js`, `src/geometry/*` | **Complete** | Core milestone |
| Face / edge / vertex edit | Custom | Yes | geometryEditing/* | **Complete** | |
| Extrude / clip | Custom | Yes | extrudeClip, clip.js | **Complete** | |
| Convex hull | Custom + math | Yes | hull.js | **Complete** | Overlaps addon `ConvexGeometry` — keep custom |
| `DecalGeometry` | addon | No | — | **Missing** | Detail stickers — M value |
| `TextGeometry` | addon + fonts | No | — | **Deferred** | Signage |
| `RoundedBoxGeometry` | addon | No | — | **Missing** | Props — L |
| `BufferGeometryUtils` | addon | Not imported | — | **Missing** | Merge/optimize — M |
| Three CSG / BSP | community / none official | Custom boolean | brushBoolean | **Redundant** only if replaced | Keep custom unless proven better |
| EdgesGeometry overlays | core | Yes | viewportDisplay, SceneView | **Internal** | Wireframe mode |

---

### 2.6 Static Meshes

| Capability | Native API | BloodBound | Files | Exposed | Missing | Cx | Val | Status |
|------------|------------|----------|-------|---------|---------|----|-----|--------|
| GLTF/GLB import | `GLTFLoader` | Yes | meshLoader, AssetViewer | asset path | Extensions UI | — | H | **Partial** |
| DRACO | `DRACOLoader` | No | — | — | decoder path | M | H | **Missing** |
| KTX2 / Basis | `KTX2Loader` | No | — | — | transcoder | M | H | **Missing** |
| FBX / OBJ / STL / PLY | loaders | No | — | — | Format matrix | M | M | **Missing** |
| Mesh collision | Rapier box from bounds | Yes | StaticMeshComponent | box / none | Convex/trimesh from GLTF | M | H | **Partial** |
| GLTF animations | AnimationMixer | Loaded unused | meshLoader | — | Clip component | L | — | **Deferred** |
| SkinnedMesh | core | No | — | — | Characters milestone | L | — | **Deferred** |

---

### 2.7 Materials Workspace

| Capability | Native API | BloodBound | Files | Exposed | Missing | Cx | Val | Status |
|------------|------------|----------|-------|---------|---------|----|-----|--------|
| MeshStandardMaterial | core | Yes via adapter | MaterialDefinition, materialFactory | baseColor, maps×5, roughness/metalness, emissive*, opacity, envMapIntensity, UV L2 | aoMap, bump, displacement, alphaMap, lightMap, wireframe, side, flatShading | — | H | **Partial** |
| MeshPhysicalMaterial | core | No | — | — | clearcoat, transmission, thickness, ior, sheen, iridescence, anisotropy | M | H | **Missing** |
| Material UV L2 | texture.repeat/offset/rotation | Yes | MaterialDefinition | scale/offset/rotation | Per-map transform | S | H | **Complete** |
| Actor / face UV L1 | custom | Yes | uvMapping, faceUVs | Details + Surface | — | — | H | **Complete** |
| PBR map generator | custom | Yes | PbrGeneratorPanel | normal/roughness from source | AO generate | M | M | **Partial** |
| Node / TSL materials | `three/tsl` | No | — | — | Needs WebGPU path | L | — | **Deferred** / **Incompatible** now |
| ShaderMaterial authoring | core | Atmosphere internal only | AtmosphereController | — | User shader graph | L | — | **Deferred** |

---

### 2.8 Texture Properties

| Capability | Native API | BloodBound | Files | Exposed | Missing | Status |
|------------|------------|----------|-------|---------|---------|--------|
| Texture asset record | custom registry | Yes | AssetRegistry | id, name, path, meta | wrap/filter/colorSpace/anisotropy | **Partial** |
| Adapter defaults | `Texture` props | Fixed in materialFactory | RepeatWrapping, anisotropy 8, colorSpace | — | Per-asset overrides | **Partial** |
| Canvas / Video / Data textures | core | Thumbs / PP internal | meshThumbnailBake, PP | — | Authorable VideoTexture | **Internal** / **Deferred** |
| Compressed textures | KTX2/DDS/… | No | — | — | With KTX2Loader | **Missing** |
| HDR / EXR as texture | HDRLoader, EXRLoader | No as env | — | — | Environment workflow | **Missing** |
| LUT textures | pmndrs LUT + loaders | PP lut effect | effectRegistry | textureAssetId | — | **Partial** (PP only) |

---

### 2.9 Environmental Effects

| Capability | Native API | BloodBound | Status | Notes |
|------------|------------|----------|--------|-------|
| Fog + atmosphere | Fog + custom | **Complete** | Soft depth occlusion; true depth volume later |
| Studio IBL | RoomEnvironment + PMREM | **Partial** | Not replaceable by map HDRI |
| Sky | Sky addon | **Missing** | Outdoor maps |
| GroundedSkybox | addon | **Missing** | |
| Height fog | custom / shader | **Missing** | Could extend atmosphere |
| Weather / particles system | Points / GPU | Mist only | **Partial** |
| Audio / PositionalAudio | core | No | **Deferred** (gameplay) |

---

### 2.10 Post-Processing

| Capability | API | BloodBound | Status |
|------------|-----|----------|--------|
| Effect catalog | pmndrs (bloom, SSAO, DoF, vignette, AA, LUT, …) | Full UI via `effectRegistry` + `PostProcessingSettings` | **Complete** |
| Presets | custom | Builtin + project | **Complete** |
| Editor preview / per-pane PP | custom | Global + pane chip | **Complete** |
| Official Three EffectComposer passes | `examples/jsm/postprocessing` | Not used | **N/A** / **Redundant** if dual-stacked — keep pmndrs |
| God rays / selective bloom / outline | pmndrs | Gated on light/actor inputs | **Partial** (needs selection UX polish) |
| Multi-viewport PP isolation | custom composer blit | Implemented (separate track) | **Complete** — do not re-scope |

---

### 2.11 Asset Viewer / Content Browser

| Capability | Status | Notes |
|------------|--------|-------|
| Texture / mesh / material / prefab browse | **Complete** | |
| Import texture / mesh | **Complete** | |
| Mesh thumbnails | **Complete** | |
| Material sphere thumbs | **Complete** | |
| HDRI browser / assign env | **Missing** | |
| Format badges (Draco/KTX2) | **Missing** | |

---

### 2.12 Viewport Settings

| Capability | Native / custom | BloodBound | Status |
|------------|-----------------|----------|--------|
| Multi-pane layouts | custom scissor | Yes | **Complete** |
| Perspective / ortho / iso cameras | core cameras | Yes | **Complete** |
| Display modes lit/unlit/wire/… | custom material overrides | Yes | **Complete** |
| Show Fog / Show PP per pane | custom | Yes | **Complete** |
| Ortho editor clear (not world BG) | custom swap | Yes | **Complete** |
| OrbitControls | addon | Yes | **Complete** |
| TransformControls | addon | Custom BrushGizmo instead | **Internal** / evaluate **Redundant** only if gizmo lacking |
| ViewHelper | addon | No | **Missing** (nice-to-have) |
| SelectionBox addon | addon | Custom marquee | **N/A** |

---

### 2.13 Editor Settings

| Capability | BloodBound | Status |
|------------|----------|--------|
| Camera orbit/fly/play sensitivities | `editorSettingsPrefs.js` | **Complete** |
| Grid / snap / rotation / scale snap | same | **Complete** |
| Viewport colors (grid/selection/subtract) | same — background no longer overrides world BG | **Complete** |
| Default display mode | same | **Complete** |
| Three.js Editor integration | Explicitly out of scope | **N/A** |

---

### 2.14 Rendering and Optimization

| Capability | Native API | BloodBound | Status |
|------------|------------|----------|--------|
| Incremental actor sync | custom | SceneView 2F.7C | **Complete** |
| World solid batching | custom | renderExperiments | **Complete** |
| `BatchedMesh` | core | Limited / experimental | **Partial** |
| `LOD` | core | No | **Deferred** |
| `SceneOptimizer` | addon | No | **Missing** (eval) |
| ShadowMapViewer | addon | No | **Internal** debug |
| WebGPURenderer | `three/webgpu` | Not used | **Deferred** / **Incompatible** now |
| Rapier physics | `@dimforge/rapier3d-compat` | PhysicsWorld | **Complete** (not Three) |
| `RapierHelper` | three addon | No | **Missing** debug |

---

## 3. Recently integrated features — completeness review

| Feature | Controls | Data | Undo | Serialize | Prefab/dup | Adapter | Edit+Play RT | GPU dispose | Gaps |
|---------|----------|------|------|-----------|------------|---------|--------------|-------------|------|
| World scene BG + fog | Y | Y | via world cmds | Y | N/A map | SceneView | Y | N/A | Blurriness weak without env tex; ortho uses editor clear |
| Fog drift + atmosphere | Y | Y | Y | Y | N/A | AtmosphereController | Y perspective | Y dispose | Soft depth only |
| World renderer tone/shadow | Y | Y | Y | Y | N/A | SceneView | Y; PP may override tone | N/A | PCFSoft deprecated alias |
| Post-processing catalog | Y | Y | Y | Y | N/A | PostProcessingController | Y | composer dispose | Master-enable UX fixed; input-gated effects |
| MeshStandard materials | Y | Y | asset cmds | material JSON | Y | materialFactory | Y | shared vs owned | Missing AO/physical maps |
| Lights | Y | Y | Y | component JSON | Y | SceneView | Y | with actor | Shadow bias/camera not exposed |
| GLTF static meshes | Y | Y | Y | assetId | Y | meshLoader | Y | epoch lifecycle | Single format |

**Silent fallbacks / inconsistencies to watch**

- `PCFSoftShadowMap` still offered in UI; Three r187 maps it to PCF.
- `backgroundBlurriness` stored but ineffective on solid Color backgrounds.
- Light `decay` fixed at 2; range alone may surprise artists used to Three defaults.
- Atmosphere and distance fog share color but are independent toggles — intentional, document in help.
- PP “Enabled” vs effect Enabled: enabling an effect now also enables master PP.

---

## 4. Missing native object types (authoring)

High relevance to geometry/environment milestone:

1. **HemisphereLight** — sky/ground fill without IBL  
2. **RectAreaLight** (+ `RectAreaLightUniformsLib.init`) — soft architectural panels  
3. **Sky / SkyMesh** — outdoor backdrop  
4. **Environment HDRI actor or World env slot** — replaces fixed RoomEnvironment  
5. **Decal** (DecalGeometry) — surface detail without new brush  

Later / deferred: Water, Reflector, Lensflare, Gaussian splat, InstancedMesh props, Audio.

---

## 5. Missing native properties on existing types

### Lights (Point / Spot / Directional)

- `decay` / power  
- `shadow.bias`, `normalBias`, `radius`, `blurSamples`  
- Shadow camera `near` / `far` / ortho size  
- Spot `target` (actor ref), optional `map`  
- Directional `target`  
- Per-mesh `castShadow` / `receiveShadow` on solids and StaticMesh  

### Materials (MeshStandard path)

- `aoMap` + `aoMapIntensity`  
- `displacementMap` / `bumpMap` + scale  
- `alphaMap`  
- `lightMap`  
- `side`, `wireframe`, `flatShading`, `depthWrite`  
- Optional promote to **MeshPhysicalMaterial** extras  

### StaticMesh

- `castShadow` / `receiveShadow`  
- Collision: convex hull / trimesh  
- Animation clips (deferred)  

### World / Renderer

- `outputColorSpace`  
- Authored `scene.environment` asset + intensity/rotation  
- Deprecate or relabel PCFSoft  

---

## 6. Missing material and texture capabilities

| Gap | Native | Suggested home | Priority |
|-----|--------|----------------|----------|
| AO map | `aoMap` | Materials Workspace | H |
| Displacement / bump | maps | Materials Workspace | M |
| Alpha map | `alphaMap` | Materials Workspace | M |
| Physical layer | MeshPhysicalMaterial | Materials type dropdown | H |
| Per-texture wrap/filter/colorSpace | `Texture` | Texture inspector in Asset Viewer | M |
| KTX2 pipeline | KTX2Loader | Import + meshLoader | H |
| HDR/EXR import as env | HDRLoader / EXRLoader | World Environment + Asset Viewer | H |

---

## 7. Missing world and environmental capabilities

| Gap | Native / addon | Home | Priority |
|-----|----------------|------|----------|
| User HDRI environment | HDRLoader + PMREM + `scene.environment` | World Settings → Environment | H |
| Sky procedural | Sky addon | World / Creation | M |
| Hemisphere light | core | Lights | H |
| Rect area light | core + UniformsLib | Lights | H |
| LightProbe from env | LightProbeGenerator | World / bake | M |
| Height fog | shader / atmosphere extend | World Fog | M |
| True volumetric depth buffer | custom / later | Atmosphere | M (after soft depth) |

---

## 8. Potentially redundant custom implementations

| Custom | Native analogue | Recommendation |
|--------|-----------------|----------------|
| Atmosphere volumetric | None first-class in WebGL core | **Keep** — complements Fog |
| Fog drift | None | **Keep** |
| brushBoolean CSG | No official CSG | **Keep** |
| BrushGizmo | TransformControls | **Keep** unless feature gap proven |
| Marquee selection | SelectionBox addon | **Keep** |
| pmndrs postprocessing | Official EffectComposer | **Keep pmndrs** — richer, already complete |
| RoomEnvironment studio | User HDRI | **Keep as fallback**; add authored env |
| ConvexBrush hull | ConvexGeometry addon | **Keep** engine-neutral hull |

---

## 9. Compatibility limitations

| Constraint | Impact |
|------------|--------|
| WebGL2 renderer only (`three` main export) | WebGPU/TSL/node materials **Deferred** |
| Single shared `WebGLRenderer` + scissor multi-view | PP must blit per pane (done); avoid fullscreen-only effects without scissor |
| Engine-neutral JSON | Do not serialize Three class instances; keep adapters in runtime |
| pmndrs PP vs official passes | Do not dual-stack composers |
| Fixed RoomEnvironment | Physical materials respond to studio IBL, not map-specific lighting until HDRI lands |
| PCFSoft deprecated in r187 | UI label/type cleanup |
| Soft particle / volume depth | Approximate occlusion; not full scene depth history for all effects |

---

## 10. Prioritized implementation backlog

Grouped by editor category. **Current milestone only** (geometry + environment authoring).  
Gameplay / animation / audio / WebGPU / characters are listed in §11 as deferred inventory — **not** in this backlog.

### P0 — High value, fits environment authoring

1. **World → Environment: authored HDRI**  
   - HDRLoader/EXRLoader → PMREM → `scene.environment` (+ intensity/rotation)  
   - Keep RoomEnvironment fallback  
   - Wire serialization on `world.scene`  
2. **Materials: `aoMap` + intensity** (+ optional bump/displacement)  
3. **Lights: expose shadow bias / normalBias / radius** (+ directional shadow camera size)  
4. **Lights: HemisphereLight** type + creation toolbar  
5. **Renderer: migrate UI off deprecated PCFSoft**; document PCF vs VSM  

### P1 — Strong environment / lighting fidelity

6. **RectAreaLight** + `RectAreaLightUniformsLib` init once per renderer  
7. **MeshPhysicalMaterial** opt-in (clearcoat, transmission, thickness, ior)  
8. **StaticMesh / import: DRACO + KTX2** loader pipeline  
9. **Per-mesh cast/receive shadow** on Brush/StaticMesh  
10. **Texture asset inspector** (wrap, filter, colorSpace, anisotropy)  

### P2 — Polish / tools

11. **Sky** addon as World backdrop option  
12. **DecalGeometry** creation tool  
13. **LightProbe** bake from env  
14. **BufferGeometryUtils** merge pass for export/optimize  
15. **ViewHelper** in viewport chrome  
16. **outputColorSpace** world renderer field  
17. **Spot/Dir light target** actor reference  

### Explicitly out of this backlog

- Multi-viewport fog/PP isolation (done; maintain only)  
- Replacing pmndrs with official EffectComposer  
- Three.js Editor embedding  
- WebGPU migration  
- Water / Reflector / Gaussian splats  

---

## 11. Deferred inventory (not in current backlog)

| Area | Examples | Status |
|------|----------|--------|
| Animation | AnimationMixer, clips on StaticMesh, SkeletonUtils | **Deferred** |
| Characters | SkinnedMesh, Bone hierarchy workspace | **Deferred** |
| Audio | AudioListener, PositionalAudio | **Deferred** |
| WebGPU / TSL | `three/webgpu`, node materials, TSL display passes | **Deferred** |
| XR | `webxr` addons | **Deferred** |
| Advanced GI | VXGI, LightMapper, CSM | **Deferred** |
| Water / mirrors | Water2, Reflector, Refractor | **Deferred** |
| Splats | GaussianSplat loaders | **Deferred** |
| Dialogue / UI / vis-script workspaces | PlaceholderWorkspace | **Deferred** (product) |

---

## 12. Suggested schema touchpoints (planning only)

When implementing P0/P1, prefer extending existing blobs:

| Data | Extension ideas |
|------|-----------------|
| `world.scene` | `environmentAssetId`, `environmentIntensity`, `environmentRotation`, `backgroundType: color\|env` |
| `world.renderer` | `outputColorSpace`; shadow type enum without Soft |
| `LightComponent` | `decay`, `shadowBias`, `shadowNormalBias`, `shadowRadius`, `shadowCamSize`, `targetActorId` |
| `MaterialDefinition` | `aoMapId`, `aoMapIntensity`, `bumpMapId`, `displacement*`, `shadingModel: standard\|physical`, physical fields |
| Texture asset meta | `wrapS/T`, `mag/minFilter`, `colorSpace`, `anisotropy` |
| `StaticMeshComponent` | `castShadow`, `receiveShadow`, `collisionType: none\|box\|convex` |

Preserve engine-neutral naming; map to Three only in adapters.

---

## 13. Source index (quick)

| Concern | Path |
|---------|------|
| World schema | `src/core/World.js` |
| Scene / lights / fog adapter | `src/runtime/SceneView.js` |
| Atmosphere | `src/runtime/atmosphere/AtmosphereController.js` |
| Studio IBL | `src/runtime/studioEnvironment.js` |
| Materials | `src/materials/MaterialDefinition.js`, `src/runtime/materialFactory.js` |
| Lights component | `src/components/LightComponent.js` |
| Mesh load | `src/runtime/meshLoader.js` |
| PP | `src/runtime/postprocessing/*`, `src/editor/postprocessing/PostProcessingSettings.jsx` |
| Viewport prefs | `src/editor/viewport/viewportPrefs.js` |
| Editor prefs | `src/editor/editorSettingsPrefs.js` |
| Level IO | `src/serialization/LevelSerializer.js`, `LevelDeserializer.js` |
| Components | `src/components/componentRegistry.js` |

---

## 14. Audit method

- Inspected installed `node_modules/three@0.187.0` exports and `examples/jsm/**` addon tree.  
- Cross-mapped BloodBound `src/**` imports, World/component schemas, DetailsPanel / Materials / PP UI, and runtime adapters.  
- Compared against pmndrs `postprocessing@6.39.6` (project FX stack) and Rapier (physics, not Three).  
- Excluded re-planning of multi-viewport fog/PP isolation work already landed on `main`.

---

*End of inventory.*
