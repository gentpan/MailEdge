#!/usr/bin/env bash
# MailEdge 自建 SMTP 发信中继一键初始化（Debian 12+/13，Ubuntu 22.04+）
#
# 用法（root 执行）：
#   RELAY_DOMAIN=example.com bash setup-mail-relay.sh
#
# 可选环境变量：
#   RELAY_HOSTNAME   默认 mail.$RELAY_DOMAIN
#   RELAY_USER       默认 mailedge
#   RELAY_PASSWORD   默认自动生成强随机密码
#   DKIM_SELECTOR    默认 mail
#   TLS_MODE         snakeoil（默认，临时自签）| custom（需同时给 TLS_CERT_FILE / TLS_KEY_FILE）
#   TLS_CERT_FILE    custom 模式的证书全链路径
#   TLS_KEY_FILE     custom 模式的私钥路径
#
# 完成后按结尾输出的 DNS 清单到 DNS 服务商添加记录，再把「MailEdge 渠道参数」填进设置页。
# 详细说明见 docs/self-hosted-smtp.md。

set -euo pipefail

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m%s\n' "$*"; }
die() { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "需要 root 运行"
command -v apt-get >/dev/null || die "仅支持 apt 系发行版（Debian/Ubuntu）"

RELAY_DOMAIN="${RELAY_DOMAIN:?缺少 RELAY_DOMAIN，用法：RELAY_DOMAIN=example.com bash setup-mail-relay.sh}"
RELAY_HOSTNAME="${RELAY_HOSTNAME:-mail.$RELAY_DOMAIN}"
RELAY_USER="${RELAY_USER:-mailedge}"
DKIM_SELECTOR="${DKIM_SELECTOR:-mail}"
TLS_MODE="${TLS_MODE:-snakeoil}"
CRED_FILE=/root/.mailedge-smtp.env

[ -n "${RELAY_PASSWORD:-}" ] || RELAY_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"

log "配置：域 $RELAY_DOMAIN，主机 $RELAY_HOSTNAME，SASL 用户 $RELAY_USER"

# ---------- 1. 主机名 ----------
log "设置主机名与 /etc/mailname"
command -v hostnamectl >/dev/null && hostnamectl set-hostname "$RELAY_HOSTNAME"
echo "$RELAY_HOSTNAME" > /etc/mailname
if grep -q '^127\.0\.1\.1' /etc/hosts; then
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1 $RELAY_HOSTNAME/" /etc/hosts
else
  echo "127.0.1.1 $RELAY_HOSTNAME" >> /etc/hosts
fi

# ---------- 2. 安装软件 ----------
log "安装 postfix / opendkim / sasl2-bin 等"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postfix opendkim opendkim-tools sasl2-bin libsasl2-modules swaks ssl-cert dnsutils curl

# ---------- 3. Postfix main.cf ----------
log "写入 /etc/postfix/main.cf（发件专用：未认证拒绝中继）"
mkdir -p /etc/postfix/tls
cat > /etc/postfix/main.cf <<'EOF'
# MailEdge 发信中继：仅发件，不接收本域入站邮件（入站走 Cloudflare Email Routing）
myhostname = __RELAY_HOSTNAME__
mydomain = __RELAY_DOMAIN__
myorigin = $mydomain
mydestination = $myhostname, localhost.localdomain, localhost
inet_interfaces = all
# 只走 IPv4：PTR 挂在 IPv4 上，避免 v6 无反解影响投递信誉
inet_protocols = ipv4
mynetworks = 127.0.0.0/8

smtpd_banner = $myhostname ESMTP
disable_vrfy_command = yes
smtpd_helo_required = yes
smtpd_helo_restrictions = permit_mynetworks, reject_invalid_helo_hostname, reject_non_fqdn_helo_hostname

# 未认证一律拒绝中继
smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination
smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination

# SASL（Cyrus + sasldb，无独立守护进程）
smtpd_sasl_type = cyrus
smtpd_sasl_path = smtpd
smtpd_sasl_auth_enable = yes
smtpd_sasl_local_domain = $myhostname
broken_sasl_auth_clients = yes

# TLS：强制 TLS 之后才允许 AUTH
smtpd_tls_cert_file = /etc/postfix/tls/__RELAY_HOSTNAME__.crt
smtpd_tls_key_file = /etc/postfix/tls/__RELAY_HOSTNAME__.key
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_loglevel = 1
smtpd_tls_session_cache_database = btree:${data_directory}/smtpd_scache
smtpd_tls_received_header = yes

# OpenDKIM milter
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:localhost:12301
non_smtpd_milters = inet:localhost:12301

message_size_limit = 52428800
recipient_delimiter = +
unknown_local_recipient_reject_code = 550
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6
EOF
sed -i "s/__RELAY_HOSTNAME__/$RELAY_HOSTNAME/g; s/__RELAY_DOMAIN__/$RELAY_DOMAIN/g" /etc/postfix/main.cf

# ---------- 4. master.cf：587/465 认证端口（不 chroot，需读 /etc/sasldb2） ----------
log "配置 submission(587) 与 smtps(465)"
if ! grep -q '^submission inet' /etc/postfix/master.cf; then
  cat >> /etc/postfix/master.cf <<'EOF'

submission inet n       -       n       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING

smtps     inet  n       -       n       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
EOF
fi

# ---------- 5. SASL ----------
log "配置 Cyrus SASL（auxprop + sasldb）"
mkdir -p /etc/postfix/sasl
cat > /etc/postfix/sasl/smtpd.conf <<'EOF'
pwcheck_method: auxprop
auxprop_plugin: sasldb
mech_list: PLAIN LOGIN
EOF
echo "$RELAY_PASSWORD" | saslpasswd2 -c -p -u "$RELAY_HOSTNAME" "$RELAY_USER"
# 关键：smtpd 以 postfix 用户运行，必须能读 sasldb
chown root:postfix /etc/sasldb2
chmod 640 /etc/sasldb2
printf 'MAILEDGE_SMTP_USER=%s\nMAILEDGE_SMTP_PASS=%s\n' "$RELAY_USER" "$RELAY_PASSWORD" > "$CRED_FILE"
chmod 600 "$CRED_FILE"

# ---------- 6. TLS ----------
log "配置 TLS（模式：$TLS_MODE）"
CRT=/etc/postfix/tls/$RELAY_HOSTNAME.crt
KEY=/etc/postfix/tls/$RELAY_HOSTNAME.key
# 目标可能是上次留下的软链，先删再落地为实体文件
rm -f "$CRT" "$KEY"
case "$TLS_MODE" in
  snakeoil)
    # 复制而非软链：postfix check 会对 /etc/postfix 下的软链权限告警，后续换正式证书直接覆盖文件
    cp /etc/ssl/certs/ssl-cert-snakeoil.pem "$CRT"
    cp /etc/ssl/private/ssl-cert-snakeoil.key "$KEY"
    chown root:postfix "$KEY"
    chmod 640 "$KEY"
    warn "snakeoil 是自签临时证书，仅验证链路；生产请换正式证书（见 docs/self-hosted-smtp.md）"
    ;;
  custom)
    [ -f "$TLS_CERT_FILE" ] && [ -f "$TLS_KEY_FILE" ] || die "TLS_MODE=custom 需要 TLS_CERT_FILE 与 TLS_KEY_FILE 指向存在的文件"
    # 复制而非软链：源文件（如 Caddy 存储）postfix 用户往往无权读取
    cp "$TLS_CERT_FILE" "$CRT"
    cp "$TLS_KEY_FILE" "$KEY"
    chown root:postfix "$KEY"
    chmod 640 "$KEY"
    warn "custom 模式是复制：证书续期后需重新执行本步（或加 cron 重新复制并 postfix reload）"
    ;;
  *) die "未知 TLS_MODE=$TLS_MODE（snakeoil|custom）" ;;
