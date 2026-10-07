# MailEdge for macOS

MailEdge 的原生 macOS 客户端。使用 SwiftUI 构建，直接连接现有 Cloudflare Worker API，不引入新的中转服务，也不需要修改 Web 端。

## 当前能力

- 连接自托管 MailEdge，自动识别“首次初始化 / 登录 / 已登录”状态
- 聚合所有信箱或切换单个信箱
- 收件箱、已发送、归档、垃圾邮件、废纸篓与自定义文件夹
- 搜索、分页、星标、已读、全部已读、移动、归档与删除
- 安全查看 HTML / 纯文本邮件；JavaScript、表单和远程资源默认被阻止
- 新建与回复邮件，支持 Markdown、抄送、密送和多附件
- 附件先走服务端 staging 接口，再使用 token 发信，复用现有智能附件策略
- 附件鉴权下载与 macOS 原生保存面板
- 60 秒自动刷新，以及工具栏/`⌘R` 手动刷新
- 原生概览展示邮件统计、附件占用、D1、Durable Objects 与 R2 实时用量
- 原生附件管理：筛选、搜索、下载、插入邮件、删除、复制/撤销分享链接
- 原生联系人管理：搜索、新建、编辑、删除，并与写信联系人选择器共用数据
- 原生服务端设置：发信渠道、AI、Telegram、版本、存储、信箱、账户与开源信息
- 浅色/深色模式；macOS 26+ 使用系统 Liquid Glass，macOS 15–25 回退到系统材质

## 运行

要求：macOS 15+、完整 Xcode 26+。只有 Command Line Tools 不包含 SwiftUI 编译器宏，无法单独编译 UI。

直接运行开发版：

```bash
cd app
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun swift run MailEdge
```

如果 `xcode-select` 已指向完整 Xcode，可直接：

```bash
cd app
swift run MailEdge
```

也可以在 Xcode 中打开 `app/Package.swift`，选择 `MailEdge` Scheme 后运行。

## 与已经部署的 Worker 一起使用

macOS App 不需要再部署一套后端。它和网页版连接同一个 Worker，因此共用 D1、Durable Objects、R2/KV、账户、信箱、邮件和发信渠道。

最短使用流程：

1. 在浏览器打开你已经能使用的 MailEdge 网页，复制地址栏中的根地址，例如 `https://your-worker.workers.dev` 或自定义域名。
2. 启动 macOS App，把该地址填入“服务器地址”。客户端会先验证 `/api/health`。
3. 使用网页版相同的管理员邮箱和密码登录。Safari 与原生 App 的 Cookie 相互隔离，因此第一次仍需登录一次，但不会创建第二个账户。
4. 管理员可直接在原生 App 的设置中配置发信渠道、AI、Telegram 和存储；网页版继续与它共用同一组配置和数据。

如果这个构建只供你自己的实例使用，可以在打包时预置地址：

```bash
cd app
MAILEDGE_SERVER_URL=https://your-worker.workers.dev ./Scripts/build-app.sh
open .build/MailEdge.app
```

预置地址只减少首次输入步骤，用户仍可在设置中更换服务器。生产地址必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `::1` 允许 HTTP。

基础的密码登录和邮件收发不依赖 Associated Domains provisioning profile。该 profile 在后续加入原生 Passkey、Universal Links，或使用相关 entitlement 正式签名时才需要。

## 测试

```bash
cd app
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun swift test
```

## 打包 `.app`

```bash
cd app
./Scripts/build-app.sh
open .build/MailEdge.app
```

脚本会自动寻找 `/Applications/Xcode.app` 或 `/Applications/Xcode-beta.app`，使用 `Resources/AppIcon.icns` 作为 Finder 与 Dock 图标，创建 `.build/MailEdge.app` 并做 ad-hoc 签名。发布给其他用户前仍需配置正式 Developer ID、Hardened Runtime 与 Apple Notarization。

## Developer ID 分发与 Apple 公证

钥匙串中已经安装 `Developer ID Application` 证书时，可以生成 Hardened Runtime 正式签名的 DMG 与 ZIP：

```bash
cd app
./Scripts/distribute-app.sh
```

分发脚本默认同时构建 Apple Silicon 与 Intel，合并为 Universal 2 应用；产物位于 `.build/distribution/`。如只需当前 Apple Silicon 架构，可设置 `MAILEDGE_UNIVERSAL=0`。

配置一次 `notarytool` Keychain profile 后，可直接提交公证并装订 ticket：

```bash
cd app
MAILEDGE_NOTARY_PROFILE=GiantAccel ./Scripts/distribute-app.sh --notarize
```

脚本不会保存 Apple ID 密码。建议让 `notarytool store-credentials` 把 App Store Connect API Key 或 App 专用密码放入系统钥匙串。

也可以直接使用 App Store Connect Team API Key（名称 “GiantAccel Notarization”，Key ID `89QP5JW5JJ`，团队所有 App 共用，私钥在 `~/.appstoreconnect/private_keys/`）；这种方式只需额外提供 Issuer ID：

```bash
MAILEDGE_ASC_ISSUER=<Issuer-ID-UUID> \
./Scripts/distribute-app.sh --notarize
```

## 连接方式

首次启动填写已经部署好的 MailEdge 根地址，例如：

```text
https://mail.example.com
```

客户端先请求 `/api/health` 校验实例，再检查 `/api/auth/setup`。登录成功后，`URLSession` 会按服务端 `Set-Cookie` 管理 `mailedge_session` HttpOnly Cookie。生产实例应该只使用 HTTPS；本地调试支持 `http://127.0.0.1:8787`。

完整的模块说明、API 映射和后续计划见 [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md)。
