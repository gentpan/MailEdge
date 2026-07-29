-- MailEdge 初始表结构（D1：账户、配置、发信状态机）
-- 邮件正文本身存放在 Durable Object 的 SQLite 中，附件二进制存放在 R2。

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- admin | user
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,                  -- token 的 SHA-256
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 发信渠道配置。config_encrypted 为 AES-GCM 加密后的 JSON。
CREATE TABLE IF NOT EXISTS mail_providers (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,               -- cloudflare | resend | sendflare
  config_encrypted TEXT NOT NULL,
  is_default       INTEGER NOT NULL DEFAULT 0,
  is_enabled       INTEGER NOT NULL DEFAULT 1,
  priority         INTEGER NOT NULL DEFAULT 100,-- 数值越小越优先（备用顺序）
  last_error       TEXT,
  last_checked_at  TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_providers_enabled ON mail_providers(is_enabled, priority);

-- 本系统持有的收件地址；每个地址对应一个 Durable Object 实例。
CREATE TABLE IF NOT EXISTS mailboxes (
  id           TEXT PRIMARY KEY,
  address      TEXT NOT NULL UNIQUE,
  display_name TEXT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  do_name      TEXT NOT NULL,
  is_catch_all INTEGER NOT NULL DEFAULT 0,      -- 该域名下未匹配地址的兜底信箱
  domain       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_domain ON mailboxes(domain, is_catch_all);

-- 发信状态机。internal_id 跨 Provider 切换保持不变，避免重复发送。
CREATE TABLE IF NOT EXISTS outbound_messages (
  id                  TEXT PRIMARY KEY,         -- mail_01J...，即 X-App-Message-ID
  user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
  mailbox_id          TEXT REFERENCES mailboxes(id) ON DELETE SET NULL,
  from_email          TEXT NOT NULL,
  to_json             TEXT NOT NULL,
  subject             TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'queued', -- queued|sending|sent|deferred|failed
  provider_id         TEXT,
  provider_type       TEXT,
  provider_message_id TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  attempt_log         TEXT NOT NULL DEFAULT '[]',
  last_error          TEXT,
  payload_key         TEXT,                     -- R2 中的完整发送载荷，用于重试
  next_retry_at       TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_messages(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_outbound_user ON outbound_messages(user_id, created_at);

-- 智能附件：超过阈值的附件不进邮件，改为 R2 + 签名下载链接。
CREATE TABLE IF NOT EXISTS attachment_links (
  token        TEXT PRIMARY KEY,
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  message_id   TEXT,                            -- 关联的 outbound_messages.id
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  downloads    INTEGER NOT NULL DEFAULT 0,
  is_revoked   INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_links_message ON attachment_links(message_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
