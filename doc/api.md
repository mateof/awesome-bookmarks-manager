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

## Getting started (mobile app / browser extension)

1. **Create a token** — in the web app: **Settings → API → New token**. Copy
   it (shown once). It has the same permissions as your account and decrypts
   your data server-side, so treat it like a password. Revoke it any time from
   the same screen.
2. **Call the API** with `Authorization: Bearer <token>` against
   `https://<your-host>/api/v1`.
3. **CORS** — browser-based clients (an extension page, a PWA on another
   origin) are subject to CORS; set `CORS_ORIGIN` on the server to your
   client's origin (comma-separated for several). Native mobile apps and
   server-side scripts are not affected.

Minimal JavaScript client:

```js
const HOST = "https://your-host";
const TOKEN = "…";
const api = (path, init = {}) =>
  fetch(`${HOST}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  }).then((r) => (r.status === 204 ? null : r.json()));

const me = await api("/me");
const recent = await api("/bookmarks?limit=50");
await api("/bookmarks", {
  method: "POST",
  body: JSON.stringify({ url: "https://example.com", tagIds: [] }),
});
```

The full model: fetch `/folders` and `/bookmarks` once, then build the tree
client-side from `parentId` / `folderId`. Everything is UUID-keyed and cheap to
cache locally.

---

## Server

### `GET /version`
The running product version, the same one the git tag and the Docker image
label carry.

```json
{ "version": "0.20.1" }
```

Authenticated like the rest of `/api/v1`: there is no reason to advertise the
version to unauthenticated visitors, and every client that wants it is signed
in anyway. In a container the value comes from the `APP_VERSION` environment
variable, baked in at build time; from a source checkout it is read from the
workspace root `package.json`.

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
  "favorite": false, "aliasOf": null,
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
| `favorite` | bool | only starred bookmarks (`?favorite=1`) |

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

## Favourites

Folders and bookmarks carry a `favorite` boolean. Set it through the normal
update endpoints:

```bash
auth -X PATCH "$HOST/api/v1/bookmarks/$BID" -d '{"favorite":true}'
auth -X PATCH "$HOST/api/v1/folders/$FID"   -d '{"favorite":true}'
```

List only the starred bookmarks with `GET /bookmarks?favorite=1`.

---

## Symlinks

A symlink is a row that lives in one folder but mirrors a folder/bookmark that
lives elsewhere. Reads resolve the target's current content, so editing the
original is reflected everywhere it is linked. Alias rows expose `aliasOf` with
the target's id.

### `POST /aliases`
```json
{ "targetType": "folder" | "bookmark", "targetId": "…", "parentId": "…" | null }
```
Creates the link inside `parentId` (root when null) and returns the new row.
Rejected with `400` when it would create a cycle (linking a folder into its own
subtree) or when the target is itself a link.

Delete a link with the usual `DELETE /folders/:id` or `DELETE /bookmarks/:id`;
the original is untouched.

---

## Tags

A tag: `{ "id": "…", "name": "dev", "color": "#3b82f6" }`.

### `GET /tags`
List all tags.

### `POST /tags/apply` (internal API)
Add tags to a batch of folders and bookmarks at once.

```json
{ "folderIds": ["…"], "bookmarkIds": ["…"], "tagIds": ["…"] }
```
→ `{ "folders": 3, "bookmarks": 12, "skipped": 1 }`

**Adds, never replaces.** A selection holds items with different tags already,
so "these are now the tags" would strip whatever each one had; the only
operation that means the same thing for every item in a mixed selection is
"also put these on". Items the caller may read but not write are counted in
`skipped` rather than failing the batch, so one read-only shared folder in a
selection does not stop the other forty being tagged.

### `POST /tags`
Create. Body: `{ "name": string(1–64), "color"?: "#rrggbb" }` (color
defaults to a neutral gray). → `201`. `409` if the name already exists.

### `PATCH /tags/:id`
Update `name` and/or `color`.

### `DELETE /tags/:id`
Delete a tag (removed from all bookmarks/folders). → `204`.

---

## Smart folders (saved queries)

A smart folder stores a **query**, not a list of items. It owns nothing: its
contents are recomputed on every read, so tagging something makes it appear and
untagging makes it leave, with no copying and no sync step.

A smart folder:

```json
{ "id": "…", "name": "Por leer", "color": "#6366f1", "position": 0,
  "query": { "tagIds": ["…"], "match": "any", "text": "", "favorite": false },
  "createdAt": "…", "updatedAt": "…" }
