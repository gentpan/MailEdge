# 本地邮件 QA 夹具

`scripts/seed-local-mail.py` 为本地 Wrangler Durable Object 创建一组固定、可重复的邮件数据，供主题、列表、详情、分页和视觉回归测试使用。脚本不会调用 Cloudflare API，也不会发送邮件。

## 使用

先启动本地 Worker，并用测试账户登录一次，让 Miniflare 创建对应的信箱 Durable Object：

```bash
npm run dev
```

在另一个终端校验夹具，再写入本地 `admin@example.com` 信箱：

```bash
npm run qa:fixtures:check
npm run qa:fixtures:seed:local
```

如需写入另一个已经在本地创建的测试信箱：

```bash
python3 scripts/seed-local-mail.py --mailbox qa@example.com
```

运行夹具自身的契约和幂等测试：

```bash
npm run qa:fixtures:test
```

## 安全与幂等约定

- 只扫描仓库内 `.wrangler/state/v3/do/mailedge-MailboxDO`，不接受任意数据库路径。
- 只删除并重建 ID 为 `seed_*` 的本地邮件；普通本地邮件不会被修改。
- 重复执行结果相同，不会不断增加邮件。
- 每次写入在一个 SQLite 事务内完成，异常时自动回滚。
- 不创建附件元数据。需要测试真实附件时，应通过本地收信流程写入可下载对象，避免出现“有附件但对象不存在”的假状态。

## 覆盖范围

当前夹具覆盖浅色 HTML、原生 `prefers-color-scheme: dark`、固定黑底、Outlook 嵌套表格、宽表格、代码块、长中文、RTL、emoji 和纯文本；同时覆盖全部六种分类、已读/未读、星标/非星标以及 25/50/100 每页的分页数据。

脚本的所有 ID、主题、正文、状态和时间戳都是固定值。修改夹具后先运行 `npm run qa:fixtures:test`，确保分类、视觉场景和幂等约定没有退化。
