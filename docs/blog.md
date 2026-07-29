# 用 Cloudflare Workers 做一个能发信的 Webmail：MailEdge

Cloudflare Email Routing 是个好东西——免费、不限量、五分钟配好，把 `you@yourdomain.com` 的信转发到你的 Gmail。但用过的人都知道它有个硬伤：**只能收，不能回**。

你收到一封客户询价，想回一句"报价单见附件"，做不到。Email Routing 没有发信能力，也没有界面。你只能用转发到的那个 Gmail 去回，于是对方看到的发件人是 `yourname@gmail.com`，域名邮箱形同虚设。

社区里有不少 Cloudflare 邮箱项目，大多止步于"把收到的信显示出来"——本质上是给 Email Routing 加了个只读的收件箱。

2026 年这个情况变了：Cloudflare Email Service 现在原生支持对外发信，Workers Binding、REST API、SMTP 三种方式都有。发信这块最后一块拼图补上了。

于是有了 **MailEdge**：一个完整跑在 Cloudflare 上的 Webmail，收发都有，而且发信不绑死在任何一家服务商上。

> 仓库：https://github.com/gentpan/MailEdge

---

## 它长什么样

### 收件箱

![收件箱](./images/02-inbox.png)

三栏布局。左边文件夹和未读数，中间列表，右边正文。HTML 正文在 `sandbox=""` 的 iframe 里渲染，脚本、表单、同源访问全部禁用——邮件正文是最典型的不可信内容，不该有任何执行权限。

### 写信

![写信](./images/04-compose.png)

注意 `产品资料.zip` 后面那个「转下载链接」标记。这是后面要重点讲的智能附件：4 MB 的文件不会真的塞进邮件，而是自动传到 R2，正文里变成一条下载链接。你什么都不用勾选。

### 发信渠道配置

![发信服务](./images/05-settings-providers.png)

三个渠道在后台直接配，填完点「测试发送」验证通不通，再「设为默认」。密钥存进 D1 之前做 AES-GCM 加密，接口返回的永远是 `re_t••••3456` 这种脱敏值。

### 发信记录

![发信记录](./images/06-outbox.png)

每封信的完整投递链路：走了哪个渠道、失败原因是什么、重试了几次。失败的那条可以手动重试，而且**沿用同一个内部 ID**——这点后面会讲为什么重要。

---

## 架构

```
收件：Email Routing → Email Worker → Durable Object (SQLite) + R2
发件：统一 MailProvider 接口 → Cloudflare Email Service / Sendflare / Resend
配置：D1（账户、渠道配置、发信状态机）
```

| 能力 | 用什么 | 为什么 |
| --- | --- | --- |
| 收件 | Email Routing → `email()` handler | Cloudflare 原生，免费计划也能用 |
| 邮件正文 | Durable Object 自带的 SQLite | 一个地址一个实例，天然分片，不存在单库瓶颈 |
| 附件 | R2 | 出口流量免费，这是关键 |
| 账户/配置/发信状态机 | D1 | 需要跨信箱查询的数据放这 |
| 前端 | Workers Assets | 和 Worker 同一次部署，不用单独建静态站 |
| 定时重试 | Cron Triggers | 每 5 分钟扫一遍待重试的邮件 |

**没有任何一处需要自己的服务器。** 一条 `npm run deploy` 全部推上去。

---

## 三个真正花了心思的地方

### 一、发信抽象：不要把自己焊死在一家服务商上

最容易的做法是直接调 Resend 的 API 完事。但发信服务商是会出问题的——涨价、限流、被墙、账号被封，任何一个都够你难受一阵。

所以发信这层做成了接口：

```ts
export interface MailProvider {
  readonly type: MailProviderType;
  send(input: SendMailInput): Promise<SendMailResult>;
}
```

Cloudflare Email Service、Sendflare、Resend 各是一个实现。上层只认 `SendMailInput`，不关心底下是 Workers Binding 还是 HTTP 请求。

想加 Amazon SES？写一个类，在工厂函数里加一个分支，完事。上层一行不用改。

有个细节值得一提：Cloudflare 的 Workers Binding 收的是**原始 MIME**，不是结构化的 JSON。所以项目里自己写了个 MIME 构建器，处理 multipart 嵌套、RFC 2047 头部编码、base64 折行、`cid:` 内嵌图片。这部分不难但很琐碎，写完之后抄送、密送、自定义头、附件才算真正跑通。

### 二、错误分类：为什么不能"失败就换个渠道重发"

这是整个项目里我最在意的一个设计。

直觉上，主渠道挂了就切备用，很合理。但**如果你不加区分地切**，会发生这样的事：

