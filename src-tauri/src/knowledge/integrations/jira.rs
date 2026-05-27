/// Jira integration — fetches all issues from all accessible projects via the REST API.
///
/// Auth: Basic auth (email + API token), same pattern as Confluence.
/// Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v2/intro/
use reqwest::Client;
use serde_json::Value;
use tracing::{info, warn};

pub const PROVIDER: &str = "jira";

/// Verify credentials and return the user's display name.
pub async fn verify(base_url: &str, email: &str, api_token: &str) -> Result<String, String> {
    let url = format!("{}/rest/api/2/myself", base_url.trim_end_matches('/'));
    let resp = jira_get(email, api_token, &url).await?;
    let name = resp["displayName"]
        .as_str()
        .unwrap_or("Jira User")
        .to_string();
    Ok(name)
}

/// Fetch all issues from all accessible projects and return (title, text) pairs.
pub async fn fetch_all_issues(
    base_url: &str,
    email: &str,
    api_token: &str,
) -> Result<Vec<(String, String)>, String> {
    let base = base_url.trim_end_matches('/');
    let mut results = Vec::new();

    // 1. Get all projects
    let projects_url = format!("{}/rest/api/2/project", base);
    let projects = jira_get(email, api_token, &projects_url).await?;
    let projects = projects.as_array().cloned().unwrap_or_default();

    for project in &projects {
        let key = match project["key"].as_str() {
            Some(k) => k,
            None => continue,
        };

        // 2. Search issues in this project using JQL, paginated
        let mut start = 0usize;
        loop {
            let search_url = format!(
                "{}/rest/api/2/search?jql=project={}&maxResults=50&startAt={}&fields=summary,description,status,priority,assignee,issuetype",
                base, key, start
            );

            let resp = match jira_get(email, api_token, &search_url).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("Jira project {} error: {}", key, e);
                    break;
                }
            };

            let issues = resp["issues"].as_array().cloned().unwrap_or_default();
            let total = resp["total"].as_u64().unwrap_or(0) as usize;
            let fetched = issues.len();

            for issue in issues {
                let key = issue["key"].as_str().unwrap_or("").to_string();
                let fields = &issue["fields"];

                let summary = fields["summary"].as_str().unwrap_or("Untitled").to_string();
                let title = format!("[{}] {}", key, summary);

                let description = fields["description"].as_str().unwrap_or("").to_string();
                let status = fields["status"]["name"].as_str().unwrap_or("").to_string();
                let priority = fields["priority"]["name"].as_str().unwrap_or("").to_string();
                let issue_type = fields["issuetype"]["name"].as_str().unwrap_or("").to_string();
                let assignee = fields["assignee"]["displayName"]
                    .as_str()
                    .unwrap_or("Unassigned")
                    .to_string();

                let text = format!(
                    "Issue: {}\nType: {}\nStatus: {}\nPriority: {}\nAssignee: {}\n\n{}",
                    title, issue_type, status, priority, assignee, description
                );

                if !text.trim().is_empty() {
                    results.push((title, text));
                }
            }

            start += fetched;
            if fetched == 0 || start >= total {
                break;
            }
        }
    }

    info!("Jira: fetched {} issues", results.len());
    Ok(results)
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async fn jira_get(email: &str, api_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Jira request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Jira response parse failed: {}", e))
}

async fn jira_post(email: &str, api_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Jira request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Jira response parse failed: {}", e))
}

async fn jira_put(email: &str, api_token: &str, url: &str, body: &Value) -> Result<(), String> {
    let resp = Client::new()
        .put(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Jira request failed: {}", e))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Jira PUT failed with status: {}", resp.status()))
    }
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new issue in a Jira project.
pub async fn create_issue(
    base_url: &str,
    email: &str,
    token: &str,
    project_key: &str,
    summary: &str,
    description: &str,
    issue_type: &str,
) -> Result<Value, String> {
    let url = format!("{}/rest/api/2/issue", base_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "fields": {
            "project": { "key": project_key },
            "summary": summary,
            "description": description,
            "issuetype": { "name": issue_type },
        }
    });
    jira_post(email, token, &url, &payload).await
}

/// Update summary and/or description of an existing Jira issue.
pub async fn update_issue(
    base_url: &str,
    email: &str,
    token: &str,
    issue_key: &str,
    summary: Option<&str>,
    description: Option<&str>,
) -> Result<Value, String> {
    let url = format!(
        "{}/rest/api/2/issue/{}",
        base_url.trim_end_matches('/'),
        issue_key
    );
    let mut fields = serde_json::json!({});
    if let Some(s) = summary {
        fields["summary"] = serde_json::json!(s);
    }
    if let Some(d) = description {
        fields["description"] = serde_json::json!(d);
    }
    let payload = serde_json::json!({ "fields": fields });
    jira_put(email, token, &url, &payload).await?;
    Ok(serde_json::json!({ "key": issue_key }))
}

/// Add a comment to a Jira issue.
pub async fn add_comment(
    base_url: &str,
    email: &str,
    token: &str,
    issue_key: &str,
    body: &str,
) -> Result<Value, String> {
    let url = format!(
        "{}/rest/api/2/issue/{}/comment",
        base_url.trim_end_matches('/'),
        issue_key
    );
    let payload = serde_json::json!({ "body": body });
    jira_post(email, token, &url, &payload).await
}

/// Transition a Jira issue to a new state by transition name (e.g. "In Progress", "Done").
/// Fetches available transitions first, then posts the matching one.
pub async fn transition_issue(
    base_url: &str,
    email: &str,
    token: &str,
    issue_key: &str,
    transition_name: &str,
) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');

    // 1. Fetch available transitions
    let transitions_url = format!("{}/rest/api/2/issue/{}/transitions", base, issue_key);
    let resp = jira_get(email, token, &transitions_url).await?;
    let transitions = resp["transitions"].as_array().cloned().unwrap_or_default();

    // 2. Find the transition by name (case-insensitive)
    let transition_id = transitions
        .iter()
        .find(|t| {
            t["name"]
                .as_str()
                .map(|n| n.to_lowercase() == transition_name.to_lowercase())
                .unwrap_or(false)
        })
        .and_then(|t| t["id"].as_str().map(|s| s.to_string()))
        .ok_or_else(|| format!("Jira transition '{}' not found for issue {}", transition_name, issue_key))?;

    // 3. Post the transition
    let post_url = format!("{}/rest/api/2/issue/{}/transitions", base, issue_key);
    let payload = serde_json::json!({ "transition": { "id": transition_id } });
    jira_post(email, token, &post_url, &payload).await?;
    Ok(())
}
