# MailEdge QA Matrix

This document is the release-gating test matrix for MailEdge. Tests must use
local or isolated Cloudflare resources. Production mailboxes, credentials, and
API tokens must never be used as fixtures.

## Severity

| Level | Meaning | Release policy |
| --- | --- | --- |
| P0 | Data loss, security exposure, authentication failure, or unusable deployment | Block release immediately |
| P1 | A core workflow is broken or an upgrade/uninstall cannot recover safely | Fix before release |
| P2 | Important compatibility, performance, or interaction defect | Fix or document with an owner and target version |
| P3 | Minor visual or copy defect | Track for a later iteration |

Every defect record must include reproduction steps, environment, evidence,
root cause, fix reference, and a regression test.

## Current automated baseline

- Biome lint
- Worker, web, and test TypeScript checks
- Vitest tests running in workerd with local D1, R2, and Durable Objects
- disposable-SQLite migration contract tests for the complete `0001`-`0007`
  chain, legacy catch-all repair, repeat execution, and row preservation
- Durable Object eviction/reopen coverage for message metadata, archived bodies,
  state, and attachment references
- Vite production build

The baseline is enforced by `.github/workflows/verify.yml` on pushes to `main`
and on pull requests.

## Deterministic fixtures

The local fixture set must cover:

- uninitialized and initialized installations;
- administrator and non-administrator sessions;
- zero, one, and multiple mailboxes;
- empty, 1, 25, 50, 100, 10,000, and 100,000 message datasets;
- read, unread, starred, attachment, and every classification state;
- plain text, regular HTML, native-dark HTML, already-dark HTML, malformed HTML,
  Outlook table layouts, wide tables, code blocks, long links, CJK, RTL, and emoji;
- R2-only, KV-only, and mixed storage;
- successful, delayed, rate-limited, failed, and fallback providers.

Fixtures must be repeatable and idempotent. Fake attachment metadata without a
corresponding local object is not allowed.

## Application matrix

### Authentication and authorization

- first-run setup, password login, logout, password reset, and session expiry;
- Passkey registration, login, cancellation, replay, and unsupported devices;
- unauthenticated, user, and administrator access for every API route;
- horizontal object access, CSRF/origin checks, cookie flags, session fixation,
  brute-force limits, and secret redaction.

### Mail lifecycle

- inbound Message-ID idempotency and interrupted attachment persistence;
- list, same-timestamp pagination, combined mailbox/category/search filters,
  FTS fallback, and datasets up to 100,000 messages;
- detail rendering, sender avatar consistency, attachments, contact actions,
  reply, reply-all, forwarding, AI reply, and provider fallback;
- read/unread, star, archive, folder move, spam/unspam, trash, and permanent delete;
- sent, queued, sending, deferred, and failed outbound states;
- provider success followed by local persistence failure, partial multi-recipient
  failure, concurrent cron runs, retries, and Worker restarts;
- retention, archived body restoration, mailbox deletion, and orphan cleanup.

### Browser and visual coverage

| Dimension | Values |
| --- | --- |
| Browser | Chromium, Firefox, WebKit |
| Theme | light, dark, system |
| Language | Chinese, English |
| List layout | compact, comfortable |
| Width | 320, 375, 390, 768, 1024, 1280, 1440, 1920, 2560 |
| Height | 600, 720, 768, 900, 1080 |
| Motion | normal, reduced motion |
| Data | empty, normal, long content, 100+ rows |

Visual snapshots must cover login, dashboard, full-width inbox, split detail,
long HTML, native-dark HTML, compose, contacts, attachment management, sent,
outbox, and every settings category. Dynamic timestamps and remote avatars must
be stabilized before screenshots are compared.

### Accessibility

- WCAG 2.2 AA contrast;
- complete keyboard operation and visible focus;
- dialog focus trapping, Escape behavior, and focus restoration;
- accessible names for icon-only controls;
- semantic tabs, menus, dialogs, alerts, and toasts;
- 44 by 44 pixel touch targets and usable 200 percent zoom;
- text alternatives for charts and a keyboard alternative to drag-and-drop.

## Data, migration, and failure matrix

- clean install and every migration path from `0001` to the current migration;
- repeated migrations, interrupted upgrades, invalid encryption keys, backup,
  restore, and checksum comparison;
- injected D1, Durable Object, R2, and KV 429, 500, timeout, missing-object, and
  delete failures;
- provider 400, 401, 408, 429, 500, hang, empty response, and partial success;
- forced restarts after object persistence, after task claim, and after provider
  success but before local persistence;
- zero-byte, limit-sized, oversized, malformed MIME, and large CID attachments.

No failed delete may be reported as successful. No retry or recovery path may
duplicate delivered mail. No message, mailbox, or attachment deletion may leave
unexpected objects behind.

## Deployment matrix

- OAuth and API Token authorization, denial, expiry, revocation, state replay,
  popup closure, restart recovery, and multiple accounts;
- complete pagination and explicit unknown/error states for Workers, D1, R2,
  KV, and routing resource discovery;
- fresh install, idempotent repeat install, R2, KV, existing resources, missing
  permissions, source download failure, dependency failure, and Cloudflare timeout;
- upgrade from the previous release with before/after D1 row counts, Durable
  Object messages, R2/KV objects, checksums, and secret names;
- forced restart at every setup phase;
- uninstall in storage, route, Worker, D1 order, stopping before destructive
  steps whenever storage cleanup fails;
- deployment statistics increment exactly once after a completed job;
- package version, Git tag, GitHub release, changelog, version API, and Worker
  deployment tag remain identical.

## Infrastructure matrix

- application service listens only on loopback; the application port is not
  reachable from the public Internet;
- HTTP and HTTPS host routing, canonical redirects, IPv4/IPv6, Caddy, Cloudflare
  Full (strict), Origin CA, security headers, service restart, and boot recovery;
- backups contain all persistent deployment statistics and application data;
- one restore drill and one previous-release rollback drill before release;
- `mailedge.sh` serves only the deployment product while `mailedge.io` serves
  the product and documentation site.

## Performance targets

Initial repeatable local targets:

- message list p95 below 300 ms;
- aggregate search p95 below 800 ms;
- message detail p95 below 500 ms;
- dashboard p95 below 2 seconds;
- LCP at or below 2.5 seconds, CLS at or below 0.1, and INP at or below 200 ms;
- alert when the main JavaScript bundle grows more than 5 percent from the
  recorded baseline.

## Release gate

A release is Go only when:

1. P0 and P1 are zero.
2. Lint, type checks, unit, integration, browser, accessibility, and production
   build checks pass.
3. Fresh install, repeat install, upgrade, failure recovery, and complete
   uninstall pass against an isolated Cloudflare account.
4. D1, Durable Object, R2/KV, attachment, and secret differences after upgrade
   are exactly zero unless explicitly required by a migration.
5. The application port is unreachable publicly.
6. Backup restore and rollback drills pass.
7. A 24 to 48 hour canary has no unresolved P0/P1 error.
