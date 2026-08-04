<h1 align="center">MailEdge</h1>

<p align="center">支持多发信渠道的 Serverless Webmail，完整跑在 Cloudflare 上，不需要任何自己的服务器。</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
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

<p align="center"><img src="docs/images/02-inbox.png" alt="MailEdge 收件箱" width="880"></p>

> 完整的产品介绍、界面截图与图文部署教程见 [docs/blog.md](docs/blog.md)。

```
收件：Email Routing → Email Worker → Durable Object (SQLite) + R2 / KV
发件：统一 MailProvider 接口 → Cloudflare Email Service / Sendflare / Resend
配置：D1（账户、渠道配置、发信状态机）
```

## 它解决什么

Cloudflare Email Routing 只能收信、转发，不能回复，也没有界面。市面上的 Cloudflare 邮箱项目大多止步于「把收到的信显示出来」。MailEdge 补上了缺的那一半：

- **发信不绑死单一服务商**。`MailProvider` 是一层抽象，Cloudflare Email Service、Sendflare、Resend 三家开箱即用，新增 SES / Mailgun / Postmark / SMTP 只需要加一个类。
- **主备切换不会重复发信**。只有网络故障、429、5xx 这类临时错误才切换渠道；域名未验证、地址非法、内容被拒等永久性错误立即失败。否则一封被拒的邮件会在三个平台各发一次。
- **绕开 5 MiB 附件上限**。小附件正常发，大附件自动上传到所选的 R2 或 KV，并在正文插入下载链接，可统计下载次数、设置过期、随时撤销。用户感觉不到区别。
- **邮件分片存储**。每个地址一个 Durable Object，各自带一份 SQLite，不存在单库瓶颈。

## 功能

- 收件箱 / 已发送 / 归档 / 回收站，搜索、分页、星标、未读计数
- 左侧可创建自定义文件夹并移动邮件；文件夹删除时邮件会安全迁回收件箱
- 多信箱聚合视图；未精确登记、靠兜底兜进来的信单独归入「其他地址」
- 每个收件地址可设置独立的左侧显示名称；显示名称不会改变 Cloudflare Email Routing 使用的实际地址
- 写信支持 Markdown（发送时转成邮件安全 HTML）、抄送、密送、多附件；管理员可指定发信渠道
- 设置页在线配置三个渠道，支持测试发送、设为默认、备用优先级
- 渠道密钥 AES-GCM 加密后存 D1，接口只返回脱敏值
- 发信记录带完整重试链路，可手动重试；`deferred` 状态由 Cron 指数退避自动重试
- HTML 正文在沙箱 iframe 中渲染，脚本、表单和顶层导航全部禁用；仅允许前端读取文档高度，让完整正文由详情面板统一滚动
- 界面中/英双语，跟随浏览器语言自动选择，可随时切换
- 新信实时推送：每个信箱 Durable Object 持有前端 WebSocket（Hibernation，空闲不计费），收信秒级到达；断线自动重连，另有 60 秒轮询兜底

### AI 助手（可选）

统一走 OpenAI 兼容接口，可接 OpenAI、DeepSeek、Kimi、智谱、硅基流动、Ollama 等，也可自填 baseURL + 模型名。Key 同样 AES-GCM 加密存 D1。

- **AI 回复**：针对来信生成回复草稿，直接填入写信框
- **AI 总结**：长邮件一键摘要，结果缓存进 Durable Object
- **邮件分类**：默认用本地规则零成本分类；启用 AI 并配置 Key 后，使用 AI 增强分类（重要 / 更新 / 推广 / 验证码 / 社交 / 其他）
- **Telegram 推送**：新信到达推送到 Telegram Bot，可只推指定分类

分类与推送挂在收信 Worker 上，都在 `waitUntil` 里异步执行，且各自 try/catch 隔离——本地规则、AI 或推送出问题绝不影响邮件入库。

## 技术栈

