# AwesomeBookmarks

<p align="center">
  <a href="https://github.com/mateof/awesome-bookmarks-manager/actions/workflows/docker.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/mateof/awesome-bookmarks-manager/docker.yml?branch=main&amp;label=CI&amp;logo=github"></a>
  <a href="https://github.com/mateof/awesome-bookmarks-manager/blob/main/package.json"><img alt="Version" src="https://img.shields.io/github/package-json/v/mateof/awesome-bookmarks-manager?label=version&amp;color=blue"></a>
  <a href="https://github.com/mateof/awesome-bookmarks-manager/pkgs/container/awesome-bookmarks-manager"><img alt="GHCR image" src="https://img.shields.io/badge/ghcr.io-image-2496ED?logo=docker&amp;logoColor=white"></a>
  <a href="https://github.com/mateof/awesome-bookmarks-manager/pkgs/container/awesome-bookmarks-manager"><img alt="Platforms" src="https://img.shields.io/badge/platforms-amd64%20%C2%B7%20arm64-informational"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/mateof/awesome-bookmarks-manager"></a>
  <a href="https://github.com/mateof/awesome-bookmarks-manager/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/mateof/awesome-bookmarks-manager"></a>
</p>

A self-hosted, encrypted, multi-user bookmark manager with folder hierarchies,
saved snapshots of every page (Wallabag-style), tags, groups for sharing,
public share links, cloud backups, and a browser extension. Ships as a
**single Docker container** — Fastify serves both the SPA and the API on
one port.

<p align="center">
  <img alt="AwesomeBookmarks library view" src="doc/images/07-bookmarks.png" width="860">
</p>

## Documentation

- **[Illustrated user guide](doc/guia-usuario.md)** — a visual walkthrough
  (register, folders, bookmarks, sharing, panels, browser extension) with real
  screenshots. In Spanish.
- [Browser extension](doc/extension.md) — install on Chrome, Opera and Firefox,
  configure it, pick a save folder and create folders from the popup. In Spanish.
- [HTTP API & MCP](doc/README.md) — programmatic access for apps, scripts and AI.
- [End-to-end tests](e2e/README.md) — the isolated Playwright suite that also
  generates the guide's screenshots.

## Features

- **Folders & bookmarks** with arbitrary nesting, rich-text descriptions
  (Tiptap editor), custom icons, and tags. Bookmarks with no icon fall back to
  a coloured letter tile derived from the name.
- **Favourites** — star any folder or bookmark; the "Favoritos" bar in the
  header is a flat, quick-access list of everything you starred.
- **Symlinks** — place a link to a folder or bookmark that lives elsewhere.
  The link always shows the original's current content, so one folder can
  gather items scattered across the tree (handy for building custom panels)
  and editing the original updates every link.
- **Tags** with color picker, autocomplete, in-line creation, and a filter
  view (`/filter`) that combines several tags with AND / OR, free text and a
  favourites-only switch.
- **Smart folders** — save any filter under a name and it appears in the
  sidebar. They store the query, not the items, so membership is recomputed on
  every visit: tag something and it shows up, untag it and it leaves. Nothing
  is duplicated.
- **Trash with restore** — deletes have always been soft; the trash makes that
  reversible. Deleting a folder cascades, so its whole subtree is restored as
  one piece and lands back where it was (or at the root if its parent is gone).
  Nothing expires on its own: emptying the trash is always an explicit action.
- **Duplicate detection & merge** — bookmarks pointing at the same URL are
  grouped on the stored `url_hash`, so trailing slashes, default ports and
  fragments do not split a group. Merging gives the survivor every tag and
  description from its copies, repoints any symlink at it, and sends the copies
  to the trash rather than destroying them.
- **Page snapshots** (Wallabag-style) — a background worker fetches each
  bookmark over HTTP and extracts the readable article (Mozilla Readability)
  plus its text, served back as a sandboxed reader iframe in the detail view.
  No headless browser, so the runtime image ships no Chromium; the trade-off
  is no pixel screenshot and limited fidelity on JS-only / SPA pages.
- **Full-text search** over snapshot contents (SQLite FTS5), with
  **Levenshtein fuzzy matching** on titles/URLs (typo-tolerant) and a
  GitHub-style chip to scope the search to the current folder.
