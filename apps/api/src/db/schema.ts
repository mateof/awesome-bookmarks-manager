import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Every timestamp is written as ISO-8601 UTC, with the `Z`.
 *
 * SQLite's own `current_timestamp` gives `2026-08-23 08:15:00`: correct, UTC,
 * and **unmarked**. A browser parsing that string has no way to know it is UTC,
 * and the rule it falls back to for the space-separated form is *local time*,
 * so every such timestamp arrived shifted by the reader's offset. Two hours, in
 * Madrid, in summer.
 *
 * `$defaultFn` runs in JS at insert time, so the value carries its zone. It has
 * to be the *only* default declared here: Drizzle checks a column's SQL default
 * first and never reaches `defaultFn` when both are set, which is a quiet way
 * to write this fix and ship nothing. The `DEFAULT (current_timestamp)` in the
 * CREATE TABLE statements stays as a backstop for raw-SQL inserts.
 *
 * Keeping one format also keeps `ORDER BY` honest: these are TEXT columns, so
 * ordering is a string comparison, and a space sorts before a `T`. With both
 * shapes in one column, 23:00 written one way sorts before 09:00 written the
 * other.
 */
const utcNow = () => new Date().toISOString();


export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    nickname: text("nickname"),
    passwordHash: text("password_hash").notNull(),
    kdfSalt: blob("kdf_salt", { mode: "buffer" }).notNull(),
    masterWrap: blob("master_wrap", { mode: "buffer" }).notNull(),
    /**
     * X25519 keypair. The public half is in the clear so anybody can seal a
     * group key to this user while they are offline; the private half is
     * sealed with their own DEK. Nullable because accounts created before
     * keypairs existed get theirs on their next authenticated request.
     */
    kxPublic: blob("kx_public", { mode: "buffer" }),
    kxPrivateCt: blob("kx_private_ct", { mode: "buffer" }),
    role: text("role").notNull().default("user"),
    autoSnapshots: integer("auto_snapshots", { mode: "boolean" })
      .notNull()
      .default(true),
    // Join groups without an explicit accept when invited.
    autoAcceptInvitations: integer("auto_accept_invitations", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    // Set when an admin creates the account with a one-time password: the
    // user must set a new password before they can use the app.
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    // TOTP two-factor. The secret is sealed with the user's DEK, so it is only
    // readable right after a password login. `pending` holds an unconfirmed
    // secret during enrollment until the first valid code flips `enabled`.
    twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    twoFactorSecretCt: blob("two_factor_secret_ct", { mode: "buffer" }),
    twoFactorPendingCt: blob("two_factor_pending_ct", { mode: "buffer" }),
    // Per-user storage ceiling in bytes. NULL means "use the instance
    // default" (app_settings), which itself may be unset = unlimited.
    storageQuotaBytes: integer("storage_quota_bytes"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    nicknameIdx: uniqueIndex("users_nickname_idx").on(t.nickname),
  }),
);

/**
 * One row per active login. The session cookie is still the authority for
 * *who* you are; this table is what makes a login revocable, and what lets a
 * user see where their account is open. A revoked row makes its cookie stop
 * working on the next request.
 */
export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    lastSeenAt: text("last_seen_at").notNull().$defaultFn(utcNow),
    revokedAt: text("revoked_at"),
  },
  (t) => ({
    userIdx: index("user_sessions_user_idx").on(t.userId, t.revokedAt),
  }),
);

/**
 * Security-relevant events: logins, refusals, panel views, admin actions.
 *
 * Not a general access log. Recording every 2xx on a personal bookmark manager
 * would bury the handful of lines an operator actually needs, and would grow
 * without bound. Rows are pruned by age (see security-log/service.ts).
 */
export const securityEvents = sqliteTable(
  "security_events",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull().$defaultFn(utcNow),
    type: text("type").notNull(),
    userId: text("user_id"),
    /** Account email when known, or whatever was attempted on a failed login. */
    subject: text("subject"),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    method: text("method").notNull().default(""),
    path: text("path").notNull().default(""),
    status: integer("status"),
    detail: text("detail"),
  },
  (t) => ({
    atIdx: index("security_events_at_idx").on(t.at),
    typeIdx: index("security_events_type_idx").on(t.type, t.at),
    ipIdx: index("security_events_ip_idx").on(t.ip, t.at),
  }),
);

/** Instance-wide key/value settings managed by admins (e.g. signup toggle). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Passkeys (WebAuthn). `dekWrap` holds this user's DEK sealed by a key derived
 * from the credential's WebAuthn PRF output, so a passkey can unlock the vault
 * without the password. Only the credential (plus MASTER_KEY) can produce it.
 */
