ALTER TABLE native_workspaces ADD COLUMN commit_token TEXT;
--> statement-breakpoint
CREATE TABLE native_audit_entries (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 workspace_id TEXT NOT NULL,
 workspace_version INTEGER NOT NULL,
 occurred_at TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_label TEXT NOT NULL,
 actor_type TEXT NOT NULL,
 source TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 entity_name TEXT NOT NULL,
 deal_id TEXT NOT NULL,
 summary TEXT NOT NULL,
 changes_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX native_audit_workspace_seq_idx ON native_audit_entries(workspace_id,seq);
--> statement-breakpoint
CREATE INDEX native_audit_workspace_deal_idx ON native_audit_entries(workspace_id,deal_id,seq);
