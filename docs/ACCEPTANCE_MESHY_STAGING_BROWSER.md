# Acceptance — Meshy Content Browser import (+ staging peek)

## Content Browser (what designers want)

- **Import Model** imports the GLB into **Meshes** and, when available, PBR maps into **Textures/&lt;asset name&gt;** (fetch is free; no extra generation spend).
- **Import maps to Content Browser** (PBR section) does the map import alone for an already-finished task.
- Asset Viewer / Content Browser then show those textures like any other project texture.

## Staging (advanced)

- Optional **Staging files** panel still lists `.meshy-staging` for debugging.
- Localhost APIs: `staging-list`, `staging-file`, `import-texture-maps`.

## Verify

- Automated: `meshyStagingBrowse.test.js`.
- Manual: Restart Vite → Import Model on a textured Meshy result → Content Browser **Textures/&lt;name&gt;** shows albedo/normal/etc.
