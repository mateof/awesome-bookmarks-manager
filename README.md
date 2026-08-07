# AwesomeBookmarks

A self-hosted, encrypted, multi-user bookmark manager with folder hierarchies,
saved snapshots of every page (Wallabag-style), tags, groups for sharing,
public share links, cloud backups, and a browser extension. Ships as a
**single Docker container** — Fastify serves both the SPA and the API on
one port.

## Features

- **Folders & bookmarks** with arbitrary nesting, rich-text descriptions
  (Tiptap editor), custom icons, and tags.
- **Tags** with color picker, autocomplete, in-line creation, and a
  dedicated `/tag/:id` view.
- **Page snapshots** (Wallabag-style) — a background worker fetches each
  bookmark over HTTP and extracts the readable article (Mozilla Readability)
  plus its text, served back as a sandboxed reader iframe in the detail view.
  No headless browser, so the runtime image ships no Chromium; the trade-off
  is no pixel screenshot and limited fidelity on JS-only / SPA pages.
- **Full-text search** over snapshot contents (SQLite FTS5), with
  **Levenshtein fuzzy matching** on titles/URLs (typo-tolerant) and a
  GitHub-style chip to scope the search to the current folder.
- **Five view modes** for folders/bookmarks: grid, compact list, large cards,
  detail table, icon mosaic. Persisted per device.
- **Multi-select** on hover with checkboxes + 3-dot kebab menus for each
  card. Batch open-in-tabs, export, and delete.
- **Export to HTML** in the standard Netscape Bookmark format — re-importable
  by Chrome / Firefox / Edge / Safari.
- **Browser bookmarks bar** in the header (Chrome-style dropdowns); click a
  folder to open all its bookmarks in tabs at once.
- **Light / dark / system theme** with persisted preference.
- **Multilingual UI**: Spanish, English, Galician (Galician in RAG
  normative). Detection via browser language + manual toggle.
- **Server-side encryption at rest** with two-tier key wrapping (master key
  in env + per-user key derived from password via Argon2id).
- **Multi-user** with email/password accounts. The first registered user
  becomes the **admin** and can manage other users (including deletion).
- **Groups** — invite people by email, share folders or bookmarks with the
  group; group members see them in a "Shared with me" section.
- **Public share links** with optional password and expiration.
- **Panels** — turn any folder into a shareable, template-styled dashboard
  (homepage-style) at `/panel/{slug}`. Navigable subfolders, clickable tag
  chips and a live tag filter, five built-in templates (Grid, Bento, Terminal,
  Minimal, Dashboard) plus a template editor with JSON import/export. Each
  panel can be public, password-protected, or shared with specific users.
- **Two-factor authentication (TOTP)** — optional per user, enforceable for
  everyone by the admin, with a trusted-network bypass for the LAN.
- **Passkeys (WebAuthn)** — optional passwordless login (needs a domain over
  HTTPS); PRF-based DEK unlock, with an opt-in PRF-less mode for authenticators
  like Bitwarden.
- **Cloud backups** to Google Drive, OneDrive, or Synology (WebDAV) — manual
  or scheduled.
- **Browser extension** (Manifest V3) for one-click adding of the current tab.
- **Importer** for the standard HTML bookmarks export of Chrome / Firefox / Edge.
- **PWA-ready** responsive UI that also works on mobile.

## Quickstart — pull from GHCR

The fastest way to self-host. No source tree, no Node, no build step. Just
one image pulled from GitHub Container Registry.

```bash
mkdir awesomebookmarks && cd awesomebookmarks

# 1. Grab the compose file (no other files needed)
curl -O https://raw.githubusercontent.com/mateof/awesome-bookmarks-manager/main/docker-compose.ghcr.yml

# 2. Generate secrets
cat > .env <<EOF
MASTER_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 48)
PUBLIC_BASE_URL=http://localhost:3001
EOF

# 3. Pull and start
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d

# 4. Open http://localhost:3001
```

Image: `ghcr.io/mateof/awesome-bookmarks-manager`. Multi-arch
(`linux/amd64`, `linux/arm64`) — works on x86 servers, Raspberry Pi 4/5,
Apple Silicon homelabs, and ARM-based NAS units.

