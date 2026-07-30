<h1 align="center">MailEdge</h1>

<p align="center">A serverless webmail with pluggable sending providers. Runs entirely on Cloudflare — no server of your own.</p>

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

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center"><img src="docs/images/02-inbox.png" alt="MailEdge inbox" width="880"></p>

```
Receiving:  Email Routing → Email Worker → Durable Object (SQLite) + R2
Sending:    Unified MailProvider interface → Cloudflare Email Service / Sendflare / Resend
Config:     D1 (accounts, provider config, outbound state machine)
```

## What it solves

Cloudflare Email Routing can receive and forward mail, but it can't reply and has no UI. Most Cloudflare mail projects stop at "display the messages you received". MailEdge fills in the missing half:

- **Sending isn't locked to one vendor.** `MailProvider` is an abstraction. Cloudflare Email Service, Sendflare and Resend work out of the box; adding SES / Mailgun / Postmark / SMTP means writing one more class.
- **Failover never duplicates a message.** Only transient errors — network failures, 429, 5xx — trigger a switch to a backup provider. Unverified domains, malformed addresses and rejected content fail immediately. Otherwise a single rejected message would go out once per platform.
- **The 5 MiB attachment ceiling is worked around.** Small files are sent as real attachments; large ones are uploaded to R2 and become download links in the body, with download counts, expiry and revocation. Recipients can't tell the difference.
- **Mail is sharded by address.** Each address gets its own Durable Object with its own SQLite instance, so there's no single-database bottleneck.

## Features

- Inbox / Sent / Archive / Trash, with search, pagination, starring and unread counts
- Aggregated view across mailboxes; mail that only matched via catch-all lands in a separate "Other addresses" folder
- Compose with Markdown (converted to email-safe HTML on send), CC, BCC and multiple attachments; admins can pin a specific sending provider
- Configure all three providers from the settings page — test send, set as default, backup priority
- Provider credentials are AES-GCM encrypted in D1; the API only ever returns masked values
- Outbound records keep the full retry chain and can be retried by hand; `deferred` messages are retried automatically by a cron trigger with exponential backoff
- HTML bodies render inside a `sandbox=""` iframe — scripts, forms and same-origin access are all disabled
- Bilingual UI (English/Chinese), auto-detected from the browser and switchable anytime

### AI assistant (optional)

Goes through an OpenAI-compatible endpoint — OpenAI, DeepSeek, Kimi, Zhipu, SiliconFlow, Ollama, etc. (the settings page has one-click presets, or fill in base URL + model name yourself). The key is AES-GCM encrypted in D1 like the provider secrets.

- **AI reply**: drafts a reply to an inbound message, dropped straight into the composer
- **AI summary**: one-click summary of a long email, cached in the Durable Object
- **AI classify**: tags incoming mail (important / updates / promotions / social / other); the inbox splits into category tabs
- **Telegram push**: pushes new mail to a Telegram bot, optionally only for chosen categories

Classification and push run on the inbound Worker inside `waitUntil`, each wrapped in its own try/catch — an AI or push failure never affects mail storage.

## Stack

Everything runs on Cloudflare — frontend and backend ship in a single deploy, no server of your own.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Cloudflare Workers | Edge execution via three entry points: `fetch` / `email` / `scheduled` |
| Receiving | Email Routing + `postal-mime` | Forwarded to an Email Worker, MIME parsed |
| Sending | In-house `MailProvider` abstraction | Cloudflare Email Service / Sendflare / Resend / SMTP |
| SMTP | `cloudflare:sockets` | Raw TCP via `connect()`, hand-written SMTP session (587/465) |
| Accounts · config · outbound state machine | D1 (SQLite) | Data that needs cross-mailbox queries |
| Mail bodies | Durable Objects + built-in SQLite | One instance per address, naturally sharded |
| Attachments | R2 | Free egress, partitioned by mailbox/month |
| Scheduled jobs | Cron Triggers | Retry deferred mail, purge expired shares |
| Crypto | Web Crypto (AES-GCM / PBKDF2) | Provider-key encryption, password hashing, session signing |
| API framework | Hono | Lightweight routing, native to Workers |
| Frontend | React 19 + Vite 7 | Served through Workers Assets |
| Styling | Hand-written CSS + design tokens | No Tailwind / CSS-in-JS — all driven by CSS variables |
| i18n | In-house lightweight layer | English/Chinese, no third-party library |
| AI | OpenAI-compatible endpoint | Reply / summary / classification, any compatible provider |
| Language · tooling | TypeScript 7 · Wrangler | Native compiler, end-to-end type safety |

## Architecture

| Capability | Implementation |
| --- | --- |
| Receiving | Cloudflare Email Routing → `email()` handler → parsed with `postal-mime` |
| Mail storage | One Durable Object per address, each with built-in SQLite |
| Attachments | R2; the raw `.eml` is archived alongside |
| Accounts / provider config / outbound state machine | D1 |
| Sending | `MailProvider` abstraction, three implementations plus failover |
| Frontend | React + Vite, served through Workers Assets |

