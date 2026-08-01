# MailEdge 常见问题（FAQ）

> 从"我想一键部署"到"我收到了信"，把每一步可能冒出来的疑问逐条拆开讲。
> 配合 [blog.md](blog.md) 的部署教程一起看。

---

## 一、部署与认证

### Q1. 一键部署需要什么？为什么不能用 Global API Key？

部署只需三样东西：

1. 一个 **Cloudflare 账户**（收信要域名托管在 Cloudflare）
2. 一个 **Cloudflare API Token**（部署用的临时钥匙，用完即删）
3. 运行安装向导的机器（可以是本地电脑，也可以是你的 VPS）

**为什么不用 Global API Key？**

Global API Key 是你账户的"万能钥匙"，权限等于你的账号密码：

- 一旦泄露，对方能操作你账户里的**一切**（改 DNS、删资源、看账单……）
- 它如果出现在聊天记录、日志、截图里，就等于公开了
- 一旦泄露必须立刻去 Cloudflare 后台 **Roll（轮换）** 让它作废

而 API Token 可以**限定权限**（只允许动 Worker/D1/R2/邮件路由）、**限定范围**（只允许访问某个账户/域名），用完删除立即失效。安全得多。

### Q2. 部署需要哪些 Token 权限？

安装向导页面有中英对照表，需要的权限如下：

| 权限（英文名） | 级别 | 选 | 用途 |
|---|---|---|---|
| `D1` | 账户 Account | `Edit` | 创建数据库、执行建表 |
| `Workers Scripts` | 账户 Account | `Edit` | 上传/更新 Worker 代码 |
| `Workers R2 Storage` | 账户 Account | `Edit` | 创建附件存储桶 |
| `Email Routing Addresses` | 账户 Account | `Edit` | 管理收信地址 |
| `Email Routing Rules` | 区域 Zone | `Edit` | 创建邮件路由规则 |
| `Zone` | 区域 Zone | `Read` | 列出你的域名 |

**在哪找**：创建 Token → Add more permissions → 注意顶部 `Account / Zone / User` 三个标签。D1、Email Routing Addresses 在 **Account** 标签下；Email Routing Rules、Zone 在 **Zone** 标签下。

**提示**：搜索时直接搜英文名，比如 D1 权限就叫 `D1`（不是 "Workers D1"）。

### Q3. 为什么用 "Edit Cloudflare Workers" 模板还要补权限？

模板只带了 Workers 相关的权限（脚本、R2、KV 等），但**没有**这三样：

- **D1**（建数据库）
- **Email Routing Addresses / Rules**（自动配收信）
- **Zone Read**（列出域名）

所以推荐路径是：**选模板 → Add more permissions 补上 D1、Email Routing Addresses、Email Routing Rules、Zone 这 4 项**。这样比从零手动勾选更省事。

### Q4. 部署是在我的电脑 / 服务器上运行吗？会占用资源吗？

部署是"本地发指令，Cloudflare 干活"：

- 你的电脑或 VPS 只负责**跑命令**（验证 Token、把代码传上去）
- 部署完成后，MailEdge 完全运行在 **Cloudflare 的边缘网络**上——数据库、存储、收信、网页都在 Cloudflare
- 关掉你的电脑，MailEdge 照常运行
- 你的机器长期负载几乎为零，只在你点"部署"时短暂占用

### Q5. 为什么安装向导让我"用完删除 Token"？

因为部署是一次性的：

1. 你在安装向导贴 Token → 服务器用它调用 Cloudflare API 建资源、传代码
2. 部署完成 → Token 使命结束
3. 你回 Cloudflare 后台**删除它** → 立即失效，即使泄露也没用了

Token 是"一次性钥匙"：用完就作废，是这类自助部署的标准安全做法。安装向导本身**不会保存**你的 Token（只存在内存里，用于那一次请求）。

### Q6. 部署一次要多久？失败了一半怎么办？

- 首次部署：1~3 分钟（服务器要在隔离的工作副本里装 MailEdge 依赖）
- 之后部署：更快（依赖已装好）

安装向导是**幂等**的——任何一步失败，修好后重跑，已经完成的步骤会自动跳过，不会重复创建资源。比如"数据库建好了，但后面部署失败"，重跑时会直接复用已建的数据库。

---

## 二、域名与收信

### Q7. 收信必须把域名托管到 Cloudflare 吗？

**必须**。收信依赖 Cloudflare 的 **Email Routing**，它要求域名托管在 Cloudflare（即域名的 NS 记录指向 Cloudflare）。

