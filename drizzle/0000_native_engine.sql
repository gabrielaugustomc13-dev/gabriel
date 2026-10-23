CREATE TABLE native_workspaces (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 state_json TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
