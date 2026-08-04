-- 发信状态记录默认保留一年；管理员可在设置中切换为 90/180/365 天。
INSERT INTO settings (key, value, updated_at)
VALUES ('outbound_retention_days', '365', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;
