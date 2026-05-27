/// SharePoint / OneDrive integration via Microsoft Graph API.
///
/// Auth: OAuth 2.0 with Azure AD (requires an Azure app registration with a Client ID).
/// Scopes: Files.Read.All, Sites.Read.All, User.Read
/// Docs: https://learn.microsoft.com/en-us/graph/api/resources/sharepoint
use reqwest::Client;
use serde_json::Value;
use tracing::{info, warn};

use crate::knowledge::ingest;
use crate::knowledge::oauth::{run_oauth_flow, OAuthConfig};
use tauri::AppHandle;

#[allow(dead_code)]
pub const PROVIDER: &str = "sharepoint";

/// `tenant` can be "common", "organizations", or a specific tenant GUID/domain.
pub async fn connect(
    app: &AppHandle,
    client_id: &str,
    client_secret: &str,
    tenant: &str,
) -> Result<(String, Option<String>, Option<u64>, String), String> {
    let auth_url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize",
        tenant
    );
    let token_url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        tenant
    );

    let tokens = run_oauth_flow(
        app,
        OAuthConfig {
            auth_url,
            token_url,
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            scopes: vec![
                "Files.Read.All".to_string(),
                "Sites.Read.All".to_string(),
                "User.Read".to_string(),
                "offline_access".to_string(),
            ],
            extra_auth_params: vec![],
            extra_token_params: vec![],
        },
    )
    .await?;

    let name = fetch_user_display_name(&tokens.access_token)
        .await
        .unwrap_or_else(|_| "SharePoint / OneDrive".to_string());

    Ok((tokens.access_token, tokens.refresh_token, tokens.expires_in, name))
}

async fn fetch_user_display_name(access_token: &str) -> Result<String, String> {
    let v: Value = graph_get(access_token, "https://graph.microsoft.com/v1.0/me").await?;
    let name = v["displayName"].as_str()
        .or_else(|| v["mail"].as_str())
        .unwrap_or("SharePoint")
        .to_string();
    Ok(name)
}

/// Fetch all readable files from OneDrive and SharePoint sites.
pub async fn fetch_all_files(access_token: &str) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();

    // 1. OneDrive personal / work drive
    let onedrive = fetch_drive_items(access_token, "https://graph.microsoft.com/v1.0/me/drive/root/children").await;
    match onedrive {
        Ok(items) => results.extend(items),
        Err(e) => warn!("OneDrive fetch error: {}", e),
    }

    // 2. SharePoint sites the user follows
    let sites_resp = graph_get(
        access_token,
        "https://graph.microsoft.com/v1.0/sites?search=*&$select=id,displayName",
    ).await;
    if let Ok(sites_val) = sites_resp {
        let sites = sites_val["value"].as_array().cloned().unwrap_or_default();
        for site in sites.iter().take(10) { // cap at 10 sites
            if let Some(site_id) = site["id"].as_str() {
                let url = format!(
                    "https://graph.microsoft.com/v1.0/sites/{}/drive/root/children",
                    site_id
                );
                match fetch_drive_items(access_token, &url).await {
                    Ok(items) => results.extend(items),
                    Err(e) => warn!("SharePoint site {} error: {}", site_id, e),
                }
            }
        }
    }

    info!("SharePoint: fetched {} files", results.len());
    Ok(results)
}

async fn fetch_drive_items(
    access_token: &str,
    url: &str,
) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();
    let mut next_url: Option<String> = Some(url.to_string());
    let client = Client::new();

    while let Some(u) = next_url.take() {
        let resp = graph_get(access_token, &u).await?;
        let items = resp["value"].as_array().cloned().unwrap_or_default();
        next_url = resp["@odata.nextLink"].as_str().map(|s| s.to_string());

        for item in items {
            let name = item["name"].as_str().unwrap_or("").to_string();
            if !is_supported_extension(&name) {
                continue;
            }
            // Download the file
            let download_url = match item["@microsoft.graph.downloadUrl"].as_str() {
                Some(u) => u.to_string(),
                None => continue,
            };
            match download_and_extract(&client, &download_url, &name).await {
                Ok(text) if !text.trim().is_empty() => results.push((name, text)),
                Ok(_) => {}
                Err(e) => warn!("SharePoint download {} error: {}", name, e),
            }
        }
    }

    Ok(results)
}

async fn download_and_extract(client: &Client, url: &str, name: &str) -> Result<String, String> {
    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    ingest::extract_text(name, &bytes)
}

fn is_supported_extension(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    matches!(ext.as_str(), "txt" | "md" | "pdf" | "docx" | "csv")
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async fn graph_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}
