<h1 align="center">MailEdge</h1>

<p align="center">支持多发信渠道的 Serverless Webmail，完整跑在 Cloudflare 上，不需要任何自己的服务器。</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black"></a>
  <a href="https://hono.dev/"><img alt="Hono" src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white"></a>
  <a href="https://developers.cloudflare.com/d1/"><img alt="D1" src="https://img.shields.io/badge/D1-SQLite-003B57?logo=sqlite&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/gentpan/MailEdge/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/gentpan/MailEdge?color=555555"></a>
  <a href="https://github.com/gentpan/MailEdge/issues"><img alt="Issues" src="https://img.shields.io/github/issues/gentpan/MailEdge?color=555555"></a>
  <a href="https://github.com/gentpan/MailEdge/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/gentpan/MailEdge?color=555555"></a>
</p>

<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a></p>

```
收件：Email Routing → Email Worker → Durable Object (SQLite) + R2
发件：统一 MailProvider 接口 → Cloudflare Email Service / Sendflare / Resend
配置：D1（账户、渠道配置、发信状态机）
```

## 它解决什么

Cloudflare Email Routing 只能收信、转发，不能回复，也没有界面。市面上的 Cloudflare 邮箱项目大多止步于「把收到的信显示出来」。MailEdge 补上了缺的那一半：

- **发信不绑死单一服务商**。`MailProvider` 是一层抽象，Cloudflare Email Service、Sendflare、Resend 三家开箱即用，新增 SES / Mailgun / Postmark / SMTP 只需要加一个类。
- **主备切换不会重复发信**。只有网络故障、429、5xx 这类临时错误才切换渠道；域名未验证、地址非法、内容被拒等永久性错误立即失败。否则一封被拒的邮件会在三个平台各发一次。
- **绕开 5 MiB 附件上限**。小附件正常发，大附件自动上传 R2 并在正文插入下载链接，可统计下载次数、设置过期、随时撤销。用户感觉不到区别。
- **邮件分片存储**。每个地址一个 Durable Object，各自带一份 SQLite，不存在单库瓶颈。

## 功能

- 收件箱 / 已发送 / 归档 / 回收站，搜索、分页、星标、未读计数
- 写信支持抄送、密送、多附件；管理员可指定发信渠道
- 设置页在线配置三个渠道，支持测试发送、设为默认、备用优先级
- 渠道密钥 AES-GCM 加密后存 D1，接口只返回脱敏值
- 发信记录带完整重试链路，可手动重试；`deferred` 状态由 Cron 指数退避自动重试
- HTML 正文在 `sandbox=""` 的 iframe 中渲染，脚本、表单、同源访问全部禁用

## 技术栈

Cloudflare Workers · D1 · R2 · Durable Objects (SQLite) · Email Routing · Hono · React · Vite · TypeScript

## 架构

| 能力 | 实现 |
| --- | --- |
| 收件 | Cloudflare Email Routing → `email()` handler → `postal-mime` 解析 |
| 邮件存储 | 每个地址一个 Durable Object，实例内置 SQLite |
| 附件 | R2；原始报文 `.eml` 一并留档 |
| 账户 / 渠道配置 / 发信状态机 | D1 |
| 发信 | `MailProvider` 抽象，三个实现 + 主备切换 |
| 前端 | React + Vite，通过 Workers Assets 托管 |

### 发信渠道

| Provider | 定位 | 说明 |
| --- | --- | --- |
| Cloudflare Email Service | 默认原生渠道 | Workers Binding，无额外 HTTP 请求；单封 ≤ 5 MiB、≤ 32 个附件；发往任意外部邮箱需要 Workers Paid |
| Sendflare | 备用或主渠道 | REST API，Bearer Token，可选 HMAC-SHA256 签名 |
| Resend | 成熟备用渠道 | REST API，需要在其后台验证域名 |

新增 SES / Mailgun / Postmark / SMTP 只需要在 [src/mail/providers/](src/mail/providers/) 加一个类，并在 [factory.ts](src/mail/factory.ts) 加一个分支。

### 状态机与切换规则

```
queued → sending → sent
                 ├── deferred → 定时任务重试（5min 起指数退避，上限 6h，最多 5 次）
                 └── failed
```

每封邮件生成固定的内部 ID（`mail_01J...`），以 `X-App-Message-ID` 头带出。切换渠道时沿用同一个 ID，便于去重与追踪。

**只有临时性错误才切换备用渠道**：网络故障、429、5xx、408。
**永久性错误直接失败**：域名未验证、地址非法、内容被拒、spam complaint、账户暂停、发件人无权限。
否则一封被拒的邮件会在三个平台各发一次。分类规则见 [src/mail/errors.ts](src/mail/errors.ts)。

### 智能附件

```
附件 ≤ 3 MB（且整封不超上限） → 真 Email Attachment
附件 > 3 MB                    → 上传 R2 → 正文插入下载链接
```

下载走 `/d/:token`，由 Worker 校验 token、有效期与撤销状态后从 R2 出流，支持统计下载次数、7 天过期、随时撤销。内嵌图片（`cid:`）始终留在邮件里，避免正文裂图。阈值由 `SMART_ATTACHMENT_THRESHOLD` 控制。

## 部署

### 1. 创建资源

```bash
npx wrangler d1 create mailedge
```

```bash
npx wrangler r2 bucket create mailedge-attachments
```