export const webauthnCredentials = sqliteTable(
  "webauthn_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(), // base64url
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports"), // CSV
    dekWrap: blob("dek_wrap", { mode: "buffer" }).notNull(),
    // When true the credential has no PRF: dekWrap is masterWrap(dek) only,
    // recoverable with MASTER_KEY (weaker). See WEBAUTHN_ALLOW_PRFLESS.
    prfless: integer("prfless", { mode: "boolean" }).notNull().default(false),
    label: text("label").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    lastUsedAt: text("last_used_at"),
  },
  (t) => ({
    userIdx: index("webauthn_user_idx").on(t.userId),
    credIdx: uniqueIndex("webauthn_credential_idx").on(t.credentialId),
  }),
);

/**
 * Panels: a named, template-styled, shareable view of a folder's subtree.
 * `payloadCt` is a MASTER_KEY-sealed JSON snapshot of the decrypted subtree so
 * a public/shared panel can be rendered without the owner being logged in.
 */
export const panels = sqliteTable(
  "panels",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Heading shown inside the panel (null = use the folder name). */
    displayTitle: text("display_title"),
    /** Browser tab text / emoji favicon overrides (null = fall back). */
    tabTitle: text("tab_title"),
    faviconEmoji: text("favicon_emoji"),
    /** Custom background asset: MASTER_KEY-sealed blob path + its MIME type. */
    bgBlobPath: text("bg_blob_path"),
    bgMime: text("bg_mime"),
    /** Custom tab icon as an image (alternative to faviconEmoji). */
    faviconBlobPath: text("favicon_blob_path"),
    faviconMime: text("favicon_mime"),
    folderId: text("folder_id").notNull(),
    templateId: text("template_id"),
    accessMode: text("access_mode").notNull().default("public"),
    passwordHash: text("password_hash"),
    payloadCt: blob("payload_ct", { mode: "buffer" }),
    payloadStatus: text("payload_status").notNull().default("pending"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    slugIdx: uniqueIndex("panels_slug_idx").on(t.slug),
    userIdx: index("panels_user_idx").on(t.userId),
  }),
);

/** Allow-list of viewers for a panel in "users" access mode. */
export const panelAllowedUsers = sqliteTable(
  "panel_allowed_users",
  {
    panelId: text("panel_id")
      .notNull()
      .references(() => panels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.panelId, t.userId] }),
  }),
);

/** User-defined panel templates (built-ins live in code). */
export const panelTemplates = sqliteTable(
  "panel_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: text("config").notNull(), // JSON
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userIdx: index("panel_templates_user_idx").on(t.userId),
  }),
);

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Master-key-wrapped copy of the group key. Null unless the group opted
     * into being recoverable: normally the key lives only in the members'
     * sealed copies, so the server cannot open the group by itself.
     */
    groupDekWrapped: blob("group_dek_wrapped", { mode: "buffer" }),
    keyVersion: integer("key_version").notNull().default(1),
    recoverable: integer("recoverable", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    ownerIdx: index("groups_owner_idx").on(t.ownerId),
  }),
);

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: text("joined_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
    userIdx: index("group_members_user_idx").on(t.userId),
  }),
);

export const groupInvitations = sqliteTable(
  "group_invitations",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at"),
    acceptedAt: text("accepted_at"),
    rejectedAt: text("rejected_at"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    tokenIdx: uniqueIndex("group_invitations_token_idx").on(t.token),
    groupIdx: index("group_invitations_group_idx").on(t.groupId),
  }),
);

export const groupShares = sqliteTable(
  "group_shares",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    sharedBy: text("shared_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    payloadCt: blob("payload_ct", { mode: "buffer" }),
    payloadStatus: text("payload_status").notNull().default("pending"),
    // "viewer" (read-only) | "editor" (group members can edit the live copy).
    access: text("access").notNull().default("viewer"),
    // Optimistic-concurrency revision for the editable payload.
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    groupIdx: index("group_shares_group_idx").on(t.groupId),
  }),
);

/**
 * A structural edit made by a group member inside an editor share, queued
 * until the owner is next online.
 *
 * The member's change lands in the share payload straight away, so the group
 * sees it at once; this row is what later carries it into the owner's real
 * folders, which is the only way the two stop drifting apart. Sealed with the
 * group key, like the payload it came from.
 */
