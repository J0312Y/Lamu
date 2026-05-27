use rusqlite::{Connection, Result};
use std::path::Path;

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

pub fn init_db(path: &Path) -> Result<()> {
    let conn = open(path)?;

    // Create all tables (idempotent)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS kb_documents (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            source_type  TEXT NOT NULL DEFAULT 'file',
            content_hash TEXT NOT NULL,
            chunk_count  INTEGER NOT NULL DEFAULT 0,
            access_level TEXT NOT NULL DEFAULT 'internal',
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kb_chunks (
            id          TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            content     TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            embedding   BLOB,
            FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(document_id);

        CREATE TABLE IF NOT EXISTS kb_watched_folders (
            id         TEXT PRIMARY KEY,
            path       TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kb_integrations (
            id                  TEXT PRIMARY KEY,
            provider            TEXT NOT NULL,
            name                TEXT NOT NULL,
            access_token        TEXT,
            refresh_token       TEXT,
            token_expires_at    INTEGER,
            config              TEXT NOT NULL DEFAULT '{}',
            last_synced_at      INTEGER,
            sync_interval_hours INTEGER,
            created_at          INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kb_webhooks (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            provider   TEXT NOT NULL,
            url        TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kb_activity (
            id           TEXT PRIMARY KEY,
            query        TEXT NOT NULL,
            result_count INTEGER NOT NULL DEFAULT 0,
            results_json TEXT NOT NULL DEFAULT '[]',
            created_at   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_kb_activity_created ON kb_activity(created_at DESC);
        ",
    )?;

    // Run additive migrations — only ignore "duplicate column" errors
    match conn.execute_batch(
        "ALTER TABLE kb_documents ADD COLUMN access_level TEXT NOT NULL DEFAULT 'internal';"
    ) {
        Ok(_) => {},
        Err(e) if e.to_string().contains("duplicate column") => {},
        Err(e) => eprintln!("[KB migration] access_level: {}", e),
    }
    match conn.execute_batch(
        "ALTER TABLE kb_integrations ADD COLUMN sync_interval_hours INTEGER;"
    ) {
        Ok(_) => {},
        Err(e) if e.to_string().contains("duplicate column") => {},
        Err(e) => eprintln!("[KB migration] sync_interval_hours: {}", e),
    }

    Ok(())
}
