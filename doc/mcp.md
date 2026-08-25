# MCP server

AwesomeBookmarks exposes a
[Model Context Protocol](https://modelcontextprotocol.io) server so an AI
assistant (Claude, or anything that speaks MCP) can add, search and manage
bookmarks in your self-hosted instance.

There are **two ways** to connect, and both use the same API token:

| Mode | What you configure | Runs where | Best when |
|------|--------------------|------------|-----------|
| **Remote (URL)** | a URL: `https://<host>/api/mcp` | inside the AwesomeBookmarks server itself | you just want to paste a URL — nothing to install |
| **Local (stdio)** | a command that runs `apps/mcp` | on the machine with the AI client | your client only supports stdio servers |

The web app builds ready-to-paste snippets for both under
**Settings → API** the moment you create a token.

---

## Create a token

In the web app: **Settings → API → Create token**, give it a label, copy the
values shown. The token is displayed **once**.

---

## Option A — Remote MCP (recommended, no install)

The server hosts an MCP endpoint at **`/api/mcp`** (Streamable HTTP). Point
your client at it directly.

```
Claude ──HTTPS──> https://<host>/api/mcp   (in-process, no local program)
```

**Auth** is the API token, provided either as a header
(`Authorization: Bearer <token>`) or, for clients that only accept a URL, as
a `?token=` query parameter.

### Claude Code / CLI

```bash
claude mcp add --scope user --transport http awesomebookmarks \
  https://<host>/api/mcp \
  --header "Authorization: Bearer <token>"
```

### Claude Desktop (custom connector)

Add a custom connector and paste the URL with the token embedded (this is the
exact string shown in Settings → API):

```
https://<host>/api/mcp?token=<token>
```

> The token is part of the URL — treat the whole URL as a secret, and prefer
> the header form (CLI) where you can.

### Notes

- The remote endpoint is **stateless**: each tool call is an independent
  authenticated request. No session to keep alive.
- The instance must be reachable from wherever the AI client runs. Serve it
  behind HTTPS for anything beyond your LAN.

---

## Option B — Local stdio server (`apps/mcp`)

A small program that runs next to the AI client and forwards to
[`/api/v1`](./api.md). Use it if your client only supports stdio MCP servers.

```
Claude Desktop ──stdio──> awesomebookmarks-mcp ──HTTPS /api/v1──> AwesomeBookmarks
```

### Build it

From the repo:

```bash
pnpm install
pnpm --filter @awesome-bookmarks/mcp build
```

This produces `apps/mcp/dist/index.js`. (You can also run it without
building via `pnpm --filter @awesome-bookmarks/mcp dev`.)

### Configure your MCP client

The server reads two environment variables:

| variable | example | meaning |
|----------|---------|---------|
| `AWESOMEBOOKMARKS_URL` | `http://192.168.0.22:7055` | base URL of your instance |
| `AWESOMEBOOKMARKS_TOKEN` | `41d9…` | an API token from step 1 |

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "awesomebookmarks": {
      "command": "node",
      "args": ["/absolute/path/to/AwesomeBookmarks/apps/mcp/dist/index.js"],
      "env": {
        "AWESOMEBOOKMARKS_URL": "http://192.168.0.22:7055",
        "AWESOMEBOOKMARKS_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the AwesomeBookmarks server.

### Any other MCP client

Run the binary over stdio with the two env vars set. The package also exposes
a `bin` named `awesomebookmarks-mcp`.

## Tools

| tool | what it does |
|------|--------------|
### Folders, bookmarks and tags

| tool | what it does |
|------|--------------|
| `list_folders` | list all folders |
| `create_folder` | create a folder (`name`, optional `parentId`, `description`, `favorite`) |
| `update_folder` | update a folder's `name`, `description` or `favorite` flag |
| `list_bookmarks` | list/filter bookmarks (`folderId`, `tagId`, `query`, `limit`, `favorite`) |
| `get_bookmark` | fetch one bookmark by id |
| `add_bookmark` | add a bookmark (`url`, optional `title`, `description`, `folderId`, `tags` by name, `favorite`) |
| `update_bookmark` | update fields of a bookmark, including `favorite` |
| `move_bookmark` | move a bookmark to a folder/position |
| `delete_bookmark` | delete a bookmark |
| `search_bookmarks` | full-text + fuzzy search (`query`, optional `folderId`, `limit`) |
| `list_tags` | list all tags |
| `create_tag` | create a tag (`name`, optional hex `color`) |

### Panels and templates

| tool | what it does |
|------|--------------|
| `list_panels` | list your panels (slug, title, template, access, public url) |
| `get_panel` | fetch one panel by id, including its allowed-user emails |
| `create_panel` | publish a folder as a panel (`title`, `slug`, `folderId`, `accessMode`, optional `templateId`, `password`, `userEmails`, `displayTitle`, `tabTitle`, `faviconEmoji`) |
| `update_panel` | update a panel; an empty string clears an override |
| `regenerate_panel` | re-snapshot a panel from the current folder tree |
| `delete_panel` | delete a panel |
| `list_panel_templates` | list templates: the built-ins plus your own |
| `create_panel_template` | create a template from a full `config` |
| `update_panel_template` | update one of your templates (built-ins are read-only) |
| `delete_panel_template` | delete one of your templates |
| `list_panel_scenes` | list the animated background scenes usable as `config.scene` |

### Inline databases (tables)

The typed tables embedded in folder and bookmark descriptions: inventories,
credential sheets, reading logs. Cells are keyed by **column id**, not by
column name, so `get_database` comes first in almost every errand.

| tool | what it does |
|------|--------------|
| `list_databases` | your tables: id, name, row count, whether shared |
| `get_database` | one table whole: columns (with select options) and rows |
| `search_database_rows` | find text inside the rows of every table you can read |
| `create_database` | a new table, seeded with a text column, a status select and a table view |
| `add_database_column` | add a column (`kind`, and `options` for select/multiSelect) |
| `add_database_row` | append a row (`cells` keyed by column id) |
| `update_database_row` | change cells of one row; merged, not replaced |
| `delete_database_row` | delete a row (recoverable from its history, in the app) |
| `export_database_csv` | the table as CSV text |
| `import_database_csv` | append the rows of a CSV; never replaces what is there |

**Password columns are never returned through MCP.** Not masked behind a flag:
not returned, by any tool, including the CSV. A value that is covered on screen
and kept out of public copies has no business in a model's context, a
transcript or a log; the person who wants it opens the app. Writing one is
allowed, because putting a secret in is not the same act as taking it out.

Deleting a row is recoverable: its last state stays in the row's history and
can be restored from the app under the same id.

### Smart folders (saved queries)

A smart folder stores a query, not a list: its contents are recomputed on every
read, so nothing is copied and nothing goes stale.

| tool | what it does |
|------|--------------|
| `list_smart_folders` | list your saved queries |
| `preview_smart_query` | run a query without saving it, to see what it would select |
| `get_smart_folder_items` | resolve a saved folder now: the folders and bookmarks it selects |
| `create_smart_folder` | save a query (`name`, `tagIds`, `match`, `text`, `favorite`, optional `color`) |
| `update_smart_folder` | rename, recolour, or replace the query |
| `delete_smart_folder` | delete the saved query (items are untouched) |

`match` is `"all"` (AND across `tagIds`) or `"any"` (OR); `text` matches the
title/name, URL and description. A query with no tags, no text and
`favorite: false` selects nothing.

### Duplicates

| tool | what it does |
|------|--------------|
| `find_duplicate_bookmarks` | group bookmarks that point at the same URL |
| `merge_duplicate_bookmarks` | fold copies into one (`keepId`, `mergeIds`) |

Matching ignores trailing slashes, default ports and `#fragments`. Merging is
additive — the keeper gains every tag and description — and the copies go to
the **trash**, so a merge is undoable.

### Trash

| tool | what it does |
|------|--------------|
| `list_trash` | everything currently in the trash, with where it will return to |
| `count_trash` | how many items are in the trash |
| `restore_from_trash` | restore an item (a folder brings back its whole deletion) |
| `delete_from_trash_permanently` | **irreversible**: destroy one trashed item |
| `empty_trash` | **irreversible**: destroy trashed items for good |

The two destructive tools are guarded on purpose, because they are the only
ones in the whole MCP surface that cannot be undone:

- Both require `confirm: true`.
- `empty_trash` additionally requires `expectedItemCount` to match what
  `count_trash` returns *right now*. On a mismatch nothing is destroyed and
  the real count comes back instead. An assistant that never looked at the
  trash cannot supply that number, which is the point: "tidy up my bookmarks"
  must not be able to turn into "shred the trash".

To simply remove something, use `delete_bookmark` — it is soft, so the item
lands in the trash and stays recoverable.

`add_bookmark` / `update_bookmark` take **tag names** (not ids) for
convenience — missing tags are created automatically. All tools return the
JSON result as text.

A template's `config` carries the whole look: `layout`, `theme` colours, `card`
options, the optional animated `scene`, `folderPreview` (list each folder's
subfolders beneath it) and the layout knobs (`maxWidth`, `gap`,
`cardMinHeight`, `sectionOrder`, `showSearch`, `showBreadcrumb`,
`showSectionTitles`, `showDownload`).

Panels rebuild themselves in the background when their content changes, so
`regenerate_panel` is only needed to force it.

## Example prompts

- "Save https://ziglang.org to my Programming folder and tag it languages, systems."
- "Search my bookmarks for anything about kubernetes and list the titles."
- "Create a folder called Recipes and move the last bookmark I added into it."
- "Star my three most-used bookmarks so they show up in Favourites."
- "Make me a panel from the Recipes folder at /panel/cocina, using the Doraemon
  template, titled 'Mi recetario' with a 🍳 as the tab icon."
- "Create a template like Terminal but with the galaxy background, wider cards
  and no breadcrumb, then apply it to my Programming panel."
- "Make me a smart folder called 'Por leer' with everything tagged pendiente or
  articulo, and tell me how many items it has right now."
- "Find duplicated bookmarks and merge each group, keeping the oldest."
- "What did I delete recently? Restore the Recipes folder."

## Security

The token grants full access to your bookmarks and can decrypt your data —
see [authentication.md](./authentication.md). Keep the client config
readable only by you, and revoke the token from the web app if it leaks.

## Troubleshooting

- **`401`** — bad or revoked token. Create a new one.
- **`423`** — the token predates headless support (created before this
  feature). Recreate it, or log into the web app once to warm the key cache.
- **Connection refused / timeout** — the MCP host can't reach
  `AWESOMEBOOKMARKS_URL`. Check it's reachable from that machine (VPN, LAN).
- The server logs to stderr; stdout is reserved for the MCP protocol.
