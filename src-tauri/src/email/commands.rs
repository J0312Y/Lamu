use super::smtp;
use crate::contacts::commands::{email_config_get, EmailConfig};
use crate::ContactsState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SendEmailRequest {
    pub to_name: String,
    pub to_email: String,
    pub subject: String,
    pub body: String,
}

/// Send an email and log the result.
#[tauri::command]
pub async fn email_send(app: AppHandle, req: SendEmailRequest) -> Result<(), String> {
    let config = email_config_get(app.clone())?;
    let result = smtp::send_email(
        &config,
        &req.to_name,
        &req.to_email,
        &req.subject,
        &req.body,
    )
    .await;

    // Log to email_log regardless of success/failure
    log_email(&app, &req, result.as_ref().err().map(|e| e.as_str()))?;

    result
}

/// Test the SMTP connection without sending.
/// Accepts the config directly from the frontend so the user does not need
/// to save before testing.
#[tauri::command]
pub async fn email_test_connection(
    app: AppHandle,
    config: Option<EmailConfig>,
) -> Result<String, String> {
    let cfg = match config {
        Some(c) => c,
        None => email_config_get(app)?,
    };
    smtp::test_connection(&cfg)
        .await
        .map(|_| "Connexion SMTP réussie".to_string())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn log_email(app: &AppHandle, req: &SendEmailRequest, error: Option<&str>) -> Result<(), String> {
    let state = app.state::<ContactsState>();
    let db_path = state
        .db_path
        .lock()
        .unwrap()
        .clone()
        .ok_or("Contacts DB not initialized")?;
    let conn = crate::contacts::db::open(&db_path).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let status = if error.is_some() { "failed" } else { "sent" };
    conn.execute(
        "INSERT INTO email_log (id, to_email, to_name, subject, body, status, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, req.to_email, req.to_name, req.subject, req.body, status, error],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
