/// GitHub integration — fetches issues, PRs, READMEs, and wiki pages.
///
/// Auth: Personal Access Token (classic or fine-grained) OR GitHub Device Flow.
/// Supports a single repo or all repos belonging to an owner/org.
/// Docs: https://docs.github.com/en/rest
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tracing::{info, warn};

pub const PROVIDER: &str = "github";

/// Verify the token and return the authenticated user's login.
pub async fn verify(token: &str) -> Result<String, String> {
    let resp = gh_get(token, "https://api.github.com/user").await?;
    let login = resp["login"].as_str().unwrap_or("GitHub User").to_string();
    Ok(login)
}

/// Fetch content from GitHub.
/// - If `repo` is Some("owner/repo"), only that repo is fetched.
/// - If `repo` is None, all repos for `owner` are fetched (up to 30).
pub async fn fetch_all_content(
    token: &str,
    owner: &str,
    repo: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();

    let repos: Vec<String> = match repo {
        Some(r) => vec![r.to_string()],
        None => list_repos(token, owner).await,
    };

    for repo_full in &repos {
        // repo_full may be "owner/repo" or just "repo"
        let full = if repo_full.contains('/') {
            repo_full.clone()
        } else {
            format!("{}/{}", owner, repo_full)
        };

        // README
        if let Some((title, text)) = fetch_readme(token, &full).await {
            results.push((title, text));
        }

        // Issues (open + closed, excluding PRs)
        let issues = fetch_issues(token, &full, "issues").await;
        results.extend(issues);

        // Pull Requests
        let prs = fetch_issues(token, &full, "pulls").await;
        results.extend(prs);

        // Wiki (if enabled — fetched via the API's wiki endpoint is not available;
        // we fall back to fetching the repo's git wiki clone via contents API)
        let wiki = fetch_wiki_pages(token, &full).await;
        results.extend(wiki);
    }

    info!("GitHub: fetched {} items across {} repos", results.len(), repos.len());
    Ok(results)
}

/// List up to 100 repos for a user or org.
async fn list_repos(token: &str, owner: &str) -> Vec<String> {
    // Try org first, fall back to user
    let org_url = format!("https://api.github.com/orgs/{}/repos?per_page=100&type=all", owner);
    let user_url = format!("https://api.github.com/users/{}/repos?per_page=100&type=all", owner);

    for url in [org_url, user_url] {
        if let Ok(resp) = gh_get(token, &url).await {
            if let Some(arr) = resp.as_array() {
                let names: Vec<String> = arr
                    .iter()
                    .filter_map(|r| r["full_name"].as_str().map(|s| s.to_string()))
                    .collect();
                if !names.is_empty() {
                    return names;
                }
            }
        }
    }
    Vec::new()
}

/// Fetch the README of a repo and return (title, text).
async fn fetch_readme(token: &str, full_repo: &str) -> Option<(String, String)> {
    let url = format!("https://api.github.com/repos/{}/readme", full_repo);
    let resp = gh_get(token, &url).await.ok()?;

    // Content is base64-encoded
    let encoded = resp["content"].as_str()?;
    let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = base64_decode(&cleaned).ok()?;
    let text = String::from_utf8(bytes).ok()?;

    if text.trim().is_empty() {
        return None;
    }

    let title = format!("{} — README", full_repo);
    Some((title, text))
}

