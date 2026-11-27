# Acceptance — Content Browser categories

Named category headers in the Content Browser for organizing folders.

## Behaviour

- **Category** in the Content Browser header (or right-click empty space → Add Category) prompts for a name and creates a top-level section header.
- When the registry has no categories, a default top section **Project Content** is inserted so built-in folders sit under one organization header. Category rows use a section icon (not a folder icon).
- Categories are **section chrome only** — they are not part of the folder path structure. Folder paths never nest under a category (`Textures/Walls` stays a real nest; `Characters` as a category does not own `Characters/Models`).
- Folders that follow a category in list order (until the next category) render indented under it. Click the header or chevron to collapse/expand that section (same collapse for any real folder that has path children).
- **Collapse All** collapses every category and folder that currently has children.
- **New** while a category is selected creates a normal top-level folder and places it in that category’s section.
- Drag / Move To a category places the folder in that section without changing its path role beyond promoting a nested folder to root when needed.
- Categories stay at the root; they cannot be nested or reparented under another folder.
- Drag shows an insert line at the top/bottom of a row (place beside) or a highlight in the middle (nest into / drop into section). Same drop-line pattern is used in Outliner and Layers.
- Right-click supports Duplicate (header only) and Copy To. Delete removes the header; section folders stay.
- Right-click → **Icon Color…** opens a color picker (native swatch + hex + most-used history) for the folder/category icon (`folderMeta[path].iconColor`). Clear removes the tint.
- Assets cannot be moved onto a category header — put them in a real folder.
- Folder and asset lists support multi-select: **Shift** range, **Ctrl/Cmd** toggle, **Alt** remove.
- Persisted in the asset registry as `folderMeta[path] = { kind: 'category', iconColor? }` (virtual paths, not on-disk directories). Plain folders may store `{ iconColor }` only.

## Verify

- Automated: `contentFolders.test.js` (create category, section placement, collapse members, copy header only, block nesting, block move-asset into category, icon color set/clear); `listMultiSelect.test.js`; `iconColor.test.js`.
- Manual: Content Browser → Category → folders listed under it collapse with the chevron → **Collapse All** → expand one section → Duplicate → Delete empty category (folders remain). Right-click a folder → Icon Color → confirm tint.
