/// GitLab integration — read (issues, MRs, files, wikis) + write (create/update issues, MRs, comments, files).
///
/// Auth: Personal Access Token or Project Access Token.
/// Supports GitLab.com and self-hosted instances.
/// Docs: https://docs.gitlab.com/ee/api/rest/
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{info, warn};

pub const PROVIDER: &str = "gitlab";

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GitLabIssue {
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub web_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitLabMR {
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub source_branch: String,
    pub target_branch: String,
    pub web_url: String,
}

// ── Auth / verify ─────────────────────────────────────────────────────────────

/// Verify the token and return the authenticated user's username.
pub async fn verify(token: &str, gitlab_url: &str) -> Result<String, String> {
    let base = base_url(gitlab_url);
    let resp = gl_get(token, &format!("{}/user", base)).await?;
    let username = resp["username"].as_str().unwrap_or("GitLab User").to_string();
    Ok(username)
}

// ── Read ──────────────────────────────────────────────────────────────────────

/// Fetch all content from a GitLab project into (title, text) pairs for KB ingestion.
pub async fn fetch_all_content(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
) -> Result<Vec<(String, String)>, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);
    let mut results = Vec::new();

    // Issues
    let issues = fetch_issues(token, &base, &encoded_id).await;
    results.extend(issues);

    // Merge Requests
    let mrs = fetch_merge_requests(token, &base, &encoded_id).await;
    results.extend(mrs);

    // README
    if let Some(readme) = fetch_readme(token, &base, &encoded_id).await {
        results.push(readme);
    }

    // Wiki pages
    let wiki = fetch_wiki(token, &base, &encoded_id).await;
    results.extend(wiki);

    info!("GitLab: fetched {} items for project {}", results.len(), project_id);
    Ok(results)
}