### Sending providers

| Provider | Role | Notes |
| --- | --- | --- |
| Cloudflare Email Service | Default, native | Workers binding, no extra HTTP request; ≤ 5 MiB per message, ≤ 32 attachments; sending to arbitrary external addresses requires Workers Paid |
| Sendflare | Backup or primary | REST API, bearer token, optional HMAC-SHA256 signing |
| Resend | Mature backup | REST API, requires domain verification in their dashboard |
| SMTP | Generic relay | Raw SMTP session over Workers `connect()` on 587 STARTTLS / 465 TLS; works with external mailboxes like Gmail (app password) |

To add SES / Mailgun / Postmark, drop a class into [src/mail/providers/](src/mail/providers/) and add one branch to [factory.ts](src/mail/factory.ts).

> **Senders and verified domains**: when sending via Resend/Sendflare, the sending domain must be verified in their dashboard first. Click "Fetch domains" in the channel config and MailEdge syncs your verified domains from the provider's API; the composer's "From" dropdown is then constrained to them, blocking unverified senders before send rather than after a rejection.
>
> **SMTP via Gmail**: host `smtp.gmail.com`, port 587, STARTTLS, username = full email, password = an *app password* (2FA required — not your login password). The settings page has a one-click Gmail preset.
>
> Workers **block outbound port 25**, so SMTP only uses 587/465 — sending never needs 25 anyway. IMAP polling is likewise a poor fit for a Worker; receive via Email Routing forwarding instead.

### State machine and failover rules

```
queued → sending → sent
                 ├── deferred → retried by cron (5 min, exponential backoff, capped at 6 h, max 5 attempts)
                 └── failed
```

Every message gets a stable internal ID (`mail_01J...`) carried in the `X-App-Message-ID` header. Switching providers reuses the same ID, which keeps deduplication and tracing intact.

**Only transient errors fall through to a backup provider**: network failures, 429, 5xx, 408.
**Permanent errors fail immediately**: unverified domain, malformed address, rejected content, spam complaint, suspended account, sender not permitted.
Otherwise one rejected message would be sent once on each of the three platforms. The classification rules live in [src/mail/errors.ts](src/mail/errors.ts).

### Smart attachments

```
attachment ≤ 3 MB (and the message stays under the limit) → real email attachment
attachment > 3 MB                                          → uploaded to R2 → download link in the body
```

Downloads go through `/d/:token`. The Worker validates the token, expiry and revocation status before streaming from R2, and tracks download counts, a 7-day expiry and manual revocation. Inline images (`cid:`) always stay in the message so the body never breaks. The threshold is controlled by `SMART_ATTACHMENT_THRESHOLD`.

### R2 layout

```
inbound/{mailboxId}/{YYYY-MM}/{messageId}/{n}-{filename}
inbound/{mailboxId}/{YYYY-MM}/{messageId}/raw.eml
outbound/{mailboxId}/{YYYY-MM}/{internalId}/payload.json
outbound/{mailboxId}/{YYYY-MM}/{internalId}/attachments/{n}-{filename}
shares/{mailboxId}/{YYYY-MM}/{token}/{filename}
```

Partitioning by mailbox and month isn't cosmetic:

- **Lifecycle rules are configured by prefix**, so R2 can expire old objects on its own instead of the app doing it
- **`list()` scans by prefix** — a flat layout means scanning everything to enumerate one month
- Per-mailbox storage usage falls out of a prefix query