/// Fetch open issues or PRs for a repo.
async fn fetch_issues(token: &str, full_repo: &str, kind: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();

    for state in ["open", "closed"] {
        let url = format!(
            "https://api.github.com/repos/{}/{}?state={}&per_page=100",
            full_repo, kind, state
        );
        match gh_get(token, &url).await {
            Ok(resp) => {
                for item in resp.as_array().cloned().unwrap_or_default() {
                    let number = item["number"].as_u64().unwrap_or(0);
                    let title_str = item["title"].as_str().unwrap_or("Untitled").to_string();
                    let body = item["body"].as_str().unwrap_or("").to_string();
                    let labels: Vec<&str> = item["labels"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|l| l["name"].as_str())
                                .collect()
                        })
                        .unwrap_or_default();
                    let item_state = item["state"].as_str().unwrap_or("").to_string();
                    let kind_label = if kind == "pulls" { "PR" } else { "Issue" };

                    let title = format!("[{}] {} #{}", full_repo, kind_label, number);
                    let text = format!(
                        "{} #{}: {}\nState: {}\nLabels: {}\n\n{}",
                        kind_label,
                        number,
                        title_str,
                        item_state,
                        labels.join(", "),
                        body
                    );

                    if !title_str.trim().is_empty() {
                        results.push((title, text));
                    }
                }
            }
            Err(e) => warn!("GitHub {} {} error: {}", full_repo, kind, e),
        }
    }

    results
}

/// Attempt to fetch wiki pages via the GitHub API (works for repos with wikis enabled).
/// Uses the undocumented `{repo}.wiki` git repo approach via contents fallback.
async fn fetch_wiki_pages(token: &str, full_repo: &str) -> Vec<(String, String)> {
    // GitHub doesn't expose wiki via the main REST API; we try the search API
    // for markdown files in the wiki. This is a best-effort approach.
    let url = format!(
        "https://api.github.com/repos/{}/contents/_wiki",
        full_repo
    );
    match gh_get(token, &url).await {
        Ok(resp) => {
            let mut results = Vec::new();
            for item in resp.as_array().cloned().unwrap_or_default() {
                if item["type"].as_str() == Some("file")
                    && item["name"].as_str().map(|n| n.ends_with(".md")).unwrap_or(false)
                {
                    let name = item["name"].as_str().unwrap_or("wiki").to_string();
                    if let Some(download_url) = item["download_url"].as_str() {
                        match gh_raw(token, download_url).await {
                            Ok(text) if !text.trim().is_empty() => {
                                let title = format!("{} — Wiki: {}", full_repo, name);
                                results.push((title, text));
                            }
                            _ => {}
                        }
                    }
                }
            }
            results
        }
        Err(_) => Vec::new(), // Wiki not enabled or not accessible
    }
}

// ── GitHub Device Flow ────────────────────────────────────────────────────────

