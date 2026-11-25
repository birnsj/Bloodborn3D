# Phase 2H.1D — Concept Library and Prompt Database

**Baseline:** Phase 2H.1C (`83815f2`).  
**Scope:** Persistent Concept Library inside AI Assets; OpenArt generation logic unchanged.

## Goal

Area-based visual reference + reusable prompts that drive consistent BloodBound asset generation. Supports imported images and OpenArt-generated concepts.

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

- Not localStorage-authoritative.
- Concept images are **not** registered in the gameplay AssetRegistry / runtime init.
- Deleting an area/concept removes only Concept Library files — never `public/assets` textures/materials.

## OpenArt vision / analysis

**Book/CLI fact:** OpenArt CLI 0.1.1 has no image-caption, analyze, or image-to-prompt command (`generate`, `model`, `creation`, `upload`, …).

**Prototype:** `visionProvider.js` reports `VISION_UNSUPPORTED`. Analyze Image… informs the designer. Manual metadata editing remains. Extension point + `mergeAnalysisSuggestions` ready for a future approved vision provider — never auto-overwrites non-empty designer fields.

## Demonstrated flows

- Create / rename / duplicate / delete areas  
- Import concept images; enforce **10 concepts / area**  
- Generate Concept → OpenArt (estimate + explicit spend) → **Save to Concept Library**  
- Editable concept metadata + area art direction  
- Reusable prompts by category; search/filter  
- **Generate Asset** seeds OpenArt with area art direction + prompt (no auto-spend)  
- Broken references repaired on normalize  

## Verification

| Check | Result |
| --- | --- |
| Units | **761 / 761** (`phase2h1dConceptLibrary.test.js`) |
| Browser API smoke | create area, import 10, 11th → `CONCEPT_LIMIT`, vision unsupported, prompt create |
| Credits in tests | **none** |
| Lint / build / CI | required pass |

## Truncated request note

The designer prompt’s acceptance list ended mid-sentence at “Saving a”. Implementation covers the numbered requirements 1–9 and the persistence/UI acceptance implied there. If additional acceptance items were cut off, call them out for a follow-up pass.
