# Acceptance — Google Drive External Art Library

## Setup (required once)

Google Drive is optional. Desktop runs without it.

1. Google Cloud Console → enable **Google Drive API**.
2. Create an **OAuth client** (Desktop app).
3. Save credentials (never commit):

```json
// .google-drive-oauth.json  (gitignored)
{ "clientId": "….apps.googleusercontent.com", "clientSecret": "…" }
```

Or set `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` in `.env`.

Optional: `GOOGLE_API_KEY` for some public folders (private shares still need OAuth).

4. Restart Vite (`npm run dev`).
5. AI Assets → Project Art Library → **External Libraries** → **Connect Google Account**.
6. Complete the browser loopback sign-in (scope: `drive.readonly`).
7. Tokens stay in `.google-drive-tokens.json` (gitignored, server-side only).

## Acceptance folder

```
https://drive.google.com/drive/folders/1YzUPmmxe8oFpy7IfiDBUtGqAbst0qE4p?usp=drive_link
```

## Checklist

| Step | Expected |
|------|----------|
| Add folder URL | Library appears with **Drive-resolved folder name** |
| Browse | Subfolders + image thumbnails (on-demand pages; Load more if paginated) |
| Preview | Full-resolution image in the detail pane |
| Multi-select | Ctrl/Cmd + Use as Reference → tray |
| Region | Select Region → drag → Send Region to Generation |
| Generation | Materializes into `project-art/.bb-art/gdrive-cache/` before OpenArt/Meshy |
| Copy to Project Art | Writable local copy with Drive provenance |
| Read-only | No remote delete / rename / move |
| Persistence | Libraries reload from `project-art/.bb-art/external-libraries.json` after restart |

## Architecture notes

- External Drive is a **source** inside Project Art Library — same gallery, tray, region, RMB menus.
- Destructive Project Art actions are hidden/blocked for `source: 'gdrive'`.
- Generation never depends on temporary Drive CDN URLs; files are downloaded to project-controlled storage first.
