use super::{db, outlook};
use crate::ContactsState;
use fuzzy_matcher::{skim::SkimMatcherV2, FuzzyMatcher};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Contact {
    pub id: String,
    pub full_name: String,
    pub email: String,
    pub alias: Option<String>,
    pub company: Option<String>,
    pub phone: Option<String>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,
    pub from_name: String,
    pub from_email: String,
    pub tls_mode: String,
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            smtp_host: String::new(),
            smtp_port: 587,
            username: String::new(),
            password: String::new(),
            from_name: String::new(),
            from_email: String::new(),
            tls_mode: "starttls".to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub imported: usize,
    pub skipped: usize,
    pub source: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn get_db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.state::<ContactsState>()
        .db_path
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Contacts DB not initialized".to_string())
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all contacts, ordered by full_name.
#[tauri::command]
pub fn contacts_list(app: AppHandle) -> Result<Vec<Contact>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, full_name, email, alias, company, phone, source
             FROM contacts ORDER BY full_name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let contacts = stmt
        .query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                full_name: row.get(1)?,
                email: row.get(2)?,
                alias: row.get(3)?,
                company: row.get(4)?,
                phone: row.get(5)?,
                source: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(contacts)
}

/// Fuzzy-search contacts by query string.
/// Returns up to `limit` results ranked by match score.
#[tauri::command]
pub fn contacts_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<Contact>, String> {
    let all = contacts_list(app)?;
    if query.trim().is_empty() {
        return Ok(all.into_iter().take(limit.unwrap_or(10)).collect());
    }

    let matcher = SkimMatcherV2::default();
    let q = query.to_lowercase();
    let mut scored: Vec<(i64, Contact)> = all
        .into_iter()
        .filter_map(|c| {
            // Score against full_name, alias, and email
            let name_score = matcher
                .fuzzy_match(&c.full_name.to_lowercase(), &q)
                .unwrap_or(0);
            let alias_score = c
                .alias
                .as_deref()
                .and_then(|a| matcher.fuzzy_match(&a.to_lowercase(), &q))
                .unwrap_or(0);
            let email_score = matcher
                .fuzzy_match(&c.email.to_lowercase(), &q)
                .unwrap_or(0);
            let best = name_score.max(alias_score).max(email_score);
            if best > 0 { Some((best, c)) } else { None }
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(scored
        .into_iter()
        .take(limit.unwrap_or(10))
        .map(|(_, c)| c)
        .collect())
}

/// Resolve a name (possibly a first name or alias) to a Contact.
/// Returns the best match or None.
#[tauri::command]
pub fn contacts_resolve(app: AppHandle, name: String) -> Result<Option<Contact>, String> {
    let results = contacts_search(app, name, Some(1))?;
    Ok(results.into_iter().next())
}

/// Add a contact manually.
#[tauri::command]
pub fn contacts_add(
    app: AppHandle,
    full_name: String,
    email: String,
    alias: Option<String>,
    company: Option<String>,
    phone: Option<String>,
) -> Result<Contact, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO contacts (id, full_name, email, alias, company, phone, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual')",
        params![id, full_name, email, alias, company, phone],
    )
    .map_err(|e| e.to_string())?;

    Ok(Contact { id, full_name, email, alias, company, phone, source: "manual".to_string() })
}

/// Update an existing contact.
#[tauri::command]
pub fn contacts_update(
    app: AppHandle,
    id: String,
    full_name: String,
    email: String,
    alias: Option<String>,
    company: Option<String>,
    phone: Option<String>,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE contacts SET full_name=?1, email=?2, alias=?3, company=?4, phone=?5,
         updated_at=(unixepoch()*1000) WHERE id=?6",
        params![full_name, email, alias, company, phone, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a contact.
#[tauri::command]
pub fn contacts_delete(app: AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM contacts WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sync contacts from Outlook (Windows COM) then fall back to Windows Contacts folder.
/// Upserts by email — existing records are updated, new ones inserted.
/// Returns counts of imported/skipped records.
#[tauri::command]
pub async fn contacts_sync_outlook(app: AppHandle) -> Result<SyncResult, String> {
    // Try Outlook COM first, then Windows Contacts folder
    let raw = match outlook::fetch_outlook_contacts() {
        Ok(v) if !v.is_empty() => (v, "outlook"),
        _ => match outlook::fetch_windows_contacts() {
            Ok(v) => (v, "windows_contacts"),
            Err(e) => return Err(format!("Could not read contacts: {}", e)),
        },
    };
    let (contacts, source) = raw;

    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;

    for c in &contacts {
        if c.email.is_empty() {
            skipped += 1;
            continue;
        }
        let id = Uuid::new_v4().to_string();
        // Upsert: if email already exists, update name/company; otherwise insert
        let rows = conn
            .execute(
                "INSERT INTO contacts (id, full_name, email, company, phone, source)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(email) DO UPDATE SET
                   full_name  = excluded.full_name,
                   company    = excluded.company,
                   phone      = excluded.phone,
                   source     = excluded.source,
                   updated_at = (unixepoch()*1000)",
                params![id, c.name, c.email, c.company, c.phone, source],
            )
            .map_err(|e| e.to_string())?;
        if rows > 0 { imported += 1; } else { skipped += 1; }
    }

    Ok(SyncResult { imported, skipped, source: source.to_string() })
}

// ── Email config ──────────────────────────────────────────────────────────────

/// Read the current SMTP configuration (singleton row).
#[tauri::command]
pub fn email_config_get(app: AppHandle) -> Result<EmailConfig, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT smtp_host, smtp_port, username, password, from_name, from_email, tls_mode
         FROM email_config WHERE id=1",
        [],
        |row| {
            Ok(EmailConfig {
                smtp_host:  row.get(0)?,
                smtp_port:  row.get::<_, u32>(1)? as u16,
                username:   row.get(2)?,
                password:   row.get(3)?,
                from_name:  row.get(4)?,
                from_email: row.get(5)?,
                tls_mode:   row.get(6)?,
            })
        },
    );
    match result {
        Ok(cfg) => Ok(cfg),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(EmailConfig::default()),
        Err(e) => Err(e.to_string()),
    }
}

/// Save (upsert) the SMTP configuration.
#[tauri::command]
pub fn email_config_save(app: AppHandle, config: EmailConfig) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO email_config (id, smtp_host, smtp_port, username, password,
             from_name, from_email, tls_mode, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch()*1000)
         ON CONFLICT(id) DO UPDATE SET
             smtp_host  = excluded.smtp_host,
             smtp_port  = excluded.smtp_port,
             username   = excluded.username,
             password   = excluded.password,
             from_name  = excluded.from_name,
             from_email = excluded.from_email,
             tls_mode   = excluded.tls_mode,
             updated_at = excluded.updated_at",
        params![
            config.smtp_host, config.smtp_port as i32, config.username,
            config.password, config.from_name, config.from_email, config.tls_mode
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get sent email history.
#[tauri::command]
pub fn email_log_list(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let db_path = get_db_path(&app)?;
    let conn = db::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, to_email, to_name, subject, status, error, sent_at
             FROM email_log ORDER BY sent_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id":       row.get::<_,String>(0)?,
                "to_email": row.get::<_,String>(1)?,
                "to_name":  row.get::<_,Option<String>>(2)?,
                "subject":  row.get::<_,String>(3)?,
                "status":   row.get::<_,String>(4)?,
                "error":    row.get::<_,Option<String>>(5)?,
                "sent_at":  row.get::<_,i64>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}
