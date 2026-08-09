# Changelog

All notable changes to MailEdge are documented here.

## [0.2.3] - 2026-08-10

### Added

- Added deterministic local QA fixtures covering 83 messages, six categories,
  light, native-dark and fixed-dark HTML, Outlook tables, plain text, RTL,
  long content, read state and starred state.
- Added isolated Playwright authentication and browser smoke coverage for
  Chromium, Firefox and WebKit, plus accessibility checks and GitHub Actions
  verification.
- Added migration, D1, Durable Object, archived R2 body, mailbox ownership and
  API authorization regression coverage.
- Added migration `0007` to repair duplicate catch-all mailbox assignments
  deterministically and enforce the one-catch-all invariant.

### Changed

- Unified sender avatars between the message list and detail header, with
  priority loading for the selected message and a stable initial fallback.
- Improved HTML email rendering across light and dark themes, including native
  dark-mode messages, fixed-dark messages, images, links, tables and quoted
  content.
- Made legacy fixed-width Outlook tables responsive in narrow detail panes
  while preserving the sender-defined width when sufficient space is available.
- Refined message detail spacing, quick replies, mailbox settings and the shared
  `#0052D9` application accent.
- Upgraded the React, Router, Vite, TypeScript, Wrangler and test toolchain and
  made the full verification workflow reproducible.

### Fixed

- Fixed dark-mode email text becoming unreadably dark after whole-document
  inversion and prevented native-dark messages from being adapted twice.
- Fixed sender detail avatars temporarily diverging from already-loaded list
  avatars when a message was opened.
- Fixed legacy email tables overflowing narrow split views and reduced nested
  email-content scrolling.
- Fixed cross-mailbox authorization boundaries and deterministic catch-all
  selection during mailbox updates and migration.

## [0.2.2] - 2026-08-07

### Added

- Added inline quick replies with optional AI-assisted drafting from the message detail view.
- Added richer attachment, sender-contact and message-list interactions across the mail workspace.

### Changed

- Improved AI provider compatibility for models that require `temperature=1` and responses that return content blocks or `output_text`.
- Refined sent-mail actions, compact list behavior, avatars, category badges, pagination and responsive message details.

### Fixed

- Fixed the deployer workspace reusing incomplete `node_modules` and missing `@vitejs/plugin-react` during production builds.
- Dependency changes now trigger a deterministic reinstall with development dependencies included, with a build-chain integrity check.
- Improved empty AI responses and test requests so valid provider responses are not reported as failures.

## [0.2.1] - 2026-08-05

### Added

- Added passkey sign-in, password recovery, contact management, custom folders and mailbox navigation.
- Added the Dashboard with mail activity, category, provider quota and D1 / Durable Object / R2 usage views.
- Added R2 attachment management, storage backends, retention settings and message-body archival migrations.
- Added local mail classification rules with optional AI-assisted classification.
- Added Markdown formatting controls to the compose editor, including preview and HTML email conversion.
- Added compact and comfortable message-list modes, pagination, sender avatars, category badges and message actions.

### Changed

- Unified the mail, settings and contacts layouts with responsive spacing, fixed-width content regions and consistent controls.
- Updated the message toolbar, contact actions, quick reply entry and attachment workflows.
- Messages sent from Markdown now include both an HTML representation for normal mail clients and a plain-text fallback.
- Added version checking that reads the current deployment and the latest deployable version from the deployer site.
- Added the MIT license and third-party icon attribution documents.

### Fixed

- Prevented message rows, badges, stars and action buttons from overflowing or becoming misaligned at different list widths.
- Removed duplicate email-content scrollbars while preserving scrolling for long messages.
- Improved avatar loading with a visible initial fallback and a smooth transition to domain icons.
- Corrected storage, migration, attachment and message-detail handling for existing data.

## [0.2.0] - 2026-08-02

- Introduced the self-hosted MailEdge deployment and upgrade workflow.
- Added the first production dashboard, attachment handling and responsive application shell.

## [0.1.2] - 2026-08-02

### Added

- Added Vitest, Biome and Worker/frontend/test TypeScript verification.

### Fixed

- Hardened CRLF header handling, PBKDF2 production limits and D1
  `database_id` backfilling.
- Improved one-click deployment workspaces, Cloudflare permission checks and
  resource-scan edge cases.

## [0.1.1] - 2026-08-02

### Added

- Added Markdown-to-safe-HTML composition and Resend, Sendflare, SMTP/Gmail and
  Cloudflare Email Service provider configuration.
- Added multi-mailbox aggregation, sender-domain discovery, provider failover,
  WebSocket new-mail delivery with polling fallback, AI tools, Telegram
  notifications and Chinese/English localization.
- Partitioned R2 attachments by mailbox and date.

## [0.1.0] - 2026-08-02

- Initial MailEdge release.
