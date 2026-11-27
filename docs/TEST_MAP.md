# Test Map — what protects what

Tests are named by build phase. This maps them to features. Manual sections refer to
[`MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md`](./MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md) (A–G).
Automated tests run in Node (no GPU, no React rendering). Anything visual relies on the manual checks.

Last verified: 1252 tests / 132 files passing; build passes (editor + player pages).

| Feature | Automated tests (`src/tests/`) | Manual |
|---|---|---|
| Architecture rules (core/runtime/editor boundaries) | architectureBoundaries | — |
| Save / load / schema / data integrity | serialization, levelSchemaVersion, phase2f7eDataIntegrity, phase2gPrerequisites, consolidationC6Foundation, dirtyTracking, saveAllRegistry | A |
| Undo / commands / hierarchy | history, componentPropertyCommands, deleteHierarchy, hierarchy | A |
| Play / Stop / runtime lifecycle | gameRuntimeLifecycle, playRestore, physicsWorldDisposal, phase2f7fPhysics, phase2f7fStabilization | G |
| Construction (walls, stairs, ramps, arches, curved, ceilings, openings) | brushFactory, wallJoin, wallOpenings, stair, curvedStair, ramp, curvedWall, archGeometry, ceilingBrush, creationToolbar, surfacePlacement, gridSnap, units, multilevelAcceptance, *Acceptance (curved*, creationToolbar) | B |
| Subtractive maps / carving / batching | brushBoolean, phase2f7aSubtractive, worldSolidFit, subtractiveMazeFactory, newMapFactory, phase2gRenderBatching, phase2gRenderingIntegration | B |
| Convex brush geometry editing | phase2f0ConvexBrush, phase2f1FaceEditing, phase2f2EdgeEditing, phase2f3VertexEditing, phase2f4ExtrusionClipping, phase2f5Integration, batch5Geometry | B |
| Surfaces / UV / align | surfaces, surfaceSelection, alignSurfaces, faceUvFit, uvMapping, batch8UvRegression, phase2e5Persistence | C |
| Materials / textures / PBR | batch2Materials, batch8Textures, materialDraft, materialPreviewBake, materialThumbnailBake, pbrGeneration | C |
| Static meshes / assets / pivot | batch6StaticMeshes, batch6AcceptanceCorrections, batch7AssetTools, batch71PivotEditing, batch7AcceptanceVerification, glbPivot, meshThumbnail, contentFolders, folderForKind, sampleAssets, retryableAssetLoads | C |
| Lighting / environment / atmosphere / post-processing | batch3Lighting, batch4Environment, worldEnvironment, worldSceneRenderer, atmosphereController, postProcessing | D |
| Prefabs / cells / authoring layers | prefab, prefabHardening, batch9AuthoringLayers, batch9AcceptanceClosure | E |
| Multi-viewport / cameras / selection | phase2f6MultiViewport, viewportCameras, viewportIsolation, viewportRenderIsolation, viewportPrefs, paneScissor, marqueeSelection, brushGizmo | F |
| GPU lifecycle / performance / sync | gpuResources, c5GpuLifecycle, sceneViewStaleMaterials, phase2f7bAssetLifecycle, phase2f7cIncrementalSync, performanceStabilization, phase2f7gStabilization, consolidationC4Geometry | F, G |
| Editor shell (layouts, dialogs, menus, settings, help) | dockLayout, workspaceLayouts, editorLifecycle, editorDialogs, editorContextMenu, editorSettingsPrefs, hoverHelp, colorThemes, collapsibleGroup, viewScale, sessionRecorder | — |
| Tutorials | tutorials, coachMark | — |
| AI assets (OpenArt, Meshy, Drive, Project Art) | phase2h1aOpenArt, phase2h1bOpenArtEditor, phase2h1cAiAssetsWorkspace, phase2h1dConceptLibrary, projectArtSchema, projectArtLibraryUi, promptComposition, generationFrame, regionHandoff, cropRegionImage, sendToGenerationOptionalPrompt, meshyCapabilities, meshyImageTo3d, googleDriveExternalLibrary, pipelineHardening | — |
| Standalone player (runs a level without the editor) | standalonePlayer, architectureBoundaries (player closure) | Open `/player.html?level=<name>` |
| Whole-editor integration | integratedEditorAcceptance, phase2b, phase2bManualChecks, phase2cVerification, phase2f7hAuditCorrections | G |

## Known gaps

- No React component tests: panels (Details, Outliner, Content Browser, AI Assets UI) are not covered beyond store/logic tests.
- No rendering tests: how things look, GPU memory and frame rate are checked only by manual checks and browser harnesses (`src/dev/*Acceptance.js`).
- No automated end-to-end test of Save As, drag-and-drop, or Prefab apply/revert UI (manual only).
- The standalone player's actual rendering and movement are verified by hand in a browser (Gothic mansion verified); Node tests cover its asset loading and its isolation from editor code.
- Three geometry-editing fixture levels (`acceptance-convex-brushes`, `-extrusion-clipping`, `-vertex-editing`) reference placeholder material names that are not in the registry. Exempted by name in `standalonePlayer.test.js`.
- Placeholder workspaces (World Map, Characters, Animation, Visual Scripting, Dialogue, UI Editor) have no code to test.
