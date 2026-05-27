/// Confluence integration — fetches all pages from all spaces via the REST API.
///
/// Auth: Personal Access Token (PAT) or Basic auth (email + API token).
/// No OAuth needed — the user pastes their PAT / API token into Lamu settings.
/// Docs: https://developer.atlassian.com/cloud/confluence/rest/v1/intro/
use reqwest::Client;
use serde_json::Value;
use tracing::{info, warn};

pub const PROVIDER: &str = "confluence";

/// Verify the credentials and return the user's display name.
pub async fn verify(base_url: &str, email: &str, api_token: &str) -> Result<String, String> {
    let url = format!("{}/wiki/rest/api/user/current", base_url.trim_end_matches('/'));
    let resp = cf_get(email, api_token, &url).await?;
    let name = resp["displayName"]
        .as_str()
        .unwrap_or("Confluence User")
        .to_string();
    Ok(name)
}

/// Fetch all pages across all accessible spaces and return (title, text) pairs.
pub async fn fetch_all_pages(
    base_url: &str,
    email: &str,
    api_token: &str,
) -> Result<Vec<(String, String)>, String> {
    let base = base_url.trim_end_matches('/');
    let mut results = Vec::new();

    // 1. List all spaces
    let spaces_url = format!("{}/wiki/rest/api/space?limit=50&type=global", base);
    let spaces_resp = cf_get(email, api_token, &spaces_url).await?;
    let spaces = spaces_resp["results"].as_array().cloned().unwrap_or_default();

    for space in &spaces {
        let key = match space["key"].as_str() {
            Some(k) => k,
            None => continue,
        };

        let mut start = 0usize;
        loop {
            let pages_url = format!(
                "{}/wiki/rest/api/content?spaceKey={}&type=page&limit=50&start={}&expand=body.storage",
                base, key, start
            );
            let pages_resp = match cf_get(email, api_token, &pages_url).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("Confluence space {} error: {}", key, e);
                    break;
                }
            };

            let pages = pages_resp["results"].as_array().cloned().unwrap_or_default();
            let size = pages.len();

            for page in pages {
                let title = page["title"].as_str().unwrap_or("Untitled").to_string();
                // body.storage.value contains HTML
                let html = page["body"]["storage"]["value"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();

                if html.trim().is_empty() {
                    continue;
                }

                // Extract text from the Confluence storage HTML
                let (_, text) = extract_confluence_html(&html);
                if !text.trim().is_empty() {
                    results.push((title, text));
                }
            }

            let total_size = pages_resp["size"].as_u64().unwrap_or(0) as usize;
            start += size;
            if size == 0 || start >= total_size {
                break;
            }
        }
    }

    info!("Confluence: fetched {} pages", results.len());
    Ok(results)
}

/// Lightweight HTML-to-text for Confluence storage format.
/// Uses the same scraper-based approach as the URL crawler.
fn extract_confluence_html(html: &str) -> (String, String) {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);

    // Confluence storage format uses standard HTML tags: p, h1-h6, ul/li, table
    let sel = Selector::parse("p,h1,h2,h3,h4,h5,h6,li,td,th").expect("valid selector");

    let mut parts: Vec<String> = Vec::new();
    for elem in document.select(&sel) {
        let text: String = elem.text().collect::<Vec<_>>().join(" ");
        let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if text.len() > 10 {
            parts.push(text);
        }
    }
    parts.dedup();
    ("".to_string(), parts.join("\n"))
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async fn cf_get(email: &str, api_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Confluence request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Confluence response parse failed: {}", e))
}

async fn cf_post(email: &str, api_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Confluence request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Confluence response parse failed: {}", e))
}

async fn cf_put(email: &str, api_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .put(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Confluence request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Confluence response parse failed: {}", e))
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new Confluence page in the given space, optionally under a parent page.
pub async fn create_page(
    base_url: &str,
    email: &str,
    token: &str,
    space_key: &str,
    title: &str,
    body_html: &str,
    parent_id: Option<&str>,
) -> Result<Value, String> {
    let url = format!("{}/wiki/rest/api/content", base_url.trim_end_matches('/'));

    let mut payload = serde_json::json!({
        "type": "page",
        "title": title,
        "space": { "key": space_key },
        "body": {
            "storage": {
                "value": body_html,
                "representation": "storage"
            }
        }
    });

    if let Some(pid) = parent_id {
        payload["ancestors"] = serde_json::json!([{ "id": pid }]);
    }

    cf_post(email, token, &url, &payload).await
}

/// Update an existing Confluence page. `version` must be the current version number + 1.
pub async fn update_page(
    base_url: &str,
    email: &str,
    token: &str,
    page_id: &str,
    title: &str,
    body_html: &str,
    version: u64,
) -> Result<Value, String> {
    let url = format!(
        "{}/wiki/rest/api/content/{}",
        base_url.trim_end_matches('/'),
        page_id
    );
    let payload = serde_json::json!({
        "type": "page",
        "title": title,
        "version": { "number": version },
        "body": {
            "storage": {
                "value": body_html,
                "representation": "storage"
            }
        }
    });
    cf_put(email, token, &url, &payload).await
}
