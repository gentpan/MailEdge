# 自建 SMTP 发信服务器指南

不想依赖 Gmail 代发或第三方发信服务的额度时，可以用一台自己的 VPS 跑 Postfix 中继，MailEdge 通过 587/465 认证后发信。收信不受影响——仍然走 Cloudflare Email Routing。

```
写信 → MailEdge（Cloudflare Worker）
         │ 587 STARTTLS + SASL 认证（Workers 禁止 25 端口出站）
         ▼
      你的 VPS（Postfix + OpenDKIM）
         │ 25 端口投递到收件方 MX，出站前自动 DKIM 签名
         ▼
      Gmail / Outlook / …
```

## 前置条件

- 一台有公网 IP 的 VPS（Debian 12+/13 或 Ubuntu 22.04+，root 权限）
- 机房**不封锁 25 端口出站**（OVH、Hetzner 默认开放；部分商家需工单开通）
- 能在机房面板设置 **PTR 反向解析**（Gmail 等严格收件方强制要求）
- 域名 DNS 可编辑（A / TXT 记录）

## 快速开始

把脚本拷到服务器上以 root 运行：

```bash
scp scripts/setup-mail-relay.sh root@<服务器IP>:/root/
ssh root@<服务器IP>
RELAY_DOMAIN=example.com bash /root/setup-mail-relay.sh
```

脚本幂等，可以重复运行。可用环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `RELAY_DOMAIN` | （必填） | 发信域名，如 `example.com` |
| `RELAY_HOSTNAME` | `mail.$RELAY_DOMAIN` | 服务器主机名 / HELO 名 |
| `RELAY_USER` | `mailedge` | SASL 用户名 |
| `RELAY_PASSWORD` | 自动生成 | SASL 密码 |
| `DKIM_SELECTOR` | `mail` | DKIM selector |
| `TLS_MODE` | `snakeoil` | `snakeoil`（临时自签）或 `custom`（需配合 `TLS_CERT_FILE`/`TLS_KEY_FILE`） |

脚本会：设置主机名 → 安装 Postfix/OpenDKIM/sasl2-bin → 写入发件专用配置（未认证一律拒绝中继）→ 创建 SASL 用户 → 生成 2048 位 DKIM 密钥 → 启动服务并做冒烟自检（587 认证、出站 25 连通、PTR 检查）。

结尾会输出**需要添加的 DNS 记录**和 **MailEdge 渠道参数**，凭据同时保存在服务器 `/root/.mailedge-smtp.env`（权限 600）。

## DNS 三件套

脚本运行完，到 DNS 服务商添加：

1. **A 记录**：`mail.example.com` → 服务器 IP。Cloudflare 上必须是「仅 DNS」（灰云），SMTP 不能走代理。
2. **DKIM TXT**：`mail._domainkey.example.com` → 内容见服务器 `/etc/opendkim/keys/example.com/mail.txt`。
3. **SPF**：在现有 SPF 记录中追加 `ip4:<服务器IP>`。与 Cloudflare Email Routing 共存的写法：

   ```
   v=spf1 include:_spf.mx.cloudflare.net ip4:<服务器IP> ~all
   ```

   （`include:_spf.mx.cloudflare.net` 是入站路由需要的，不要删。）

## PTR 反向解析

在机房面板把服务器 IP 的 PTR 设为 `mail.example.com`（与 A 记录互相对应，即 FCrDNS）。验证：

```bash
dig -x <服务器IP> +short   # 应返回 mail.example.com.
```

OVH 面板修改后传播到权威 DNS 可能需要数小时，耐心等。PTR 未生效期间 Gmail 大概率拒收或进垃圾箱。

## TLS 证书

脚本默认用 snakeoil 自签证书——链路可通，但不受信任，仅用于验证。生产环境换正式证书：

**方式一：certbot 独立模式**（需要 80 端口空闲）：

```bash
apt-get install -y certbot
certbot certonly --standalone -d mail.example.com
TLS_MODE=custom \
TLS_CERT_FILE=/etc/letsencrypt/live/mail.example.com/fullchain.pem \
TLS_KEY_FILE=/etc/letsencrypt/live/mail.example.com/privkey.pem \
RELAY_DOMAIN=example.com bash /root/setup-mail-relay.sh
```

**方式二：服务器已跑 Caddy**——给 Caddy 加一个站点 `mail.example.com { respond "ok" 200 }` 让它自动签发，然后 `TLS_MODE=custom` 指向 `/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/mail.example.com/` 下的 `.crt` / `.key`。

> `custom` 模式是**复制**证书而非软链（Caddy 的私钥权限 postfix 读不了），所以证书续期后要重新执行一次，或加一个每周 cron 重新复制并 `postfix reload`。

## 验证清单

```bash
# 1. 本机认证自检（脚本已自动做）
swaks --server 127.0.0.1:587 --tls --auth LOGIN \
  --auth-user mailedge --auth-password '<密码>' --quit-after AUTH

# 2. DKIM 公钥已发布且与私钥配对（DNS 添加后）
opendkim-testkey -d example.com -s mail -vv

# 3. 发一封真实测试信，然后到 mail-tester.com 看评分
swaks --server 127.0.0.1:587 --tls --auth LOGIN \
  --auth-user mailedge --auth-password '<密码>' \
  --from test@example.com --to <mail-tester 给的地址> \
  --h-Subject "relay test" --body "hello"

# 4. 看日志（Debian 13 无 rsyslog，日志在 journald）
journalctl -u postfix -u opendkim -f
```

mail-tester 评分里 SPF / DKIM / PTR 三项全绿才算就绪。

## 在 MailEdge 里添加渠道

设置 → 发信渠道 → SMTP：

| 字段 | 值 |
|---|---|
| 主机 | `mail.example.com` |
| 端口 | `587`（或 `465` + TLS） |
| 加密 | `STARTTLS` |
| 用户名 | `mailedge` |
| 密码 | 脚本生成的密码 |

点预设里的「自建服务器（587/STARTTLS）」可一键填好端口与加密方式。

## 常见问题

**为什么必须 587/465，不能 25？**
Cloudflare Workers 禁止 25 端口出站。发信走 submission 端口本来就是规范做法，25 留给服务器之间的投递。

**DMARC 要不要管？**
域名已有 `p=none` 的 DMARC 记录即可先跑通；稳定后建议收紧到 `p=quarantine` 再 `p=reject`。

**想签多个域 / 子域？**
在服务器 `/etc/opendkim/signing.table` 加一行 `*@other.com mail._domainkey.other.com`（对应 key.table 也要有该域的密钥），重启 opendkim。

**加发信用户？**
`saslpasswd2 -c -u mail.example.com <新用户>`，然后确认 `/etc/sasldb2` 仍是 `root:postfix 640`。

**服务器上还有别的服务会不会冲突？**
脚本只装 Postfix/OpenDKIM/SASL 并监听 25/465/587，不碰 80/443，可与 Caddy/Nginx/其他应用共存。