- **Command palette** (Cmd/Ctrl+K) — one box for everything. Titles and URLs
  match instantly from memory while the server searches descriptions and the
  FTS index over saved snapshots in parallel, so a page can be found by
  something written *inside* it, with the matching phrase highlighted under the
  result. Items in the folder you are standing in are grouped and highlighted
  first. The same box also runs actions (new bookmark, new folder, go to
  panels, trash, duplicates…).
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
  chips and a live tag filter. Each panel can be public, password-protected,
  or shared with specific users, and **rebuilds itself in the background**
  when its content changes (symlinked content included).
  - **Themes**: eleven built-in templates (Grid, Bento, Terminal, Minimal,
    Dashboard, Galaxy, Ocean, Beach, Aquarium, Dragon Ball, Doraemon) plus a
    template editor with JSON import/export.
  - **Animated backgrounds**: pick a built-in scene (galaxy, aurora, ocean,
    beach, fish tank, clouds, sakura, dragon balls) rendered in pure CSS, or
    upload your own image, GIF or short video per panel.
  - **Live preview** in the template editor, at desktop and phone widths, with
    a colour picker and layout controls (max width, card gap, minimum card
    height, section order, and toggles for the search box, breadcrumb, section
    titles and download button).
  - **Per-panel identity**: override the heading shown inside the panel, the
    browser tab title and the tab icon (emoji favicon).
  - **Optional subfolder listing**: each folder can list its children beneath
    it so a whole level is browsable at a glance.
  - **Download for the browser**: visitors can export the panel as a Netscape
    bookmarks file and import it into Chrome / Firefox / Edge.
- **Two-factor authentication (TOTP)** — optional per user, enforceable for
  everyone by the admin, with a trusted-network bypass for the LAN.
- **Passkeys (WebAuthn)** — optional passwordless login (needs a domain over
  HTTPS); PRF-based DEK unlock, with an opt-in PRF-less mode for authenticators
  like Bitwarden.
- **Cloud backups** to Google Drive, OneDrive, or Synology (WebDAV) — manual
  or scheduled.
- **MCP server** at `/api/mcp` so an AI client (Claude and friends) can manage
  bookmarks, folders, tags, favourites, panels, panel templates, smart folders,
  duplicates and the trash with an API token. The two irreversible tools
  (purging) require an explicit confirmation, and emptying the trash also
  requires the caller to state how many items it expects to destroy, so an
  assistant that never looked cannot call it. See [doc/mcp.md](doc/mcp.md).
- **Browser extension** (Manifest V3) for one-click adding of the current tab.
- **Importer** for the standard HTML bookmarks export of Chrome / Firefox / Edge.
- **Installable PWA and share target** — install it from the browser on Android
  and the app joins the system share sheet, so a link can be sent from any app
  straight into a folder you pick (the last one is remembered). Responsive UI
  throughout; a minimal service worker keeps the shell available offline and
  never caches anything under `/api`.

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
pnpm build   # outputs dist/ (Chrome/Opera) and dist-firefox/ (Firefox)
```

Load `dist/` in Chrome/Opera (`chrome://extensions` or `opera://extensions` →
Developer Mode → Load unpacked) or `dist-firefox/manifest.json` in Firefox
(`about:debugging` → Load Temporary Add-on). Then open the options page to enter
your backend URL and a token (generated in the web UI, Settings → API). The
popup lets you pick the save folder and create folders. Full per-browser install
steps: [doc/extension.md](doc/extension.md).

<p align="center">
  <img alt="Extension popup with folder picker" src="doc/images/21-extension-popup.png" width="300">
</p>

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

<p align="center">
  <img alt="Public panel view" src="doc/images/15-panel-public.png" width="820">
</p>

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
the snapshot. The copyable panel URL is built from your browser's current
origin, so it always matches how you reach the app — no `PUBLIC_BASE_URL`
needed for panels (it still feeds the older share-links feature).

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

AwesomeBookmarks exposes a stable, token-authenticated public REST API — build
a mobile app, browser extension, or script against it — and ships an MCP server
so an AI assistant can manage your bookmarks.

- Create a token in **Settings → API**.
- Public API base: `https://<host>/api/v1` with
  `Authorization: Bearer <token>`.
- [doc/api.md](doc/api.md) has a getting-started guide for client developers
  (token, CORS, a minimal fetch client) plus every endpoint and the public
  panel-view endpoints.
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