async fn fetch_issues(token: &str, base: &str, encoded_id: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    for state in ["opened", "closed"] {
        let url = format!(
            "{}/projects/{}/issues?state={}&per_page=100",
            base, encoded_id, state
        );
        match gl_get(token, &url).await {
            Ok(resp) => {
                for item in resp.as_array().cloned().unwrap_or_default() {
                    let iid = item["iid"].as_u64().unwrap_or(0);
                    let title_str = item["title"].as_str().unwrap_or("Untitled").to_string();
                    let body = item["description"].as_str().unwrap_or("").to_string();
                    let state_str = item["state"].as_str().unwrap_or("").to_string();
                    let labels: Vec<String> = item["labels"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|l| l.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    let assignees: Vec<String> = item["assignees"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|a| a["username"].as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();

                    let title = format!("[GitLab] Issue #{}: {}", iid, title_str);
                    let text = format!(
                        "Issue #{}: {}\nState: {}\nLabels: {}\nAssignees: {}\n\n{}",
                        iid, title_str, state_str,
                        labels.join(", "),
                        assignees.join(", "),
                        body
                    );
                    results.push((title, text));
                }
            }
            Err(e) => warn!("GitLab issues error: {}", e),
        }
    }
    results
}

async fn fetch_merge_requests(token: &str, base: &str, encoded_id: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    for state in ["opened", "merged", "closed"] {
        let url = format!(
            "{}/projects/{}/merge_requests?state={}&per_page=100",
            base, encoded_id, state
        );
        match gl_get(token, &url).await {
            Ok(resp) => {
                for item in resp.as_array().cloned().unwrap_or_default() {
                    let iid = item["iid"].as_u64().unwrap_or(0);
                    let title_str = item["title"].as_str().unwrap_or("Untitled").to_string();
                    let body = item["description"].as_str().unwrap_or("").to_string();
                    let state_str = item["state"].as_str().unwrap_or("").to_string();
                    let src = item["source_branch"].as_str().unwrap_or("").to_string();
                    let tgt = item["target_branch"].as_str().unwrap_or("").to_string();

                    let title = format!("[GitLab] MR #{}: {}", iid, title_str);
                    let text = format!(
                        "MR #{}: {}\nState: {}\n{} → {}\n\n{}",
                        iid, title_str, state_str, src, tgt, body
                    );
                    results.push((title, text));
                }
            }
            Err(e) => warn!("GitLab MRs error: {}", e),
        }
    }
    results
}

async fn fetch_readme(token: &str, base: &str, encoded_id: &str) -> Option<(String, String)> {
    for branch in ["main", "master", "develop"] {
        let url = format!(
            "{}/projects/{}/repository/files/README.md/raw?ref={}",
            base, encoded_id, branch
        );
        if let Ok(text) = gl_raw(token, &url).await {
            if !text.trim().is_empty() {
                return Some(("[GitLab] README".to_string(), text));
            }
        }
    }
    None
}

async fn fetch_wiki(token: &str, base: &str, encoded_id: &str) -> Vec<(String, String)> {
    let url = format!("{}/projects/{}/wikis?with_content=1", base, encoded_id);
    match gl_get(token, &url).await {
        Ok(resp) => {
            resp.as_array().cloned().unwrap_or_default().iter().filter_map(|page| {
                let title = page["title"].as_str()?.to_string();
                let content = page["content"].as_str().unwrap_or("").to_string();
                if content.trim().is_empty() { return None; }
                Some((format!("[GitLab] Wiki: {}", title), content))
            }).collect()
        }
        Err(_) => Vec::new(),
    }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/// Create a new issue. Returns the created issue.
pub async fn create_issue(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
    title: &str,
    description: &str,
    labels: Option<Vec<String>>,
    assignee_usernames: Option<Vec<String>>,
) -> Result<GitLabIssue, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);

    // Resolve assignee usernames → user IDs
    let assignee_ids: Vec<u64> = if let Some(names) = assignee_usernames {
        let mut ids = Vec::new();
        for name in names {
            if let Ok(user) = gl_get(token, &format!("{}/users?username={}", base, name)).await {
                if let Some(id) = user.as_array().and_then(|a| a.first()).and_then(|u| u["id"].as_u64()) {
                    ids.push(id);
                }
            }
        }
        ids
    } else {
        Vec::new()
    };

    let mut body = json!({
        "title": title,
        "description": description,
    });
    if let Some(lbls) = labels {
        body["labels"] = json!(lbls.join(","));
    }
    if !assignee_ids.is_empty() {
        body["assignee_ids"] = json!(assignee_ids);
    }

    let url = format!("{}/projects/{}/issues", base, encoded_id);
    let resp = gl_post(token, &url, &body).await?;

    Ok(GitLabIssue {
        iid: resp["iid"].as_u64().unwrap_or(0),
        title: resp["title"].as_str().unwrap_or("").to_string(),
        description: resp["description"].as_str().map(|s| s.to_string()),
        state: resp["state"].as_str().unwrap_or("opened").to_string(),
        web_url: resp["web_url"].as_str().unwrap_or("").to_string(),
    })
}

/// Update an existing issue (title, description, state, labels, assignees).
pub async fn update_issue(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
    issue_iid: u64,
    title: Option<&str>,
    description: Option<&str>,
    state_event: Option<&str>, // "close" or "reopen"
    labels: Option<Vec<String>>,
) -> Result<GitLabIssue, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);

    let mut body = json!({});
    if let Some(t) = title { body["title"] = json!(t); }
    if let Some(d) = description { body["description"] = json!(d); }
    if let Some(s) = state_event { body["state_event"] = json!(s); }
    if let Some(lbls) = labels { body["labels"] = json!(lbls.join(",")); }

    let url = format!("{}/projects/{}/issues/{}", base, encoded_id, issue_iid);
    let resp = gl_put(token, &url, &body).await?;

    Ok(GitLabIssue {
        iid: resp["iid"].as_u64().unwrap_or(issue_iid),
        title: resp["title"].as_str().unwrap_or("").to_string(),
        description: resp["description"].as_str().map(|s| s.to_string()),
        state: resp["state"].as_str().unwrap_or("").to_string(),
        web_url: resp["web_url"].as_str().unwrap_or("").to_string(),
    })
}

