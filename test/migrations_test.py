"""Destructive migration QA executed only against disposable SQLite files.

The D1 migrations use SQLite-compatible SQL.  These tests intentionally avoid
Wrangler and `.wrangler/state`: every case creates a brand-new database under a
temporary directory and removes it when the test exits.
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = tuple(sorted((ROOT / "migrations").glob("*.sql")))
EXPECTED_MIGRATIONS = tuple(f"{number:04d}" for number in range(1, 8))


def migration_prefixes() -> tuple[str, ...]:
    return tuple(path.stem.split("_", 1)[0] for path in MIGRATIONS)


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def apply(connection: sqlite3.Connection, *migrations: Path) -> None:
    for migration in migrations:
        connection.executescript(migration.read_text(encoding="utf-8"))


def insert_history_fixture(connection: sqlite3.Connection) -> None:
    """Create representative 0001-0006 data, including legacy catch-all drift."""
    connection.execute(
        """INSERT INTO users
           (id, email, name, password_hash, password_salt, role, is_enabled, created_at)
           VALUES ('user_a', 'owner@example.com', 'Owner', 'hash', 'salt', 'admin', 1,
                   '2025-01-01 00:00:00')"""
    )
    connection.execute(
        """INSERT INTO sessions (id, user_id, expires_at, created_at)
           VALUES ('session_a', 'user_a', '2030-01-01 00:00:00', '2025-01-01 00:00:01')"""
    )
    connection.execute(
        """INSERT INTO mail_providers
           (id, name, type, config_encrypted, is_default, priority, created_at, updated_at)
           VALUES ('provider_a', 'Primary', 'resend', 'ciphertext', 1, 10,
                   '2025-01-01 00:00:02', '2025-01-01 00:00:02')"""
    )

    mailboxes = (
        # The oldest row must survive as the domain catch-all.
        ("mb_keep", "owner@example.com", 1, "2025-01-01 00:00:03"),
        ("mb_later", "later@example.com", 1, "2025-01-02 00:00:03"),
        # Equal timestamp: lexicographically larger id must be demoted.
        ("mb_z", "z@example.com", 1, "2025-01-01 00:00:03"),
        ("mb_regular", "support@example.com", 0, "2025-01-03 00:00:03"),
    )
    connection.executemany(
        """INSERT INTO mailboxes
           (id, address, display_name, user_id, do_name, is_catch_all, domain, created_at)
           VALUES (?, ?, 'Mailbox', 'user_a', 'mailbox:' || ?, ?, 'example.com', ?)""",
        ((row[0], row[1], row[1], row[2], row[3]) for row in mailboxes),
    )
    connection.execute(
        """INSERT INTO mailboxes
           (id, address, display_name, user_id, do_name, is_catch_all, domain, created_at)
           VALUES ('mb_other', 'owner@other.test', 'Other', 'user_a',
                   'mailbox:owner@other.test', 1, 'other.test', '2025-01-04 00:00:03')"""
    )

    connection.execute(
        """INSERT INTO outbound_messages
           (id, user_id, mailbox_id, from_email, to_json, subject, status, provider_id,
            provider_type, provider_message_id, attempts, attempt_log, payload_key,
            created_at, updated_at)
           VALUES ('mail_a', 'user_a', 'mb_keep', 'owner@example.com',
                   '[{"email":"recipient@example.net"}]', 'Migration payload', 'sent',
                   'provider_a', 'resend', 'remote_123', 1, '[{"ok":true}]',
                   'outbound/mb_keep/mail_a/payload.json',
                   '2025-01-05 00:00:00', '2025-01-05 00:00:01')"""
    )
    connection.execute(
        """INSERT INTO attachment_links
           (token, r2_key, filename, content_type, size, message_id, user_id, downloads,
            is_revoked, expires_at, created_at)
           VALUES ('token_a', 'shares/mail_a/report.pdf', 'report.pdf', 'application/pdf',
                   4096, 'mail_a', 'user_a', 2, 0, '2030-01-01 00:00:00',
                   '2025-01-05 00:00:02')"""
    )
    connection.execute(
        """INSERT INTO passkey_credentials
           (id, user_id, public_key, algorithm, transports, sign_count, created_at)
           VALUES ('passkey_a', 'user_a', 'public-key', 'ES256', '["internal"]', 7,
                   '2025-01-06 00:00:00')"""
    )
    connection.execute(
        """INSERT INTO auth_challenges
           (id, kind, user_id, challenge, expires_at, created_at)
           VALUES ('challenge_a', 'login', 'user_a', 'challenge',
                   '2030-01-01 00:00:00', '2025-01-06 00:00:01')"""
    )
    connection.execute(
        """INSERT INTO password_reset_tokens
           (id, user_id, token_hash, expires_at, created_at)
           VALUES ('reset_a', 'user_a', 'reset-hash', '2030-01-01 00:00:00',
                   '2025-01-06 00:00:02')"""
    )
    connection.execute(
        """INSERT INTO mail_folders (id, user_id, name, created_at)
           VALUES ('folder_a', 'user_a', 'Invoices', '2025-01-07 00:00:00')"""
    )
    connection.execute(
        """INSERT INTO contacts
           (id, user_id, email, name, company, notes, created_at, updated_at)
           VALUES ('contact_a', 'user_a', 'billing@example.net', 'Billing', 'Example',
                   'Migration contact', '2025-01-08 00:00:00', '2025-01-08 00:00:01')"""
    )

    # Custom administrator choices must not be overwritten by default-setting migrations.
    connection.execute(
        "UPDATE settings SET value = 'kv', updated_at = '2025-02-01 00:00:00' "
        "WHERE key = 'storage_backend'"
    )
    connection.execute(
        "UPDATE settings SET value = '180', updated_at = '2025-02-01 00:00:01' "
        "WHERE key = 'outbound_retention_days'"
    )
    connection.commit()


def snapshot(connection: sqlite3.Connection) -> dict[str, list[tuple]]:
    tables = (
        "users",
        "sessions",
        "mail_providers",
        "mailboxes",
        "outbound_messages",
        "attachment_links",
        "settings",
        "passkey_credentials",
        "auth_challenges",
        "password_reset_tokens",
        "mail_folders",
        "contacts",
    )
    result: dict[str, list[tuple]] = {}
    for table in tables:
        columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
        order = columns[0]
        result[table] = [tuple(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY {order}")]
    return result


class MigrationContractTests(unittest.TestCase):
    def test_repository_contains_one_ordered_chain_from_0001_through_0007(self) -> None:
        self.assertEqual(migration_prefixes(), EXPECTED_MIGRATIONS)

    def test_fresh_install_builds_complete_schema_and_is_repeatable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "fresh.sqlite"
            with connect(database) as connection:
                apply(connection, *MIGRATIONS)
                first_schema = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')"
                    )
                }
                apply(connection, *MIGRATIONS)
                second_schema = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')"
                    )
                }

                self.assertEqual(first_schema, second_schema)
                self.assertTrue(
                    {
                        "users",
                        "mailboxes",
                        "outbound_messages",
                        "attachment_links",
                        "passkey_credentials",
                        "mail_folders",
                        "contacts",
                        "idx_mailboxes_one_catchall_per_domain",
                    }.issubset(first_schema)
                )
                self.assertEqual(
                    dict(connection.execute("SELECT key, value FROM settings")),
                    {"storage_backend": "r2", "outbound_retention_days": "365"},
                )
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_0007_repairs_legacy_duplicates_without_losing_related_data(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "upgrade.sqlite"
            with connect(database) as connection:
                apply(connection, *MIGRATIONS[:6])
                insert_history_fixture(connection)
                before = snapshot(connection)

                apply(connection, MIGRATIONS[6])
                after = snapshot(connection)

                # 0007 changes only the unsafe flag; rows and all related payload references remain.
                before_mailboxes = {row[0]: row for row in before.pop("mailboxes")}
                after_mailboxes = {row[0]: row for row in after.pop("mailboxes")}
                self.assertEqual(before, after)
                self.assertEqual(set(before_mailboxes), set(after_mailboxes))
                for mailbox_id, before_row in before_mailboxes.items():
                    after_row = after_mailboxes[mailbox_id]
                    self.assertEqual(before_row[:5] + before_row[6:], after_row[:5] + after_row[6:])

                catchalls = connection.execute(
                    "SELECT id, domain FROM mailboxes WHERE is_catch_all = 1 ORDER BY domain"
                ).fetchall()
                self.assertEqual([tuple(row) for row in catchalls], [
                    ("mb_keep", "example.com"),
                    ("mb_other", "other.test"),
                ])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

                outbound = connection.execute(
                    "SELECT mailbox_id, payload_key, attempt_log FROM outbound_messages WHERE id = 'mail_a'"
                ).fetchone()
                self.assertEqual(
                    tuple(outbound),
                    ("mb_keep", "outbound/mb_keep/mail_a/payload.json", '[{"ok":true}]'),
                )
                attachment = connection.execute(
                    "SELECT r2_key, filename, size, downloads FROM attachment_links WHERE token = 'token_a'"
                ).fetchone()
                self.assertEqual(
                    tuple(attachment),
                    ("shares/mail_a/report.pdf", "report.pdf", 4096, 2),
                )

    def test_reapplying_full_chain_preserves_data_and_admin_settings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "repeat.sqlite"
            with connect(database) as connection:
                apply(connection, *MIGRATIONS[:6])
                insert_history_fixture(connection)
                apply(connection, MIGRATIONS[6])
                first = snapshot(connection)

                apply(connection, *MIGRATIONS)

                self.assertEqual(snapshot(connection), first)
                self.assertEqual(
                    dict(connection.execute("SELECT key, value FROM settings")),
                    {"storage_backend": "kv", "outbound_retention_days": "180"},
                )
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_unique_constraint_failure_is_fail_closed_and_non_destructive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "constraints.sqlite"
            with connect(database) as connection:
                apply(connection, *MIGRATIONS)
                connection.execute(
                    """INSERT INTO users (id, email, password_hash, password_salt)
                       VALUES ('user_a', 'owner@example.com', 'hash', 'salt')"""
                )
                connection.execute(
                    """INSERT INTO mailboxes
                       (id, address, user_id, do_name, is_catch_all, domain)
                       VALUES ('mb_a', 'owner@example.com', 'user_a',
                               'mailbox:owner@example.com', 1, 'example.com')"""
                )
                connection.commit()

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """INSERT INTO mailboxes
                           (id, address, user_id, do_name, is_catch_all, domain)
                           VALUES ('mb_b', 'other@example.com', 'user_a',
                                   'mailbox:other@example.com', 1, 'example.com')"""
                    )

                rows = connection.execute(
                    "SELECT id, is_catch_all FROM mailboxes ORDER BY id"
                ).fetchall()
                self.assertEqual([tuple(row) for row in rows], [("mb_a", 1)])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main()
