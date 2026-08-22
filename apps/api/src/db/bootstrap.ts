import { getSqlite } from "./client.js";

/**
 * Idempotently create all tables and indexes. Used in lieu of generated
 * migrations for now — single source of truth still lives in schema.ts (this
 * file mirrors it). When a real migration is needed later, switch to
 * drizzle-kit and a migrations folder.
 */
export function ensureSchema() {
  const sql = getSqlite();
  sql.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      kdf_salt BLOB NOT NULL,
      master_wrap BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT,
      name_ct BLOB NOT NULL,
      description_ct BLOB,
      icon_blob_path TEXT,
      image_blob_path TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      alias_of TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      rev INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS folders_user_parent_idx
      ON folders(user_id, parent_id, deleted_at);

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id TEXT,
      title_ct BLOB NOT NULL,
      url_ct BLOB NOT NULL,
      description_ct BLOB,
      url_hash TEXT NOT NULL,
      icon_blob_path TEXT,
      snapshot_html_path TEXT,
      snapshot_screenshot_path TEXT,
      snapshot_text_path TEXT,
      snapshot_status TEXT NOT NULL DEFAULT 'none',
      favorite INTEGER NOT NULL DEFAULT 0,
      alias_of TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      rev INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS bookmarks_user_folder_idx
      ON bookmarks(user_id, folder_id, deleted_at);
    CREATE INDEX IF NOT EXISTS bookmarks_user_url_hash_idx
      ON bookmarks(user_id, url_hash);

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      last_seen_at TEXT NOT NULL DEFAULT (current_timestamp),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS user_sessions_user_idx
      ON user_sessions(user_id, revoked_at);

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL DEFAULT (current_timestamp),
      type TEXT NOT NULL,
      user_id TEXT,
      subject TEXT,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status INTEGER,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS security_events_at_idx ON security_events(at);
    CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events(type, at);
    CREATE INDEX IF NOT EXISTS security_events_ip_idx ON security_events(ip, at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      dek_wrap BLOB NOT NULL,
      prfless INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS webauthn_user_idx ON webauthn_credentials(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS webauthn_credential_idx
      ON webauthn_credentials(credential_id);

    CREATE TABLE IF NOT EXISTS panels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      display_title TEXT,
      tab_title TEXT,
      favicon_emoji TEXT,
      bg_blob_path TEXT,
      bg_mime TEXT,
      favicon_blob_path TEXT,
      favicon_mime TEXT,
      folder_id TEXT NOT NULL,
      template_id TEXT,
      access_mode TEXT NOT NULL DEFAULT 'public',
      password_hash TEXT,
      payload_ct BLOB,
      payload_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS panels_slug_idx ON panels(slug);
    CREATE INDEX IF NOT EXISTS panels_user_idx ON panels(user_id);

    CREATE TABLE IF NOT EXISTS panel_allowed_users (
      panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (panel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS panel_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS panel_templates_user_idx ON panel_templates(user_id);

    CREATE TABLE IF NOT EXISTS smart_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name_ct BLOB NOT NULL,
      query_ct BLOB NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS smart_folders_user_idx
      ON smart_folders(user_id, position);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, name);

    CREATE TABLE IF NOT EXISTS folder_tags (
      folder_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (folder_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS folder_tags_tag_idx ON folder_tags(tag_id);

    CREATE TABLE IF NOT EXISTS bookmark_tags (
      bookmark_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (bookmark_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS bookmark_tags_tag_idx ON bookmark_tags(tag_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      available_at TEXT NOT NULL DEFAULT (current_timestamp),
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS jobs_status_available_idx ON jobs(status, available_at);
    CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id);

    CREATE TABLE IF NOT EXISTS cloud_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      credentials_ct BLOB NOT NULL,
      backup_schedule_cron TEXT,
      last_backup_at TEXT,
      last_status TEXT NOT NULL DEFAULT 'never',
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS cloud_connections_user_idx ON cloud_connections(user_id);

    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      token TEXT NOT NULL,
      payload_ct BLOB,
      payload_status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS share_links_token_idx ON share_links(token);
    CREATE INDEX IF NOT EXISTS share_links_user_idx ON share_links(user_id);

    CREATE TABLE IF NOT EXISTS extension_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS extension_tokens_user_idx ON extension_tokens(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS extension_tokens_hash_idx
      ON extension_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      group_dek_wrapped BLOB,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS groups_owner_idx ON groups(owner_id);

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (current_timestamp),
      PRIMARY KEY (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);

    CREATE TABLE IF NOT EXISTS group_invitations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT,
      accepted_at TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_token_idx
      ON group_invitations(token);
    CREATE INDEX IF NOT EXISTS group_invitations_group_idx
      ON group_invitations(group_id);

    CREATE TABLE IF NOT EXISTS group_shares (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      payload_ct BLOB,
      payload_status TEXT NOT NULL DEFAULT 'pending',
      access TEXT NOT NULL DEFAULT 'viewer',
      rev INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS group_shares_group_idx ON group_shares(group_id);

    -- Structural edits a group member made inside an editor share, waiting to
    -- be written back to the owner's real rows. They cannot be applied when
    -- they happen: the owner's content is encrypted with the owner's key, and
    -- the member does not have it. See groups/ops.ts.
    CREATE TABLE IF NOT EXISTS group_share_ops (
      id TEXT PRIMARY KEY,
      share_id TEXT NOT NULL REFERENCES group_shares(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_ct BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS group_share_ops_share_idx ON group_share_ops(share_id);

    CREATE TABLE IF NOT EXISTS entity_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      rev INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      payload_ct BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS entity_versions_entity_idx
      ON entity_versions(user_id, entity_type, entity_id, created_at);

    -- Files attached to a folder or bookmark. The bytes are a sealed blob on
    -- disk; name and MIME are encrypted too, so a look at the database says
    -- how many files you have and how big, and nothing else.
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      name_ct BLOB NOT NULL,
      mime_ct BLOB NOT NULL,
      size_bytes INTEGER NOT NULL,
      blob_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS attachments_entity_idx
      ON attachments(user_id, entity_type, entity_id);
  `);

  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name_ct BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS databases_user_idx ON databases(user_id);

    CREATE TABLE IF NOT EXISTS database_columns (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name_ct BLOB NOT NULL,
      config_ct BLOB,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS database_columns_db_idx
      ON database_columns(database_id, position);

    CREATE TABLE IF NOT EXISTS database_rows (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      cells_ct BLOB NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS database_rows_db_idx
      ON database_rows(database_id, position);

    CREATE TABLE IF NOT EXISTS database_views (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name_ct BLOB NOT NULL,
      config_ct BLOB,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS database_views_db_idx
      ON database_views(database_id, position);
  `);

  // Attachment metadata added after the table shipped. The slug hash carries
  // the uniqueness constraint (see schema.ts); NULLs are allowed so rows
  // written before slugs existed keep working, and SQLite lets multiple NULLs
  // coexist under a UNIQUE index.
  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS group_member_keys (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      key_version INTEGER NOT NULL DEFAULT 1,
      wrapped_key BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      PRIMARY KEY (group_id, user_id, key_version)
    );
    CREATE INDEX IF NOT EXISTS group_member_keys_user_idx
      ON group_member_keys(user_id);
  `);
  tryAddColumn("database_views", "block_id", "TEXT");
  relaxGroupDekNotNull();
  tryAddColumn("folders", "key_group_id", "TEXT");
  tryAddColumn("bookmarks", "key_group_id", "TEXT");
  tryAddColumn("databases", "key_group_id", "TEXT");
  getSqlite().exec(`
    CREATE INDEX IF NOT EXISTS folders_group_idx ON folders(key_group_id);
    CREATE INDEX IF NOT EXISTS bookmarks_group_idx ON bookmarks(key_group_id);
    CREATE INDEX IF NOT EXISTS databases_group_idx ON databases(key_group_id);
  `);
  tryAddColumn("groups", "key_version", "INTEGER NOT NULL DEFAULT 1");
  tryAddColumn("groups", "recoverable", "INTEGER NOT NULL DEFAULT 0");
  tryAddColumn("users", "kx_public", "BLOB");
  tryAddColumn("users", "kx_private_ct", "BLOB");
  tryAddColumn("attachments", "description_ct", "BLOB");
  tryAddColumn("attachments", "slug_ct", "BLOB");
  tryAddColumn("attachments", "slug_hash", "TEXT");
  getSqlite().exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS attachments_user_slug_idx
       ON attachments(user_id, slug_hash);`,
  );

  // Best-effort additions to existing tables. SQLite has no
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so we attempt and ignore the
  // 'duplicate column name' error.
  tryAddColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
  tryAddColumn("users", "nickname", "TEXT");
  tryAddColumn("users", "auto_snapshots", "INTEGER NOT NULL DEFAULT 1");
  tryAddColumn(
    "users",
    "auto_accept_invitations",
    "INTEGER NOT NULL DEFAULT 0",
  );
  tryAddColumn("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
  tryAddColumn("users", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 0");
  tryAddColumn("users", "two_factor_secret_ct", "BLOB");
  tryAddColumn("users", "two_factor_pending_ct", "BLOB");
  // Per-user storage ceiling; NULL falls back to the instance default.
  tryAddColumn("users", "storage_quota_bytes", "INTEGER");
  // The user's primary cloud vault (UI default for copy/restore).
  tryAddColumn("cloud_connections", "is_default", "INTEGER NOT NULL DEFAULT 0");
  tryAddColumn("bookmarks", "snapshot_error", "TEXT");
  // Starred bookmarks ("Favoritos" bar).
  tryAddColumn("bookmarks", "favorite", "INTEGER NOT NULL DEFAULT 0");
  tryAddColumn("folders", "favorite", "INTEGER NOT NULL DEFAULT 0");
  // Symlinks: an alias row points at the real folder/bookmark it mirrors.
  tryAddColumn("folders", "alias_of", "TEXT");
  tryAddColumn("bookmarks", "alias_of", "TEXT");
  // Optimistic-concurrency revision for folders/bookmarks.
  tryAddColumn("folders", "rev", "INTEGER NOT NULL DEFAULT 1");
  tryAddColumn("bookmarks", "rev", "INTEGER NOT NULL DEFAULT 1");
  // Share access level + concurrency rev for editable group shares.
  tryAddColumn("group_shares", "access", "TEXT NOT NULL DEFAULT 'viewer'");
  tryAddColumn("group_shares", "rev", "INTEGER NOT NULL DEFAULT 1");
  // Rejected invitations (for the sender's status view).
  tryAddColumn("group_invitations", "rejected_at", "TEXT");
  // Marker for content imported from a group share ("shared" badge).
  tryAddColumn("folders", "share_origin", "TEXT");
  tryAddColumn("bookmarks", "share_origin", "TEXT");
  // Live "symlink" portal to a group share (folder imported as a link).
  tryAddColumn("folders", "linked_share_id", "TEXT");
  // Per-card appearance: optional background colour (hex with optional
  // alpha) and an encrypted background image stored as a blob.
  tryAddColumn("folders", "bg_color", "TEXT");
  tryAddColumn("bookmarks", "bg_color", "TEXT");
  tryAddColumn("bookmarks", "image_blob_path", "TEXT");
  // Manual override of the text colour drawn over a card's background.
  tryAddColumn("folders", "text_tone", "TEXT");
  tryAddColumn("bookmarks", "text_tone", "TEXT");
  // Per-panel identity overrides: heading shown inside the panel, browser tab
  // title and an emoji favicon.
  tryAddColumn("panels", "display_title", "TEXT");
  tryAddColumn("panels", "tab_title", "TEXT");
  tryAddColumn("panels", "favicon_emoji", "TEXT");
  // Custom uploaded panel background (image/gif/video), MASTER_KEY-sealed.
  tryAddColumn("panels", "bg_blob_path", "TEXT");
  tryAddColumn("panels", "bg_mime", "TEXT");
  // Tab icon as an uploaded image, as an alternative to the emoji.
  tryAddColumn("panels", "favicon_blob_path", "TEXT");
  tryAddColumn("panels", "favicon_mime", "TEXT");
  // Token-wrapped DEK envelope for headless API / MCP access.
  tryAddColumn("extension_tokens", "dek_wrap", "BLOB");
  // Passkeys registered before the PRF-less fallback existed default to PRF.
  tryAddColumn("webauthn_credentials", "prfless", "INTEGER NOT NULL DEFAULT 0");

  // Unique index on nickname — applied even if added later. Multiple NULLs are
  // allowed by SQLite UNIQUE constraints, so existing users without a
  // nickname coexist fine.
  getSqlite().exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_idx ON users(nickname);`,
  );

  ensureAdminExists();
}

/**
 * If no admin user exists yet — typical when the role column was added to a
 * pre-existing database and every user inherited the default 'user' role —
 * promote the oldest registered account. The instance always needs at least
 * one admin to manage users / view diagnostics.
 */
function ensureAdminExists() {
  const sql = getSqlite();
  const admin = sql
    .prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`)
    .get();
  if (admin) return;
  const oldest = sql
    .prepare(
      `SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1`,
    )
    .get() as { id: string; email: string } | undefined;
  if (!oldest) return; // no users registered yet
  sql.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(oldest.id);
  console.log(`[bootstrap] No admin found — promoted ${oldest.email} to admin.`);
}

/**
 * Make `groups.group_dek_wrapped` nullable on databases created before the key
 * moved to the members.
 *
 * SQLite cannot relax a NOT NULL constraint in place, so the table has to be
 * rebuilt. Guarded on the current shape so it runs exactly once, and wrapped
 * with foreign keys off because several tables reference `groups` and dropping
 * it mid-transaction would otherwise cascade them away.
 */
function relaxGroupDekNotNull() {
  const sql = getSqlite();
  const cols = sql.prepare(`PRAGMA table_info(groups)`).all() as {
    name: string;
    notnull: number;
  }[];
  const col = cols.find((c) => c.name === "group_dek_wrapped");
  if (!col || col.notnull === 0) return;

  sql.pragma("foreign_keys = OFF");
  try {
    sql.exec(`
      BEGIN;
      CREATE TABLE groups_migrated (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        group_dek_wrapped BLOB,
        key_version INTEGER NOT NULL DEFAULT 1,
        recoverable INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (current_timestamp)
      );
      INSERT INTO groups_migrated
        (id, owner_id, name, description, group_dek_wrapped, key_version, recoverable, created_at)
      SELECT id, owner_id, name, description, group_dek_wrapped,
             COALESCE(key_version, 1), COALESCE(recoverable, 0), created_at
      FROM groups;
      DROP TABLE groups;
      ALTER TABLE groups_migrated RENAME TO groups;
      CREATE INDEX IF NOT EXISTS groups_owner_idx ON groups(owner_id);
      COMMIT;
    `);
    console.log("[bootstrap] groups.group_dek_wrapped is now nullable");
  } catch (err) {
    try {
      sql.exec("ROLLBACK");
    } catch {
      /* nothing to roll back */
    }
    throw err;
  } finally {
    sql.pragma("foreign_keys = ON");
  }
}

function tryAddColumn(table: string, column: string, def: string) {
  const sql = getSqlite();
  try {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column")) throw err;
  }
}
