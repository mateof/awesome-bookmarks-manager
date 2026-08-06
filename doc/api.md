# Public REST API (`/api/v1`)

Stable, versioned API for native apps, scripts and the MCP server.

- **Base URL:** `https://<your-host>/api/v1`
- **Auth:** `Authorization: Bearer <token>` (see
  [authentication.md](./authentication.md)) or a browser session cookie.
- **Content type:** `application/json` for request bodies.
- **IDs:** UUID v4 strings.
- **Errors:** non-2xx responses carry `{ "error": string, "code": string }`.

All examples assume:

```bash
HOST=https://your-host
TOKEN=your-api-token
auth() { curl -s -H "Authorization: Bearer $TOKEN" "$@"; }
```

---

## Identity

### `GET /me`
Returns the authenticated user.

```bash
auth $HOST/api/v1/me
```
```json
{ "id": "…", "email": "me@example.com", "nickname": "me", "role": "admin",
  "autoSnapshots": true, "createdAt": "2026-05-01 10:00:00" }
```

---

## Folders

A folder:
```json
{ "id": "…", "parentId": null, "name": "Work", "description": null,
  "iconBlobPath": null, "imageBlobPath": null, "bgColor": null,
  "position": 0, "tagIds": [], "createdAt": "…", "updatedAt": "…" }
```

### `GET /folders`
List every folder (flat; build the tree client-side from `parentId`).

### `GET /folders/:id`
Fetch one folder.

### `POST /folders`
Create a folder. Body:

| field | type | required | notes |
|-------|------|----------|-------|
| `name` | string (1–256) | yes | |
| `parentId` | uuid \| null | no | null/omit = root |
| `description` | string | no | rich text (sanitized HTML) |
| `tagIds` | uuid[] | no | |
| `bgColor` | string \| null | no | `#rrggbb`, `#rrggbbaa` or `rgba(...)` |

```bash
auth -X POST $HOST/api/v1/folders \
  -H "Content-Type: application/json" \
  -d '{"name":"Reading","parentId":null}'
```
→ `201` with the created folder.

### `PATCH /folders/:id`
Update `name`, `description`, `tagIds` and/or `bgColor`. Only provided
fields change.

### `POST /folders/:id/move`
Move/reorder a folder. Body: `{ "newParentId": uuid|null, "position": int }`.
Rejects moves that would create a cycle.

### `DELETE /folders/:id`
Soft-delete a folder. → `204`.

---

## Bookmarks

A bookmark:
```json
{ "id": "…", "folderId": null, "title": "Example", "url": "https://example.com",
  "description": null, "iconBlobPath": null, "imageBlobPath": null,
  "bgColor": null, "snapshotStatus": "pending", "hasSnapshot": false,
  "position": 0, "tagIds": [], "createdAt": "…", "updatedAt": "…" }
```

`snapshotStatus` is one of `none | pending | running | ready | error`.

### `GET /bookmarks`
List bookmarks. Query params (all optional):

| param | type | notes |
|-------|------|-------|
| `folderId` | uuid | only this folder |
| `tagId` | uuid | only bookmarks with this tag |
| `q` | string | substring filter over title/url/description |
| `limit` | int | cap the count |

```bash
auth "$HOST/api/v1/bookmarks?folderId=$FID&limit=50"
```

### `GET /bookmarks/:id`
Fetch one bookmark.

### `POST /bookmarks`
Create a bookmark. A favicon and full-page snapshot are captured in the
background (unless the account disabled auto-snapshots). Body:

| field | type | required | notes |
|-------|------|----------|-------|
| `url` | string (url) | yes | |
| `title` | string (1–1024) | no | auto-filled from the page if omitted |
| `description` | string | no | rich text |
| `folderId` | uuid \| null | no | null/omit = root |
| `tagIds` | uuid[] | no | |
| `bgColor` | string \| null | no | |
| `fetchSnapshot` | boolean | no | default `true` |

```bash
auth -X POST $HOST/api/v1/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","title":"Example","tagIds":[]}'
```
→ `201` with the created bookmark.

### `PATCH /bookmarks/:id`
Update `title`, `url`, `description`, `folderId`, `tagIds`, `bgColor`.
Changing `url` re-queues a snapshot. Only provided fields change.

### `POST /bookmarks/:id/move`
Move/reorder. Body: `{ "newFolderId": uuid|null, "position": int }`.

### `POST /bookmarks/:id/refresh-snapshot`
Re-queue favicon + snapshot capture. → `{ "ok": true }`.

### `DELETE /bookmarks/:id`
Soft-delete. → `204`.

---

## Tags

A tag: `{ "id": "…", "name": "dev", "color": "#3b82f6" }`.

### `GET /tags`
List all tags.

### `POST /tags`
Create. Body: `{ "name": string(1–64), "color"?: "#rrggbb" }` (color
defaults to a neutral gray). → `201`. `409` if the name already exists.

### `PATCH /tags/:id`
Update `name` and/or `color`.

### `DELETE /tags/:id`
Delete a tag (removed from all bookmarks/folders). → `204`.

---

## Search

### `GET /search`
Full-text search over page snapshots (SQLite FTS5) plus fuzzy
(Levenshtein) matching on titles and URL hosts. Query params:

| param | type | required | notes |
|-------|------|----------|-------|
| `q` | string (1–256) | yes | |
| `folderId` | uuid | no | scope to a folder + its descendants |
| `limit` | int (1–100) | no | default 50 |

```bash
auth "$HOST/api/v1/search?q=rust"
```
```json
[ { "bookmark": { "id": "…", "title": "…", "url": "…", … },
    "snippet": "…<mark>rust</mark>…" } ]
```

---

## Quick-add (browser-extension endpoint)

Outside `/api/v1` but token-authenticated and handy for a one-shot "save
this URL":

### `POST /api/ext/quick-add`
Body: `{ "url": string, "title"?: string, "folderId"?: uuid|null, "tags"?: string[] }`.
Note `tags` here are **names** (created if missing), unlike the `/api/v1`
bookmark endpoints which take `tagIds`.

---

## Notes & limits

- Request body limit: 64 MB. Uploaded images (icons/backgrounds) go through
  the internal `/api/*` multipart endpoints, not `/api/v1`.
- Global rate limit safety net applies; there is no per-endpoint quota.
- Deletes are soft (data is retained server-side, hidden from listings).