全部构建在 Cloudflare 平台上，前后端同一次部署，无需自建服务器。

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Cloudflare Workers | 边缘执行，`fetch` / `email` / `scheduled` 三个入口 |
| 收件 | Email Routing + `postal-mime` | 转发到 Email Worker，解析 MIME |
| 发件 | 自研 `MailProvider` 抽象 | Cloudflare Email Service / Sendflare / Resend / SMTP |
| SMTP | `cloudflare:sockets` | `connect()` 裸 TCP，手写 SMTP 会话（587/465） |
| 账户 · 配置 · 发信状态机 | D1（SQLite） | 需要跨信箱查询的数据 |
| 邮件正文 | Durable Objects + 内置 SQLite | 一地址一实例，天然分片 |
| 附件 | R2 / KV | 后台可选；KV 无需支付方式但单个对象上限 25MB |
| 定时任务 | Cron Triggers | 重试 deferred 邮件、清理过期分享 |
| 加密 | Web Crypto（AES-GCM / PBKDF2） | 渠道密钥加密、口令哈希、会话签名 |
| API 框架 | Hono | 轻量路由，贴合 Workers |
| 前端 | React 19 + Vite 7 | 通过 Workers Assets 托管 |
| 样式 | 纯手写 CSS + 设计令牌 | 无 Tailwind / CSS-in-JS，全部 CSS 变量驱动 |
| i18n | 自研轻量方案 | 中/英，无第三方库 |
| AI | OpenAI 兼容接口 | 回复 / 总结 / 分类，可接任意兼容服务商 |
| 语言 · 工具链 | TypeScript 7 · Wrangler | 原生编译器，端到端类型安全 |

## 架构

| 能力 | 实现 |
| --- | --- |
| 收件 | Cloudflare Email Routing → `email()` handler → `postal-mime` 解析 |
| 邮件存储 | 每个地址一个 Durable Object，实例内置 SQLite |
| 附件 | R2 / KV；原始报文 `.eml` 一并留档 |
| 账户 / 渠道配置 / 发信状态机 | D1 |
| 发信 | `MailProvider` 抽象，三个实现 + 主备切换 |
| 前端 | React + Vite，通过 Workers Assets 托管 |

### 发信渠道

| Provider | 定位 | 说明 |
| --- | --- | --- |
| Cloudflare Email Service | 默认原生渠道 | Workers Binding，无额外 HTTP 请求；单封 ≤ 5 MiB、≤ 32 个附件；发往任意外部邮箱需要 Workers Paid |
| Sendflare | 备用或主渠道 | REST API，Bearer Token，可选 HMAC-SHA256 签名 |
| Resend | 成熟备用渠道 | REST API，需要在其后台验证域名 |
| SMTP | 通用代发 | 用 Workers `connect()` 走 587 STARTTLS / 465 TLS，手写 SMTP 会话；可用 Gmail 等外部邮箱（应用专用密码） |

新增 SES / Mailgun / Postmark 只需要在 [src/mail/providers/](src/mail/providers/) 加一个类，并在 [factory.ts](src/mail/factory.ts) 加一个分支。

> **发件人与已验证域名**：用 Resend/Sendflare 发信时，发件域名必须先在其后台验证。在渠道配置里点「拉取域名」，MailEdge 会调用服务商接口同步你已验证的域名；写信时「发件人」下拉据此约束，发出前就拦住未验证的地址，而不是被拒后才知道。
>
> **SMTP 用 Gmail 代发**：主机 `smtp.gmail.com`、端口 587、加密 STARTTLS、用户名填完整邮箱、密码填「应用专用密码」（需先开两步验证，不能用登录密码）。设置页有 Gmail 一键预设。
>
> Workers **禁止 25 端口**出站，所以 SMTP 只能走 587/465——发信本来也不需要 25。IMAP 代收同理不适合 Worker，收信请用 Email Routing 转发。

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
附件 > 3 MB                    → 上传 R2 / KV → 正文插入下载链接
```

下载走 `/d/:token`，由 Worker 校验 token、有效期与撤销状态后从对象存储出流，支持统计下载次数、7 天过期、随时撤销。内嵌图片（`cid:`）始终留在邮件里，避免正文裂图。阈值由 `SMART_ATTACHMENT_THRESHOLD` 控制。

后台「设置 → 存储」可以在 R2 与 KV 之间切换。读取和删除会兼容两个后端，切换不会删除历史附件；KV 单个值限制为 25MB。

### R2 目录结构

```
inbound/{信箱ID}/{年-月}/{邮件ID}/{序号}-{文件名}
inbound/{信箱ID}/{年-月}/{邮件ID}/raw.eml
outbound/{信箱ID}/{年-月}/{内部ID}/payload.json
outbound/{信箱ID}/{年-月}/{内部ID}/attachments/{序号}-{文件名}
shares/{信箱ID}/{年-月}/{token}/{文件名}
```

按信箱与年月分区不只是为了整齐：

- **生命周期规则按前缀配置**，可以直接交给 R2 自动清理旧对象，不必在应用层写清理逻辑
- **`list()` 按前缀扫描**，扁平结构下列举某个月的对象要扫全量
- 按信箱前缀可直接统计各信箱占用的存储

完整键落在库里（DO 的 `r2_key`、`attachment_links.r2_key`、`outbound_messages.payload_key`），因此调整键结构只影响新对象，存量对象照常可读，不需要迁移。键构造集中在 [src/lib/r2key.ts](src/lib/r2key.ts)。

文件名保留中文——R2 键支持 UTF-8，且键从不直接进 URL（下载走 token），只剔除控制字符和影响键层级的字符。

配置 R2 自动清理 90 天前的收件归档：

```bash
npx wrangler r2 bucket lifecycle add mailedge-attachments --prefix inbound/ --expire-days 90
```

## 部署

### 一键部署

先做一次 OAuth 授权（凭据由 wrangler 自己保管，不需要你复制粘贴任何 API Key）：

```bash
npx wrangler login
```

然后：

```bash
npm run setup
```

脚本会列出计划、等你确认，再依次完成：建 D1 → 创建或复用 KV → 尝试创建 R2（未开通付费时自动使用 KV）→ 回填绑定 → 建表 → 部署 → 生成并写入两个机密 → 把 `APP_URL` 回填成实际地址。

全程幂等，中途失败修好后重跑即可，已完成的步骤自动跳过。**已存在的 `ENCRYPTION_KEY` 绝不会被覆盖**——它是渠道密钥的主密钥，换掉等于作废所有已保存的发信配置。

> 首次运行时 Worker 尚未部署，机密可能写不进去，脚本会提示你再跑一次 `npm run setup` 补上。

跑完后还剩两步必须在面板操作，见下面的「配置收件」和「初始化」。

### 手动部署

不想用脚本的话，等价的手工步骤：

```bash
npx wrangler d1 create mailedge
```

```bash
npx wrangler r2 bucket create mailedge-attachments
```

如果账户未开通 R2，改为创建 KV namespace，并把返回的 ID 填入 `wrangler.jsonc` 的 `kv_namespaces[0].id`：

```bash
npx wrangler kv namespace create mailedge-attachments
```

把 `d1 create` 输出的 `database_id` 填进 [wrangler.jsonc](wrangler.jsonc)，同时把 `APP_URL` 改成你的正式域名（下载链接会用它拼绝对地址）。

```bash
openssl rand -base64 32
```

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put SESSION_SECRET
```

