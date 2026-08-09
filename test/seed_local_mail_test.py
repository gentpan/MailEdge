"""Contract tests for the local QA mailbox fixture generator."""

from __future__ import annotations

import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/seed-local-mail.py"
SPEC = importlib.util.spec_from_file_location("seed_local_mail", SCRIPT)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import failure is fatal
    raise RuntimeError(f"无法加载 {SCRIPT}")
seed_local_mail = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed_local_mail)


class SeedLocalMailTest(unittest.TestCase):
    def test_fixture_contract_and_visual_coverage(self) -> None:
        seed_local_mail.validate_fixtures()
        summary = seed_local_mail.fixture_summary()

        self.assertGreaterEqual(summary["count"], 80)
        self.assertEqual(summary["attachments"], 0)
        self.assertGreater(summary["read"], 0)
        self.assertGreater(summary["unread"], 0)
        self.assertGreater(summary["starred"], 0)
        self.assertGreater(summary["plainTextOnly"], 0)
        self.assertEqual(set(summary["categories"]), seed_local_mail.VALID_CATEGORIES)
        self.assertTrue(all(summary["coverage"].values()))

    def test_seeding_is_idempotent_and_prunes_stale_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "mailbox.sqlite"
            with sqlite3.connect(database) as connection:
                connection.executescript(
                    """
                    CREATE TABLE messages (
                      id TEXT PRIMARY KEY, internal_id TEXT, direction TEXT NOT NULL,
                      folder TEXT NOT NULL DEFAULT 'inbox', message_id TEXT, in_reply_to TEXT,
                      thread_id TEXT, from_email TEXT NOT NULL, from_name TEXT,
                      to_json TEXT NOT NULL DEFAULT '[]', cc_json TEXT NOT NULL DEFAULT '[]',
                      bcc_json TEXT NOT NULL DEFAULT '[]', reply_to_json TEXT,
                      subject TEXT NOT NULL DEFAULT '', snippet TEXT NOT NULL DEFAULT '',
                      html TEXT, text TEXT, headers_json TEXT NOT NULL DEFAULT '{}',
                      size INTEGER NOT NULL DEFAULT 0, is_read INTEGER NOT NULL DEFAULT 0,
                      is_starred INTEGER NOT NULL DEFAULT 0, status TEXT, provider TEXT,
                      error TEXT, category TEXT, ai_summary TEXT, received_at TEXT NOT NULL
                    );
                    CREATE TABLE attachments (
                      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, filename TEXT NOT NULL,
                      content_type TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
                      mode TEXT NOT NULL DEFAULT 'inline', r2_key TEXT, token TEXT
                    );
                    INSERT INTO messages (id, direction, from_email, subject, received_at)
                    VALUES ('seed_removed_fixture', 'inbound', 'old@example.com', 'stale', '2020-01-01T00:00:00Z');
                    INSERT INTO attachments (id, message_id, filename, content_type)
                    VALUES ('stale_attachment', 'seed_removed_fixture', 'missing.pdf', 'application/pdf');
                    """
                )

            first = seed_local_mail.seed_database(database, "admin@example.com")
            second = seed_local_mail.seed_database(database, "admin@example.com")
            self.assertEqual(first, len(seed_local_mail.MESSAGES))
            self.assertEqual(second, first)

            with sqlite3.connect(database) as connection:
                fixture_count = connection.execute(
                    "SELECT COUNT(*) FROM messages WHERE id GLOB 'seed_*'"
                ).fetchone()[0]
                stale_count = connection.execute(
                    "SELECT COUNT(*) FROM messages WHERE id = 'seed_removed_fixture'"
                ).fetchone()[0]
                attachment_count = connection.execute("SELECT COUNT(*) FROM attachments").fetchone()[0]

            self.assertEqual(fixture_count, first)
            self.assertEqual(stale_count, 0)
            self.assertEqual(attachment_count, 0)


if __name__ == "__main__":
    unittest.main()
