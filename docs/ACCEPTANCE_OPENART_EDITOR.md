# Phase 2H.1B — OpenArt Editor Integration

**Baseline:** Phase 2H.1A (`ba054b9`, 738 tests).  
**Adds:** OpenArt generation panel in the Content Browser / Asset Viewer + optional dock panel.

## Goal

Integrate OpenArt image generation into BloodBound’s existing asset browser using the PoC adapter, session gate, and texture/material pipelines — without automatic paid generation.

## What shipped

| Piece | Location |
| --- | --- |
| Module UI store (survives panel unmount) | `src/editor/openart/openArtUiStore.js` |
| Generation panel | `src/editor/openart/OpenArtGeneratePanel.jsx` |
| Content Browser tool folder `OpenArt` | `AssetBrowserContext` + `ContentBrowser` + `AssetViewer` |
| Optional dock panel + Window menu | `dockPanels.jsx`, `dockLayout.js`, `AppMenuBar.jsx`, layout prefs/schema |
| Reference upload API | `vite-plugins/openArtApi.js` (`upload-reference`) |
| Units (mocked; **no credit spend**) | `src/tests/phase2h1bOpenArtEditor.test.js` |
| Browser harness (mocked by default) | `public/dev/phase2h1bOpenArtEditor.js` |

Reuses 2H.1A: CLI adapter, session estimate→approve, `/api/openart`, `openArtClient`, `importTextureBuffer` / material creation.

## UI surface

- Auth / connection status pill + credit balance + Refresh
- Model + mode selects (from CLI `model list` / form schema)
- Prompt + dynamic model-specific parameters from `model form`
- Aspect / resolution when present in schema
- Reference image upload for image2image (staged locally; absolute path only to CLI)
- Estimate (cost quote) + **Generate…** with explicit spend confirm dialog
- Progress / status, preview, Import as Texture, Create Material from Image, Discard
- No automatic retries; duplicate submits blocked via `submitLocked`

## Safety

- No automatic paid generation — `confirmSpend: true` required after UI confirm
- No automatic generation retries
- No credentials in browser state or repository
- Automated tests and the default browser harness **never spend credits**
- Geometry / gameplay / map generation untouched
- No additional providers

## Verification

| Check | Result |
| --- | --- |
| Prior suite | **738** preserved |
| New 2H.1B units | mocked connect / estimate / approve gate / generate / discard / CLI missing |
| `npm test` | **748 / 748** (prior + 2H.1B + dock visibility updates) |
| `npm run lint` | exit 0 |
| `npm run build` | succeeds |
| Browser harness | mocked workflow **PASS** (`ok: true`, `spentCredits: false`); live estimate-only optional |

### Browser

```js
await import('/dev/phase2h1bOpenArtEditor.js');
await window.__phase2h1bOpenArtEditor();           // mocked — no spend
await window.__phase2h1bOpenArtEditor({ mock: false }); // live estimate only
```

PoC result from 2H.1A remains valid for import path verification (`scripts/phase2h1a-openart/results/poc-report.json`). Do not request another paid generation until the designer approves.

## Manual editor walkthrough

1. Dev server with OpenArt CLI installed and authenticated.
2. Content Browser → **OpenArt** (or Window → Show OpenArt).
3. Confirm Connected + credit balance.
4. Choose model/mode, enter prompt, **Estimate** — note cost.
5. **Generate…** → approve spend dialog (or Cancel).
6. Preview → Import as Texture / Create Material / Discard.
7. Switch Content folders mid-run — status remains in the module store.