```bash
npx wrangler d1 migrations apply mailedge --remote
```

```bash
npm run deploy
```

### 配置收件

**必须先完成部署**，Worker 才会出现在 Email Routing 的下拉列表里。

Cloudflare 面板 → **Compute** → **Email Service** → **Email Routing** → 选择域名（首次进入需先启用，它会自动写入 MX 与 SPF 记录）。

然后 **Routing Rules** → **Create routing rule**：

| 字段 | 填写 |
| --- | --- |
| Email pattern | 地址的本地部分，如 `support` |
| Action | **Send to a Worker** |
| Worker | `mailedge` |

想接收整个域名的邮件，改用 **Catch-all address**，action 同样设为 Send to a Worker。

> 投递给 Worker 只在新版 Email Routing 界面提供。若面板提示需要切换到新界面，按提示切换即可。

### 初始化

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

### 测试与代码检查

```bash
npm run verify
```

一条命令跑完 lint、三套 typecheck（Worker / 前端 / 测试）和全部测试。也可以分开跑：

| 命令 | 作用 |
| --- | --- |
| `npm test` | Vitest，跑在真实 workerd 里（`@cloudflare/vitest-pool-workers`） |
| `npm run test:watch` | 监听模式 |
| `npm run typecheck` | Worker、前端、测试三套 tsconfig |
| `npm run lint` | Biome，检查格式 + lint + import 顺序 |
| `npm run lint:fix` | 自动修可修的部分 |

测试不是在 Node 里模拟 Workers，而是真的跑在 workerd 中：`crypto.subtle`、D1、Durable Object、`cloudflare:sockets` 的行为与线上一致。`test/dispatcher.test.ts` 用真实 D1 建表（直接读 `migrations/`），验证发信状态机不会把一封被拒的邮件在多个渠道重发。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET/POST` | `/api/auth/setup` | 首次初始化（已有用户后自动关闭） |
| `POST` | `/api/auth/login` `/logout` `/password` | 会话 |
| `GET` | `/api/auth/me` | 当前用户与信箱 |
| `GET/POST/DELETE` | `/api/mailboxes` | 收件地址管理 |
| `PATCH` | `/api/mailboxes/:id` | 更新左侧显示名称（不改变路由地址） |
| `GET/POST/PATCH/DELETE` | `/api/folders` `/api/folders/:id` | 自定义文件夹管理 |
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
- HTML 正文在前端用沙箱 iframe 渲染，脚本、表单和顶层导航全部禁用；前端仅读取文档高度，避免长正文被固定视口裁断。
- 邮件按地址分片存储在各自的 Durable Object 中，跨信箱的全局搜索需要另做索引。
