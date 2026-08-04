-- 用户自定义邮件文件夹。邮件记录中的 folder 保存 folder.id，删除时由 Worker 移回收件箱。
CREATE TABLE IF NOT EXISTS mail_folders (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mail_folders_user ON mail_folders(user_id, created_at);