```

The query fields:

| field | type | notes |
|-------|------|-------|
| `tagIds` | uuid[] (≤50) | empty = no tag restriction |
| `match` | `"all"` \| `"any"` | AND or OR across `tagIds`. Default `"any"` |
| `text` | string (≤200) | matched against title/name, URL and description |
| `favorite` | boolean | restrict to starred items |

An all-empty query selects **nothing** (it is the state a half-built filter is
in), rather than the whole library.

### `GET /smart-folders`
List them, ordered by `position`.

### `GET /smart-folders/:id`
One saved folder, definition only.

### `GET /smart-folders/:id/items`
Evaluate the query now and return what it selects. This is the endpoint worth
using: it saves downloading the whole library to filter client-side.

```bash
auth "$HOST/api/v1/smart-folders/$SFID/items"
```
```json
{ "smartFolder": { … }, "folders": [ … ], "bookmarks": [ … ] }
```

### `POST /smart-folders`
Body: `{ "name": string(1–120), "query": { … }, "color"?: "#rrggbb" }`. → `201`.

### `PATCH /smart-folders/:id`
Update `name`, `color`, `position` and/or `query`. `query` is replaced whole,
not merged field by field.

### `DELETE /smart-folders/:id`
Removes the saved query only. The folders and bookmarks it listed are
untouched. → `204`.

---

## Duplicates

### `GET /bookmarks/duplicates`
Bookmarks pointing at the same URL, grouped. Matching runs on the stored
`url_hash` (a keyed hash of the *normalised* URL), so a trailing slash, a
default port and a `#fragment` do not split a group, and no URL has to be
decrypted to find them. Symlinks are excluded: pointing at the same URL from
two places is what they are for.

```json
[ { "key": "9f2c…", "url": "https://example.com/guide",
    "bookmarks": [ { "id": "…", "title": "…", … } ] } ]
```

Groups come back largest first; inside a group the oldest bookmark is first,
which is the natural one to keep.

### `POST /bookmarks/merge`
Body: `{ "keepId": uuid, "mergeIds": uuid[] (1–200) }`.

The keeper gains every tag from the copies, plus any description or real title
it was missing, stays starred if any copy was, and inherits symlinks that
pointed at the merged rows. The copies are **soft-deleted**, so they land in
the trash and a merge can be undone.

Every id must resolve to the same URL; otherwise the call is rejected with
`400` rather than silently destroying a different bookmark.

```json
{ "keptId": "…", "merged": 2, "tagsAdded": 3, "aliasesRepointed": 1 }
```

---

## Trash

Deletes across the whole API are **soft**: the row keeps its data and gets a
`deletedAt` stamp. These endpoints are the other half of that.

Deleting a folder stamps its whole subtree in one action, so rows sharing a
`groupKey` were removed together and come back together.

### `GET /trash`
```json
[ { "type": "bookmark", "id": "…", "title": "…", "url": "…",
    "parentId": "…", "path": "Trabajo / Referencias",
    "deletedAt": "…", "groupKey": "…", "siblings": 12 } ]
```
Optional `?rootLabel=Inicio` sets the label used for items that lived at the
root.

### `GET /trash/count`
`{ "count": 37 }`.

### `POST /trash/restore`
Body: `{ "type": "folder" | "bookmark", "id": uuid }`.

Restoring a folder brings back everything deleted **in the same action**, to
its original place; something removed separately at another time stays in the
trash. If the parent folder no longer exists the item lands at the root rather
than becoming unreachable.

```json
{ "folders": 3, "bookmarks": 34, "movedToRoot": false }
```

### `DELETE /trash/:type/:id`
**Irreversible.** Destroys one trashed item together with its version history,
snapshot, index entry and images. → `204`.

### `DELETE /trash`
**Irreversible.** Empties the trash. Optional `?olderThanDays=30` spares
anything deleted more recently. Returns what was destroyed:

```json
{ "folders": 3, "bookmarks": 34 }
```

Nothing expires on its own: these two endpoints are the only ones in the API
that destroy data instead of moving it.

---

## Storage

Bytes are counted from two places: blobs on disk (page snapshots, images,
icons, panel assets) and the encrypted columns. Blobs are what actually fill a
server — a snapshot is 100 kB to 5 MB — so the database figure is an estimate
of stored field sizes and deliberately ignores SQLite's own overhead.

### `GET /storage/me`
Your own consumption and the limit that applies to you.

```json
{ "userId": "…", "usedBytes": 734003200, "quotaBytes": 2147483648,
  "quotaSource": "default",
  "breakdown": { "snapshots": 700000000, "images": 20000000, "icons": 3000000,
                 "panelAssets": 0, "database": 11003200 } }
```

