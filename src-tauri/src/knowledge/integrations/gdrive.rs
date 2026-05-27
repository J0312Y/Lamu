/// Google Drive integration — lists all Drive files and downloads their content.
///
/// Auth: OAuth 2.0 with Google (requires a Google Cloud project with Drive API enabled).
/// Scopes: https://www.googleapis.com/auth/drive.readonly
use reqwest::Client;
use serde::Deserialize;
use tracing::{info, warn};

use crate::knowledge::oauth::{run_oauth_flow, OAuthConfig};
use crate::knowledge::ingest;
use tauri::AppHandle;

#[allow(dead_code)]
pub const PROVIDER: &str = "gdrive";
pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

pub async fn connect(
    app: &AppHandle,
    client_id: &str,
    client_secret: &str,
) -> Result<(String, Option<String>, Option<u64>, String), String> {
    let tokens = run_oauth_flow(
        app,
        OAuthConfig {
            auth_url: AUTH_URL.to_string(),
            token_url: TOKEN_URL.to_string(),
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            scopes: vec![
                "https://www.googleapis.com/auth/drive.readonly".to_string(),
                "https://www.googleapis.com/auth/userinfo.email".to_string(),
            ],
            extra_auth_params: vec![],
            extra_token_params: vec![],
        },
    )
    .await?;

    // Fetch user email as workspace name
    let name = fetch_user_email(&tokens.access_token)
        .await
        .unwrap_or_else(|_| "Google Drive".to_string());

    Ok((tokens.access_token, tokens.refresh_token, tokens.expires_in, name))
}

async fn fetch_user_email(access_token: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Info {
        email: Option<String>,
    }
    let resp: Info = Client::new()
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(resp.email.unwrap_or_else(|| "Google Drive".to_string()))
}

/// Fetch all readable files from Google Drive and return (name, text) pairs.
pub async fn fetch_all_files(access_token: &str) -> Result<Vec<(String, String)>, String> {
    #[derive(Deserialize)]
    struct FileList {
        files: Vec<DriveFile>,
        #[serde(rename = "nextPageToken")]
        next_page_token: Option<String>,
    }
    #[derive(Deserialize, Clone)]
    struct DriveFile {
        id: String,
        name: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    }

    let mut results: Vec<(String, String)> = Vec::new();
    let mut page_token: Option<String> = None;
    let client = Client::new();

    loop {
        let mut url = "https://www.googleapis.com/drive/v3/files?\
            fields=nextPageToken,files(id,name,mimeType)&\
            q=trashed=false&\
            pageSize=100"
            .to_string();
        if let Some(ref t) = page_token {
            url.push_str(&format!("&pageToken={}", t));
        }

        let list: FileList = client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        for file in &list.files {
            match download_file(&client, access_token, file.id.as_str(), file.name.as_str(), file.mime_type.as_str()).await {
                Ok(Some((name, text))) => results.push((name, text)),
                Ok(None) => {}
                Err(e) => warn!("GDrive file {} error: {}", file.name, e),
            }
        }

        match list.next_page_token {
            Some(t) => page_token = Some(t),
            None => break,
        }
    }

    info!("Google Drive: fetched {} files", results.len());
    Ok(results)
}

async fn download_file(
    client: &Client,
    access_token: &str,
    file_id: &str,
    name: &str,
    mime_type: &str,
) -> Result<Option<(String, String)>, String> {
    // Google Docs / Sheets / Slides → export as plain text
    let (download_url, filename) = if mime_type == "application/vnd.google-apps.document" {
        (
            format!("https://www.googleapis.com/drive/v3/files/{}/export?mimeType=text%2Fplain", file_id),
            format!("{}.txt", name),
        )
    } else if mime_type == "application/vnd.google-apps.spreadsheet" {
        (
            format!("https://www.googleapis.com/drive/v3/files/{}/export?mimeType=text%2Fcsv", file_id),
            format!("{}.csv", name),
        )
    } else if mime_type.starts_with("application/vnd.google-apps") {
        // Slides, Forms, etc. — skip
        return Ok(None);
    } else if supported_mime(mime_type) {
        (
            format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id),
            name.to_string(),
        )
    } else {
        return Ok(None);
    };

    let bytes = client
        .get(&download_url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let text = ingest::extract_text(&filename, &bytes)?;
    if text.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some((name.to_string(), text)))
}

fn supported_mime(mime: &str) -> bool {
    matches!(
        mime,
        "application/pdf"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "text/plain"
            | "text/markdown"
            | "text/csv"
    )
}
