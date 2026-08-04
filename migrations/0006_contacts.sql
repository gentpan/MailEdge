-- 用户联系人。联系人按用户隔离，邮箱地址在同一账户内唯一。
CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  company    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_email
  ON contacts(user_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_user_name
  ON contacts(user_id, name);
