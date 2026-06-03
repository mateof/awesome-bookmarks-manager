import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    nickname: text("nickname"),
    passwordHash: text("password_hash").notNull(),
    kdfSalt: blob("kdf_salt", { mode: "buffer" }).notNull(),
    masterWrap: blob("master_wrap", { mode: "buffer" }).notNull(),
    role: text("role").notNull().default("user"),
    autoSnapshots: integer("auto_snapshots", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    nicknameIdx: uniqueIndex("users_nickname_idx").on(t.nickname),
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
    groupDekWrapped: blob("group_dek_wrapped", { mode: "buffer" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    joinedAt: text("joined_at").notNull().default(sql`(current_timestamp)`),
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
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    groupIdx: index("group_shares_group_idx").on(t.groupId),
  }),
);

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    nameCt: blob("name_ct", { mode: "buffer" }).notNull(),
    descriptionCt: blob("description_ct", { mode: "buffer" }),
    iconBlobPath: text("icon_blob_path"),
    imageBlobPath: text("image_blob_path"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
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
    folderId: text("folder_id"),
    titleCt: blob("title_ct", { mode: "buffer" }).notNull(),
    urlCt: blob("url_ct", { mode: "buffer" }).notNull(),
    descriptionCt: blob("description_ct", { mode: "buffer" }),
    urlHash: text("url_hash").notNull(),
    iconBlobPath: text("icon_blob_path"),
    snapshotHtmlPath: text("snapshot_html_path"),
    snapshotScreenshotPath: text("snapshot_screenshot_path"),
    snapshotTextPath: text("snapshot_text_path"),
    snapshotStatus: text("snapshot_status").notNull().default("none"),
    snapshotError: text("snapshot_error"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
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

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    availableAt: text("available_at").notNull().default(sql`(current_timestamp)`),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
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
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    userIdx: index("extension_tokens_user_idx").on(t.userId),
    hashIdx: uniqueIndex("extension_tokens_hash_idx").on(t.tokenHash),
  }),
);