操作：在 Cloudflare 后台 → **Compute → Email Service → Email Routing** → 选择你的域名 → Enable（自动写入 MX 与 SPF 记录）。

> 还没托管？在域名注册商那里把 NS 改成 Cloudflare 给的两个地址，等生效即可。

### Q8. "兜底信箱（catch-all）"是什么意思？

兜底信箱 = 这个域名下**所有没单独登记的地址**，来信都会落进来。

假设你的域名是 `example.com`，登记了 `support@example.com` 并设为兜底：

| 来信地址 | 没兜底时 | 有兜底时 |
|---|---|---|
| `support@example.com` | 正常收 | 正常收 |
| `hello@example.com`（没登记） | **退信** | 收下，归入"其他地址" |

作用：**防止漏信**。初始化时 MailEdge 会把你填的第一个地址自动设为兜底，这样域名下任何来信都不丢。

### Q9. "需在 Cloudflare Email Routing 中指向本 Worker"是什么意思？

这是两个层面的配合：

- **MailEdge 软件内部**：兜底信箱决定"信到手里后归谁"
- **Cloudflare 外部**：Email Routing 决定"信来了转给谁"

信要进来，必须让 Cloudflare 把域名收到的信**投递给 `mailedge` 这个 Worker**：

```
有人来信 → Cloudflare 收下 → Email Routing 规则（Catch-all 或精确地址）→ 转给 mailedge Worker → MailEdge 判断归属 → 兜底规则兜住
```

如果你用安装向导部署并选了"收整个域名的信"，向导已经自动帮你配好了 Catch-all 规则指向 Worker，不需要手动操作。如果选的是精确地址，也要在 Email Routing 里建对应规则指向 Worker。

### Q10. 收不到信，怎么排查？

按顺序查：

1. **DNS 生效了吗**：MX/SPF 记录写入后可能要等几分钟。可用 `nslookup -type=MX 你的域名` 检查。
2. **Email Routing 启用了吗**：Cloudflare → Email Routing → 应显示 Enabled。
3. **路由规则指向 Worker 了吗**：Routing rules 里应有规则，Action 是 `Send to a Worker`，Worker 是 `mailedge`。
4. **地址一致吗**：初始化页填的地址必须和路由规则一致。不一致会退信 `550 未知收件人`。
5. **测试**：用外部邮箱发一封，观察是否秒级出现在收件箱（MailEdge 有实时推送）。

### Q11. 为什么退信"550 未知收件人"？

因为 Cloudflare 把信转给了 Worker，但 Worker 在 MailEdge 里**找不到对应的信箱**。

原因通常是：

- 初始化时填的地址 ≠ 路由规则里的地址
- 或你给 `xxx@域名` 发信，但这个地址没登记、也没设兜底

解决：要么登记该地址，要么把某个地址设为兜底信箱，要么在 Email Routing 里用 Catch-all。

---

## 三、发信

### Q12. 发往外部邮箱为什么需要 Workers Paid？

Cloudflare 的 **Email Service**（Workers 内置发信绑定）发往**外部邮箱**（Gmail、QQ、Outlook 等）需要 Workers **Paid** 计划（$5/月），免费计划只能发到同域。

- **收信**：免费和付费计划都可用
- **发信到外部**：需要 Paid（每月含 3,000 封，超出每 1,000 封 $0.35）

想先免费体验发信？两个办法：

- 用 **SMTP 代发**（见 Q13），Workers 免费计划也能用
- 只在同域信箱之间互发

### Q13. SMTP 代发是什么？用 Gmail 怎么配？

SMTP 代发 = 借用别人的发信服务器帮你发邮件，不占用 Cloudflare 的发信额度。

用 **Gmail 代发**（免费可用）：

| 配置 | 值 |
|---|---|
| 主机 | `smtp.gmail.com` |
| 端口 | `587` |
| 加密 | `STARTTLS` |
| 用户名 | 你的完整 Gmail 地址 |
| 密码 | **应用专用密码**（不是登录密码） |

> 应用专用密码：先给 Gmail 开两步验证，然后到 Google 账户 → 安全 → 应用专用密码，生成一个 16 位密码填进去。

> 注意：Cloudflare Workers **禁止用 25 端口**，所以只能走 587（STARTTLS）或 465（TLS），发信本来也不需要用 25。

### Q14. "多渠道发信自动切换"是什么意思？

MailEdge 支持四家发信渠道：**Cloudflare Email Service / Resend / Sendflare / SMTP**。

它们不是"随便选一个"，而是可以配置**主渠道 + 备用渠道**：

