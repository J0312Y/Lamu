use super::{crawler, db, embed, ingest, integrations, search, watcher};
use crate::KbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tracing::error;
use uuid::Uuid;

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbDocument {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub access_level: String,
    pub chunk_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct KbStats {
    pub document_count: i64,
    pub chunk_count: i64,
    pub embedded_count: i64,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn content_hash(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn get_db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let state = app.state::<KbState>();
    // Clone the path out so the MutexGuard is dropped before returning
    let path = state.db_path.lock().unwrap().clone();
    path.ok_or_else(|| "Knowledge base not initialized".to_string())
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Ingest a file into the knowledge base.
/// Emits "kb-ingest-progress" events during parsing and embedding.
#[tauri::command]
pub async fn kb_ingest_file(
    app: AppHandle,
    name: String,
    file_bytes: Vec<u8>,
) -> Result<KbDocument, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();

    // 1. Extract text
    let _ = app.emit(
        "kb-ingest-progress",
        serde_json::json!({ "step": "parsing", "name": &name }),
    );
    let text = ingest::extract_text(&name, &file_bytes)
        .map_err(|e| format!("Text extraction failed: {}", e))?;

    // 2. Chunk
    let chunks = ingest::chunk_text(&text);
    if chunks.is_empty() {
        return Err("No content could be extracted from this file".to_string());
    }

    let doc_id = Uuid::new_v4().to_string();
    let hash = content_hash(&file_bytes);
    let ts = now_ms();

    // 3. Insert document record
    {
        let conn = db::open(&db_path).map_err(|e| format!("DB open error: {}", e))?;
        conn.execute(
            "INSERT OR REPLACE INTO kb_documents \
             (id, name, source_type, content_hash, chunk_count, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![doc_id, name, "file", hash, chunks.len() as i64, ts, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    // 4. Embed each chunk and store
    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_id = Uuid::new_v4().to_string();

        let _ = app.emit(
            "kb-ingest-progress",
            serde_json::json!({
                "step": "embedding",
                "name": &name,
                "current": i + 1,
                "total": chunks.len(),
            }),
        );

        let embedding_blob = match embed::embed_text(&embed_config, chunk).await {
            Ok(vec) => Some(embed::vec_to_blob(&vec)),
            Err(e) => {
                error!("Embedding chunk {} failed: {}", i, e);
                None // store without embedding; can re-embed later
            }
        };

        let conn = db::open(&db_path).map_err(|e| format!("DB open error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_chunks (id, document_id, content, chunk_index, embedding) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![chunk_id, doc_id, chunk, i as i64, embedding_blob],
        )
        .map_err(|e| format!("Chunk insert error: {}", e))?;
    }

    let _ = app.emit(
        "kb-ingest-progress",
        serde_json::json!({ "step": "done", "name": &name }),
    );

    Ok(KbDocument {
        id: doc_id,
        name,
        source_type: "file".to_string(),
        access_level: "internal".to_string(),
        chunk_count: chunks.len() as i64,
        created_at: ts,
        updated_at: ts,
    })
}

/// Semantic search over the knowledge base; returns top_k chunks by similarity.
/// Every search that returns at least one result is logged to kb_activity.
#[tauri::command]
pub async fn kb_search(
    app: AppHandle,
    query: String,
    top_k: Option<usize>,
) -> Result<Vec<search::KbSearchResult>, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();
    let k = top_k.unwrap_or(5);

    // Try semantic search; fall back to keyword search if embedding is unavailable
    let results = if embed_config.provider == "none" {
        search::keyword_search(&db_path, &query, k)?
    } else {
        match search::search(&db_path, &embed_config, &query, k).await {
            Ok(r) => r,
            Err(_) => search::keyword_search(&db_path, &query, k)?,
        }
    };

    // Log activity for non-empty results
    if !results.is_empty() {
        let activity_id = Uuid::new_v4().to_string();
        let ts = now_ms();
        let results_json = serde_json::to_string(
            &results
                .iter()
                .map(|r| serde_json::json!({
                    "doc_name":    r.document_name,
                    "source_type": r.source_type,
                    "similarity":  r.similarity,
                    "snippet":     r.content.chars().take(200).collect::<String>(),
                }))
                .collect::<Vec<_>>(),
        )
        .unwrap_or_else(|_| "[]".to_string());

        if let Ok(conn) = db::open(&db_path) {
            let _ = conn.execute(
                "INSERT INTO kb_activity (id, query, result_count, results_json, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![activity_id, query, results.len() as i64, results_json, ts],
            );
        }
    }

    Ok(results)
}

/// Debug search — same pipeline as kb_search but returns semantic_score and
/// keyword_score fields for each result, plus ALL candidates above a 0.05
/// cosine threshold (capped at 20) so the UI can display score distributions.
#[tauri::command]
pub async fn kb_debug_search(
    app: AppHandle,
    query: String,
    top_k: Option<usize>,
) -> Result<Vec<search::KbSearchResult>, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();
    let k = top_k.unwrap_or(10).min(20);

    if embed_config.provider == "none" {
        return search::keyword_search(&db_path, &query, k);
    }

    match search::debug_search(&db_path, &embed_config, &query, k).await {
        Ok(r) => Ok(r),
        Err(_) => search::keyword_search(&db_path, &query, k),
    }
}

// ── Activity feed ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbActivityEntry {
    pub id: String,
    pub query: String,
    pub result_count: i64,
    pub results: Vec<KbActivityResult>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbActivityResult {
    pub doc_name: String,
    pub source_type: String,
    pub similarity: f32,
    pub snippet: String,
}

/// Return the most recent activity entries (default limit: 50).
#[tauri::command]
pub fn kb_get_activity(app: AppHandle, limit: Option<i64>) -> Result<Vec<KbActivityEntry>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let n = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, query, result_count, results_json, created_at \
             FROM kb_activity ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let entries = stmt
        .query_map(params![n], |row| {
            let json: String = row.get(3)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                json,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(id, query, result_count, json, created_at)| {
            let results: Vec<KbActivityResult> = serde_json::from_str(&json)
                .unwrap_or_default();
            KbActivityEntry { id, query, result_count, results, created_at }
        })
        .collect();

    Ok(entries)
}

/// Clear all activity history.
#[tauri::command]
pub fn kb_clear_activity(app: AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute("DELETE FROM kb_activity", [])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

/// List all ingested documents ordered by creation date (newest first).
#[tauri::command]
pub fn kb_list_documents(app: AppHandle) -> Result<Vec<KbDocument>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, source_type, access_level, chunk_count, created_at, updated_at \
             FROM kb_documents ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let docs = stmt
        .query_map([], |row| {
            Ok(KbDocument {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(2)?,
                access_level: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "internal".to_string()),
                chunk_count: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(docs)
}

/// Delete a document and cascade-delete all its chunks.
#[tauri::command]
pub fn kb_delete_document(app: AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute("DELETE FROM kb_documents WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

/// Return all chunks for a specific document in order, for full-document operations like summarization.
#[tauri::command]
pub fn kb_get_document_chunks(app: AppHandle, document_id: String) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT content FROM kb_chunks WHERE document_id = ?1 ORDER BY chunk_index ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;
    let chunks: Vec<String> = stmt
        .query_map(params![document_id], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(chunks)
}

/// Return document count, total chunk count, and how many chunks have embeddings.
#[tauri::command]
pub fn kb_get_stats(app: AppHandle) -> Result<KbStats, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let doc_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM kb_documents", [], |r| r.get(0))
        .unwrap_or(0);
    let chunk_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM kb_chunks", [], |r| r.get(0))
        .unwrap_or(0);
    let embedded_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM kb_chunks WHERE embedding IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(KbStats {
        document_count: doc_count,
        chunk_count,
        embedded_count,
    })
}

/// Persist a new embedding provider configuration.
#[tauri::command]
pub fn kb_set_embed_config(
    app: AppHandle,
    config: embed::KbEmbedConfig,
) -> Result<(), String> {
    *app.state::<KbState>().embed_config.lock().unwrap() = config;
    Ok(())
}

/// Return the current embedding provider configuration.
#[tauri::command]
pub fn kb_get_embed_config(app: AppHandle) -> Result<embed::KbEmbedConfig, String> {
    Ok(app.state::<KbState>().embed_config.lock().unwrap().clone())
}

// ── Re-embed all chunks ───────────────────────────────────────────────────────

/// Re-embed every chunk that currently has no embedding (or all chunks if force=true).
/// Emits "kb-reembed-progress" events: { current, total }.
#[tauri::command]
pub async fn kb_reembed_all(app: AppHandle, force: Option<bool>) -> Result<usize, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();

    let filter = if force.unwrap_or(false) {
        "SELECT id, content FROM kb_chunks"
    } else {
        "SELECT id, content FROM kb_chunks WHERE embedding IS NULL"
    };

    let chunk_rows: Vec<(String, String)> = {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        let mut stmt = conn.prepare(filter).map_err(|e| format!("Query error: {}", e))?;
        let rows: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| format!("Query error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let total = chunk_rows.len();
    let mut done = 0usize;

    for (chunk_id, content) in &chunk_rows {
        match embed::embed_text(&embed_config, content).await {
            Ok(vec) => {
                let blob = embed::vec_to_blob(&vec);
                let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
                conn.execute(
                    "UPDATE kb_chunks SET embedding = ?1 WHERE id = ?2",
                    params![blob, chunk_id],
                )
                .map_err(|e| format!("Update error: {}", e))?;
                done += 1;
            }
            Err(e) => {
                error!("Re-embed chunk {} failed: {}", chunk_id, e);
            }
        }

        let _ = app.emit(
            "kb-reembed-progress",
            serde_json::json!({ "current": done, "total": total }),
        );
    }

    Ok(done)
}

// ── Phase 2: URL ingestion ────────────────────────────────────────────────────

/// Crawl a URL, extract text, and ingest it into the knowledge base.
#[tauri::command]
pub async fn kb_ingest_url(app: AppHandle, url: String) -> Result<KbDocument, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();

    let _ = app.emit(
        "kb-ingest-progress",
        serde_json::json!({ "step": "crawling", "name": &url }),
    );

    let (title, text) = crawler::fetch_url(&url).await?;
    let name = if title.trim().is_empty() {
        url.clone()
    } else {
        title
    };

    if text.trim().is_empty() {
        return Err("No content could be extracted from this URL".to_string());
    }

    let chunks = ingest::chunk_text(&text);
    let doc_id = Uuid::new_v4().to_string();
    let hash = content_hash(url.as_bytes());
    let ts = now_ms();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB open error: {}", e))?;
        conn.execute(
            "INSERT OR REPLACE INTO kb_documents \
             (id, name, source_type, content_hash, chunk_count, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![doc_id, name, "url", hash, chunks.len() as i64, ts, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_id = Uuid::new_v4().to_string();

        let _ = app.emit(
            "kb-ingest-progress",
            serde_json::json!({
                "step": "embedding",
                "name": &name,
                "current": i + 1,
                "total": chunks.len(),
            }),
        );

        let embedding_blob = match embed::embed_text(&embed_config, chunk).await {
            Ok(vec) => Some(embed::vec_to_blob(&vec)),
            Err(e) => {
                error!("Embedding chunk {} failed: {}", i, e);
                None
            }
        };

        let conn = db::open(&db_path).map_err(|e| format!("DB open error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_chunks (id, document_id, content, chunk_index, embedding) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![chunk_id, doc_id, chunk, i as i64, embedding_blob],
        )
        .map_err(|e| format!("Chunk insert error: {}", e))?;
    }

    let _ = app.emit(
        "kb-ingest-progress",
        serde_json::json!({ "step": "done", "name": &name }),
    );

    Ok(KbDocument {
        id: doc_id,
        name,
        source_type: "url".to_string(),
        access_level: "internal".to_string(),
        chunk_count: chunks.len() as i64,
        created_at: ts,
        updated_at: ts,
    })
}

// ── Phase 2: Watched folders ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbWatchedFolder {
    pub id: String,
    pub path: String,
    pub created_at: i64,
}

/// Add a folder to the watched list and (re)start the filesystem watcher.
#[tauri::command]
pub fn kb_add_watched_folder(app: AppHandle, path: String) -> Result<KbWatchedFolder, String> {
    let db_path = get_db_path(&app)?;
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT OR IGNORE INTO kb_watched_folders (id, path, created_at) VALUES (?1, ?2, ?3)",
            params![id, path, ts],
        )
        .map_err(|e| format!("Insert error: {}", e))?;
    }

    watcher::restart_watcher(app.app_handle());

    Ok(KbWatchedFolder {
        id,
        path,
        created_at: ts,
    })
}

/// Remove a watched folder by its id and restart the watcher.
#[tauri::command]
pub fn kb_remove_watched_folder(app: AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "DELETE FROM kb_watched_folders WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Delete error: {}", e))?;
    }

    watcher::restart_watcher(app.app_handle());
    Ok(())
}

/// List all currently watched folders.
#[tauri::command]
pub fn kb_list_watched_folders(app: AppHandle) -> Result<Vec<KbWatchedFolder>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, path, created_at FROM kb_watched_folders ORDER BY created_at ASC")
        .map_err(|e| format!("Query error: {}", e))?;

    let folders = stmt
        .query_map([], |row| {
            Ok(KbWatchedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(folders)
}

// ── Phase 2: OAuth integrations ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbIntegration {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub last_synced_at: Option<i64>,
    pub sync_interval_hours: Option<i64>,
    pub created_at: i64,
}

/// Connect a provider via OAuth (notion / gdrive / sharepoint).
/// For Confluence (Basic auth), use kb_add_confluence instead.
#[tauri::command]
pub async fn kb_connect_integration(
    app: AppHandle,
    provider: String,
    client_id: String,
    client_secret: String,
    // Only required for SharePoint: "common", "organizations", or a tenant GUID/domain.
    tenant: Option<String>,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    let (access_token, refresh_token, expires_in, display_name) = match provider.as_str() {
        "notion" => {
            integrations::notion::connect(&app, &client_id, &client_secret).await?
        }
        "gdrive" => {
            integrations::gdrive::connect(&app, &client_id, &client_secret).await?
        }
        "sharepoint" => {
            let t = tenant.as_deref().unwrap_or("common");
            integrations::sharepoint::connect(&app, &client_id, &client_secret, t).await?
        }
        other => return Err(format!("Unknown provider: {}", other)),
    };

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let expires_at: Option<i64> = expires_in.map(|secs| ts + (secs as i64 * 1000));
    let config = serde_json::json!({ "client_id": client_id }).to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations \
             (id, provider, name, access_token, refresh_token, token_expires_at, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                provider,
                display_name,
                access_token,
                refresh_token,
                expires_at,
                config,
                ts,
            ],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider,
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

/// Add a Confluence integration using Basic auth (email + API token).
#[tauri::command]
pub async fn kb_add_confluence(
    app: AppHandle,
    base_url: String,
    email: String,
    api_token: String,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    // Verify credentials before saving
    let display_name = integrations::confluence::verify(&base_url, &email, &api_token).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let config = serde_json::json!({
        "base_url": base_url,
        "email": email,
        "api_token": api_token,
    })
    .to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations \
             (id, provider, name, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                integrations::confluence::PROVIDER,
                display_name,
                config,
                ts,
            ],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::confluence::PROVIDER.to_string(),
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

/// List all connected integrations.
#[tauri::command]
pub fn kb_list_integrations(app: AppHandle) -> Result<Vec<KbIntegration>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, provider, name, last_synced_at, sync_interval_hours, created_at \
             FROM kb_integrations ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let integrations = stmt
        .query_map([], |row| {
            Ok(KbIntegration {
                id: row.get(0)?,
                provider: row.get(1)?,
                name: row.get(2)?,
                last_synced_at: row.get(3)?,
                sync_interval_hours: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(integrations)
}

/// Disconnect (delete) an integration by id.
#[tauri::command]
pub fn kb_disconnect_integration(app: AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "DELETE FROM kb_integrations WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

/// Sync an integration: fetch all content and ingest into the knowledge base.
#[tauri::command]
pub async fn kb_sync_integration(app: AppHandle, id: String) -> Result<usize, String> {
    let db_path = get_db_path(&app)?;
    let embed_config = app.state::<KbState>().embed_config.lock().unwrap().clone();

    // Load integration record
    let (provider, access_token, config_json) = {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        let row: (String, Option<String>, String) = conn
            .query_row(
                "SELECT provider, access_token, config FROM kb_integrations WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| format!("Integration {} not found ({})", id, e))?;
        row
    };

    let config: serde_json::Value =
        serde_json::from_str(&config_json).unwrap_or(serde_json::json!({}));

    // Fetch pages/files from the provider
    let pages: Vec<(String, String)> = match provider.as_str() {
        "notion" => {
            let token = access_token.ok_or("No access token for Notion")?;
            integrations::notion::fetch_all_pages(&token).await?
        }
        "gdrive" => {
            let token = access_token.ok_or("No access token for Google Drive")?;
            integrations::gdrive::fetch_all_files(&token).await?
        }
        "sharepoint" => {
            let token = access_token.ok_or("No access token for SharePoint")?;
            integrations::sharepoint::fetch_all_files(&token).await?
        }
        "confluence" => {
            let base_url = config["base_url"].as_str().ok_or("Missing base_url")?;
            let email = config["email"].as_str().ok_or("Missing email")?;
            let api_token = config["api_token"].as_str().ok_or("Missing api_token")?;
            integrations::confluence::fetch_all_pages(base_url, email, api_token).await?
        }
        "jira" => {
            let base_url = config["base_url"].as_str().ok_or("Missing base_url")?;
            let email = config["email"].as_str().ok_or("Missing email")?;
            let api_token = config["api_token"].as_str().ok_or("Missing api_token")?;
            integrations::jira::fetch_all_issues(base_url, email, api_token).await?
        }
        "shopify" => {
            let shop_domain = config["shop_domain"].as_str().ok_or("Missing shop_domain")?;
            let token = access_token.ok_or("No access token for Shopify")?;
            integrations::shopify::fetch_all_content(shop_domain, &token).await?
        }
        "salesforce" => {
            let instance_url = config["instance_url"].as_str().ok_or("Missing instance_url")?;
            let token = access_token.ok_or("No access token for Salesforce")?;
            integrations::salesforce::fetch_all_records(&token, instance_url).await?
        }
        "github" => {
            let owner = config["owner"].as_str().ok_or("Missing owner")?;
            let repo = config["repo"].as_str();
            let token = access_token.ok_or("No access token for GitHub")?;
            integrations::github::fetch_all_content(&token, owner, repo).await?
        }
        "gitlab" => {
            let gitlab_url = config["gitlab_url"].as_str().unwrap_or("https://gitlab.com");
            let project_id = config["project_id"].as_str().ok_or("Missing project_id")?;
            let token = access_token.ok_or("No access token for GitLab")?;
            integrations::gitlab::fetch_all_content(&token, gitlab_url, project_id).await?
        }
        "postgres" | "mysql" => {
            // For databases: snapshot the schema so the AI knows the structure
            let raw_token = access_token.unwrap_or_default();
            let password = deobfuscate_token(&raw_token).unwrap_or(raw_token);
            let schema = integrations::database::get_schema(&password, &config).await?;
            let alias = config["alias"].as_str().unwrap_or(&provider);
            vec![(format!("Schema: {}", alias), schema)]
        }
        other => return Err(format!("Unknown provider: {}", other)),
    };

    let total = pages.len();
    let source_type = format!("integration:{}", provider);

    // Ingest each page
    for (page_name, text) in &pages {
        if text.trim().is_empty() {
            continue;
        }
        let chunks = ingest::chunk_text(text);
        let doc_id = Uuid::new_v4().to_string();
        let hash = content_hash(format!("{}:{}", id, page_name).as_bytes());
        let ts = now_ms();

        {
            let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
            conn.execute(
                "INSERT OR REPLACE INTO kb_documents \
                 (id, name, source_type, content_hash, chunk_count, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![doc_id, page_name, source_type, hash, chunks.len() as i64, ts, ts],
            )
            .map_err(|e| format!("DB insert error: {}", e))?;
        }

        for (i, chunk) in chunks.iter().enumerate() {
            let chunk_id = Uuid::new_v4().to_string();
            let embedding_blob = match embed::embed_text(&embed_config, chunk).await {
                Ok(vec) => Some(embed::vec_to_blob(&vec)),
                Err(e) => {
                    error!("Embedding failed for {} chunk {}: {}", page_name, i, e);
                    None
                }
            };

            let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
            conn.execute(
                "INSERT INTO kb_chunks (id, document_id, content, chunk_index, embedding) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![chunk_id, doc_id, chunk, i as i64, embedding_blob],
            )
            .map_err(|e| format!("Chunk insert error: {}", e))?;
        }
    }

    // Update last_synced_at
    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "UPDATE kb_integrations SET last_synced_at = ?1 WHERE id = ?2",
            params![now_ms(), id],
        )
        .map_err(|e| format!("Update error: {}", e))?;
    }

    Ok(total)
}

// ── Phase 4: Jira integration ─────────────────────────────────────────────────

/// Add a Jira integration using Basic auth (email + API token).
#[tauri::command]
pub async fn kb_add_jira(
    app: AppHandle,
    base_url: String,
    email: String,
    api_token: String,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    let display_name = integrations::jira::verify(&base_url, &email, &api_token).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let config = serde_json::json!({
        "base_url": base_url,
        "email": email,
        "api_token": api_token,
    })
    .to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, config, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, integrations::jira::PROVIDER, display_name, config, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::jira::PROVIDER.to_string(),
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

// ── Phase 4: Sync interval ────────────────────────────────────────────────────

/// Set (or clear) the auto-sync interval for an integration.
/// Pass hours = 0 to disable auto-sync.
#[tauri::command]
pub fn kb_set_sync_interval(app: AppHandle, id: String, hours: u32) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let hours_val: Option<u32> = if hours == 0 { None } else { Some(hours) };
    conn.execute(
        "UPDATE kb_integrations SET sync_interval_hours = ?1 WHERE id = ?2",
        params![hours_val, id],
    )
    .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

// ── Phase 4: Webhooks ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbWebhook {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub url: String,
    pub created_at: i64,
}

/// Add a Slack or Teams incoming webhook.
#[tauri::command]
pub fn kb_add_webhook(
    app: AppHandle,
    name: String,
    provider: String,
    url: String,
) -> Result<KbWebhook, String> {
    let db_path = get_db_path(&app)?;
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();

    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "INSERT INTO kb_webhooks (id, name, provider, url, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, provider, url, ts],
    )
    .map_err(|e| format!("DB insert error: {}", e))?;

    Ok(KbWebhook { id, name, provider, url, created_at: ts })
}

/// List all configured webhooks.
#[tauri::command]
pub fn kb_list_webhooks(app: AppHandle) -> Result<Vec<KbWebhook>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, name, provider, url, created_at FROM kb_webhooks ORDER BY created_at ASC")
        .map_err(|e| format!("Query error: {}", e))?;

    let hooks = stmt
        .query_map([], |row| {
            Ok(KbWebhook {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                url: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hooks)
}

/// Remove a webhook by id.
#[tauri::command]
pub fn kb_remove_webhook(app: AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute("DELETE FROM kb_webhooks WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

/// Post a message to a webhook (Slack or Teams).
#[tauri::command]
pub async fn kb_post_webhook(app: AppHandle, id: String, message: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;

    let (provider, url) = {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.query_row(
            "SELECT provider, url FROM kb_webhooks WHERE id = ?1",
            params![id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("Webhook {} not found", id))?
    };

    let payload = match provider.as_str() {
        "teams" => serde_json::json!({ "text": message }),
        _ => serde_json::json!({ "text": message }), // Slack format
    };

    reqwest::Client::new()
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Webhook post failed: {}", e))?;

    Ok(())
}

// ── Phase 4: Export CSV ───────────────────────────────────────────────────────

/// Export the document list as a CSV string.
#[tauri::command]
pub fn kb_export_csv(app: AppHandle) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT name, source_type, access_level, chunk_count, created_at, updated_at \
             FROM kb_documents ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let mut out = Vec::new();
    let mut wtr = csv::Writer::from_writer(&mut out);
    wtr.write_record(["name", "source_type", "access_level", "chunk_count", "created_at", "updated_at"])
        .map_err(|e| format!("CSV write error: {}", e))?;

    let rows: Vec<(String, String, String, i64, i64, i64)> = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for (name, source_type, access_level, chunk_count, created_at, updated_at) in rows {
        wtr.write_record([
            &name,
            &source_type,
            &access_level,
            &chunk_count.to_string(),
            &created_at.to_string(),
            &updated_at.to_string(),
        ])
        .map_err(|e| format!("CSV write error: {}", e))?;
    }

    wtr.flush().map_err(|e| format!("CSV flush error: {}", e))?;
    drop(wtr);

    String::from_utf8(out).map_err(|e| format!("UTF-8 error: {}", e))
}

// ── Phase 4: Per-document access control ─────────────────────────────────────

/// Set the access level for a document.
/// Valid levels: "public", "internal", "confidential", "secret"
#[tauri::command]
pub fn kb_set_document_access(
    app: AppHandle,
    id: String,
    access_level: String,
) -> Result<(), String> {
    let valid = ["public", "internal", "confidential", "secret"];
    if !valid.contains(&access_level.as_str()) {
        return Err(format!("Invalid access level: {}", access_level));
    }

    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    conn.execute(
        "UPDATE kb_documents SET access_level = ?1 WHERE id = ?2",
        params![access_level, id],
    )
    .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

// ── Phase 5: Shopify integration ──────────────────────────────────────────────

/// Add a Shopify integration using an Admin API access token.
#[tauri::command]
pub async fn kb_add_shopify(
    app: AppHandle,
    shop_domain: String,
    access_token: String,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    let shop_name = integrations::shopify::verify(&shop_domain, &access_token).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let config = serde_json::json!({ "shop_domain": shop_domain }).to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::shopify::PROVIDER, shop_name, access_token, config, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::shopify::PROVIDER.to_string(),
        name: shop_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

// ── Phase 5: Salesforce integration ──────────────────────────────────────────

/// Connect Salesforce via OAuth. Opens the browser for OAuth authorization.
#[tauri::command]
pub async fn kb_add_salesforce(
    app: AppHandle,
    client_id: String,
    client_secret: String,
    instance_url: String,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    let (access_token, refresh_token, _expires_in, name) =
        integrations::salesforce::connect(&app, &client_id, &client_secret, &instance_url).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let config = serde_json::json!({
        "instance_url": instance_url,
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    })
    .to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::salesforce::PROVIDER, name, access_token, config, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::salesforce::PROVIDER.to_string(),
        name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

// ── Phase 5: GitHub integration ───────────────────────────────────────────────

/// Add a GitHub integration using a Personal Access Token.
/// `repo` is optional — if omitted, all repos for `owner` are fetched.
#[tauri::command]
pub async fn kb_add_github(
    app: AppHandle,
    token: String,
    owner: String,
    repo: Option<String>,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;

    let login = integrations::github::verify(&token).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let display_name = match &repo {
        Some(r) => format!("GitHub: {}/{}", owner, r),
        None => format!("GitHub: {}", owner),
    };
    let config = serde_json::json!({
        "owner": owner,
        "repo": repo,
        "login": login,
    })
    .to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::github::PROVIDER, display_name, token, config, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::github::PROVIDER.to_string(),
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

// ── Built-in credential check ─────────────────────────────────────────────────

/// Returns the list of providers that have built-in OAuth credentials configured.
/// The frontend uses this to decide whether to show "Connect with X" vs custom-credential forms.
#[tauri::command]
pub async fn kb_list_builtin_providers() -> Vec<String> {
    use super::oauth_apps::fetch_oauth_config;
    let config = fetch_oauth_config().await;
    let mut out = Vec::new();
    if config.get("github_client_id").map(|v| !v.is_empty()).unwrap_or(false) { out.push("github".to_string()); }
    if config.get("notion_client_id").map(|v| !v.is_empty()).unwrap_or(false) { out.push("notion".to_string()); }
    if config.get("google_client_id").map(|v| !v.is_empty()).unwrap_or(false) { out.push("gdrive".to_string()); out.push("google_calendar".to_string()); }
    if config.get("salesforce_client_id").map(|v| !v.is_empty()).unwrap_or(false) { out.push("salesforce".to_string()); }
    if config.get("sharepoint_client_id").map(|v| !v.is_empty()).unwrap_or(false) { out.push("sharepoint".to_string()); }
    out
}

// ── GitHub Device Flow connect ────────────────────────────────────────────────

/// Connect GitHub via Device Flow (no PAT needed).
/// Opens the browser automatically and polls until the user authorizes.
/// Emits "github-device-code" event with { user_code, verification_uri } for the UI.
#[tauri::command]
pub async fn kb_github_device_connect(
    app: AppHandle,
    owner: String,
    repo: Option<String>,
) -> Result<KbIntegration, String> {
    use super::oauth_apps::fetch_oauth_config;
    let config = fetch_oauth_config().await;
    let github_client_id = config.get("github_client_id").cloned().unwrap_or_default();

    if github_client_id.is_empty() {
        return Err("GitHub Device Flow is not configured (add github_client_id in admin settings)".to_string());
    }

    let db_path = get_db_path(&app)?;

    let (token, login) = integrations::github::device_flow_connect(
        &app,
        &github_client_id,
        &owner,
        repo.as_deref(),
    )
    .await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let display_name = match &repo {
        Some(r) => format!("GitHub: {}/{}", owner, r),
        None => format!("GitHub: {}", owner),
    };
    let config = serde_json::json!({
        "owner": owner,
        "repo": repo,
        "login": login,
    })
    .to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::github::PROVIDER, display_name, token, config, ts],
        )
        .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::github::PROVIDER.to_string(),
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

// ── Built-in OAuth connect ────────────────────────────────────────────────────

/// Connect a provider using built-in (hardcoded) OAuth credentials.
/// Supports: notion, gdrive, salesforce, sharepoint.
/// This avoids asking users to supply their own client_id/secret.
#[tauri::command]
pub async fn kb_connect_builtin(
    app: AppHandle,
    provider: String,
    tenant: Option<String>,
) -> Result<KbIntegration, String> {
    use super::oauth_apps::fetch_oauth_config;
    let config = fetch_oauth_config().await;

    let get = |key: &str| config.get(key).cloned().unwrap_or_default();

    match provider.as_str() {
        "notion" => {
            let cid = get("notion_client_id");
            let csec = get("notion_client_secret");
            if cid.is_empty() { return Err("Notion built-in credentials not configured".to_string()); }
            kb_connect_integration(app, provider, cid, csec, None).await
        }
        "gdrive" => {
            let cid = get("google_client_id");
            let csec = get("google_client_secret");
            if cid.is_empty() { return Err("Google Drive built-in credentials not configured".to_string()); }
            kb_connect_integration(app, provider, cid, csec, None).await
        }
        "salesforce" => {
            let cid = get("salesforce_client_id");
            let csec = get("salesforce_client_secret");
            let instance = { let v = get("salesforce_instance"); if v.is_empty() { "https://login.salesforce.com".to_string() } else { v } };
            if cid.is_empty() { return Err("Salesforce built-in credentials not configured".to_string()); }
            kb_add_salesforce(app, cid, csec, instance).await
        }
        "sharepoint" => {
            let cid = get("sharepoint_client_id");
            let csec = get("sharepoint_client_secret");
            let default_tenant = { let v = get("sharepoint_tenant"); if v.is_empty() { "common".to_string() } else { v } };
            if cid.is_empty() { return Err("SharePoint built-in credentials not configured".to_string()); }
            let t = tenant.unwrap_or(default_tenant);
            kb_connect_integration(app, provider, cid, csec, Some(t)).await
        }
        other => Err(format!("Provider '{}' does not support built-in OAuth", other)),
    }
}

// ── GitLab ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_add_gitlab(
    app: AppHandle,
    token: String,
    gitlab_url: String,
    project_id: String,
) -> Result<KbIntegration, String> {
    let db_path = get_db_path(&app)?;
    let login = integrations::gitlab::verify(&token, &gitlab_url).await?;
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let display_name = format!("GitLab: {}", project_id);
    let config = serde_json::json!({
        "gitlab_url": gitlab_url,
        "project_id": project_id,
        "login": login,
    }).to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::gitlab::PROVIDER, display_name, token, config, ts],
        ).map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration {
        id,
        provider: integrations::gitlab::PROVIDER.to_string(),
        name: display_name,
        last_synced_at: None,
        sync_interval_hours: None,
        created_at: ts,
    })
}

#[tauri::command]
pub async fn kb_gitlab_create_issue(
    app: AppHandle,
    integration_id: String,
    title: String,
    description: String,
    labels: Option<Vec<String>>,
    assignees: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let (token, gitlab_url, project_id) = get_gitlab_config(&app, &integration_id)?;
    let issue = integrations::gitlab::create_issue(
        &token, &gitlab_url, &project_id, &title, &description, labels, assignees,
    ).await?;
    Ok(serde_json::to_value(issue).unwrap())
}

#[tauri::command]
pub async fn kb_gitlab_update_issue(
    app: AppHandle,
    integration_id: String,
    issue_iid: u64,
    title: Option<String>,
    description: Option<String>,
    state_event: Option<String>,
    labels: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let (token, gitlab_url, project_id) = get_gitlab_config(&app, &integration_id)?;
    let issue = integrations::gitlab::update_issue(
        &token, &gitlab_url, &project_id, issue_iid,
        title.as_deref(), description.as_deref(), state_event.as_deref(), labels,
    ).await?;
    Ok(serde_json::to_value(issue).unwrap())
}

#[tauri::command]
pub async fn kb_gitlab_comment_issue(
    app: AppHandle,
    integration_id: String,
    issue_iid: u64,
    body: String,
) -> Result<String, String> {
    let (token, gitlab_url, project_id) = get_gitlab_config(&app, &integration_id)?;
    integrations::gitlab::comment_issue(&token, &gitlab_url, &project_id, issue_iid, &body).await
}

#[tauri::command]
pub async fn kb_gitlab_create_mr(
    app: AppHandle,
    integration_id: String,
    title: String,
    source_branch: String,
    target_branch: String,
    description: String,
) -> Result<serde_json::Value, String> {
    let (token, gitlab_url, project_id) = get_gitlab_config(&app, &integration_id)?;
    let mr = integrations::gitlab::create_merge_request(
        &token, &gitlab_url, &project_id, &title, &source_branch, &target_branch, &description,
    ).await?;
    Ok(serde_json::to_value(mr).unwrap())
}

#[tauri::command]
pub async fn kb_gitlab_upsert_file(
    app: AppHandle,
    integration_id: String,
    file_path: String,
    content: String,
    branch: String,
    commit_message: String,
) -> Result<String, String> {
    let (token, gitlab_url, project_id) = get_gitlab_config(&app, &integration_id)?;
    integrations::gitlab::upsert_file(
        &token, &gitlab_url, &project_id, &file_path, &content, &branch, &commit_message,
    ).await
}

/// Helper: load token + config for a GitLab integration from DB.
fn get_gitlab_config(app: &AppHandle, integration_id: &str) -> Result<(String, String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'gitlab'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "GitLab integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str)
        .map_err(|e| format!("Config parse error: {}", e))?;
    let gitlab_url = config["gitlab_url"].as_str().unwrap_or("https://gitlab.com").to_string();
    let project_id = config["project_id"].as_str().unwrap_or("").to_string();
    Ok((token, gitlab_url, project_id))
}

// ── GitHub write ──────────────────────────────────────────────────────────────

fn get_github_config(app: &AppHandle, integration_id: &str) -> Result<(String, String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'github'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "GitHub integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let owner = config["owner"].as_str().unwrap_or("").to_string();
    let repo = config["repo"].as_str().unwrap_or("").to_string();
    Ok((token, owner, repo))
}

#[tauri::command]
pub async fn kb_github_create_issue(app: AppHandle, integration_id: String, title: String, body: String, labels: Option<Vec<String>>, assignees: Option<Vec<String>>) -> Result<serde_json::Value, String> {
    let (token, owner, repo) = get_github_config(&app, &integration_id)?;
    integrations::github::create_issue(&token, &owner, &repo, &title, &body, labels, assignees).await
}

#[tauri::command]
pub async fn kb_github_update_issue(app: AppHandle, integration_id: String, issue_number: u64, title: Option<String>, body: Option<String>, state: Option<String>) -> Result<serde_json::Value, String> {
    let (token, owner, repo) = get_github_config(&app, &integration_id)?;
    integrations::github::update_issue(&token, &owner, &repo, issue_number, title.as_deref(), body.as_deref(), state.as_deref()).await
}

#[tauri::command]
pub async fn kb_github_add_comment(app: AppHandle, integration_id: String, issue_number: u64, body: String) -> Result<serde_json::Value, String> {
    let (token, owner, repo) = get_github_config(&app, &integration_id)?;
    integrations::github::add_comment(&token, &owner, &repo, issue_number, &body).await
}

#[tauri::command]
pub async fn kb_github_create_pr(app: AppHandle, integration_id: String, title: String, head: String, base: String, body: String) -> Result<serde_json::Value, String> {
    let (token, owner, repo) = get_github_config(&app, &integration_id)?;
    integrations::github::create_pull_request(&token, &owner, &repo, &title, &head, &base, &body).await
}

// ── Jira write ────────────────────────────────────────────────────────────────

fn get_jira_config(app: &AppHandle, integration_id: &str) -> Result<(String, String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'jira'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Jira integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let base_url = config["base_url"].as_str().unwrap_or("").to_string();
    let email = config["email"].as_str().unwrap_or("").to_string();
    Ok((token, base_url, email))
}

#[tauri::command]
pub async fn kb_jira_create_issue(app: AppHandle, integration_id: String, project_key: String, summary: String, description: String, issue_type: String) -> Result<serde_json::Value, String> {
    let (token, base_url, email) = get_jira_config(&app, &integration_id)?;
    integrations::jira::create_issue(&base_url, &email, &token, &project_key, &summary, &description, &issue_type).await
}

#[tauri::command]
pub async fn kb_jira_update_issue(app: AppHandle, integration_id: String, issue_key: String, summary: Option<String>, description: Option<String>) -> Result<serde_json::Value, String> {
    let (token, base_url, email) = get_jira_config(&app, &integration_id)?;
    integrations::jira::update_issue(&base_url, &email, &token, &issue_key, summary.as_deref(), description.as_deref()).await
}

#[tauri::command]
pub async fn kb_jira_add_comment(app: AppHandle, integration_id: String, issue_key: String, body: String) -> Result<serde_json::Value, String> {
    let (token, base_url, email) = get_jira_config(&app, &integration_id)?;
    integrations::jira::add_comment(&base_url, &email, &token, &issue_key, &body).await
}

#[tauri::command]
pub async fn kb_jira_transition_issue(app: AppHandle, integration_id: String, issue_key: String, transition_name: String) -> Result<(), String> {
    let (token, base_url, email) = get_jira_config(&app, &integration_id)?;
    integrations::jira::transition_issue(&base_url, &email, &token, &issue_key, &transition_name).await
}

// ── Confluence write ──────────────────────────────────────────────────────────

fn get_confluence_config(app: &AppHandle, integration_id: &str) -> Result<(String, String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'confluence'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Confluence integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let base_url = config["base_url"].as_str().unwrap_or("").to_string();
    let email = config["email"].as_str().unwrap_or("").to_string();
    Ok((token, base_url, email))
}

#[tauri::command]
pub async fn kb_confluence_create_page(app: AppHandle, integration_id: String, space_key: String, title: String, body_html: String, parent_id: Option<String>) -> Result<serde_json::Value, String> {
    let (token, base_url, email) = get_confluence_config(&app, &integration_id)?;
    integrations::confluence::create_page(&base_url, &email, &token, &space_key, &title, &body_html, parent_id.as_deref()).await
}

#[tauri::command]
pub async fn kb_confluence_update_page(app: AppHandle, integration_id: String, page_id: String, title: String, body_html: String, version: u64) -> Result<serde_json::Value, String> {
    let (token, base_url, email) = get_confluence_config(&app, &integration_id)?;
    integrations::confluence::update_page(&base_url, &email, &token, &page_id, &title, &body_html, version).await
}

// ── Notion write ──────────────────────────────────────────────────────────────

fn get_notion_token(app: &AppHandle, integration_id: &str) -> Result<String, String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let token: String = conn.query_row(
        "SELECT access_token FROM kb_integrations WHERE id = ?1 AND provider = 'notion'",
        params![integration_id],
        |row| row.get(0),
    ).map_err(|_| "Notion integration not found".to_string())?;
    Ok(token)
}

#[tauri::command]
pub async fn kb_notion_create_page(app: AppHandle, integration_id: String, parent_page_id: String, title: String, content: String) -> Result<serde_json::Value, String> {
    let token = get_notion_token(&app, &integration_id)?;
    integrations::notion::create_page(&token, &parent_page_id, &title, &content).await
}

#[tauri::command]
pub async fn kb_notion_append_content(app: AppHandle, integration_id: String, page_id: String, content: String) -> Result<(), String> {
    let token = get_notion_token(&app, &integration_id)?;
    integrations::notion::append_content(&token, &page_id, &content).await
}

// ── Salesforce write ──────────────────────────────────────────────────────────

fn get_salesforce_config(app: &AppHandle, integration_id: &str) -> Result<(String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'salesforce'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Salesforce integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let instance_url = config["instance_url"].as_str().unwrap_or("").to_string();
    Ok((token, instance_url))
}

#[tauri::command]
pub async fn kb_salesforce_create_record(app: AppHandle, integration_id: String, object_type: String, fields: serde_json::Value) -> Result<serde_json::Value, String> {
    let (token, instance_url) = get_salesforce_config(&app, &integration_id)?;
    integrations::salesforce::create_record(&token, &instance_url, &object_type, fields).await
}

#[tauri::command]
pub async fn kb_salesforce_update_record(app: AppHandle, integration_id: String, object_type: String, record_id: String, fields: serde_json::Value) -> Result<(), String> {
    let (token, instance_url) = get_salesforce_config(&app, &integration_id)?;
    integrations::salesforce::update_record(&token, &instance_url, &object_type, &record_id, fields).await
}

// ── Shopify write ─────────────────────────────────────────────────────────────

fn get_shopify_config(app: &AppHandle, integration_id: &str) -> Result<(String, String), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (token, config_str): (String, String) = conn.query_row(
        "SELECT access_token, config FROM kb_integrations WHERE id = ?1 AND provider = 'shopify'",
        params![integration_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Shopify integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let shop_domain = config["shop_domain"].as_str().unwrap_or("").to_string();
    Ok((token, shop_domain))
}

#[tauri::command]
pub async fn kb_shopify_create_product(app: AppHandle, integration_id: String, title: String, body_html: String, price: String) -> Result<serde_json::Value, String> {
    let (token, shop_domain) = get_shopify_config(&app, &integration_id)?;
    integrations::shopify::create_product(&shop_domain, &token, &title, &body_html, &price).await
}

#[tauri::command]
pub async fn kb_shopify_update_product(app: AppHandle, integration_id: String, product_id: u64, title: Option<String>, body_html: Option<String>) -> Result<serde_json::Value, String> {
    let (token, shop_domain) = get_shopify_config(&app, &integration_id)?;
    integrations::shopify::update_product(&shop_domain, &token, product_id, title.as_deref(), body_html.as_deref()).await
}

// ── Database commands ─────────────────────────────────────────────────────────

/// Add a SQL database integration (PostgreSQL or MySQL).
#[tauri::command]
pub async fn kb_add_database(
    app: AppHandle,
    db_type: String,   // "postgres" | "mysql"
    alias: String,
    host: String,
    port: u64,
    dbname: String,
    username: String,
    password: String,
    ssl: bool,
) -> Result<bool, String> {
    let config = serde_json::json!({
        "db_type": db_type,
        "alias": alias,
        "host": host,
        "port": port,
        "dbname": dbname,
        "username": username,
        "ssl": ssl,
    });

    // Test connectivity
    integrations::database::verify(&password, &config).await?;

    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    // TODO: migrate to tauri-plugin-keychain for proper credential storage
    let obfuscated_pw = obfuscate_token(&password);
    conn.execute(
        "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            db_type,
            format!("{} ({})", alias, dbname),
            obfuscated_pw,
            config.to_string(),
            now_ms(),
        ],
    ).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Get schema for a database integration.
#[tauri::command]
pub async fn kb_database_get_schema(
    app: AppHandle,
    integration_id: String,
) -> Result<String, String> {
    let (password, config) = get_db_config(&app, &integration_id)?;
    integrations::database::get_schema(&password, &config).await
}

/// Execute a SQL query against a database integration.
/// `allow_write` must be true for INSERT/UPDATE/DELETE (requires user confirmation via LAMU_ACTION).
#[tauri::command]
pub async fn kb_database_query(
    app: AppHandle,
    integration_id: String,
    sql: String,
    allow_write: bool,
) -> Result<String, String> {
    let (password, config) = get_db_config(&app, &integration_id)?;
    integrations::database::execute_query(&password, &config, &sql, allow_write).await
}

// ── Google Calendar ───────────────────────────────────────────────────────────

/// Connect Google Calendar via OAuth.
/// Stores the integration in kb_integrations with provider = "google_calendar".
#[tauri::command]
pub async fn kb_connect_calendar(app: AppHandle, client_id: Option<String>, client_secret: Option<String>) -> Result<KbIntegration, String> {
    use super::oauth_apps::fetch_oauth_config;

    let (cid, csec) = if client_id.as_deref().unwrap_or("").is_empty() {
        let config = fetch_oauth_config().await;
        let cid = config.get("google_client_id").cloned().unwrap_or_default();
        let csec = config.get("google_client_secret").cloned().unwrap_or_default();
        (cid, csec)
    } else {
        (client_id.unwrap_or_default(), client_secret.unwrap_or_default())
    };

    if cid.is_empty() {
        return Err("Google Calendar client credentials not configured. Add google_client_id in the admin settings.".to_string());
    }

    let cid = cid.as_str();
    let csec = csec.as_str();

    let db_path = get_db_path(&app)?;
    let (access_token, refresh_token, _expires, name) =
        integrations::calendar::connect(&app, cid, csec).await?;

    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let config = serde_json::json!({
        "client_id": cid,
        "client_secret": csec,
        "refresh_token": refresh_token,
    }).to_string();

    {
        let conn = db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
        conn.execute(
            "INSERT INTO kb_integrations (id, provider, name, access_token, config, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, integrations::calendar::PROVIDER, &name, access_token, config, ts],
        ).map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(KbIntegration { id, provider: integrations::calendar::PROVIDER.to_string(), name, last_synced_at: None, sync_interval_hours: None, created_at: ts })
}

/// Fetch upcoming calendar events (next N events from now).
#[tauri::command]
pub async fn kb_calendar_upcoming(app: AppHandle, max_results: Option<u32>) -> Result<Vec<integrations::calendar::CalendarEvent>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;

    let (token, _config): (String, String) = conn
        .query_row(
            "SELECT access_token, config FROM kb_integrations WHERE provider = ?1 ORDER BY created_at DESC LIMIT 1",
            params![integrations::calendar::PROVIDER],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Google Calendar not connected — connect it first".to_string())?;

    integrations::calendar::fetch_upcoming_events(&token, max_results.unwrap_or(10)).await
}

fn get_db_config(app: &AppHandle, integration_id: &str) -> Result<(String, serde_json::Value), String> {
    let db_path = get_db_path(app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let (token, config_str): (String, String) = conn
        .query_row(
            "SELECT access_token, config FROM kb_integrations WHERE id = ?1",
            params![integration_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Database integration not found".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    // Deobfuscate password — try deobfuscation, fall back to raw value for legacy entries
    let password = deobfuscate_token(&token).unwrap_or(token);
    Ok((password, config))
}

// Simple XOR obfuscation to avoid plaintext passwords in SQLite.
// TODO: replace with tauri-plugin-keychain for proper secure storage.
const OBF_KEY: &[u8] = b"lamu_kb_secret_2026";
const OBF_PREFIX: &str = "obf:";

fn obfuscate_token(plaintext: &str) -> String {
    let xored: Vec<u8> = plaintext.as_bytes().iter().enumerate()
        .map(|(i, b)| b ^ OBF_KEY[i % OBF_KEY.len()])
        .collect();
    format!("{}{}", OBF_PREFIX, base64_encode(&xored))
}

pub fn deobfuscate_token(stored: &str) -> Option<String> {
    if !stored.starts_with(OBF_PREFIX) { return None; }
    let encoded = &stored[OBF_PREFIX.len()..];
    let xored = base64_decode_bytes(encoded)?;
    let plain: Vec<u8> = xored.iter().enumerate()
        .map(|(i, b)| b ^ OBF_KEY[i % OBF_KEY.len()])
        .collect();
    String::from_utf8(plain).ok()
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        let _ = write!(out, "{}", ALPHA[((n >> 18) & 63) as usize] as char);
        let _ = write!(out, "{}", ALPHA[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 { let _ = write!(out, "{}", ALPHA[((n >> 6) & 63) as usize] as char); } else { out.push('='); }
        if chunk.len() > 2 { let _ = write!(out, "{}", ALPHA[(n & 63) as usize] as char); } else { out.push('='); }
    }
    out
}

fn base64_decode_bytes(s: &str) -> Option<Vec<u8>> {
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let lookup: std::collections::HashMap<u8, u8> = ALPHA.iter().enumerate()
        .map(|(i, &c)| (c, i as u8)).collect();
    let bytes: Vec<u8> = s.as_bytes().chunks(4).flat_map(|chunk| {
        if chunk.len() < 4 { return vec![]; }
        let get = |c: u8| *lookup.get(&c).unwrap_or(&0);
        let b0 = (get(chunk[0]) << 2) | (get(chunk[1]) >> 4);
        let b1 = (get(chunk[1]) << 4) | (get(chunk[2]) >> 2);
        let b2 = (get(chunk[2]) << 6) | get(chunk[3]);
        if chunk[2] == b'=' { vec![b0] }
        else if chunk[3] == b'=' { vec![b0, b1] }
        else { vec![b0, b1, b2] }
    }).collect();
    Some(bytes)
}