`quotaSource` is `user` (a per-user override), `default` (the instance-wide
setting) or `none` (unlimited, in which case `quotaBytes` is null). Pass
`?fresh=1` to bypass the five-minute cache and re-walk the blob tree.

**Enforcement.** A write that would cross the limit is rejected with `413`
(`code: "quota_exceeded"`); the snapshot worker checks before fetching and
marks the bookmark as errored rather than retrying forever. Being over quota
never blocks reads, edits or deletes — a user has to be able to free their own
space.

### `GET /admin/storage` *(admin)*
Every account, heaviest first, each row being a `GET /storage/me` payload plus
`email`, `nickname` and `role`.

### `PATCH /admin/users/:id/quota` *(admin)*
Body: `{ "quotaBytes": number | null }`. `null` clears the per-user override so
the instance default applies again; `0` is a real value meaning "no new bytes".
An admin can cap any account, their own included.

The instance-wide default lives in the settings endpoint as
`defaultStorageQuotaBytes` (null = unlimited).

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

## Panels (public view)

Read a published **panel** (a template-styled dashboard of a folder). Handy for
a client that renders someone's shared board. These live under `/api/public`
(not `/api/v1`) and don't need a token for public panels.

### `GET /api/public/panel/:slug`
Returns the panel when viewable, or a gate flag:

```json
{ "title": "My links", "template": { "layout": "grid", "theme": { … }, … },
  "displayTitle": "Mi panel", "tabTitle": "Enlaces", "faviconEmoji": "🔖",
  "bgAssetKind": "image", "bgAssetVersion": "2026-08-16T…",
  "root": { "id": "…", "name": "…", "description": null,
            "bookmarks": [ { "id": "…", "title": "…", "url": "…",
                            "description": "<p>…</p>",
                            "tags": [ { "name": "dev", "color": "#3b82f6" } ] } ],
            "subfolders": [ … ] } }
```

Gate flags (no `root`): `{ "needsPassword": true }`,
`{ "needsAuth": true }` (the viewer must log in — send the session cookie), or
`{ "forbidden": true }`. `description` is sanitized rich-text HTML.

`displayTitle`, `tabTitle` and `faviconEmoji` are optional per-panel overrides
(heading inside the panel, browser tab text, emoji favicon). `bgAssetKind` is
`"image"` or `"video"` when the panel has a custom uploaded background.

### `POST /api/public/panel/:slug`
Body `{ "password": string }` to unlock a password-protected panel; returns the
same shape with `root` on success.

### `GET /api/public/panel/:slug/background`
Streams the panel's custom background (image, GIF or video) with an `ETag`.
`404` when the panel has none. Panels shared with specific users require the
session cookie; public and password-protected ones serve it directly, since the
asset is decorative and the content itself stays gated.

> Panel/template **management** over REST (create, edit, regenerate, delete)
> uses the session-cookie API the web app uses, not bearer tokens. For
> token-based automation use the [MCP server](mcp.md), whose `*_panel` and
> `*_panel_template` tools cover the same operations.

---

## Notes & limits

- Request body limit: 64 MB. Uploaded images (icons/backgrounds) go through
  the internal `/api/*` multipart endpoints, not `/api/v1`.
- Global rate limit safety net applies; there is no per-endpoint quota.
- Deletes are soft (data is retained server-side, hidden from listings).

### Admin insights

`GET /admin/insights` (internal API, admin only) returns storage broken down by
type for every account, plus instance-wide counts and 30 days of sign-in
activity.

**Metadata only, by construction.** An admin holds nobody's key, so no folder
name, bookmark title or description appears in this response and none can: the
server would need that user's password-derived key to read them and does not
have it. Counts, byte sizes and timestamps were never encrypted, which is why
they are available.

### Timestamps

Every `*_at` field is **ISO-8601 UTC with the `Z`**, e.g.
`2026-08-23T08:15:00.000Z`. Render it in whatever zone the reader is in; the
value itself never carries one.

Releases up to v0.83.1 returned some of them as `2026-08-23 08:15:00`, which is
the same instant, still UTC, and **unmarked**. If you parse that with anything
that falls back to local time — which is what browsers do for the
space-separated form — you get an answer offset by your own zone. Old rows are
re-stamped on boot, so an upgraded instance answers in the marked form too.

`GET /time` (internal API, authenticated) returns the server's clock in that
same shape, plus its `timeZone` and `offsetMinutes`, for comparing clocks.