Pinning a version (recommended for production) — add `IMAGE_TAG=v1.2.3` to
your `.env`.

The persistent state lives in `./data` (SQLite database + encrypted blob
storage for snapshots/icons). **Back up that directory + your `.env`** — the
`MASTER_KEY` is required to decrypt anything; lose it and the data is gone.

### Architecture in one paragraph

The container runs a single Fastify process. It serves the API under
`/api/*`, exposes `/health` for the Docker healthcheck, and serves the
built React SPA from `/app/public` for everything else (with a catch-all
fallback to `index.html` so client-side routing works). No nginx, no
sidecar, no internal network.

### Optional Docker Compose variables

Add these to `.env` if you want them:

```env
# Image tag and port mapping
IMAGE_TAG=latest                # or a pinned version: 1.2.3
IMAGE_OWNER=mateof              # change if you forked
API_PORT=3001                   # Fastify listen port AND host binding
                                # (1:1 mapping; same var is used both
                                # inside the container and by compose)

# OAuth credentials for cloud backups
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your.domain/api/cloud/connect/gdrive/callback

MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=https://your.domain/api/cloud/connect/onedrive/callback

# Public base URL — used to build share/panel links (set it to how you
# actually reach the app, including scheme and port).
PUBLIC_BASE_URL=https://bookmarks.example.com

# Keep the session across restarts/updates without re-entering the password
# (weaker: server secrets can then recover the key). Off by default.
PERSIST_SESSION_KEY=false

# Passkeys (WebAuthn). Needs a domain, not an IP, over HTTPS.
WEBAUTHN_RP_ID=bookmarks.example.com
WEBAUTHN_ORIGIN=https://bookmarks.example.com
WEBAUTHN_ALLOW_PRFLESS=false   # true to allow Bitwarden (weaker, see docs)

# Only honour X-Forwarded-For behind a trusted reverse proxy (needed for the
# 2FA trusted-network bypass to see the real client IP).
TRUSTED_PROXY=false

# Tuning
KEY_CACHE_IDLE_MIN=30        # how long a user's data key stays cached
KEY_CACHE_HARD_MIN=1440      # absolute upper bound
SNAPSHOT_CONCURRENCY=2       # parallel snapshot fetches
```

## Quickstart — build locally

If you want to build the image from source instead of pulling it:

```bash
git clone https://github.com/mateof/awesome-bookmarks-manager.git
cd awesome-bookmarks-manager

cat > .env <<EOF
MASTER_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 48)
PUBLIC_BASE_URL=http://localhost:3001
EOF

docker compose up -d --build
```

## Local development (without Docker)

Requirements:

- **Node.js ≥ 22**
- **pnpm ≥ 9** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)

```bash
git clone https://github.com/mateof/awesome-bookmarks-manager.git
cd awesome-bookmarks-manager

# Install dependencies
pnpm install

# Generate dev secrets
cat > .env <<EOF
MASTER_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 48)
EOF

# Run everything (api + web + extension watch)
pnpm dev
```

You'll see the URLs printed in the terminal:

```
➜  Local:   http://localhost:3000/
➜  Network: http://192.168.x.x:3000/
```

In dev the **web** is served by Vite on `:3000` and the **API** runs
separately on `:3001`. Vite proxies `/api/*` straight through (no path
rewrite) since the API mounts its routes under `/api`. Both bind to
`0.0.0.0` so any device on your local network can connect.

### Browser extension (development)

```bash
cd apps/extension
pnpm build           # outputs to apps/extension/dist
```

Then in Chrome / Edge / Brave: open `chrome://extensions`, enable Developer
Mode, click "Load unpacked", and select `apps/extension/dist`. Open the
extension's options page once to enter your backend URL and a token (you can
generate the token from the web UI in Settings).

### Importing bookmarks from your browser

1. In Chrome / Edge / Firefox: **Settings → Bookmarks → Export to HTML**.
2. In AwesomeBookmarks: **Settings → Import / Export → choose file**.
3. Snapshot generation will be queued for every imported bookmark (you can
   disable that in the same dialog).

### Exporting bookmarks back out

