# Acceptance — Help Encyclopedia

Searchable concept glossary under Help → Encyclopedia….

## Behaviour

- Help → **Encyclopedia…** opens a modal dialog (Esc / backdrop / Close dismiss).
- Left pane: search filter + terms grouped by category.
- Right pane: selected term title, category, definition, and **See also** links that jump to related terms.
- Content is a curated glossary (Brush, Cell, Prefab, Surface, eu, World Solid, …), not a dump of Hover Help control tips.
- Hover Help entry `help.encyclopedia` describes the menu item.

## Verify

- Automated: `encyclopedia.test.js` (catalog size, search filter, seeAlso integrity, Help content).
- Manual: Help → Encyclopedia… → search “brush” → open Brush → follow See also → Esc closes.
