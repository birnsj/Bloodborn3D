# Phase 2H.1D — Concept Library and Prompt Database

**Baseline:** Phase 2H.1C (`83815f2`).  
**Scope:** Persistent Concept Library inside AI Assets; OpenArt generation logic unchanged (estimate → explicit spend).

## Goal

Area-based visual reference + reusable prompts that drive consistent BloodBound asset generation. Supports imported images and OpenArt-generated concepts. Completes original acceptance: reference staging, origin IDs, concept↔asset associations, full prompt preview.

## Workspace

AI Assets top-level sections:

1. **Concept Library** — areas, concepts, prompts  
2. **Asset Generation** — existing providers (OpenArt live)

## Persistence

| Item | Location |
| --- | --- |
| Authoritative DB | `concept-library/library.json` (schemaVersion **1**) |
| Concept images | `concept-library/images/{areaId}/{conceptId}.ext` |
| Dev API | `/api/concept-library` (`vite-plugins/conceptLibraryApi.js`, serve-only) |

- Not localStorage-authoritative — restarting the editor reloads `library.json`.
- Concept images are **not** registered in the gameplay AssetRegistry / runtime init.
- Deleting an area/concept removes only Concept Library files — never `public/assets` textures/materials.
- Imported production assets store `generatedAssetRefs` on the originating concept (and prompt when present).

## OpenArt vision / analysis

**Book/CLI fact:** OpenArt CLI 0.1.1 has no image-caption, analyze, or image-to-prompt command.

**Prototype:** `visionProvider.js` reports `VISION_UNSUPPORTED`. Analyze Image… informs the designer. Manual metadata editing remains. No alternate vision provider in this phase.

## Acceptance completion (2H.1D.1)

| Requirement | Implementation |
| --- | --- |
| Auto-transfer concept refs into OpenArt staging when model supports references | `stage-reference` API + `conceptLibraryStageReference`; seeds `--image` / image2image when schema/mode allows |
| Preserve area / concept / prompt IDs through generation | `generationOrigin` on `aiAssetsUiStore`; shown on OpenArt results |
| Persist imported asset ↔ concept/prompt associations | `attach-asset` API; OpenArt Import Texture / Create Material attach when origin is set |
| View associated assets from Concept Library | Concept + Prompt detail lists; opens Asset Browser folder/selection |
| Display complete final submitted prompt before generation | Generate Asset confirm (untruncated); OpenArt controls preview; spend confirm includes full prompt |

## Demonstrated / verified flows

- Creating multiple independent areas (create / rename / duplicate / delete)  
- Importing concept images  
- Enforcing **10 concepts / area** (`CONCEPT_LIMIT`)  
- Saving a generated concept using mocked OpenArt responses (`Save to Concept Library`)  
- Creating and editing reusable prompts  
- Launching asset generation from a saved concept prompt (seeds OpenArt; **no auto-spend**)  
- Preserving concept-to-asset associations (`generatedAssetRefs`)  
- Restarting the editor without losing database content (`library.json`)  
- Missing images / deleted references: normalize drops broken links; `stage-reference` → `MISSING_IMAGE`; image GET → 404 JSON  

## Spending safeguards (unchanged)

- Estimate before Generate  
- Explicit `confirmSpend: true` only  
- No automatic retries that spend again  
- Unit tests never call paid generation  

## Verification

| Check | Result |
| --- | --- |
| Units | **768 / 768** including `phase2h1dConceptLibrary.test.js` (prompt/ref/association helpers) |
| Credits in tests | **none** |
| Vision provider | unsupported only |
| Lint / build / CI | required pass |