Full keys are persisted (the DO's `r2_key`, `attachment_links.r2_key`, `outbound_messages.payload_key`), so changing the key layout only affects new objects — existing ones stay readable and no migration is needed. Key construction lives in [src/lib/r2key.ts](src/lib/r2key.ts).

Filenames keep non-ASCII characters: R2 keys are UTF-8 and keys never appear in a URL (downloads go through the token), so only control characters and characters that would affect the key hierarchy are stripped.

Expire archived inbound mail after 90 days:

```bash
npx wrangler r2 bucket lifecycle add mailedge-attachments --prefix inbound/ --expire-days 90
```

## Deployment

### 1. Create the resources

```bash
npx wrangler d1 create mailedge
```

```bash
npx wrangler r2 bucket create mailedge-attachments
```

Put the `database_id` printed by `d1 create` into [wrangler.jsonc](wrangler.jsonc), and change `APP_URL` to your production domain (download links are built from it).

### 2. Set the secrets

```bash
openssl rand -base64 32
```

```bash
npx wrangler secret put ENCRYPTION_KEY
```

```bash
npx wrangler secret put SESSION_SECRET
```

`ENCRYPTION_KEY` encrypts `mail_providers.config_encrypted` (AES-GCM). Rotating it invalidates every stored provider credential.

### 3. Migrate and deploy

```bash
npx wrangler d1 migrations apply mailedge --remote
```

```bash
npm run deploy
```

### 4. Wire up receiving

**Deploy first.** The Worker only appears in the Email Routing dropdown once it has been deployed.

Cloudflare dashboard → **Compute** → **Email Service** → **Email Routing** → pick your domain (enable it on first visit; it writes the MX and SPF records for you).

Then **Routing Rules** → **Create routing rule**:

| Field | Value |
| --- | --- |
| Email pattern | the local part of the address, e.g. `support` |
| Action | **Send to a Worker** |
| Worker | `mailedge` |

To receive mail for the whole domain, use **Catch-all address** instead, with the same action.

> Delivering to a Worker is only available in the new Email Routing interface. If the dashboard prompts you to switch, do so.

### 5. Initialize

Open the deployed domain. On first visit you get a setup page: create the admin account and bind the first receiving address. **That address must match the routing rule from the previous step** — otherwise the Worker won't find a mailbox for incoming mail and will reject it (`550 unknown recipient`).

Then head to Settings → Sending providers: fill in the credentials, hit "Test send" to confirm it works, and mark it as default.

Sending to arbitrary external addresses requires Workers Paid (3,000 messages/month included, $0.35 per 1,000 after that). Receiving works on both free and paid plans.

## Local development

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Fill in two values generated with `openssl rand -base64 32`, then:

```bash
npx wrangler d1 migrations apply mailedge --local
```

```bash
npm run dev
```

`npm run dev` builds the frontend and starts `wrangler dev` (http://127.0.0.1:8787). While working on the UI, run `npm run dev:web` in a second terminal for incremental builds.

Simulate an inbound message locally (wrangler's built-in endpoint):

```bash
curl -X POST 'http://127.0.0.1:8787/cdn-cgi/handler/email?from=alice@outside.com&to=you@yourdomain.com' --data-binary @test.eml -H 'Content-Type: message/rfc822'
```

All local state lives in `.wrangler/state/` — delete it to reset.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET/POST` | `/api/auth/setup` | First-run setup (closes itself once a user exists) |
| `POST` | `/api/auth/login` `/logout` `/password` | Session |
| `GET` | `/api/auth/me` | Current user and mailboxes |
| `GET/POST/DELETE` | `/api/mailboxes` | Receiving addresses |
| `GET` | `/api/messages` | List, supports `folder` `q` `before` |
| `GET/PATCH/DELETE` | `/api/messages/:id` | Detail; read/star/move; delete (trash first) |
| `GET` | `/api/messages/:id/attachments/:attachmentId` | Download an inbound attachment |
| `GET` | `/api/stats` | Unread counts per folder |
| `POST` | `/api/mail/send` | Send (JSON or multipart) |
| `GET` | `/api/mail/outbox` `/outbox/:id` | Outbound records |
| `POST` | `/api/mail/outbox/:id/retry` | Manual retry (reuses the same internal ID) |
| `GET/POST/DELETE` | `/api/providers` | Provider management (admin) |
| `POST` | `/api/providers/:id/default` `/test` | Set default, test send |
| `GET/POST` | `/api/shares` `/shares/:token/revoke` | Attachment share links |
| `GET` | `/d/:token` | Public download for large attachments |

### Sending examples

JSON (attachments as base64):

```bash
curl -X POST https://your-domain/api/mail/send -H 'Content-Type: application/json' -b cookie.txt -d '{"from":"you@yourdomain.com","to":"someone@example.com","subject":"Hello","text":"Body","html":"<p>Body</p>"}'
```

multipart (what the UI uses — `payload` holds the JSON, files go in `attachments`):

```bash
curl -X POST https://your-domain/api/mail/send -b cookie.txt -F 'payload={"from":"you@yourdomain.com","to":"someone@example.com","subject":"Quote","text":"See attached"}' -F 'attachments=@quote.pdf'
```

The `smartAttachments` field in the response tells you which files were sent inline and which became download links.

## Known trade-offs

- The Cloudflare Workers binding takes raw MIME, so the message is assembled by [src/mail/mime.ts](src/mail/mime.ts) (CC, BCC, reply-to, custom headers, attachments and inline images are all covered). The binding delivers per envelope recipient, so `send()` is called once per address; a failure partway through can leave a partial delivery.
- Sendflare's field names and signing headers follow their current API reference. If those change, only [src/mail/providers/sendflare.ts](src/mail/providers/sendflare.ts) needs editing — the abstraction above it is unaffected.
- HTML bodies render in a `sandbox=""` iframe on the frontend, with scripts, forms and same-origin access disabled.
- Mail is sharded across Durable Objects by address, so cross-mailbox global search would need a separate index.
