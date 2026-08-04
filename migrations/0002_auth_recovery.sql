-- Passkey 公钥与一次性认证挑战。私钥永远只保留在用户的设备或密码管理器中。
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id           TEXT PRIMARY KEY,                  -- WebAuthn credential ID（base64url）
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,                     -- SPKI 公钥（base64url）
  algorithm    TEXT NOT NULL,                     -- ES256 | RS256
  transports   TEXT NOT NULL DEFAULT '[]',       -- JSON 数组
  sign_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,                       -- register | login
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup ON auth_challenges(challenge, kind, user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_lookup ON password_reset_tokens(token_hash, expires_at, used_at);