把 `d1 create` 输出的 `database_id` 填进 [wrangler.jsonc](wrangler.jsonc)，同时把 `APP_URL` 改成你的正式域名（下载链接会用它拼绝对地址）。

### 2. 写入机密

```bash
openssl rand -base64 32
```

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put SESSION_SECRET
```

`ENCRYPTION_KEY` 用于加密 `mail_providers.config_encrypted`（AES-GCM），换掉它等于作废所有已保存的渠道密钥。

### 3. 建表并部署

```bash
npx wrangler d1 migrations apply mailedge --remote
```

```bash
npm run deploy
```

### 4. 配置收件

**必须先完成上一步的部署**，Worker 才会出现在 Email Routing 的下拉列表里。

Cloudflare 面板 → **Compute** → **Email Service** → **Email Routing** → 选择域名（首次进入需先启用，它会自动写入 MX 与 SPF 记录）。

然后 **Routing Rules** → **Create routing rule**：

| 字段 | 填写 |
| --- | --- |
| Email pattern | 地址的本地部分，如 `support` |
| Action | **Send to a Worker** |
| Worker | `mailedge` |

想接收整个域名的邮件，改用 **Catch-all address**，action 同样设为 Send to a Worker。

> 投递给 Worker 只在新版 Email Routing 界面提供。若面板提示需要切换到新界面，按提示切换即可。

### 5. 初始化

打开部署后的域名，首次访问会进入初始化页，创建管理员并绑定第一个收件地址。**这里填写的地址必须与上一步的路由规则一致**，否则 Worker 收到邮件时找不到对应信箱，会直接退信（`550 未知收件人`）。

之后到「设置 → 发信服务」配置渠道，先「测试发送」确认可用，再「设为默认」。

发往任意外部邮箱需要 Workers Paid（含每月 3,000 封，超出每 1,000 封 0.35 美元）；收件在免费和付费计划都可用。

## 本地开发

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

填入两个 `openssl rand -base64 32` 生成的值，然后：

```bash
npx wrangler d1 migrations apply mailedge --local
```

```bash
npm run dev
```

`npm run dev` 会先构建前端再启动 `wrangler dev`（http://127.0.0.1:8787）。改前端时另开一个终端跑 `npm run dev:web` 做增量构建。

本地模拟收信（wrangler 内置入口）：

```bash
curl -X POST 'http://127.0.0.1:8787/cdn-cgi/handler/email?from=alice@outside.com&to=you@yourdomain.com' --data-binary @test.eml -H 'Content-Type: message/rfc822'
```

本地状态都在 `.wrangler/state/`，删掉即可重置。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET/POST` | `/api/auth/setup` | 首次初始化（已有用户后自动关闭） |
| `POST` | `/api/auth/login` `/logout` `/password` | 会话 |
| `GET` | `/api/auth/me` | 当前用户与信箱 |
| `GET/POST/DELETE` | `/api/mailboxes` | 收件地址管理 |
| `GET` | `/api/messages` | 列表，支持 `folder` `q` `before` 分页 |
| `GET/PATCH/DELETE` | `/api/messages/:id` | 详情、已读/星标/移动、删除（先进回收站） |
| `GET` | `/api/messages/:id/attachments/:attachmentId` | 收件附件下载 |
| `GET` | `/api/stats` | 各文件夹未读数 |
| `POST` | `/api/mail/send` | 发信（JSON 或 multipart） |
| `GET` | `/api/mail/outbox` `/outbox/:id` | 发信记录 |
| `POST` | `/api/mail/outbox/:id/retry` | 手动重试（沿用同一内部 ID） |
| `GET/POST/DELETE` | `/api/providers` | 渠道管理（管理员） |
| `POST` | `/api/providers/:id/default` `/test` | 设为默认、测试发送 |
| `GET/POST` | `/api/shares` `/shares/:token/revoke` | 附件分享链接 |
| `GET` | `/d/:token` | 大附件公开下载 |

### 发信示例

JSON（附件用 base64）：

```bash
curl -X POST https://your-domain/api/mail/send -H 'Content-Type: application/json' -b cookie.txt -d '{"from":"you@yourdomain.com","to":"someone@example.com","subject":"你好","text":"正文","html":"<p>正文</p>"}'
```

multipart（前端上传用，`payload` 字段是 JSON，文件放 `attachments`）：

```bash
curl -X POST https://your-domain/api/mail/send -b cookie.txt -F 'payload={"from":"you@yourdomain.com","to":"someone@example.com","subject":"报价单","text":"见附件"}' -F 'attachments=@quote.pdf'
```

返回里的 `smartAttachments` 会说明哪些附件真发了、哪些转成了下载链接。

## 已知取舍

- Cloudflare 的 Workers Binding 收的是原始 MIME，报文由 [src/mail/mime.ts](src/mail/mime.ts) 自行构建（抄送、密送、回复地址、自定义头、附件、内嵌图片都已覆盖）。绑定按信封收件人逐个投递，因此收件人多时会调用多次 `send()`；若中途失败可能出现部分投递。
- Sendflare 的字段名与签名头以其当前 API Reference 为准，如有调整只需要改 [src/mail/providers/sendflare.ts](src/mail/providers/sendflare.ts)，不影响上层抽象。
- HTML 正文在前端用 `sandbox=""` 的 iframe 渲染，脚本、表单、同源访问全部禁用。
- 邮件按地址分片存储在各自的 Durable Object 中，跨信箱的全局搜索需要另做索引。