Use the export button in any folder header, the kebab menu on a single
item, or the batch toolbar after multi-selecting. The output is a standard
Netscape Bookmark HTML file, re-importable by every major browser.

## Panels — shareable dashboards

Turn any folder into a polished, standalone dashboard of its bookmarks
(think Homer / Dashy / Flame), reachable at `/panel/{slug}`.

**Create one:** open a folder, use the ⋮ menu on a folder card → **Generate
panel**. Pick a name (which becomes the URL slug), a **template**, and an
**access mode**. You get a shareable URL back.

**What a viewer sees:** the folder's bookmarks laid out per the template, with
favicons, descriptions and **tag chips**. Subfolders are **navigable** in
place (nothing else in your account is exposed). A **tag filter bar** lets the
viewer filter across the whole panel by tag (AND/OR), and clicking any tag chip
on a card filters by it — switching to a flat "results" view.

**Access modes** (you choose per panel):

| Mode | Who can see it |
|------|----------------|
| Public | Anyone with the link |
| Password | Anyone with the link **and** the password |
| Users | Only the specific accounts you list by email (they must log in) |

**Templates** are JSON configs (layout, theme colours, card options, tag
filter) — safe to render on public pages and easy to move around. Manage
everything from the **Panels** entry in the sidebar:

- *Panels* tab: search, preview, copy URL, **regenerate**, edit, delete.
- *Templates* tab: five built-ins (Grid, Bento, Terminal, Minimal list,
  Dashboard), a visual **editor**, **duplicate** a built-in, and
  **import / export** templates as `.json` files.

**How it works / crypto note:** creating or regenerating a panel materialises a
decrypted snapshot of the folder subtree sealed with the server `MASTER_KEY`,
so public/shared panels render without you being logged in. This is a
deliberate, per-panel exposure of *shared* content — the rest of your vault
stays zero-knowledge. Edit a folder afterwards? Hit **Regenerate** to refresh
the snapshot. Set `PUBLIC_BASE_URL` so the copied URLs match your real host.

## First-time use

1. Open `http://localhost:3001`, click **Crear cuenta** (or switch to
   English / Galician via the language toggle in the header).
2. **The first registered account is automatically the admin** — it can
   manage users from **Settings → Admin**.
3. Subsequent users are regular accounts. The admin can promote others or
   delete them along with their data.

> ⚠️ **Don't lose your password.** It derives a key that protects your data
> on top of the server master key. There is no email-based reset flow —
> losing the password means re-creating the account from a backup.

## Useful commands

```bash
pnpm dev              # full dev stack (api + web + extension watch)
pnpm build            # build everything
pnpm test             # run unit tests (crypto package has the most coverage)
pnpm typecheck        # tsc --noEmit across all packages

# Inside apps/api/
pnpm db:generate      # generate new Drizzle migration after schema edits
pnpm db:migrate       # apply migrations to ./data/db.sqlite
```

## Programmatic access (API & MCP)

AwesomeBookmarks exposes a stable public REST API and ships an MCP server so
an AI assistant can manage your bookmarks.

- Create a token in **Settings → API**.
- Public API base: `https://<host>/api/v1` with
  `Authorization: Bearer <token>`.
- MCP server: [apps/mcp](apps/mcp) — point Claude Desktop (or any MCP client)
  at it.

Full docs in [doc/](doc/):
[overview](doc/README.md) · [authentication](doc/authentication.md) ·
[REST API](doc/api.md) · [MCP](doc/mcp.md).

```bash
curl https://your-host/api/v1/bookmarks -H "Authorization: Bearer <token>"
```

## CI / release

[.github/workflows/docker.yml](.github/workflows/docker.yml) builds the
combined multi-arch (`amd64` + `arm64`) image on every push to `main` and
on every `v*.*.*` tag, then pushes it to GHCR. Tags applied automatically:

- `latest` — the head of `main` and the most recent semver tag.
- `main` and `main-<sha-short>` — main-branch builds.
- `1.2.3`, `1.2`, `1` — when you push a tag like `v1.2.3`.
- `sha-<short>` — every push.

The workflow uses BuildKit GHA cache, so subsequent builds are fast even
with the heavy Playwright base image.

## License

See [LICENSE](LICENSE).
