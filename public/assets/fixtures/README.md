# Batch 7 decode / import fixtures

Licensed third-party samples used for acceptance verification. Served locally under `/assets/fixtures/` — **no CDN at runtime**.

| Path | Source | License | Purpose |
|------|--------|---------|---------|
| `meshopt_triangle.glb` | BloodBound-generated | Project | Meshopt decode smoke |
| `draco/Box.*` | [Khronos glTF-Sample-Assets Box](https://github.com/KhronosGroup/glTF-Sample-Assets) | CC-BY 4.0 (Cesium) | DRACO geometry decode |
| `draco/Duck.*` | Khronos Duck | SCEA Shared Source 1.0 (Sony) | Textured DRACO decode |
| `ktx2/2d_*.ktx2` | [three.js r187](https://github.com/mrdoob/three.js) `examples/textures/ktx2` | MIT | KTX2/Basis transcoder |
| `ktx2/ktx2_quad.gltf` | BloodBound wrapper + three.js UASTC | MIT + project | GLTFLoader + `KHR_texture_basisu` |
| `gltf/Box.*` | Khronos Box (plain) | CC-BY 4.0 | GLTF import baseline |
| `fbx/vCube.fbx` | three.js r187 examples | MIT | FBX import |
| `collada/polygons.dae` | three.js r187 examples | MIT | Collada import |

License text copies: `licenses/`.

Compression **encode** remains deferred — fixtures are pre-compressed samples only.
