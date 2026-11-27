# Acceptance — Scene Outliner categories

Category section headers in the Scene Outliner (same idea as Content Browser categories).

## Behaviour

- **Category** in the Outliner toolbar creates a named section header.
- Categories are list-order chrome only — they are not actors and do not change `parentId` hierarchy.
- Root actors that follow a category in outliner order (until the next category) render under it and collapse with the header.
- **Collapse All** collapses every category and parent actor that currently has children.
- Drag actors onto a category to place them in that section; drag categories to reorder.
- Delete category removes the header only; actors stay in the level.
- Right-click → **Icon Color…** opens the shared color picker (most-used colors remembered) for the category or actor icon (`categories[id].iconColor` / `actor.iconColor`). Clear removes the tint.
- Persisted on the level as optional `outliner: { rootOrder, categories }` and optional actor `iconColor` (no schema bump).

## Verify

- Automated: `outlinerLayout.test.js`; `iconColor.test.js`
- Manual: Outliner → Category → drag root actors under it → collapse → **Collapse All** → Delete category (actors remain) → Icon Color on actor/category → Save/reload.
