/// OAuth credentials for Lamu integrations.
///
/// Credentials are fetched from the Lamu backend (`GET /api/oauth-config`)
/// at runtime so they can be managed from the admin dashboard without
/// recompiling the app.
///
/// Fallback to empty strings if the backend is unreachable — the connect
/// flow will then return an appropriate error to the user.

use std::collections::HashMap;

fn lamu_api_url() -> &'static str {
    option_env!("LAMU_API_URL").unwrap_or("http://localhost:3000")
}

/// Fetches all OAuth credentials from the backend settings.
/// Returns a map of key → value (e.g. "google_client_id" → "123.apps.googleusercontent.com").
pub async fn fetch_oauth_config() -> HashMap<String, String> {
    let url = format!("{}/api/oauth-config", lamu_api_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(config) = json.get("config").and_then(|c| c.as_object()) {
                    return config
                        .iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect();
                }
            }
            HashMap::new()
        }
        Err(_) => HashMap::new(),
    }
}

/// Helper: get a single credential from the backend config.
#[allow(dead_code)]
pub async fn get_credential(key: &str) -> String {
    fetch_oauth_config().await
        .remove(key)
        .unwrap_or_default()
}

// ── Convenience getters ───────────────────────────────────────────────────────

#[allow(dead_code)] pub async fn google_client_id() -> String     { get_credential("google_client_id").await }
#[allow(dead_code)] pub async fn google_client_secret() -> String { get_credential("google_client_secret").await }
#[allow(dead_code)] pub async fn github_client_id() -> String     { get_credential("github_client_id").await }
#[allow(dead_code)] pub async fn notion_client_id() -> String     { get_credential("notion_client_id").await }
#[allow(dead_code)] pub async fn notion_client_secret() -> String { get_credential("notion_client_secret").await }
#[allow(dead_code)] pub async fn salesforce_client_id() -> String     { get_credential("salesforce_client_id").await }
#[allow(dead_code)] pub async fn salesforce_client_secret() -> String { get_credential("salesforce_client_secret").await }
#[allow(dead_code)] pub async fn sharepoint_client_id() -> String     { get_credential("sharepoint_client_id").await }
#[allow(dead_code)] pub async fn sharepoint_client_secret() -> String { get_credential("sharepoint_client_secret").await }

/// Returns true if a provider has credentials configured in the backend.
#[allow(dead_code)]
pub async fn has_builtin(provider: &str) -> bool {
    let config = fetch_oauth_config().await;
    match provider {
        "github"          => config.get("github_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        "notion"          => config.get("notion_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        "gdrive"          => config.get("google_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        "google_calendar" => config.get("google_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        "salesforce"      => config.get("salesforce_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        "sharepoint"      => config.get("sharepoint_client_id").map(|v| !v.is_empty()).unwrap_or(false),
        _                 => false,
    }
}
