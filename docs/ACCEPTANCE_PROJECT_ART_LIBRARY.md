# Phase 2H.1E — Project Art Library

**Status:** Done (Bridge redesign)  
**Scope:** Filesystem-driven Adobe Bridge–style Project Art Library: browse, organize, inspect, and hand off to Asset Generation. The library is **not** a second asset generator.

## Goals

1. Rename Concept Library → **Project Art Library**.
2. Filesystem under `project-art/` is authoritative for image discovery.
3. Metadata, collections, prompts, and associations live in `project-art/.bb-art/library.json`.
4. Multi-select + persistent **Generation References** tray across folders and AI Assets tabs.
5. Inspector tabs: **Details** / **Prompt** / **Generation** (saved prompts + provenance; no new-request construction).
6. **Send to Generation** / **Use as Reference** hand off into Asset Generation — estimate/spend remains manual.

## Layout

AI Assets tabs:

1. **Project Art Library** — Bridge three-column browser  
2. **Asset Generation** — OpenArt pipeline (prompt templates, instructions, tiling, generate)

Project Art columns (resizable):

| Column | Contents |
| --- | --- |
| Left | Project Library filters (All / Recent / Favorites), Projects folder tree, Collections, Tags |
| Center | Breadcrumb, search/sort/import, thumbnail grid, status bar, Generation References tray |
| Right | Large preview + Details / Prompt / Generation tabs + Send to Generation / Use as Reference |

## Split of responsibilities

| Concern | Project Art Library | Asset Generation |
| --- | --- | --- |
| Browse / organize / tags / collections | Yes | — |
| Edit saved working prompt + metadata | Yes | — |
| View original prompt / provenance | Yes | — |
| Prompt template / instructions / Compose Prompt | — | Yes |
| Region selection on preview (Send Region to Generation) | Yes | Crops region → OpenArt --image |
| Horizontal / vertical tiling | — | Yes |
| Estimate / spend / OpenArt form | — | Yes |
| Persistent reference tray | Yes (source of truth) | Shows tray thumbs when composing |

## Persistence

| Item | Path |
| --- | --- |
| Artwork files | `project-art/**` (gitignored binaries) |
| Metadata DB | `project-art/.bb-art/library.json` (tracked) |
| Thumb cache dir | `project-art/.bb-art/thumbs/` (gitignored; optional) |
| Gameplay assets | unchanged under `public/assets/` |

Legacy `concept-library/` remains readable for one-shot migration when the project-art library is empty.

## Vision / prompts

- OpenArt CLI has no separate image-analysis API — `VISION_UNSUPPORTED` for captioning.
- **Compose Prompt** (Asset Generation) builds template wording (`source: 'template'`). Visual material comes from the attached cropped **image reference** submitted to Nano Banana 2 via `--image`.
- Final OpenArt composition still uses existing tiling helpers — do not double-append tiling in Send to Generation.

## Prompt Templates + selected region

- **Templates** (`promptTemplates.js`, `PROMPT_TEMPLATES`) are data-driven definitions (framing, technical constraints, orthographic / isolated / tiling-relevant flags, output type). Includes **3D Model Reference** and **Sprite**. `ASSET_CATEGORIES` is derived for dropdown labels.
- **Asset Generation → Prompt Templates**: pick a template (e.g. Wall Texture), optional instructions, then **Compose Prompt**. Output is template-based; the cropped reference supplies visual detail. The generated body has **no tiling sentences** — tiling is appended once from the existing Tile Horizontal / Vertical checkboxes (and `composeGenerationPrompt` skips the append if the body already says "seamless … tiling"). **Save Prompt** writes a Project Art prompt and, when the origin has `sourceItemId`, updates that item's `generationPrompt`.
- **Region workflow**: in the Project Art preview, **Select Region** → drag a rectangle (stored normalized 0..1 against the image's natural size in `aiAssetsUiStore.selectedRegion`) → **Send Region to Generation**. The rectangle is **cropped** and uploaded into `.openart-staging` as the OpenArt `--image` reference (image2image). Source image, region coordinates, cropped staging metadata, template id, and source item travel in `generationOrigin` (`sourceRegion`, `croppedReference`, `promptTemplateId`, `sourceItemId`). No separate vision analysis step.
- **Provenance**: saving a result to Project Art records `promptTemplateId`, `assetCategory`, `sourceRegion`, `sourceItemId`, `croppedReference` alongside the existing prompt and tiling fields.

## Acceptance checklist

| Criterion | Verify |
| --- | --- |
| Import multiple images | Gallery Import / OS drop into folder |
| Organize folders | mkdir / rename / delete / move / Explorer open |
| Collections | Create collection from multi-folder items |
| Reference tray | Multi-select → Use as Reference; survives folder + tab switch |
| Prompt edit/save | Prompt tab edits working prompt; Save Prompt persists |
| Send to Generation | Seeds OpenArt; no auto estimate/spend |
| Use as Reference | Adds to tray without replacing generation prompt |
| Generation construction only in Asset Generation | Category / Compose Prompt / tiling absent from library inspector |
| Save generation into folder | **Save to Project Art** when `artSaveTargetFolder` set |
| Rename/move preserves IDs | item id stable; `relativePath` updated |
| Restart persistence | library.json + folders survive reload |
| No credit spend in tests | Unit tests + mocked flows only |

## Primary files

- `src/editor/projectArt/*` (panel, store, schema, `generationHandoff.js`)
- `vite-plugins/projectArtApi.js`
- `src/io/projectArtClient.js`
- `src/editor/aiAssets/AiAssetsWorkspace.jsx`, `aiAssetsUiStore.js`
- `src/editor/openart/OpenArtControls.jsx`
- `src/tests/projectArtSchema.test.js`, `projectArtLibraryUi.test.js`
