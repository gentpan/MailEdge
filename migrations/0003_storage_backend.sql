-- 默认保留旧实例的 R2 行为；切换到 KV 由管理员在设置页完成。
INSERT INTO settings (key, value, updated_at)
VALUES ('storage_backend', 'r2', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;
