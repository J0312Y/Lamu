use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info, warn};

use super::{embed::KbEmbedConfig, ingest};
use crate::KbState;

/// Spawn a background thread + tokio task that watches all currently registered
/// folders and auto-ingests new/modified files as they appear.
///
/// Call this once at startup (after DB is ready) and again whenever a folder is
/// added or removed to restart the watcher with the updated folder list.
pub fn start_watcher(app: AppHandle, folders: Vec<PathBuf>, embed_config: KbEmbedConfig) {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<notify::Event>>();

    // Build the filesystem watcher on a dedicated OS thread
    let mut watcher = match RecommendedWatcher::new(
        move |res| {
            let _ = notify_tx.send(res);
        },
        notify::Config::default(),
    ) {
        Ok(w) => w,
        Err(e) => {
            error!("Failed to create filesystem watcher: {}", e);
            return;
        }
    };

    let mut watched_any = false;
    for folder in &folders {
        if folder.exists() {
            match watcher.watch(folder, RecursiveMode::Recursive) {
                Ok(_) => {
                    info!("Watching folder: {}", folder.display());
                    watched_any = true;
                }
                Err(e) => warn!("Cannot watch {}: {}", folder.display(), e),
            }
        } else {
            warn!("Watched folder does not exist: {}", folder.display());
        }
    }

    if !watched_any {
        return;
    }

    // Store the watcher in KbState to keep it alive
    {
        let state = app.state::<KbState>();
        *state.watcher.lock().unwrap() = Some(watcher);
    }

    // Bridge thread: owns a single-threaded tokio runtime so it can drive
    // async file-event handlers without depending on any external runtime.
    let app_clone = app.clone();
    let embed_cfg = embed_config.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("watcher tokio runtime");

        for result in notify_rx {
            match result {
                Ok(event) => {
                    if should_process(&event) {
                        for path in &event.paths {
                            let path = path.clone();
                            let app2 = app_clone.clone();
                            let cfg = embed_cfg.clone();
                            rt.block_on(async move {
                                handle_file_event(app2, path, cfg).await;
                            });
                        }
                    }
                }
                Err(e) => {
                    error!("Watcher error: {}", e);
                }
            }
        }
    });
}

/// Returns true for create/modify events on supported file types.
fn should_process(event: &notify::Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Data(_))
    ) && event.paths.iter().any(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e.to_lowercase().as_str(), "txt" | "md" | "pdf" | "docx" | "csv" | "rst" | "markdown"))
            .unwrap_or(false)
    })
}

async fn handle_file_event(app: AppHandle, path: PathBuf, embed_config: KbEmbedConfig) {
    let state = app.state::<KbState>();
    let db_path = match state.db_path.lock().unwrap().clone() {
        Some(p) => p,
        None => return,
    };

    let filename = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_string(),
        None => return,
    };

    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(e) => {
            warn!("Cannot read file {}: {}", path.display(), e);
            return;
        }
    };

    // Extract and chunk text
    let text = match ingest::extract_text(&filename, &bytes) {
        Ok(t) => t,
        Err(e) => {
            warn!("Text extraction failed for {}: {}", filename, e);
            return;
        }
    };
    let chunks = ingest::chunk_text(&text);
    if chunks.is_empty() {
        return;
    }

    info!("Auto-ingesting {} ({} chunks)", filename, chunks.len());

    // Remove any existing document with the same name (re-ingest)
    if let Ok(conn) = super::db::open(&db_path) {
        let _ = conn.execute(
            "DELETE FROM kb_documents WHERE name = ?1 AND source_type = 'folder'",
            rusqlite::params![filename],
        );
    }

    let doc_id = uuid::Uuid::new_v4().to_string();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    if let Ok(conn) = super::db::open(&db_path) {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO kb_documents \
             (id, name, source_type, content_hash, chunk_count, created_at, updated_at) \
             VALUES (?1, ?2, 'folder', ?3, ?4, ?5, ?6)",
            rusqlite::params![doc_id, filename, "", chunks.len() as i64, ts, ts],
        );
    }

    let _ = app.emit(
        "kb-watcher-event",
        serde_json::json!({ "file": filename, "chunks": chunks.len() }),
    );

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_id = uuid::Uuid::new_v4().to_string();
        let embedding = super::embed::embed_text(&embed_config, chunk)
            .await
            .ok()
            .map(|v| super::embed::vec_to_blob(&v));

        if let Ok(conn) = super::db::open(&db_path) {
            let _ = conn.execute(
                "INSERT INTO kb_chunks (id, document_id, content, chunk_index, embedding) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![chunk_id, doc_id, chunk, i as i64, embedding],
            );
        }
    }
}

/// Restart the watcher by reading the current folder list from the DB and
/// dropping the previous watcher instance.
pub fn restart_watcher(app: &AppHandle) {
    let state = app.state::<KbState>();
    let db_path = match state.db_path.lock().unwrap().clone() {
        Some(p) => p,
        None => return,
    };
    let embed_config = state.embed_config.lock().unwrap().clone();

    // Drop existing watcher first (stops watching)
    *state.watcher.lock().unwrap() = None;

    // Re-read folder list from DB
    let folders: Vec<PathBuf> = match super::db::open(&db_path) {
        Ok(conn) => {
            let mut stmt = conn
                .prepare("SELECT path FROM kb_watched_folders")
                .unwrap();
            stmt.query_map([], |r| r.get::<_, String>(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .map(PathBuf::from)
                .collect()
        }
        Err(_) => return,
    };

    if !folders.is_empty() {
        start_watcher(app.clone(), folders, embed_config);
    }
}
