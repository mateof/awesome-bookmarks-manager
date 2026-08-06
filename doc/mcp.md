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
| `list_folders` | list all folders |
| `create_folder` | create a folder (`name`, optional `parentId`, `description`) |
| `list_bookmarks` | list/filter bookmarks (`folderId`, `tagId`, `query`, `limit`) |
| `get_bookmark` | fetch one bookmark by id |
| `add_bookmark` | add a bookmark (`url`, optional `title`, `description`, `folderId`, `tags` by name) |
| `update_bookmark` | update fields of a bookmark |
| `move_bookmark` | move a bookmark to a folder/position |
| `delete_bookmark` | delete a bookmark |
| `search_bookmarks` | full-text + fuzzy search (`query`, optional `folderId`, `limit`) |
| `list_tags` | list all tags |
| `create_tag` | create a tag (`name`, optional hex `color`) |

`add_bookmark` / `update_bookmark` take **tag names** (not ids) for
convenience — missing tags are created automatically. All tools return the
JSON result as text.

## Example prompts

- "Save https://ziglang.org to my Programming folder and tag it languages, systems."
- "Search my bookmarks for anything about kubernetes and list the titles."
- "Create a folder called Recipes and move the last bookmark I added into it."

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
