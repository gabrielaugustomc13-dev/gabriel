CREATE TABLE crm_access_members (
 user_id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','analyst')),
 seller_id TEXT NOT NULL DEFAULT '',
 label TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
