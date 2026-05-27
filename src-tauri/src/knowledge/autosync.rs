/// Auto-sync scheduler — runs in the background and periodically syncs
/// integrations that have a sync_interval_hours configured.
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tracing::{error, info};

use super::{db, embed, ingest, integrations};
use crate::KbState;
use rusqlite::params;
use uuid::Uuid;

/// Spawn the background auto-sync loop. Call once at app startup.
pub fn start_autosync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Check every 30 minutes
        let mut interval = tokio::time::interval(Duration::from_secs(30 * 60));
        interval.tick().await; // skip the immediate first tick

        loop {
            interval.tick().await;
            run_due_syncs(&app).await;
        }
    });
}

async fn run_due_syncs(app: &AppHandle) {
    let (db_path, embed_config) = {
        let state = app.state::<KbState>();
        let path = state.db_path.lock().unwrap().clone();
        let cfg = state.embed_config.lock().unwrap().clone();
        match path {
            Some(p) => (p, cfg),
            None => return,
        }
    };

    // Load integrations that have a sync interval and are due
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    #[derive(Debug)]
    struct IntegRow {
        id: String,
        provider: String,
        access_token: Option<String>,
        config: String,
        last_synced_at: Option<i64>,
        sync_interval_hours: i64,
    }

    let due: Vec<IntegRow> = {
        let conn = match db::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                error!("Auto-sync DB open error: {}", e);
                return;
            }
        };
        let mut stmt = match conn.prepare(
            "SELECT id, provider, access_token, config, last_synced_at, sync_interval_hours \
             FROM kb_integrations WHERE sync_interval_hours IS NOT NULL",
        ) {
            Ok(s) => s,
            Err(e) => {
                error!("Auto-sync query error: {}", e);
                return;
            }
        };

        let all_rows: Vec<IntegRow> = match stmt.query_map([], |r| {
            Ok(IntegRow {
                id: r.get(0)?,
                provider: r.get(1)?,
                access_token: r.get(2)?,
                config: r.get(3)?,
                last_synced_at: r.get(4)?,
                sync_interval_hours: r.get(5)?,
            })
        }) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        };

        all_rows
            .into_iter()
            .filter(|row| {
                let interval_ms = row.sync_interval_hours * 3_600_000;
                match row.last_synced_at {
                    None => true,
                    Some(last) => now_ms - last >= interval_ms,
                }
            })
            .collect()
    };

    for row in due {
        info!("Auto-syncing integration {} ({})", row.id, row.provider);

        let config: serde_json::Value =
            serde_json::from_str(&row.config).unwrap_or(serde_json::json!({}));

        let pages: Vec<(String, String)> = match row.provider.as_str() {
            "notion" => match &row.access_token {
                Some(t) => integrations::notion::fetch_all_pages(t).await.unwrap_or_default(),
                None => continue,
            },
            "gdrive" => match &row.access_token {
                Some(t) => integrations::gdrive::fetch_all_files(t).await.unwrap_or_default(),
                None => continue,
            },
            "sharepoint" => match &row.access_token {
                Some(t) => integrations::sharepoint::fetch_all_files(t).await.unwrap_or_default(),
                None => continue,
            },
            "confluence" => {
                let base_url = config["base_url"].as_str().unwrap_or_default();
                let email = config["email"].as_str().unwrap_or_default();
                let api_token = config["api_token"].as_str().unwrap_or_default();
                integrations::confluence::fetch_all_pages(base_url, email, api_token)
                    .await
                    .unwrap_or_default()
            }
            "jira" => {
                let base_url = config["base_url"].as_str().unwrap_or_default();
                let email = config["email"].as_str().unwrap_or_default();
                let api_token = config["api_token"].as_str().unwrap_or_default();
                integrations::jira::fetch_all_issues(base_url, email, api_token)
                    .await
                    .unwrap_or_default()
            }
            "shopify" => {
                let shop_domain = config["shop_domain"].as_str().unwrap_or_default();
                match &row.access_token {
                    Some(t) => integrations::shopify::fetch_all_content(shop_domain, t)
                        .await
                        .unwrap_or_default(),
                    None => continue,
                }
            }
            "salesforce" => {
                let instance_url = config["instance_url"].as_str().unwrap_or_default();
                match &row.access_token {
                    Some(t) => integrations::salesforce::fetch_all_records(t, instance_url)
                        .await
                        .unwrap_or_default(),
                    None => continue,
                }
            }
            "github" => {
                let owner = config["owner"].as_str().unwrap_or_default();
                let repo = config["repo"].as_str();
                match &row.access_token {
                    Some(t) => integrations::github::fetch_all_content(t, owner, repo)
                        .await
                        .unwrap_or_default(),
                    None => continue,
                }
            }
            _ => continue,
        };

        let source_type = format!("integration:{}", row.provider);

        for (page_name, text) in &pages {
            if text.trim().is_empty() {
                continue;
            }
            let chunks = ingest::chunk_text(text);
            let doc_id = Uuid::new_v4().to_string();
            let hash = format!("{}:{}", row.id, page_name);
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;

            if let Ok(conn) = db::open(&db_path) {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO kb_documents \
                     (id, name, source_type, content_hash, chunk_count, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![doc_id, page_name, source_type, hash, chunks.len() as i64, ts, ts],
                );
            }

            for (i, chunk) in chunks.iter().enumerate() {
                let chunk_id = Uuid::new_v4().to_string();
                let embedding = embed::embed_text(&embed_config, chunk)
                    .await
                    .ok()
                    .map(|v| embed::vec_to_blob(&v));

                if let Ok(conn) = db::open(&db_path) {
                    let _ = conn.execute(
                        "INSERT INTO kb_chunks (id, document_id, content, chunk_index, embedding) \
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![chunk_id, doc_id, chunk, i as i64, embedding],
                    );
                }
            }
        }

        // Update last_synced_at
        if let Ok(conn) = db::open(&db_path) {
            let _ = conn.execute(
                "UPDATE kb_integrations SET last_synced_at = ?1 WHERE id = ?2",
                params![now_ms, row.id],
            );
        }

        info!("Auto-sync done for {} — {} pages", row.provider, pages.len());
    }
}