export const groupShareOps = sqliteTable(
  "group_share_ops",
  {
    id: text("id").primaryKey(),
    shareId: text("share_id")
      .notNull()
      .references(() => groupShares.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payloadCt: blob("payload_ct", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    shareIdx: index("group_share_ops_share_idx").on(t.shareId),
  }),
);

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Which key seals this row. Null means the owner's own DEK, which is the
     * normal case. When set, the row belongs to that group and is sealed with
     * the group key, so every member with the key reads and writes it directly
     * instead of through a copy that has to be reconciled later.
     */
    keyGroupId: text("key_group_id"),
    /**
     * The key scope this row is sealed with, when it is shared. Supersedes
     * `keyGroupId`, which sealed with the group's own key and therefore could
     * only ever reach one group.
     */
    keyScopeId: text("key_scope_id"),
    parentId: text("parent_id"),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    descriptionCt: blob("description_ct", { mode: "buffer" }),
    iconBlobPath: text("icon_blob_path"),
    imageBlobPath: text("image_blob_path"),
    bgColor: text("bg_color"),
    /** "light" | "dark" to force the overlaid text colour; null = automatic. */
    textTone: text("text_tone"),
    // Set (to the source group name) when this was imported from a group
    // share, so the UI can mark it as "shared".
    shareOrigin: text("share_origin"),
    /** Symlink: when set, this row is an alias of another folder. */
    aliasOf: text("alias_of"),
    /** Starred by the user; shown in the "Favoritos" bar. */
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    // When set, this folder is a live "symlink" portal to a group share: it
    // has no real children; opening it renders the share's current content.
    linkedShareId: text("linked_share_id"),
    position: integer("position").notNull().default(0),
    // Optimistic-concurrency revision, bumped on every mutation. A conditional
    // update (WHERE rev = expected) lets a stale writer be rejected with 409.
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
    deletedAt: text("deleted_at"),
  },
  (t) => ({
    userParentIdx: index("folders_user_parent_idx").on(
      t.userId,
      t.parentId,
      t.deletedAt,
    ),
  }),
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Which key seals this row. Null means the owner's own DEK, which is the
     * normal case. When set, the row belongs to that group and is sealed with
     * the group key, so every member with the key reads and writes it directly
     * instead of through a copy that has to be reconciled later.
     */
    keyGroupId: text("key_group_id"),
    /**
     * The key scope this row is sealed with, when it is shared. Supersedes
     * `keyGroupId`, which sealed with the group's own key and therefore could
     * only ever reach one group.
     */
    keyScopeId: text("key_scope_id"),
    folderId: text("folder_id"),
    titleCt: blob("title_ct", { mode: "buffer" }).notNull(),
    urlCt: blob("url_ct", { mode: "buffer" }).notNull(),
    descriptionCt: blob("description_ct", { mode: "buffer" }),
    urlHash: text("url_hash").notNull(),
    iconBlobPath: text("icon_blob_path"),
    imageBlobPath: text("image_blob_path"),
    bgColor: text("bg_color"),
    /** See folders.textTone. */
    textTone: text("text_tone"),
    snapshotHtmlPath: text("snapshot_html_path"),
    snapshotScreenshotPath: text("snapshot_screenshot_path"),
    snapshotTextPath: text("snapshot_text_path"),
    snapshotStatus: text("snapshot_status").notNull().default("none"),
    snapshotError: text("snapshot_error"),
    // Source group name when imported from a share (see folders.shareOrigin).
    shareOrigin: text("share_origin"),
    /** Symlink: when set, this row is an alias of another bookmark. */
    aliasOf: text("alias_of"),
    /** Starred by the user; shown in the "Favoritos" bar. */
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull().default(0),
    // Optimistic-concurrency revision (see folders.rev).
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
    deletedAt: text("deleted_at"),
  },
  (t) => ({
    userFolderIdx: index("bookmarks_user_folder_idx").on(
      t.userId,
      t.folderId,
      t.deletedAt,
    ),
    urlHashIdx: index("bookmarks_user_url_hash_idx").on(t.userId, t.urlHash),
  }),
);

/**
 * Saved queries shown in the sidebar as "smart folders". They own no content:
 * `queryCt` holds the sealed predicate and membership is evaluated at read
 * time, so nothing is duplicated and nothing goes stale.
 */
export const smartFolders = sqliteTable(
  "smart_folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    /** Sealed JSON: { tagIds, match, text, favorite }. */
    queryCt: blob("query_ct", { mode: "buffer" }).notNull(),
    color: text("color").notNull().default("#6366f1"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userIdx: index("smart_folders_user_idx").on(t.userId, t.position),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userNameIdx: uniqueIndex("tags_user_name_idx").on(t.userId, t.name),
  }),
);

