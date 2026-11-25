# Phase 2H.1E — Project Art Library

**Status:** Done  
**Scope:** Evolve Concept Library into a filesystem-driven Adobe Bridge–style Project Art Library with reference tray, template prompt composition, and Asset Generation handoff. No automatic paid generation.

## Goals

1. Rename Concept Library → **Project Art Library**.
2. Filesystem under `project-art/` is authoritative for image discovery.
3. Metadata, collections, prompts, and associations live in `project-art/.bb-art/library.json`.
4. Multi-select + persistent **Generation References** tray across folders and AI Assets tabs.
5. **Generate Asset Prompt** panel with category, tiling, template composition (vision still unsupported on OpenArt CLI).
6. **Send to Asset Generation** transfers prompt, refs, tiling, category, and IDs — estimate/spend remains manual.

## Layout

AI Assets tabs:

1. **Project Art Library** — folders / gallery / preview + prompt  
2. **Asset Generation** — existing OpenArt pipeline  

Three-column Project Art UI (resizable): folders + collections | thumbnail gallery + refs tray | preview + metadata + Generate Asset Prompt.

## Persistence

| Item | Path |
| --- | --- |
| Artwork files | `project-art/**` (gitignored binaries) |
| Metadata DB | `project-art/.bb-art/library.json` (tracked) |
| Thumb cache dir | `project-art/.bb-art/thumbs/` (gitignored; optional) |
| Gameplay assets | unchanged under `public/assets/` |

Legacy `concept-library/` remains readable for one-shot migration when the project-art library is empty.

## Vision / prompts

- OpenArt CLI has no image analysis — `VISION_UNSUPPORTED`.
- **Analyze References & Create Prompt** falls back to **template** composition (`source: 'template'`), clearly labeled in UI.
- Texture categories append orthographic / tiling constraints in the template path.
- Final OpenArt composition still uses existing tiling helpers — do not double-append tiling in Send to Generation.

## Acceptance checklist

| Criterion | Verify |
| --- | --- |
| Import multiple images | Gallery Import / OS drop into folder |
| Organize folders | mkdir / rename / delete / move / Explorer open |
| Collections | Create collection from multi-folder items |
| Reference tray | Multi-select → Add; survives folder + tab switch |
| Prompt create/edit/save | Category + instruction → template compose → Save Prompt |
| Send to Asset Generation | Seeds OpenArt; no auto estimate/spend |
| Save generation into folder | **Save to Project Art** when `artSaveTargetFolder` set |
| Rename/move preserves IDs | item id stable; `relativePath` updated |
| Restart persistence | library.json + folders survive reload |
| No credit spend in tests | Unit tests + mocked flows only |

## Primary files

- `src/editor/projectArt/*`
- `vite-plugins/projectArtApi.js`
- `src/io/projectArtClient.js`
- `src/editor/aiAssets/AiAssetsWorkspace.jsx`, `aiAssetsUiStore.js`
- `src/tests/projectArtSchema.test.js`, `projectArtLibraryUi.test.js`