> 你给 `zhang@supplier.com` 发一封信。Cloudflare 返回「域名未验证」——失败。系统自动切到 Sendflare，同样的域名，同样失败。再切到 Resend，还是失败。
>
> 这封信在你这边显示"发送失败"，但如果其中某一家的校验宽松一点放行了呢？客户就会收到重复的邮件。更糟的情况是三家都放行了——客户收到三封一模一样的信。

所以错误必须分成两类：

**临时性（transient）→ 可以切换**
- 网络故障、连接断开
- 429 限流
- 5xx 服务端错误
- 408 超时

**永久性（permanent）→ 立即失败，绝不切换**
- 域名未验证
- 收件地址格式错误
- 内容被拒 / spam complaint
- 账户被暂停
- 发件人无权限

代码里长这样（[src/mail/errors.ts](../src/mail/errors.ts)）：

```ts
export function classifyHttpFailure(status: number, message: string): FailureKind {
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "transient";
  if (status >= 400) {
    // 4xx 默认永久失败，除非报文明确表示是临时问题
    return TRANSIENT_PATTERNS.some((p) => p.test(message)) ? "transient" : "permanent";
  }
  return "transient";
}
```

实测效果——故意把 Sendflare 的地址指向一个连不上的端口，Resend 用一个无效的 Key：

```json
{
  "status": "failed",
  "attempts": [
    { "providerType": "sendflare", "error": "Network connection lost.", "failureKind": "transient" },
    { "providerType": "resend",    "error": "API key is invalid",       "failureKind": "permanent" }
  ]
}
```

Sendflare 网络故障 → 判定临时 → 切换到 Resend。Resend 返回 401 → 判定永久 → **停止，不再往下切**。这就是想要的行为。

还有一层保险：每封邮件生成一个固定的内部 ID，以 `X-App-Message-ID` 头带出去。

```
X-App-Message-ID: mail_01KYQEY0KC2RT77X2RVM2BDWKF
```

切换渠道、定时重试、手动重试，全都沿用同一个 ID。收件方的邮件客户端和你自己的日志都能靠它去重。

状态机是这样流转的：

```
queued → sending → sent
                 ├── deferred → 定时任务重试（5min 起指数退避，上限 6h，最多 5 次）
                 └── failed
```

`deferred` 是所有渠道都返回临时错误时的状态——不是失败，是"待会儿再试"。发送载荷（含附件）落在 R2 里，重试时不需要前端再传一次。

### 三、智能附件：绕开 5 MiB 的墙

Cloudflare Email Service 单封邮件（正文 + 附件）上限 5 MiB。发个 PDF 合同、Excel 报价单没问题，发一组高清图或者一个设计稿压缩包，直接超了。

这其实是所有邮件系统的通病——Gmail 是 25 MB，也一样会被大文件卡住。Gmail 的解法是：超过限制就自动转 Google Drive 链接。

MailEdge 抄了这个思路：

```
附件 ≤ 3 MB（且整封不超上限） → 真 Email Attachment
附件 > 3 MB                    → 上传 R2 → 正文插入下载链接
```

用户端零感知：选文件、点发送，界面上只会多一个「转下载链接」的小标记。

实测，一次带 2 KB 和 4 MB 两个附件的发送：

```json
"smartAttachments": {
  "inline": [{ "filename": "small.bin", "size": 2048 }],
  "shared": [{ "filename": "big.bin", "size": 4194304, "url": "https://.../d/zurR89hF..." }]
}
```

小的走真附件，大的变成链接。

下载链接不是 R2 的公开地址，而是走 Worker：

```
用户点击 → Worker 校验 token / 有效期 / 撤销状态 → 从 R2 出流
```

好处是能统计下载次数、设 7 天过期、随时撤销。R2 的出口流量免费，这个方案的边际成本基本是零。

发出去之后是这个效果——`报价单.pdf` 是真附件，`产品资料.zip` 带「下载链接」标记，正文里自动追加了下载地址：

![带智能附件的邮件](./images/03-message-detail.png)

一个容易忽略的细节：**内嵌图片（`cid:`）必须留在邮件里**。签名档里的 logo 如果被转成了下载链接，正文就裂图了。所以判断逻辑里对带 `contentId` 的附件单独放行。

---

## 部署：一步一步

![配置流程](./images/08-cf-routing-rule.png)

### 顺序不能颠倒

先说最容易踩的坑：**Worker 必须先部署成功，才会出现在 Email Routing 的下拉列表里。**

很多人的直觉是先去 Cloudflare 面板把邮件路由配好，结果发现 Worker 下拉框是空的，以为哪里出错了。实际上只是顺序反了。

