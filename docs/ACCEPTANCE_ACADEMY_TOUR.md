# Acceptance — Academy Tour all

Timed walkthrough of every Academy lesson and step that performs each tip’s instruction.

## Behaviour

- Academy → **Tour all lessons** (also Help → **Tour all Academy…**) starts the queue in lesson `order` (Stop Academy Tour while running).
- **Speed** (0.5×–3×) beside Tour all and on the tour banner shortens tip waits and cursor/orbit motion; persists in tutorial prefs.
- Each catalog row also has **Tour** to auto-walk only that lesson; when it finishes, Academy reopens and the lesson is marked Done.
- Academy panel hides for the tour/lesson so tips are not covered; it reappears on stop/exit (and when a single-lesson tour finishes).
- Per tip, the tour switches viewport layout / Cam / Fog / Mist / PP / display as needed (single roomy pane for build/pick demos; quad or Cam when the tip is about those).
- Tour tips stay compact and clear of the control and viewport action zone (no full-screen dim); Stop lives on the banner.
- Each coach tip shows briefly, then the tour executes the step so the viewport shows the instruction: orbit/focus like a user for camera tips, pick actors/faces via the same raycast path as a click, create brushes/lights, set Cam, Play/Stop, etc.
- A fake on-screen cursor follows those actions (RMB drag for orbit, LMB click for picks/UI).
- Tips that belong in **Materials** or **AI Assets** switch those workspace tabs; other tips return to **Level Editor**. Placeholder modules (World Map, Characters, …) are not opened.
- Save / spend / generate / **Record** highlights are not auto-clicked (Record’s browser tab picker cannot be Cancelled from the page). While touring, every editor popup is auto-dismissed: Save/filename prompts → Cancel; unsaved leave confirms → Discard/OK; alerts → OK. Open Cam / View / File menus and other dropdowns are closed after tip clicks so they never cover the action.
- If a step cannot be verified after execution, the tour skips ahead so it keeps moving.
- Chained lessons use `restartTutorialSession` so Stop restores the project in one pop (no nested black tutorial frames).
- Tour forces Unlit + fog off so sparse starters are readable.
- Does **not** mark lessons Done. Esc also stops.
- Help: `panel.tutorials.tour`.

## Verify

- Automated: `tutorials.test.js` tour queue / progress helpers + tour execute unit checks.
- Manual: Academy → Tour all lessons → tips advance with visible changes (not empty black voids) → Esc restores the project level; Done badges unchanged.