esac

# ---------- 7. OpenDKIM ----------
log "配置 OpenDKIM（selector=$DKIM_SELECTOR，2048 位）"
mkdir -p "/etc/opendkim/keys/$RELAY_DOMAIN"
if [ ! -f "/etc/opendkim/keys/$RELAY_DOMAIN/$DKIM_SELECTOR.private" ]; then
  opendkim-genkey -b 2048 -d "$RELAY_DOMAIN" -s "$DKIM_SELECTOR" -D "/etc/opendkim/keys/$RELAY_DOMAIN/"
fi
chown -R opendkim:opendkim /etc/opendkim

cat > /etc/opendkim.conf <<'EOF'
Syslog yes
SyslogSuccess yes
Canonicalization relaxed/simple
Mode sv
SubDomains no
OversignHeaders From
AutoRestart yes
AutoRestartRate 10/1h
Socket inet:12301@localhost
PidFile /run/opendkim/opendkim.pid
UserID opendkim:opendkim
UMask 002
KeyTable refile:/etc/opendkim/key.table
SigningTable refile:/etc/opendkim/signing.table
InternalHosts refile:/etc/opendkim/trusted.hosts
ExternalIgnoreList refile:/etc/opendkim/trusted.hosts
EOF

echo "$DKIM_SELECTOR._domainkey.$RELAY_DOMAIN $RELAY_DOMAIN:$DKIM_SELECTOR:/etc/opendkim/keys/$RELAY_DOMAIN/$DKIM_SELECTOR.private" > /etc/opendkim/key.table
printf '*@%s %s._domainkey.%s\n*@*.%s %s._domainkey.%s\n' \
  "$RELAY_DOMAIN" "$DKIM_SELECTOR" "$RELAY_DOMAIN" \
  "$RELAY_DOMAIN" "$DKIM_SELECTOR" "$RELAY_DOMAIN" > /etc/opendkim/signing.table
