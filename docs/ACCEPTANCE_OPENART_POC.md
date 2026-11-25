# Phase 2H.1A — OpenArt Integration Proof of Concept

**Baseline:** `20eba7e` (725 tests).  
**Official CLI:** https://github.com/OpenArt-AI/cli (`openart` 0.1.1 verified on this machine).

## Goal

Prove OpenArt can feed BloodBound’s existing texture → material pipeline **before** any generation UI.

## What shipped

| Piece | Location |
| --- | --- |
| CLI adapter (fixed argv, `--json`, no shell) | `src/dev/openart/openArtCli.js` |
| Estimate → approve → one-shot generate session | `src/dev/openart/openArtSession.js` |
| Dev-only Vite API (`apply: 'serve'`) | `vite-plugins/openArtApi.js` → `/api/openart` |
| Browser client helpers | `src/io/openArtClient.js` |
| PoC script | `scripts/phase2h1a-openart/runPoc.mjs` |
| Browser harness | `public/dev/phase2h1aOpenArt.js` |
| Staging dir (gitignored) | `.openart-staging/` |
| Units | `src/tests/phase2h1aOpenArt.test.js` |

Credentials stay in the OpenArt CLI store (`%USERPROFILE%\.openart\cli-credentials.json`). The browser never sees them.

## Safety rules enforced

- Argv arrays only — prompts are a single argv element, never shell-interpolated.
- `model cost` / `--dry-run` for quotes; **no spend**.
- Paid generate requires `confirmSpend: true` against a prior `estimateId`.
- An estimate can be spent **once**; failures do not auto-retry.
- Result downloads allowlisted to `*.openart.ai` / `*.openartcdn.com` over HTTPS.
- Plugin is `apply: 'serve'` only (local development editor).

## Demonstrated workflow

```
Prompt → cost estimate (20 credits) → --approve-spend
  → async generate (history id VpVi1p1Pyra1vK7cbkUF)
  → creation wait/get → staging download
  → importTextureBuffer → material baseColorMapId
  → preview at /assets/textures/tex_c483469396d2.png
```

| Step | Result |
| --- | --- |
| CLI detect | `openart` 0.1.1 at LocalAppData install path |
| Auth / account | Plus plan; 11815 → 11795 credits (−20) |
| Models | 23 image-capable models listed |
| Cost quote | `nano-banana-2` text2image = **20** credits (1:1 / 1K) |
| Generate | One approved async submit; no retry |
| Import | `tex_c483469396d2` + `mat_8609cf1b090a` (“OpenArt PoC Ashlar”) |
| Preview | HTTP 200, ~2.1 MB PNG under `/assets/...` |

Full machine report: `scripts/phase2h1a-openart/results/poc-report.json`.

### Commands

```bash
# Quote only (default — does not spend)
node scripts/phase2h1a-openart/runPoc.mjs

# Explicit paid path
node scripts/phase2h1a-openart/runPoc.mjs --approve-spend
```

Browser (dev server):

```js
await import('/dev/phase2h1aOpenArt.js');
await window.__phase2h1aOpenArt({ approveSpend: false }); // estimate only
```

## Failure handling verified

| Case | Behavior |
| --- | --- |
| Missing / unusable CLI | `CLI_MISSING` / `CLI_FAILED` structured status (HTTP 503 via API) |
| Auth failure | `AUTH_FAILED` from CLI stderr classification (HTTP 401) |
| Generate without approval | `APPROVAL_REQUIRED` — estimate remains unspent |
| Double spend on same estimate | `ALREADY_SPENT` |
| Submit throws | estimate **not** marked spent; no automatic retry |
| Bad download host | `URL_HOST_REJECTED` |

## Tests / gate

| Check | Result |
| --- | --- |
| `npm test` | **738 / 738** (725 + 13 OpenArt) |
| Lint / build | Pass (pre-existing EditorContext warnings only) |
| Existing asset registry / import workflows | Unchanged; OpenArt reuses `importTextureBuffer` |

## Limitations / next (not in this PoC)

- No generation UI / panel yet (by design).
- CLI 0.1.1 `generate image` does not accept `--aspect-ratio` / `--resolution` flags; cost quotes those configs, generate uses model defaults.
- Brush assignment in the Level Editor is the normal “apply material” path once the material exists — no dedicated OpenArt assign UI.
- Do not start the full generation interface until the designer directs Phase 2H.1B+.