export const folderTags = sqliteTable(
  "folder_tags",
  {
    folderId: text("folder_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.folderId, t.tagId] }),
    tagIdx: index("folder_tags_tag_idx").on(t.tagId),
  }),
);

export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: text("bookmark_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.bookmarkId, t.tagId] }),
    tagIdx: index("bookmark_tags_tag_idx").on(t.tagId),
  }),
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: text("payload").notNull(), // JSON
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    availableAt: text("available_at").notNull().$defaultFn(utcNow),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    statusIdx: index("jobs_status_available_idx").on(t.status, t.availableAt),
    userIdx: index("jobs_user_idx").on(t.userId),
  }),
);

export const cloudConnections = sqliteTable(
  "cloud_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    credentialsCt: blob("credentials_ct", { mode: "buffer" }).notNull(),
    backupScheduleCron: text("backup_schedule_cron"),
    lastBackupAt: text("last_backup_at"),
    lastStatus: text("last_status").notNull().default("never"),
    /**
     * The user's primary vault. Schedules stay per connection (each has its
     * own cron), so this is what the UI preselects: the destination offered
     * for a copy, and the vault a restore starts from.
     */
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userIdx: index("cloud_connections_user_idx").on(t.userId),
  }),
);

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    token: text("token").notNull(),
    payloadCt: blob("payload_ct", { mode: "buffer" }),
    payloadStatus: text("payload_status").notNull().default("pending"),
    expiresAt: text("expires_at"),
    passwordHash: text("password_hash"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    tokenIdx: uniqueIndex("share_links_token_idx").on(t.token),
    userIdx: index("share_links_user_idx").on(t.userId),
  }),
);

export const extensionTokens = sqliteTable(
  "extension_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    // Master-sealed, token-wrapped copy of the user's DEK. Lets a headless
    // API/MCP client decrypt data without an interactive password login.
    // Nullable so pre-existing (legacy) tokens keep working via the cache.
    dekWrap: blob("dek_wrap", { mode: "buffer" }),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userIdx: index("extension_tokens_user_idx").on(t.userId),
    hashIdx: uniqueIndex("extension_tokens_hash_idx").on(t.tokenHash),
  }),
);

export const entityVersions = sqliteTable(
  "entity_versions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "folder" | "bookmark"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    // The entity rev this version captures.
    rev: integer("rev").notNull(),
    // Who made the change (owner for personal content).
    actorId: text("actor_id").notNull(),
    // Sealed JSON snapshot of the editable fields at this version (user DEK,
    // AAD "<userId>|version.payload").
    payloadCt: blob("payload_ct", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    entityIdx: index("entity_versions_entity_idx").on(
      t.userId,
      t.entityType,
      t.entityId,
      t.createdAt,
    ),
  }),
);

/**
 * Files attached to a folder or a bookmark. The bytes live in a blob sealed
 * with the owner's DEK; the row keeps only what listing needs, and even the
 * name and MIME type are encrypted (the server has no business knowing you
 * attached a payslip). `sizeBytes` is the plaintext length, recorded because
 * the sealed file on disk is a few bytes longer and the user should see the
 * size they uploaded.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "folder" | "bookmark"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    descriptionCt: blob("description_ct", { mode: "buffer" }),
    /** Encrypted, for display. */
    slugCt: blob("slug_ct", { mode: "buffer" }),
    /**
     * Deterministic per-user hash of the slug. Uniqueness has to be enforced
     * by the database, and a UNIQUE index over AES-GCM ciphertext would never
     * fire (random IV per write). Same trick as bookmarks.url_hash. Salted
     * with the user id so the same slug in two accounts does not correlate.
     */
    slugHash: text("slug_hash"),
    mimeCt: blob("mime_ct", { mode: "buffer" }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    blobPath: text("blob_path").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    entityIdx: index("attachments_entity_idx").on(
      t.userId,
      t.entityType,
      t.entityId,
    ),
    slugIdx: uniqueIndex("attachments_user_slug_idx").on(t.userId, t.slugHash),
  }),
);


/**
 * Inline databases. See packages/shared/src/databases.ts for why the shape is
 * what it is; the short version is that a row is one sealed blob because
 * filtering happens in memory after decryption anyway, so per-cell rows would
 * buy a query capability that cannot be used.
 */
