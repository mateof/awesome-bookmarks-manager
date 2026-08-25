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
- [Themes](doc/temas.md) — the ten built-in themes and how to write your own.
  In Spanish.
- [HTTP API & MCP](doc/README.md) — programmatic access for apps, scripts and AI.
- [End-to-end tests](e2e/README.md) — the isolated Playwright suite that also
  generates the guide's screenshots.

## Features

- **Folders & bookmarks** with arbitrary nesting, rich-text descriptions
  (Tiptap editor with headings, section rules, text colour, **coloured
  underlines**, a **highlighter**, font family, pasted/dropped **images**, and
  **click-to-copy** and **hidden-until-clicked** marks for the credentials
  people actually keep in these notes), custom icons, and tags. The
  highlighter's colours are translucent rather than pastel, so the same note
  reads in light mode, in dark mode and inside a panel that brings its own
  background: the wash darkens a dark page and lightens a light one instead of
  being right in exactly one of them. Bookmarks with no icon fall back to
  a coloured letter tile derived from the name. Long descriptions are capped at
  a fixed height and scroll inside it, with a button that opens the whole text
  full-screen, so a wall of notes never pushes a folder's contents off screen;
  the controls only appear when the text really overflows. Images pasted into a
  note ride inside the note's own encrypted field, resized client-side, so they
  survive the `.abz` export and reach group shares with the text.
- **Attachments** — real files hanging off a folder or a bookmark, up to 25 MB
  each, each with a name, a description and a **slug**. Sealed with the owner's
  key like everything else, and so are all three plus the MIME type: the server
  knows how many bytes you stored and nothing else. The slug is unique per
  account (enforced by a UNIQUE index over a per-user hash, since a unique
  index over AES-GCM ciphertext could never fire) and is what notes refer to,
  so replacing a file under the same slug keeps every reference working. They
  count against the storage quota (with their own slice in the breakdown),
  travel inside the `.abz` archive, and are deleted along with their parent
  when it is purged from the trash. The list is a separate query made only on a
  detail view, so browsing costs exactly what it did before.
- **References inside descriptions** — type `@` for a folder or bookmark and
  `#` for an attached file, and the note carries a chip instead of a dead
  title. Chips show the target's *current* name (they resolve in one batched
  request per note, not one per chip) and mark themselves broken when it is
  gone. A bookmark chip has two destinations: the label opens its detail page,
  the arrow opens the URL in a new tab. Hovering shows a card with the URL on
  top and the description underneath. Stored as anchors with `data-ref`
  attributes so they survive the server's sanitiser and render everywhere the
  HTML does.
