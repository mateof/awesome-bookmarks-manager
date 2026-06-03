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
      position INTEGER NOT NULL DEFAULT 0,
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
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS bookmarks_user_folder_idx
      ON bookmarks(user_id, folder_id, deleted_at);
    CREATE INDEX IF NOT EXISTS bookmarks_user_url_hash_idx
      ON bookmarks(user_id, url_hash);

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
      group_dek_wrapped BLOB NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS group_shares_group_idx ON group_shares(group_id);
  `);

  // Best-effort additions to existing tables. SQLite has no
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so we attempt and ignore the
  // 'duplicate column name' error.
  tryAddColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
  tryAddColumn("users", "nickname", "TEXT");
  tryAddColumn("users", "auto_snapshots", "INTEGER NOT NULL DEFAULT 1");
  tryAddColumn("bookmarks", "snapshot_error", "TEXT");

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

function tryAddColumn(table: string, column: string, def: string) {
  const sql = getSqlite();
  try {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column")) throw err;
  }
}
