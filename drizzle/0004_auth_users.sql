CREATE TABLE crm_auth_users (
 user_id TEXT PRIMARY KEY NOT NULL,
 login TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES crm_access_members(user_id) ON DELETE CASCADE
);
