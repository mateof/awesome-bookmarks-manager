# AwesomeBookmarks — Documentation

Programmatic access to a self-hosted AwesomeBookmarks instance, for native
apps, scripts and AI assistants.

## Contents

- [authentication.md](./authentication.md) — API tokens, the security model
  behind headless access, and how encryption still applies.
- [api.md](./api.md) — the public REST API (`/api/v1`): every endpoint,
  request/response shapes and `curl` examples.
- [mcp.md](./mcp.md) — the Model Context Protocol server that lets an AI
  (Claude Desktop, etc.) add, search and manage bookmarks.

## The two surfaces

| Surface | Path | Auth | For |
|---------|------|------|-----|
| Internal web API | `/api/*` | session cookie | the bundled web app only |
| Public API | `/api/v1/*` | `Authorization: Bearer <token>` **or** session cookie | native apps, scripts, MCP |

The public API is the stable, documented, versioned surface. Build against
`/api/v1`. The internal `/api/*` routes back the web SPA and may change.

## 60-second start

1. Open the web app, go to **Settings → API**, create a token, copy it.
2. Call the API:

   ```bash
   curl https://your-host/api/v1/bookmarks \
     -H "Authorization: Bearer <token>"

   curl -X POST https://your-host/api/v1/bookmarks \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://example.com","title":"Example"}'
   ```

3. For AI access, point an MCP client at the bundled server — see
   [mcp.md](./mcp.md).

## Data model in one glance

- **Folders** nest arbitrarily (`parentId`). A `null` parent means the root.
- **Bookmarks** live in a folder (`folderId`, `null` = root) and carry a
  url, title, rich-text description, icon, tags and an auto-captured page
  snapshot.
- **Tags** are flat, per-user, name + color. Bookmarks/folders reference
  them by id (`tagIds`).

Everything is per-user and encrypted at rest — see
[authentication.md](./authentication.md) for what that means for tokens.