printf '127.0.0.1\n::1\nlocalhost\n%s\n' "$RELAY_HOSTNAME" > /etc/opendkim/trusted.hosts

# Debian 的 /etc/default/opendkim 若设置 SOCKET 会覆盖 conf，保持一致
if [ -f /etc/default/opendkim ]; then
  sed -i 's|^SOCKET=.*|SOCKET=inet:12301@localhost|' /etc/default/opendkim
fi

# ---------- 8. 启动 ----------
log "启动并设置开机自启"
systemctl enable --quiet opendkim postfix
systemctl restart opendkim
postfix check
systemctl restart postfix
sleep 1

# ---------- 9. 冒烟自检 ----------
log "冒烟自检"
ss -tln | grep -q ':587 ' && ss -tln | grep -q ':465 ' && echo "  端口 587/465 已监听" || die "587/465 未监听"

if swaks --server 127.0.0.1:587 --tls --auth LOGIN \
    --auth-user "$RELAY_USER" --auth-password "$RELAY_PASSWORD" \
    --quit-after AUTH >/dev/null 2>&1; then
  echo "  587 STARTTLS + AUTH LOGIN 认证通过"
else
  die "587 认证自检失败，查看 journalctl -u postfix -n 50"
fi

if timeout 8 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25; head -c 30 <&3' >/dev/null 2>&1; then
  echo "  出站 25 端口连通"
else
  warn "出站 25 端口不通！可能机房封锁（部分商家默认封 25），外发会全部失败"
fi

MY_IP=""
for ip_src in https://api.ipify.org https://icanhazip.com https://ifconfig.me/ip; do
  MY_IP="$(curl -4 -s --max-time 5 "$ip_src" 2>/dev/null | tr -d '[:space:]')"
  [[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && break
  MY_IP=""
done
# 外部服务都失败时退回本机网卡地址（NAT 场景可能不是公网 IP，仅用于提示信息）
[ -n "$MY_IP" ] || MY_IP="$(ip -4 addr show scope global | awk '/inet /{split($2,a,"/"); print a[1]; exit}')"
[ -n "$MY_IP" ] || MY_IP="<服务器公网IP>"
PTR="$(dig +short -x "$MY_IP" 2>/dev/null || true)"
if [ -n "$PTR" ] && [ "$PTR" != "$RELAY_HOSTNAME." ]; then
  warn "PTR 记录当前是 $PTR，请在机房面板改为 $RELAY_HOSTNAME（Gmail 等严格方强制要求）"
fi

# ---------- 10. 交接信息 ----------
DKIM_TXT="/etc/opendkim/keys/$RELAY_DOMAIN/$DKIM_SELECTOR.txt"
cat <<DONE

================================================================
部署完成。接下来两步：

【1】到 DNS 服务商添加 3 条记录（Cloudflare 上 A 记录必须「仅 DNS」灰云）：

  A     $RELAY_HOSTNAME            $MY_IP
  TXT   $DKIM_SELECTOR._domainkey.$RELAY_DOMAIN   见 $DKIM_TXT
  TXT   $RELAY_DOMAIN              在现有 SPF 中追加 ip4:$MY_IP
        例：v=spf1 include:_spf.mx.cloudflare.net ip4:$MY_IP ~all

【2】MailEdge 设置页添加 SMTP 渠道：

  主机    $RELAY_HOSTNAME
  端口    587（或 465 + TLS）
  加密    STARTTLS
  用户名  $RELAY_USER
  密码    $RELAY_PASSWORD

凭据已保存到 $CRED_FILE（权限 600）。
验证 DKIM：opendkim-testkey -d $RELAY_DOMAIN -s $DKIM_SELECTOR -vv
================================================================
DONE
