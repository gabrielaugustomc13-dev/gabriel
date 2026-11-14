CREATE TABLE crm_viewer_access (
 user_id TEXT PRIMARY KEY NOT NULL,
 permissions_json TEXT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES crm_access_members(user_id) ON DELETE CASCADE
);
