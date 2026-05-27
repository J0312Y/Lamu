use rusqlite::{Connection, Result};
use std::path::Path;

pub fn open(db_path: &Path) -> Result<Connection> {
    Connection::open(db_path)
}

/// Create contacts table and indexes if they don't exist.
pub fn init_db(db_path: &Path) -> Result<()> {
    let conn = open(db_path)?;
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS contacts (
            id          TEXT PRIMARY KEY,
            full_name   TEXT NOT NULL,
            email       TEXT NOT NULL,
            -- Short alias used in voice commands (e.g. 'Joel')
            alias       TEXT,
            company     TEXT,
            phone       TEXT,
            -- 'outlook' | 'manual'
            source      TEXT NOT NULL DEFAULT 'manual',
            created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );

        CREATE INDEX IF NOT EXISTS contacts_email  ON contacts(email);
        CREATE INDEX IF NOT EXISTS contacts_name   ON contacts(full_name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS contacts_alias  ON contacts(alias  COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS email_config (
            id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
            smtp_host   TEXT NOT NULL DEFAULT '',
            smtp_port   INTEGER NOT NULL DEFAULT 587,
            username    TEXT NOT NULL DEFAULT '',
            -- Password stored here as plaintext for now; keychain integration is optional
            password    TEXT NOT NULL DEFAULT '',
            from_name   TEXT NOT NULL DEFAULT '',
            from_email  TEXT NOT NULL DEFAULT '',
            -- 'tls' | 'starttls' | 'none'
            tls_mode    TEXT NOT NULL DEFAULT 'starttls',
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );

        -- Sent email log for history
        CREATE TABLE IF NOT EXISTS email_log (
            id          TEXT PRIMARY KEY,
            to_email    TEXT NOT NULL,
            to_name     TEXT,
            subject     TEXT NOT NULL,
            body        TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
            error       TEXT,
            sent_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
    ")?;
    Ok(())
}