### 1. 建资源

```bash
npx wrangler d1 create mailedge
```

```bash
npx wrangler r2 bucket create mailedge-attachments
```

把 `d1 create` 输出的 `database_id` 填进 `wrangler.jsonc`，同时把 `APP_URL` 改成你的正式域名（附件下载链接要用它拼绝对地址）。

### 2. 写机密

```bash
openssl rand -base64 32
```

跑两次，分别填给这两条：

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put SESSION_SECRET
```

`ENCRYPTION_KEY` 用来加密渠道密钥。换掉它等于作废所有已保存的 API Key，要谨慎。

### 3. 建表 + 部署

```bash
npx wrangler d1 migrations apply mailedge --remote
```

```bash
npm run deploy
```

**走完这一步再往下。**

### 4. 配 Email Routing

Cloudflare 面板 → **Compute** → **Email Service** → **Email Routing** → 选你的域名。

> 注意路径。Cloudflare 把 Email Routing 挪到了 Email Service 下面，不再是域名页里的选项卡了。如果面板提示你需要切换到新版界面——投递给 Worker 这个功能只有新版才有，按提示切换即可。

首次进入要先启用 Email Routing，它会**自动**写入 3 条 MX 和 1 条 SPF 记录，不用手动加。

然后 **Routing Rules** → **Create routing rule**：

| 字段 | 填什么 |
| --- | --- |
| Email pattern | 地址的本地部分，比如 `support` |
| Action | **Send to a Worker** |
| Worker | `mailedge` |

想收整个域名的信，改用 **Catch-all address**，action 同样设成 Send to a Worker。

### 5. 初始化

![初始化](./images/01-login.png)

打开你的 Worker 域名，首次访问会进入初始化页，创建管理员并绑定第一个收件地址。

**这里填的地址必须和第 4 步的路由规则一致。** 对不上的话，Worker 收到信找不到对应信箱，会直接退信 `550 未知收件人`。

### 6. 配发信渠道

进「设置 → 发信服务」，填一个渠道的密钥，点「测试发送」确认通了，再「设为默认」。

发到任意外部邮箱需要 Workers Paid（含每月 3,000 封，超出每 1,000 封 $0.35）。收信在免费计划就能用。

---

## 几个会踩的坑

### MX 记录会打架

Email Routing 启用时会占用根域的 MX。如果 Resend 要求你在根域再加一条 MX（用于退信），两者冲突。

解法：**发信用子域**。在 Resend 里注册 `send.yourdomain.com`，发件地址写 `noreply@send.yourdomain.com`，MX 加在子域上，和收信的根域互不干扰。

### SPF 只能有一条

一个域名的 TXT 记录里不能出现两条 `v=spf1`。多个渠道要合并：

```
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

### 收信和发信是两套 DNS

Email Routing 自动加的 MX/SPF 只管收信。发信还得单独去各家验证域名拿 DKIM。这两件事没有任何关系，别指望配了一个另一个就好了。

### 怎么确认路由通了

配完之后不用等真人给你发信：

```bash
npx wrangler tail
```

然后拿另一个邮箱发一封过来。能看到 Worker 被触发就说明通了。什么日志都没有，说明规则没生效或者 Worker 选错了。

本地开发的话，wrangler 内置了模拟投递的入口：

```bash
curl -X POST 'http://127.0.0.1:8787/cdn-cgi/handler/email?from=alice@outside.com&to=you@yourdomain.com' --data-binary @test.eml -H 'Content-Type: message/rfc822'
```

---

## 已知的取舍

写文章总要诚实一点，说说没做好的地方：

- **Cloudflare 的绑定按信封收件人逐个投递。** 收件人多的时候会调用多次 `send()`，中途失败可能出现部分投递。这是绑定的行为，不是项目的选择。
- **Sendflare 的字段名以其当前 API Reference 为准。** 如果官方调整了，改一个文件就行，不影响上层抽象——这也正是做 Provider 抽象的价值。
- **跨信箱的全局搜索没有。** 邮件按地址分片存在各自的 Durable Object 里，要做全局搜索得另建索引。单个信箱内的搜索是有的。
- **没做富文本编辑器。** 写信目前是纯文本，发出去时转成简单 HTML。接一个编辑器不难，但那是另一个话题了。

---

## 最后

整个项目的技术栈：Cloudflare Workers · D1 · R2 · Durable Objects · Email Routing · Hono · React · Vite · TypeScript。

代码在 GitHub 上，欢迎提 issue 和 PR：

**https://github.com/gentpan/MailEdge**

如果你也被 Email Routing "只能收不能回"卡过，希望这个能帮上忙。
