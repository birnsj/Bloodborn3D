# Phase 2H.1C — AI Assets Workspace

**Baseline:** Phase 2H.1B (`a1664eb`, 748 tests).  
**Scope:** UI consolidation only — no new providers, no spending-safeguard changes.

## Goal

Make **AI Assets** the primary home for AI-assisted generation. OpenArt moves from the Content Browser / Window dock into a dedicated three-column workspace.

## Layout

| Column | Role |
| --- | --- |
| Left | Provider navigation by category (Image / 3D) with status indicators |
| Center | Selected provider controls — OpenArt renders **all** CLI schema fields |
| Right | Status, preview, metadata, Import Texture / Create Material / Discard |

**Image Generation:** OpenArt (live), ComfyUI (Coming Soon)  
**3D Generation:** Meshy (Coming Soon)

## OpenArt controls

Dynamic from `model form` JSON Schema via `schemaForm.jsx`:

- Primary: aspect / resolution / negative prompt / image count / etc.
- Advanced (collapsible): seed, guidance, steps, style, unknown shapes
- Unsupported schema shapes → safe JSON/text fallback (never silently hidden)
- Estimate + explicit spend confirm unchanged from 2H.1B

## Removed standalone entry points

- Content Browser **OpenArt** tool folder
- Window → Show/Hide OpenArt dock panel
- OpenArt dockview registration

Generated assets still import into normal **Textures** / **Materials** registry folders.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **754 / 754** |
| Lint / build | pass |
| Browser | mocked harness **PASS** (`spentCredits: false`) |
| Credits spent in tests | **none** |

```js
await import('/dev/phase2h1cAiAssets.js');
await window.__phase2h1cAiAssets(); // mocked — no spend
```
