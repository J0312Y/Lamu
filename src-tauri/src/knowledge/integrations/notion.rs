/// Notion integration — fetches all accessible pages and converts them to plain text.
///
/// Auth: OAuth 2.0 (Client ID + Secret from a Notion integration app).
/// Docs: https://developers.notion.com/docs/authorization
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tracing::{info, warn};

use crate::knowledge::oauth::{run_oauth_flow, OAuthConfig};
use tauri::AppHandle;

#[allow(dead_code)]
pub const PROVIDER: &str = "notion";
pub const AUTH_URL: &str = "https://api.notion.com/v1/oauth/authorize";
pub const TOKEN_URL: &str = "https://api.notion.com/v1/oauth/token";
pub const NOTION_VERSION: &str = "2022-06-28";

/// Returns OAuth tokens after user completes browser flow.
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
            scopes: vec![], // Notion doesn't use scopes in the traditional sense
            extra_auth_params: vec![
                ("owner".to_string(), "user".to_string()),
            ],
            extra_token_params: vec![],
        },
    )
    .await?;

    // Fetch workspace name
    let workspace_name = fetch_workspace_name(&tokens.access_token)
        .await
        .unwrap_or_else(|_| "Notion".to_string());

    Ok((
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in,
        workspace_name,
    ))
}

async fn fetch_workspace_name(access_token: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct MeResponse {
        name: Option<String>,
    }

    let resp = notion_get(access_token, "https://api.notion.com/v1/users/me").await?;
    let me: MeResponse = serde_json::from_value(resp).unwrap_or(MeResponse { name: None });
    Ok(me.name.unwrap_or_else(|| "Notion Workspace".to_string()))
}

/// Fetch all pages accessible to the integration and yield (title, text) pairs.
pub async fn fetch_all_pages(access_token: &str) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut body = serde_json::json!({
            "filter": { "value": "page", "property": "object" },
            "page_size": 100,
        });
        if let Some(ref c) = cursor {
            body["start_cursor"] = serde_json::json!(c);
        }

        let resp = notion_post(access_token, "https://api.notion.com/v1/search", &body).await?;

        let pages = resp["results"].as_array().cloned().unwrap_or_default();
        let has_more = resp["has_more"].as_bool().unwrap_or(false);
        cursor = resp["next_cursor"].as_str().map(|s| s.to_string());

        for page in pages {
            let id = page["id"].as_str().unwrap_or("").replace('-', "");
            let title = extract_page_title(&page);
            if id.is_empty() {
                continue;
            }
            match fetch_page_text(access_token, &page["id"].as_str().unwrap_or("")).await {
                Ok(text) if !text.trim().is_empty() => {
                    results.push((title, text));
                }
                Ok(_) => {}
                Err(e) => warn!("Notion page {} fetch error: {}", id, e),
            }
        }

        if !has_more {
            break;
        }
    }

    info!("Notion: fetched {} pages", results.len());
    Ok(results)
}

fn extract_page_title(page: &Value) -> String {
    page["properties"]["title"]["title"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|t| t["plain_text"].as_str())
        .unwrap_or("Untitled")
        .to_string()
}

/// Recursively fetch all block children and convert to plain text.
async fn fetch_page_text(access_token: &str, page_id: &str) -> Result<String, String> {
    let url = format!(
        "https://api.notion.com/v1/blocks/{}/children?page_size=100",
        page_id
    );
    let resp = notion_get(access_token, &url).await?;
    let blocks = resp["results"].as_array().cloned().unwrap_or_default();
    let mut lines = Vec::new();
    for block in blocks {
        if let Some(text) = block_to_text(&block) {
            lines.push(text);
        }
    }
    Ok(lines.join("\n"))
}

fn block_to_text(block: &Value) -> Option<String> {
    let kind = block["type"].as_str()?;
    let rich_texts = block[kind]["rich_text"].as_array()?;
    let text: String = rich_texts
        .iter()
        .filter_map(|rt| rt["plain_text"].as_str())
        .collect::<Vec<_>>()
        .join("");
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async fn notion_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .bearer_auth(access_token)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

async fn notion_post(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .bearer_auth(access_token)
        .header("Notion-Version", NOTION_VERSION)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

async fn notion_patch(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .patch(url)
        .bearer_auth(access_token)
        .header("Notion-Version", NOTION_VERSION)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new Notion page as a child of an existing page.
/// The page will have a title and a single paragraph block with `content`.
pub async fn create_page(
    token: &str,
    parent_page_id: &str,
    title: &str,
    content: &str,
) -> Result<Value, String> {
    let payload = serde_json::json!({
        "parent": { "page_id": parent_page_id },
        "properties": {
            "title": {
                "title": [{ "text": { "content": title } }]
            }
        },
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "text": { "content": content } }]
                }
            }
        ]
    });
    notion_post(token, "https://api.notion.com/v1/pages", &payload).await
}

/// Append a paragraph block with `content` to an existing Notion page.
pub async fn append_content(token: &str, page_id: &str, content: &str) -> Result<(), String> {
    let url = format!("https://api.notion.com/v1/blocks/{}/children", page_id);
    let payload = serde_json::json!({
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "text": { "content": content } }]
                }
            }
        ]
    });
    notion_patch(token, &url, &payload).await?;
    Ok(())
}