/// Complete the GitHub Device Flow: poll for the token until the user authorizes or it expires.
/// Opens the browser automatically and polls. Returns the access token on success.
pub async fn device_flow_connect(
    app: &AppHandle,
    client_id: &str,
    _owner: &str,
    _repo: Option<&str>,
) -> Result<(String, String), String> {
    #[derive(Deserialize)]
    struct DeviceCodeResp {
        device_code: String,
        user_code: String,
        verification_uri: String,
        expires_in: u64,
        interval: u64,
    }

    #[derive(Deserialize)]
    struct TokenResp {
        access_token: Option<String>,
        error: Option<String>,
    }

    // Step 1: Request device code
    let dc: DeviceCodeResp = Client::new()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .form(&[
            ("client_id", client_id),
            ("scope", "repo read:org read:user"),
        ])
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Device code parse failed: {}", e))?;

    // Step 2: Emit the user_code + verification_uri so the UI can show them
    let _ = app.emit(
        "github-device-code",
        serde_json::json!({
            "user_code": dc.user_code,
            "verification_uri": dc.verification_uri,
        }),
    );

    // Open the browser automatically
    let _ = app
        .opener()
        .open_url(&dc.verification_uri, None::<&str>);

    // Step 3: Poll for the token
    let poll_interval = Duration::from_secs(dc.interval.max(5));
    let deadline = std::time::Instant::now() + Duration::from_secs(dc.expires_in);

    let access_token = loop {
        tokio::time::sleep(poll_interval).await;

        if std::time::Instant::now() > deadline {
            return Err("GitHub Device Flow timed out — no authorization within the allowed time".to_string());
        }

        let tr: TokenResp = Client::new()
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .header("User-Agent", "Lamu-KnowledgeBase/1.0")
            .form(&[
                ("client_id", client_id),
                ("device_code", dc.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Token poll request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Token poll parse failed: {}", e))?;

        match tr.error.as_deref() {
            None | Some("authorization_pending") | Some("slow_down") => {
                if let Some(token) = tr.access_token {
                    if !token.is_empty() {
                        break token;
                    }
                }
                // still waiting
            }
            Some("expired_token") => {
                return Err("GitHub Device Flow expired — please try again".to_string());
            }
            Some("access_denied") => {
                return Err("GitHub authorization was denied by the user".to_string());
            }
            Some(other) => {
                return Err(format!("GitHub token error: {}", other));
            }
        }
    };

    // Step 4: Verify the token
    let login = verify(&access_token).await?;

    Ok((access_token, login))
}

// ── Base64 decode helper ──────────────────────────────────────────────────────

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Simple base64 decoder using the standard alphabet
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [0u8; 256];
    for (i, &c) in CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let input: Vec<u8> = input.bytes().filter(|&b| b != b'=').collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 3 < input.len() {
        let a = table[input[i] as usize] as u32;
        let b = table[input[i + 1] as usize] as u32;
        let c = table[input[i + 2] as usize] as u32;
        let d = table[input[i + 3] as usize] as u32;
        let n = (a << 18) | (b << 12) | (c << 6) | d;
        out.push((n >> 16) as u8);
        out.push((n >> 8) as u8);
        out.push(n as u8);
        i += 4;
    }
    Ok(out)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async fn gh_get(token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .send()
        .await
        .map_err(|e| format!("GitHub request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitHub response parse failed: {}", e))
}

async fn gh_raw(token: &str, url: &str) -> Result<String, String> {
    Client::new()
        .get(url)
        .bearer_auth(token)
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .send()
        .await
        .map_err(|e| format!("GitHub raw request failed: {}", e))?
        .text()
        .await
        .map_err(|e| format!("GitHub raw response failed: {}", e))
}

async fn gh_post(token: &str, url: &str, body: &serde_json::Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GitHub request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitHub response parse failed: {}", e))
}

async fn gh_patch(token: &str, url: &str, body: &serde_json::Value) -> Result<Value, String> {
    Client::new()
        .patch(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GitHub request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitHub response parse failed: {}", e))
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new issue in a repository.
pub async fn create_issue(
    token: &str,
    owner: &str,
    repo: &str,
    title: &str,
    body: &str,
    labels: Option<Vec<String>>,
    assignees: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{}/{}/issues", owner, repo);
    let mut payload = serde_json::json!({
        "title": title,
        "body": body,
    });
    if let Some(l) = labels {
        payload["labels"] = serde_json::json!(l);
    }
    if let Some(a) = assignees {
        payload["assignees"] = serde_json::json!(a);
    }
    gh_post(token, &url, &payload).await
}

/// Update an existing issue (title, body, and/or state).
pub async fn update_issue(
    token: &str,
    owner: &str,
    repo: &str,
    issue_number: u64,
    title: Option<&str>,
    body: Option<&str>,
    state: Option<&str>,
) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues/{}",
        owner, repo, issue_number
    );
    let mut payload = serde_json::json!({});
    if let Some(t) = title {
        payload["title"] = serde_json::json!(t);
    }
    if let Some(b) = body {
        payload["body"] = serde_json::json!(b);
    }
    if let Some(s) = state {
        payload["state"] = serde_json::json!(s);
    }
    gh_patch(token, &url, &payload).await
}

/// Add a comment to an issue or pull request.
pub async fn add_comment(
    token: &str,
    owner: &str,
    repo: &str,
    issue_number: u64,
    body: &str,
) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues/{}/comments",
        owner, repo, issue_number
    );
    let payload = serde_json::json!({ "body": body });
    gh_post(token, &url, &payload).await
}

/// Create a pull request.
pub async fn create_pull_request(
    token: &str,
    owner: &str,
    repo: &str,
    title: &str,
    head: &str,
    base: &str,
    body: &str,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);
    let payload = serde_json::json!({
        "title": title,
        "head": head,
        "base": base,
        "body": body,
    });
    gh_post(token, &url, &payload).await
}
