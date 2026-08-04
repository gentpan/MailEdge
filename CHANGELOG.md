# Changelog

All notable changes to MailEdge are documented here.

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

## [0.2.0] - 2026-08-04

- Introduced the self-hosted MailEdge deployment and upgrade workflow.
- Added the first production dashboard, attachment handling and responsive application shell.

## [0.1.0]

- Initial MailEdge release.