/// Add a comment to an issue.
pub async fn comment_issue(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
    issue_iid: u64,
    body: &str,
) -> Result<String, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);
    let url = format!("{}/projects/{}/issues/{}/notes", base, encoded_id, issue_iid);
    let resp = gl_post(token, &url, &json!({ "body": body })).await?;
    Ok(resp["web_url"].as_str().unwrap_or("Comment created").to_string())
}

/// Create a merge request.
pub async fn create_merge_request(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
    title: &str,
    source_branch: &str,
    target_branch: &str,
    description: &str,
) -> Result<GitLabMR, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);
    let url = format!("{}/projects/{}/merge_requests", base, encoded_id);
    let body = json!({
        "title": title,
        "source_branch": source_branch,
        "target_branch": target_branch,
        "description": description,
    });
    let resp = gl_post(token, &url, &body).await?;

    Ok(GitLabMR {
        iid: resp["iid"].as_u64().unwrap_or(0),
        title: resp["title"].as_str().unwrap_or("").to_string(),
        description: resp["description"].as_str().map(|s| s.to_string()),
        state: resp["state"].as_str().unwrap_or("opened").to_string(),
        source_branch: resp["source_branch"].as_str().unwrap_or("").to_string(),
        target_branch: resp["target_branch"].as_str().unwrap_or("").to_string(),
        web_url: resp["web_url"].as_str().unwrap_or("").to_string(),
    })
}

/// Create or update a file in the repository.
pub async fn upsert_file(
    token: &str,
    gitlab_url: &str,
    project_id: &str,
    file_path: &str,
    content: &str,
    branch: &str,
    commit_message: &str,
) -> Result<String, String> {
    let base = base_url(gitlab_url);
    let encoded_id = urlencoded(project_id);
    let encoded_path = urlencoded(file_path);

    // Check if file exists
    let check_url = format!(
        "{}/projects/{}/repository/files/{}?ref={}",
        base, encoded_id, encoded_path, branch
    );
    let file_exists = gl_get(token, &check_url).await.is_ok();

    let url = format!("{}/projects/{}/repository/files/{}", base, encoded_id, encoded_path);
    let body = json!({
        "branch": branch,
        "content": content,
        "commit_message": commit_message,
        "encoding": "text",
    });

    let resp = if file_exists {
        gl_put(token, &url, &body).await?
    } else {
        gl_post(token, &url, &body).await?
    };

    Ok(resp["file_path"].as_str().unwrap_or(file_path).to_string())
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

fn base_url(gitlab_url: &str) -> String {
    let base = gitlab_url.trim_end_matches('/');
    if base.is_empty() || base == "https://gitlab.com" || base == "http://gitlab.com" {
        "https://gitlab.com/api/v4".to_string()
    } else {
        format!("{}/api/v4", base)
    }
}

fn urlencoded(s: &str) -> String {
    s.replace('/', "%2F").replace(' ', "%20")
}

async fn gl_get(token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .header("PRIVATE-TOKEN", token)
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .send()
        .await
        .map_err(|e| format!("GitLab request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitLab parse failed: {}", e))
}

async fn gl_raw(token: &str, url: &str) -> Result<String, String> {
    Client::new()
        .get(url)
        .header("PRIVATE-TOKEN", token)
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .send()
        .await
        .map_err(|e| format!("GitLab raw request failed: {}", e))?
        .text()
        .await
        .map_err(|e| format!("GitLab raw parse failed: {}", e))
}

async fn gl_post(token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .header("PRIVATE-TOKEN", token)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GitLab POST failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitLab POST parse failed: {}", e))
}

async fn gl_put(token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .put(url)
        .header("PRIVATE-TOKEN", token)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Lamu-KnowledgeBase/1.0")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GitLab PUT failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("GitLab PUT parse failed: {}", e))
}