- **Inline databases** — a Notion/SiYuan-style typed table embedded in any
  description: text, number, checkbox, date, select, multi-select, URL, a
  **reference** column pointing at your own bookmarks and folders, and a
  **password** column that stays covered until you ask for it and copies with
  one click. That masking is about the room you are in, not about the server:
  the cell is sealed like every other one and anyone who can read the table can
  reveal it. What it does guarantee is that the flattened copy — a public
  panel, a group's copy of a note — prints dots and never the value. Select
  columns take a colour per option, chosen from the chip itself; columns can be
  dragged into another order by their header (or moved one step at a time from
  the column menu, for people not using a mouse) and **resized** by their right
  edge; a value too long for its column shows in full on hover; and any row
  **opens as a form**, every field labelled, for when the grid is the wrong
  shape to read one row in. A note holding a table arrives **folded** to a
  strip and opens on a click, so a folder's own contents are not pushed off the
  screen by a grid every time you visit it. Three views
  over the same rows (table, kanban board, gallery), each with its own filters,
  sorting, visible columns and grouping. The note stores only an id; the rows
  live in their own tables, sealed per row, because a description is one
  AES-GCM field resealed in full on every save. Filtering and sorting run in
  memory after decryption (the server cannot compare ciphertext in SQL, and the
  app's own search already works this way), which caps a table at ~5000 rows by
  design. Databases travel whole inside the `.abz` archive with their ids
  rewritten on import, and are flattened into a static table for public panels
  and group shares, whose readers have no session to query with. A database is
  shared **in its own right**: the same table can be embedded in several notes
  that are not shared with the same people, so it carries its own
  `key_group_id` rather than inheriting whichever note mentions it. The command
  palette searches **inside** tables and takes you to the matching row, and
  every row keeps a **history** of its last twenty states with one-click
  restore, including one for a row that was deleted. Both leave password
  columns alone: a covered value has no business in a search snippet or a
  history list. Tables go **in and out as CSV** (import appends and never
  replaces, inventing the columns and select options the file needs), and are
  reachable over **MCP**, where password columns are not returned at all. A
  table starts from a **template** (inventory, credentials, reading log,
  tasks), so the status is a select and the quantity a number from the first
  row; a column can show a **summary** in its footer (sum, average, filled,
  ticked), where empty cells are excluded rather than counted as zero; rows
  **duplicate** and delete **in bulk**; and a view can freeze its first column,
  choose its row height, or lay the rows out on a **month** by one of their
  date columns. All of that lives on the view, so it looks the same wherever
  the table is opened, including for whoever it was shared with. Three column
  kinds are **computed rather than typed**: a **formula** over its own row
  (`[Cantidad] * [Precio]`, with `si`, `dias`, `concat` and a handful more), a
  **relation** pointing at rows of another of your tables, and a **rollup**
  summarising one of their columns through it. None of them stores a value, so
  none can go stale; the price is that they cannot be filtered or sorted on,
  which the model states rather than half-implements. A flattened copy carries
  a formula's answer (it is made of columns the reader is already shown) and
  prints nothing for a relation or a rollup, which reach into a table that
  reader may not have.
- **Embed a table that already exists**, not only a new one: the same database
  can appear in several notes and stay one table. Each embed has its own id, so
  it can be pinned to a single view (rendered without the tab strip) and can own
  views that exist only in that note, which is what lets one place show a board
  grouped by status while another shows a filtered table. Per embed it also
  carries **how tall it may be** and whether it renders as a grid at all or as
  a one-line **summary card** that opens on click, because the same table can
  be the point of one note and a footnote in another. A **quick filter** in the
  embed narrows the rows as you type without saving anything. And `@` reaches
  **rows**, not only folders and bookmarks, so the row where something was
  written down is linkable from the note where it was decided; the chip stores
  ids, so renaming the row changes what the note shows.
- **Mobile editor bar** — on a narrow screen the toolbar detaches and pins
  itself directly above the on-screen keyboard, tracking its height through
  `visualViewport`, with a `+` that opens the rest of the actions as a grid.
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
- **Decrypted-list cache** — the cost of a read here is the decryption, not
  the query: on 20.000 bookmarks SQLite returns the rows in ~48 ms while
  opening their three sealed fields takes ~193 ms. The decrypted lists are
  therefore cached in process, next to the keys that produced them, and each
  entry proves it is current against a cheap signature derived from the data
  (row count, sum of `rev`, latest `updated_at`) instead of relying on every
  mutation path remembering to invalidate. Measured on 5.000 bookmarks:
  `GET /bookmarks` 103 ms → 12 ms, `GET /search` 126 ms → 32 ms. The cache is
  dropped whenever the user's key is evicted, so plaintext never outlives it.
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
  card. Batch open-in-tabs, move, export, delete, and **copy as a list**: the
  selection lands on the clipboard as a hierarchical outline with every
  subfolder expanded, as Markdown for chats and as a nested list of real links
  for email and documents. Selecting a folder and something inside it does not
  produce the entry twice.
- **Export to HTML** in the standard Netscape Bookmark format — re-importable
  by Chrome / Firefox / Edge / Safari.
- **Portable archive (`.abz`)** — the app's own format, for everything HTML
  cannot carry: tags, descriptions, colours, icons and favourites. Exports a
  whole account, one folder's subtree or a single bookmark, and imports back
  **into a chosen folder as copies** (fresh ids, tags matched by name), so it
  never overwrites what you already have. Exporting opens a dialog for the two
  choices only you can make: whether to include the archived page snapshots
  (off by default, they are the bulk of the size) and an optional passphrase,
  asked twice because a typo produces a file nobody can open. Unlike a cloud
  backup, whose contents are sealed with the owner's key, an archive travels
  between accounts and instances.
- **Browser bookmarks bar** in the header (Chrome-style dropdowns); click a
  folder to open all its bookmarks in tabs at once.
- **Ten themes**, each with a light and a dark side, picked in Settings →
  Appearance, plus import of your own from a JSON file. A theme is a set of CSS
  variables rather than a restyle: the interface is written against Tailwind's
  `slate`, `white` and `blue` (87% of every colour utility in the app), those
  three resolve to variables, and a theme supplies the values. The semantic
  colours (danger red, warning amber, success green) stay fixed on purpose.
  Ramps are generated in OKLCH from the default's own lightness curve, so every
  theme keeps the contrast relationships the UI was designed with. See
  [doc/temas.md](doc/temas.md) for the format.
- **Light / dark / system** switch, with persisted preference.
- **Multilingual UI**: Spanish, English, Galician (Galician in RAG
  normative). Detection via browser language + manual toggle.
- **Server-side encryption at rest.** Master key in env wrapping a per-user key
  derived from the password (Argon2id), plus an X25519 keypair per account so a
  group key can be sealed to somebody who is offline. Group content is sealed
  with a key held by the members, not by the server. See
  [doc/encryption.md](doc/encryption.md) for the whole picture, including what
  it does *not* protect against.
- **Multi-user** with email/password accounts. The first registered user
  becomes the **admin** and can manage other users (including deletion).
- **Storage quotas & usage** — Settings → Almacenamiento shows what your data
  takes up, split by what actually causes it (page snapshots, background
  images, icons, panel assets, encrypted rows). Admins additionally see every
  account's consumption, set an instance-wide default limit, and override it
  per user (themselves included). Over quota, uploads and new snapshots are
  refused with a `413` while reading, editing and deleting keep working, so a
  user can always free their own space.
- **Groups** — invite people by email, share folders or bookmarks with the
  group; group members see them in a "Shared with me" section. An **editor**
  share is genuinely collaborative: members create folders and bookmarks inside
  it, rename them and delete them. That happens in two stages by necessity —
  the owner's rows are encrypted with the owner's key, which nobody else has —
  so the change lands in the shared copy at once (the whole group sees it) and
  is replayed into the owner's real folders the next time they sign in, keeping
  the same ids so nothing turns into a duplicate of itself. A shared folder is
  drawn with the **same grid as your own** — five view modes, the same cards,
  the same kebab — because the card layer takes an `EntitySource` for the four
  things that used to be wired straight to the personal API (icon URL,
  background URL, the favourite star, drag and drop) instead of being a second
  implementation that drifts. Members edit through the *same dialogs* as their
  own folders — the full edit form with the icon library, emoji and favicon
  fetch, rich-text description, tags and the background picker, plus the
  personal appearance dialog with its text-tone control — pointed at the
  share's endpoints. They can create, rename, move, tag, restyle and delete
  inside it, star it and reorder it by dragging. The star is a
  *shared* one (it reaches the owner's row like every other edit, and does not
  land in the member's own favourites bar, which lists their own rows), and the
  order travels in the shared copy: a drop records the target folder's whole
  child order, so the write-back renumbers the owner's rows to match instead of
  writing one index and leaving ties. A share travels
  with the look its owner gave it: background colour or image, custom icon,
  forced text tone and tags, all browsed one folder at a time with the same
  up-one-level button as your own view. Because icons and backgrounds are
  sealed with the owner's key, each share keeps its own copy of them re-sealed
  with the group key, which is what lets a member see them while the owner is
  offline (and what makes them count against the owner's quota).
- **Public share links** with optional password and expiration.
- **Panels** — turn any folder into a shareable, template-styled dashboard
  (homepage-style) at `/panel/{slug}`. Navigable subfolders, clickable tag
  chips and a live tag filter. Each panel can be public, password-protected,
  or shared with specific users, and **rebuilds itself in the background**
  when its content changes (symlinked content included).
  - **Templates**: seventeen built-in ones plus an editor with JSON
    import/export. Eleven browse a folder at a time (Grid, Bento, Terminal,
    Minimal, Dashboard, Galaxy, Ocean, Beach, Aquarium, Dragon Ball,
    Doraemon), and six draw the **whole hierarchy and open it in place**, with
    no navigation at all: `tree` unfolds down the page (Árbol, Plano),
    `mindmap` branches across it column by column (Mapa mental, Sinapsis), and
    `orbit` lays a level out as a ring around its parent (Órbita, Reactor).
    They open on hover on a desktop and on tap where there is no hover; a
    closed branch stays mounted for the height animation but is `inert`, so it
    is out of the tab order, the accessibility tree and find-in-page.
  - **Descriptions in place**: a folder or bookmark with text gets an icon that
    opens it in a modal, in every template, and the editor's click-to-copy and
    hidden-until-clicked marks work there too (same implementation as the app,
    so the two cannot drift), re-coloured from the template's own palette
    because a panel can be dark while the app is light.
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
  or scheduled, and **per user**: each account has its own vaults, and the
  credentials are sealed with that user's own key, so nobody else (the server
  included, without that key) can read them. Backups are a *copy*: the data
  stays on the server, which is why storage quotas still apply. You can list
  what is in a vault, **restore it back into the server** (a merge, never a
  wipe), copy an archive straight from one vault to another without it passing
  through the browser, and mark one vault as primary. A NAS presenting a
  self-signed certificate (the usual case on a LAN) is handled by **pinning**:
  you are shown the fingerprint, and once accepted only that exact certificate
  is trusted, so it never degrades into "accept anything".
- **Active sessions** — see every device where the account is open (browser,
  system, IP, first and last seen) and close any of them. Revoking makes that
  cookie be refused on its next request, even though it has not expired.
- **Security log** (admin) — logins and failed attempts, refusals (401/403/429),
  server errors and views of published panels and shares, with counters, an
  activity sparkline, the IPs with most refusals, and filters by type, user,
  IP, path and status. Successful 2xx traffic is deliberately not recorded: it
  would bury the lines that matter.
- **In-app dialogs** — confirmations are the app's own components, styled,
  translated and keyboard-accessible, never `window.confirm`. Destructive ones
  are red and start with Cancel focused.
- **MCP server** at `/api/mcp` so an AI client (Claude and friends) can manage
  bookmarks, folders, tags, favourites, panels, panel templates, smart folders,
  duplicates and the trash with an API token. The two irreversible tools
  (purging) require an explicit confirmation, and emptying the trash also
  requires the caller to state how many items it expects to destroy, so an
  assistant that never looked cannot call it. See [doc/mcp.md](doc/mcp.md).
- **Browser extension** (Manifest V3) for one-click adding of the current tab.
- **Importer** for the standard HTML bookmarks export of Chrome / Firefox / Edge.
  Page snapshots are **off by default** on import: bringing in a few thousand
  URLs would otherwise mean a few thousand page fetches and a lot of storage.
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

### Who becomes admin

By default the **first account to register** does. That is convenient and it is
a race: between starting the container and getting round to signing up, whoever
reaches `/signup` first owns the instance. An empty instance accepts signups
even with registration disabled, because otherwise there would be no way to
bootstrap at all. On anything reachable from the internet, name the admin
instead:

```
ADMIN_EMAILS=you@example.com          # comma-separated for several
ADMIN_PASSWORD=change-me-once         # optional, see below
```

`ADMIN_EMAILS` **turns the first-user rule off**. Someone else registering first
gets an ordinary account; the named addresses get admin whenever they register,
and accounts that already exist are promoted on the next boot. It only ever
grants — a typo cannot demote your real admin, and removing one is done from the
admin screen where you can see what you are doing.

`ADMIN_PASSWORD` closes what is left. With the email alone nobody else can
*become* admin, but nothing stops somebody registering **as** that address
before you do, and an email is usually guessable. Given a password and a single
`ADMIN_EMAILS`, the account is created on first boot, so there is nothing to
claim. It is flagged must-change, so the value stops being a password the moment
it is used once; prefer a Docker secret or an uncommitted `.env`, and delete it
after your first sign-in. Both variables are safe to leave in place: they do
nothing once the account exists and is an admin.

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
