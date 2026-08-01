# MailEdge 网页安装向导（deployer）

让你**或你的用户**在网页上点几下，就在自己的 Cloudflare 账户里自动部署出一套 MailEdge 邮箱系统。

```
用户 → 打开安装页面 → 创建一次性 API Token → 粘贴 → 选域名/地址 → 一键部署 → 拿到管理面板地址
```

## 原理

- 部署核心复用 MailEdge 自带的 `npm run setup`（wrangler 驱动，处理了 D1/R2/机密/建表/部署的全部细节）
- 用户在网页提供**一次性 Cloudflare API Token**，服务端把它作为 `CLOUDFLARE_API_TOKEN` 环境变量注入部署进程
- 部署在**隔离的工作副本**（`deployer/workspace/mailedge/`）中进行，不污染主项目配置
- 部署完成后，服务端再调用 Cloudflare API 配置 **Email Routing**（把来信转发到刚部署的 Worker）
- Token 只在内存中使用，**不落库**；页面完成后大字提醒用户删除

## 本地运行

```bash
cd deployer
npm install
npm run dev          # 启动 http://127.0.0.1:8788
```

打开 http://127.0.0.1:8788 即进入安装向导。

> 首次部署会在 `deployer/workspace/mailedge/` 复制 MailEdge 源码并安装依赖（需要几分钟，仅一次）。
> 工作副本默认指向 `deployer/` 上一级的 MailEdge 项目；如需指向别的副本，改 `src/config.ts` 里的 `MAILEDGE_ROOT`。

## 部署到你的服务器

`deployer` 是一个普通 Node 服务，把整个 `deployer/` 目录（含 MailEdge 项目副本）放到服务器上：

```bash
npm install --production
npm run start
```

- 用反向代理（Nginx/Caddy）把域名指到端口，配好 HTTPS
- 建议加一层请求频率限制（防止陌生人刷部署）
- 生产环境设置 `PORT` 环境变量

## 用户侧需要创建的 Token 权限

页面会引导用户去 Cloudflare 后台创建 Token，需要勾选：

| 作用域 | 权限 | 级别 |
|---|---|---|
| 账户 | Workers Scripts | Edit |
| 账户 | Workers R2 Storage | Edit |
| 账户 | Workers D1 | Edit |
| 账户 | Workers KV Storage | Edit |
| 账户 | Email Routing Addresses | Edit |
| 区域 | Email Routing Rules | Edit |
| 区域 | Zone | Read |

部署完成后提醒用户**立即删除该 Token**。

## 目录结构

```
deployer/
├── src/
│   ├── index.ts          # Hono 服务入口（验证 token / 查域名 / 发起部署 / 查进度）
│   ├── config.ts         # 指向 MailEdge 主项目的路径
│   ├── workspace.ts      # 隔离工作副本的初始化与依赖安装
│   ├── deploy.ts         # 后台执行 setup，实时收集日志，提取部署地址
│   ├── types.ts
│   ├── cf/
│   │   ├── client.ts     # Cloudflare REST API 客户端
│   │   └── email.ts      # Email Routing 启用 + 路由规则
│   └── bundle/
│       └── worker.ts     # esbuild 打包 MailEdge Worker（供未来直接 API 上传）
├── web/
│   └── index.html        # 安装向导页面（单文件，无构建步骤）
└── workspace/            # 隔离的 MailEdge 工作副本（自动生成）
```

## 已实现 / 待完善

已实现：
- Token 校验、账户/域名列表
- 一键部署（后台跑 setup）+ 实时日志轮询
- 部署后自动配置 Email Routing（精确地址 / catch-all）
- 结果页展示管理地址 + 删除 Token 提醒

待完善（后续迭代）：
- 部署进度用 SSE 推送替代轮询
- Token 预填链接（运行时查权限组 ID 生成）
- 用户系统 / 多租户隔离 / 用量统计（商业化阶段）
- 部署任务的持久化与并发控制