export const databases = sqliteTable(
  "databases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Which key seals this row. Null means the owner's own DEK, which is the
     * normal case. When set, the row belongs to that group and is sealed with
     * the group key, so every member with the key reads and writes it directly
     * instead of through a copy that has to be reconciled later.
     */
    keyGroupId: text("key_group_id"),
    /**
     * The key scope this row is sealed with, when it is shared. Supersedes
     * `keyGroupId`, which sealed with the group's own key and therefore could
     * only ever reach one group.
     */
    keyScopeId: text("key_scope_id"),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    userIdx: index("databases_user_idx").on(t.userId),
    groupIdx: index("databases_group_idx").on(t.keyGroupId),
  }),
);

export const databaseColumns = sqliteTable(
  "database_columns",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** ColumnKind. Plaintext: it is a fixed vocabulary, not user content. */
    kind: text("kind").notNull(),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    /** Sealed JSON: select options, width. */
    configCt: blob("config_ct", { mode: "buffer" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    dbIdx: index("database_columns_db_idx").on(t.databaseId, t.position),
  }),
);

export const databaseRows = sqliteTable(
  "database_rows",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** Sealed JSON object keyed by column id. */
    cellsCt: blob("cells_ct", { mode: "buffer" }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
    updatedAt: text("updated_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    dbIdx: index("database_rows_db_idx").on(t.databaseId, t.position),
  }),
);

/**
 * What a row said before the last edit.
 *
 * Sealed with the **row's** key rather than the editor's own, which is the
 * whole design decision here. A shared table is written by several people; a
 * history sealed with whoever happened to type would be readable only by them,
 * so the owner would watch their table change and be unable to read a single
 * entry of its past. The rows themselves already work this way.
 */
export const databaseRowVersions = sqliteTable(
  "database_row_versions",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    rowId: text("row_id").notNull(),
    /** The key's owner, mirroring `database_rows`. */
    userId: text("user_id").notNull(),
    /** Who made the change that produced this entry. */
    actorId: text("actor_id").notNull(),
    /** Sealed JSON of the cells as they were. */
    cellsCt: blob("cells_ct", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    rowIdx: index("database_row_versions_row_idx").on(t.rowId, t.createdAt),
  }),
);

export const databaseViews = sqliteTable(
  "database_views",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** ViewKind. */
    kind: text("kind").notNull(),
    /**
     * The embed this view is private to, or null when it belongs to the
     * database and appears wherever the database does. Plaintext because it is
     * an opaque identifier the app mints, not user content.
     */
    blockId: text("block_id"),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    /** Sealed JSON: filters, sorts, hidden columns, grouping. */
    configCt: blob("config_ct", { mode: "buffer" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    dbIdx: index("database_views_db_idx").on(t.databaseId, t.position),
  }),
);


/**
 * The group key, sealed to one member's public key.
 *
 * One row per (group, member, key version). Versions exist so a rotation can
 * hand out a new key without a moment where nobody can read anything, and so
 * the old rows can be dropped deliberately rather than overwritten in place.
 */
export const groupMemberKeys = sqliteTable(
  "group_member_keys",
  {
    groupId: text("group_id").notNull(),
    userId: text("user_id").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    wrappedKey: blob("wrapped_key", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId, t.keyVersion] }),
    userIdx: index("group_member_keys_user_idx").on(t.userId),
  }),
);


/**
 * A key that a piece of shared content is sealed with, granted to one or more
 * groups.
 *
 * Sealing content with the *group's* key works until you share the same thing
 * with a second group: a key cannot be narrowed to a subset, so handing group
 * B the key of group A would give B everything A has. A scope is the missing
 * level. The content gets its own key, and each group that may read it holds
 * that key wrapped with its own.
 *
 * The practical payoff: sharing something with another group costs one small
 * row, not a re-encryption of the content, because the content's key does not
 * change when the audience grows.
 */
export const keyScopes = sqliteTable("key_scopes", {
  id: text("id").primaryKey(),
  /** Who created the share. Only used for accounting and diagnostics. */
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(utcNow),
});

export const keyScopeGrants = sqliteTable(
  "key_scope_grants",
  {
    scopeId: text("scope_id").notNull(),
    groupId: text("group_id").notNull(),
    /** The scope key, sealed with that group's key. */
    wrappedKey: blob("wrapped_key", { mode: "buffer" }).notNull(),
    /** Which version of the group key wrapped it, so rotation can find it. */
    groupKeyVersion: integer("group_key_version").notNull().default(1),
    createdAt: text("created_at").notNull().$defaultFn(utcNow),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scopeId, t.groupId] }),
    groupIdx: index("key_scope_grants_group_idx").on(t.groupId),
  }),
);
