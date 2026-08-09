-- Catch-all 安全约束：每个域名只能有一个兜底信箱。
-- 历史版本允许重复；升级时保留创建时间最早（时间相同则 id 最小）的记录。
UPDATE mailboxes AS current
SET is_catch_all = 0
WHERE current.is_catch_all = 1
  AND EXISTS (
    SELECT 1
    FROM mailboxes AS keeper
    WHERE keeper.domain = current.domain
      AND keeper.is_catch_all = 1
      AND (
        keeper.created_at < current.created_at
        OR (keeper.created_at = current.created_at AND keeper.id < current.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_one_catchall_per_domain
  ON mailboxes(domain)
  WHERE is_catch_all = 1;