- 主渠道成功 → 完事
- 主渠道**临时故障**（网络问题、429 限流、5xx 服务器错误）→ 自动切换到备用渠道重发
- **永久失败**（域名未验证、地址非法、内容被拒）→ 立即失败，**绝不换渠道重发**——否则一封被拒的邮件会在三个平台各发一次

### Q15. 我的发件域名需要在服务商那边验证吗？

用 Resend/Sendflare 发信时，**发件域名要先在其后台验证**（它们会给你加一条 DNS 记录，你到 Cloudflare 添加后等它验证）。

MailEdge 设置页可以点"拉取域名"，自动同步你已验证的域名，写信时发件人下拉据此约束——**发出去之前就拦住未验证的地址**，而不是被拒了才知道。

---

## 四、安装向导（deployer / mailedge.sh）

### Q16. 安装向导是什么？跑在哪？

安装向导是一个**网页**（比如部署在 `mailedge.sh`），让用户：

```
打开页面 → 创建一次性 Token → 粘贴 → 选账户/域名/地址 → 一键部署 → 拿到管理面板地址
```

它跑在**你自己的服务器**（VPS）上，本身只是一个 Node 服务。它的工作是"指挥 Cloudflare 干活"，不承载 MailEdge 本身。

### Q17. VPS 需要什么配置？

安装向导只在你点部署的瞬间干活（验证 Token、传代码），平时负载很低。

| 项 | 最低 | 推荐 |
|---|---|---|
| CPU | 1 核 | 2 核 |
| 内存 | 1 GB | **2 GB**（部署时跑依赖安装/前端构建，2GB 稳妥） |
| 磁盘 | 10 GB | 20 GB |
| 系统 | Debian/Ubuntu | 任选 |

软件：Node.js 22+、git、一个反代（Caddy/Nginx，配 HTTPS）。

### Q18. 安装向导的"一键验证（权限体检）"是干什么的？

输入 Token 点"验证"，向导会**只读探测**（不改任何东西）5 项核心权限：

- D1 数据库能否访问
- R2 存储能否访问
- Workers 脚本能否访问
- 域名（Zone）能否读取
- Email Routing 能否读取

每项显示 ✓/✗。**有 ✗ 就去补权限再回来验证**，避免部署到一半才发现权限不够。验证通过才进入下一步选域名。

### Q19. 安装向导安全吗？它保存我的 Token 吗？

不保存。Token 只在你的浏览器发起请求时经向导内存转一圈，用于那一次部署，不落数据库、不进日志。部署完成页面会**大字提醒你删除 Token**——删掉后这个 Token 就彻底没用了。

### Q20. 部署后想用自己的域名访问（不用 workers.dev）怎么办？

部署完成后拿到的是 `xxx.workers.dev` 地址。想用自己的域名：

Cloudflare 后台 → **Workers 与 Pages** → 你的 `mailedge` → 设置 → 域名 → **添加自定义域** → 填 `mail.你的域名.com` → 按提示添加 DNS 记录即可。

---

## 五、概念澄清

### Q21. 宣传首页和安装向导是动态的吗？

| 页面 | 性质 |
|---|---|
| 宣传首页（`mailedge.sh/`） | **纯静态** HTML，秒开 |
| 安装向导（`mailedge.sh/install`） | **动态**——根据你贴的 Token 实时验证、显示部署日志 |

### Q22. 我的邮件数据存在哪？属于谁？

全部存在**你自己的 Cloudflare 账户**里：

- 邮件正文 → 你账户的 **D1 / Durable Object**（SQLite）
- 附件 → 你账户的 **R2** 存储
- 配置 → 你账户的 D1

MailEdge 部署在你的账户下，数据完全属于你，安装向导（包括它的运营者）**碰不到**你的邮件数据。

### Q23. 免费额度够用吗？

| 能力 | 免费计划 | Workers Paid（$5/月） |
|---|---|---|
| 收信（Email Routing → Worker） | ✅ | ✅ |
| 发信到**同域** | ✅ | ✅ |
| 发信到**外部邮箱** | ❌ | ✅（3,000 封/月） |
| D1 / R2 基础用量 | 有免费额度 | 额度更高 |

> 发信渠道用 **SMTP 代发**（Q13）的话，免费计划也能发外部邮箱——所以"免费额度"实际够大多数人用。

### Q24. Global API Key 已经泄露过一次，怎么办？

立刻处理：

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 找到 **Global API Key** → **Roll（轮换）**
3. 旧 Key 立即作废
4. 以后一律用**受限 API Token**（部署时用，用完删除）

---
