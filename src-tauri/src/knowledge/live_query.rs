/// Live-query integrations: fetch fresh data directly from the external API
/// and return formatted text to be injected into the AI context.
use regex::Regex;
use reqwest::Client;
use rusqlite::params;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

// ── Entry point ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_integration_live_query(
    app: AppHandle,
    integration_id: String,
    query_hint: String,
) -> Result<String, String> {
    let db_path = {
        let state = app.state::<crate::KbState>();
        let guard = state.db_path.lock().unwrap();
        guard.clone().ok_or("DB not initialized")?
    };
    let conn = crate::knowledge::db::open(&db_path).map_err(|e| format!("DB error: {}", e))?;
    let (provider, token, config_str): (String, String, String) = conn
        .query_row(
            "SELECT provider, access_token, config FROM kb_integrations WHERE id = ?1",
            params![integration_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Integration not found".to_string())?;
    let config: Value = serde_json::from_str(&config_str).unwrap_or_default();

    // For database integrations, deobfuscate the stored password
    let effective_token = if matches!(provider.as_str(), "postgres" | "mysql") {
        crate::knowledge::commands::deobfuscate_token(&token).unwrap_or_else(|| token.clone())
    } else {
        token.clone()
    };

    match provider.as_str() {
        "gitlab"     => live_query_gitlab(&token, &config, &query_hint).await,
        "github"     => live_query_github(&token, &config, &query_hint).await,
        "jira"       => live_query_jira(&token, &config, &query_hint).await,
        "confluence" => live_query_confluence(&token, &config, &query_hint).await,
        "notion"     => live_query_notion(&token, &config, &query_hint).await,
        "salesforce" => live_query_salesforce(&token, &config, &query_hint).await,
        "shopify"    => live_query_shopify(&token, &config, &query_hint).await,
        "postgres" | "mysql" => live_query_database(&effective_token, &config, &query_hint).await,
        other => Err(format!("Provider '{}' does not support live queries", other)),
    }
}

// ── Query intent helpers ──────────────────────────────────────────────────────

/// Extract a numeric ID from strings like "#42", "issue 42", "MR 5", "PR #3"
fn extract_number(hint: &str) -> Option<u64> {
    let re = Regex::new(r"#?(\d+)").unwrap();
    re.captures(hint).and_then(|c| c[1].parse::<u64>().ok())
}

/// Extract a Jira-style issue key like PROJ-123
fn extract_jira_key(hint: &str) -> Option<String> {
    let re = Regex::new(r"\b([A-Z][A-Z0-9]+-\d+)\b").unwrap();
    re.captures(hint).map(|c| c[1].to_string())
}

fn contains_any(text: &str, keywords: &[&str]) -> bool {
    let lower = text.to_lowercase();
    keywords.iter().any(|k| lower.contains(k))
}

// ── GitLab ────────────────────────────────────────────────────────────────────

async fn live_query_gitlab(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let gitlab_url = config["gitlab_url"].as_str().unwrap_or("https://gitlab.com");
    let project_id = config["project_id"].as_str().ok_or("GitLab config missing project_id")?;
    let base = gitlab_base_url(gitlab_url);
    let enc = url_encode(project_id);
    let lower = hint.to_lowercase();

    // ── Specific issue ────────────────────────────────────────────────────────
    if contains_any(&lower, &["issue", "#", "ticket", "bug"]) {
        if let Some(iid) = extract_number(hint) {
            let url = format!("{}/projects/{}/issues/{}", base, enc, iid);
            if let Ok(issue) = gl_get(token, &url).await {
                let mut out = format_gitlab_issue_full(&issue);
                // Also fetch comments if explicitly requested
                if contains_any(&lower, &["comment", "discussion", "réponse", "note"]) {
                    let notes_url = format!("{}/projects/{}/issues/{}/notes?per_page=20", base, enc, iid);
                    if let Ok(notes) = gl_get(token, &notes_url).await {
                        out.push_str(&format_notes(&notes, "GitLab"));
                    }
                }
                return Ok(out);
            }
        }
    }

    // ── Comments on an issue (without specific issue number — list recent) ────
    if contains_any(&lower, &["comment", "discussion", "note"]) && !contains_any(&lower, &["mr", "merge request"]) {
        let issues_url = format!("{}/projects/{}/issues?state=opened&per_page=5&order_by=updated_at", base, enc);
        if let Ok(issues) = gl_get(token, &issues_url).await {
            let mut out = String::from("=== Dernières discussions GitLab ===\n");
            for issue in issues.as_array().cloned().unwrap_or_default().iter().take(5) {
                let iid = issue["iid"].as_u64().unwrap_or(0);
                let title = issue["title"].as_str().unwrap_or("Untitled");
                let notes_url = format!("{}/projects/{}/issues/{}/notes?per_page=5", base, enc, iid);
                if let Ok(notes) = gl_get(token, &notes_url).await {
                    out.push_str(&format!("\n📌 Issue #{} — {}\n", iid, title));
                    for note in notes.as_array().cloned().unwrap_or_default() {
                        let author = note["author"]["username"].as_str().unwrap_or("?");
                        let body = note["body"].as_str().unwrap_or("").chars().take(200).collect::<String>();
                        out.push_str(&format!("  [{author}] {body}\n"));
                    }
                }
            }
            return Ok(out);
        }
    }

    // ── Specific MR ───────────────────────────────────────────────────────────
    if contains_any(&lower, &["mr", "merge request", "pull request", "pr"]) {
        if let Some(iid) = extract_number(hint) {
            let url = format!("{}/projects/{}/merge_requests/{}", base, enc, iid);
            if let Ok(mr) = gl_get(token, &url).await {
                let mut out = format_gitlab_mr_full(&mr);
                if contains_any(&lower, &["comment", "discussion", "note"]) {
                    let notes_url = format!("{}/projects/{}/merge_requests/{}/notes?per_page=20", base, enc, iid);
                    if let Ok(notes) = gl_get(token, &notes_url).await {
                        out.push_str(&format_notes(&notes, "GitLab MR"));
                    }
                }
                return Ok(out);
            }
        }
        // List open MRs
        let mrs_url = format!("{}/projects/{}/merge_requests?state=opened&per_page=15&order_by=updated_at", base, enc);
        if let Ok(resp) = gl_get(token, &mrs_url).await {
            return Ok(format_gitlab_mr_list(&resp));
        }
    }

    // ── File content ──────────────────────────────────────────────────────────
    if contains_any(&lower, &["file", "fichier", "code", "src", "path", "/"]) {
        // Try to extract a file path from the hint
        if let Some(path) = extract_file_path(hint) {
            let branch = extract_branch(hint).unwrap_or_else(|| "main".to_string());
            let encoded_path = url_encode(&path);
            let url = format!("{}/projects/{}/repository/files/{}?ref={}", base, enc, encoded_path, branch);
            if let Ok(file) = gl_get(token, &url).await {
                let content_b64 = file["content"].as_str().unwrap_or("");
                let decoded = base64_decode(content_b64);
                return Ok(format!(
                    "=== Fichier GitLab: {} (branche: {}) ===\n```\n{}\n```",
                    path, branch,
                    decoded.chars().take(3000).collect::<String>()
                ));
            }
        }
    }

    // ── Commits / pushes ──────────────────────────────────────────────────────
    if contains_any(&lower, &["commit", "push", "history", "log", "modification", "change"]) {
        let branch = extract_branch(hint).unwrap_or_else(|| "main".to_string());
        let url = format!("{}/projects/{}/repository/commits?ref_name={}&per_page=20", base, enc, branch);
        if let Ok(resp) = gl_get(token, &url).await {
            return Ok(format_commits(&resp, "GitLab", &branch));
        }
    }

    // ── Pipelines / CI ────────────────────────────────────────────────────────
    if contains_any(&lower, &["pipeline", "ci", "build", "deploy", "job"]) {
        let url = format!("{}/projects/{}/pipelines?per_page=10", base, enc);
        if let Ok(resp) = gl_get(token, &url).await {
            return Ok(format_pipelines(&resp));
        }
    }

    // ── Branches ─────────────────────────────────────────────────────────────
    if contains_any(&lower, &["branch", "branche"]) {
        let url = format!("{}/projects/{}/repository/branches?per_page=20", base, enc);
        if let Ok(resp) = gl_get(token, &url).await {
            return Ok(format_branches(&resp, "GitLab"));
        }
    }

    // ── Default: open issues + MRs ────────────────────────────────────────────
    let mut items: Vec<(String, String)> = Vec::new();
    let issues_url = format!("{}/projects/{}/issues?state=opened&per_page=20&order_by=updated_at", base, enc);
    if let Ok(resp) = gl_get(token, &issues_url).await {
        for item in resp.as_array().cloned().unwrap_or_default() {
            let iid = item["iid"].as_u64().unwrap_or(0);
            let title = item["title"].as_str().unwrap_or("Untitled").to_string();
            let labels: Vec<String> = item["labels"].as_array().map(|a| {
                a.iter().filter_map(|l| l.as_str().map(String::from)).collect()
            }).unwrap_or_default();
            let assignees: Vec<String> = item["assignees"].as_array().map(|a| {
                a.iter().filter_map(|x| x["username"].as_str().map(String::from)).collect()
            }).unwrap_or_default();
            items.push((format!("Issue #{} — {}", iid, title),
                format!("Labels: {} | Assignees: {}", labels.join(", "), assignees.join(", "))));
        }
    }
    let mrs_url = format!("{}/projects/{}/merge_requests?state=opened&per_page=10", base, enc);
    if let Ok(resp) = gl_get(token, &mrs_url).await {
        for item in resp.as_array().cloned().unwrap_or_default() {
            let iid = item["iid"].as_u64().unwrap_or(0);
            let title = item["title"].as_str().unwrap_or("Untitled").to_string();
            let src = item["source_branch"].as_str().unwrap_or("?");
            let tgt = item["target_branch"].as_str().unwrap_or("?");
            let author = item["author"]["username"].as_str().unwrap_or("?");
            items.push((format!("MR #{} — {}", iid, title),
                format!("{} → {} | Author: {}", src, tgt, author)));
        }
    }
    Ok(format_list("GitLab", &items))
}

fn format_gitlab_issue_full(issue: &Value) -> String {
    let iid = issue["iid"].as_u64().unwrap_or(0);
    let title = issue["title"].as_str().unwrap_or("Untitled");
    let state = issue["state"].as_str().unwrap_or("unknown");
    let author = issue["author"]["username"].as_str().unwrap_or("?");
    let desc = issue["description"].as_str().unwrap_or("Pas de description");
    let labels: Vec<&str> = issue["labels"].as_array()
        .map(|a| a.iter().filter_map(|l| l.as_str()).collect())
        .unwrap_or_default();
    let assignees: Vec<&str> = issue["assignees"].as_array()
        .map(|a| a.iter().filter_map(|x| x["username"].as_str()).collect())
        .unwrap_or_default();
    let created = issue["created_at"].as_str().unwrap_or("?");
    let updated = issue["updated_at"].as_str().unwrap_or("?");
    format!(
        "=== GitLab Issue #{} ===\nTitre: {}\nStatut: {} | Auteur: {}\nLabels: {} | Assignés: {}\nCréé: {} | MàJ: {}\n\nDescription:\n{}\n",
        iid, title, state, author,
        labels.join(", "), assignees.join(", "),
        created, updated,
        desc.chars().take(2000).collect::<String>()
    )
}

fn format_gitlab_mr_full(mr: &Value) -> String {
    let iid = mr["iid"].as_u64().unwrap_or(0);
    let title = mr["title"].as_str().unwrap_or("Untitled");
    let state = mr["state"].as_str().unwrap_or("?");
    let author = mr["author"]["username"].as_str().unwrap_or("?");
    let src = mr["source_branch"].as_str().unwrap_or("?");
    let tgt = mr["target_branch"].as_str().unwrap_or("?");
    let desc = mr["description"].as_str().unwrap_or("");
    let created = mr["created_at"].as_str().unwrap_or("?");
    format!(
        "=== GitLab MR #{} ===\nTitre: {}\nStatut: {} | Auteur: {}\nBranche: {} → {}\nCréé: {}\n\nDescription:\n{}\n",
        iid, title, state, author, src, tgt, created,
        desc.chars().take(2000).collect::<String>()
    )
}

fn format_gitlab_mr_list(resp: &Value) -> String {
    let mut out = String::from("=== Merge Requests GitLab (ouvertes) ===\n");
    for mr in resp.as_array().cloned().unwrap_or_default() {
        let iid = mr["iid"].as_u64().unwrap_or(0);
        let title = mr["title"].as_str().unwrap_or("Untitled");
        let src = mr["source_branch"].as_str().unwrap_or("?");
        let tgt = mr["target_branch"].as_str().unwrap_or("?");
        let author = mr["author"]["username"].as_str().unwrap_or("?");
        out.push_str(&format!("• MR #{} — {} ({} → {}) | {}\n", iid, title, src, tgt, author));
    }
    out
}

// ── GitHub ────────────────────────────────────────────────────────────────────

async fn live_query_github(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let owner = config["owner"].as_str().ok_or("GitHub config missing owner")?;
    let repo = config["repo"].as_str().ok_or("GitHub config missing repo")?;
    let full_repo = if repo.contains('/') { repo.to_string() } else { format!("{}/{}", owner, repo) };
    let lower = hint.to_lowercase();

    // ── Specific issue ────────────────────────────────────────────────────────
    if contains_any(&lower, &["issue", "ticket", "bug"]) && !contains_any(&lower, &["pr", "pull request"]) {
        if let Some(num) = extract_number(hint) {
            let url = format!("https://api.github.com/repos/{}/issues/{}", full_repo, num);
            if let Ok(issue) = gh_get(token, &url).await {
                let mut out = format_github_issue_full(&issue, &full_repo);
                if contains_any(&lower, &["comment", "discussion"]) {
                    let comments_url = format!("https://api.github.com/repos/{}/issues/{}/comments?per_page=20", full_repo, num);
                    if let Ok(comments) = gh_get(token, &comments_url).await {
                        out.push_str(&format_github_comments(&comments));
                    }
                }
                return Ok(out);
            }
        }
    }

    // ── Specific PR ───────────────────────────────────────────────────────────
    if contains_any(&lower, &["pr", "pull request", "pull"]) {
        if let Some(num) = extract_number(hint) {
            let url = format!("https://api.github.com/repos/{}/pulls/{}", full_repo, num);
            if let Ok(pr) = gh_get(token, &url).await {
                let mut out = format_github_pr_full(&pr);
                if contains_any(&lower, &["comment", "review"]) {
                    let reviews_url = format!("https://api.github.com/repos/{}/pulls/{}/reviews", full_repo, num);
                    if let Ok(reviews) = gh_get(token, &reviews_url).await {
                        out.push_str(&format_github_reviews(&reviews));
                    }
                }
                return Ok(out);
            }
        }
        // List open PRs
        let prs_url = format!("https://api.github.com/repos/{}/pulls?state=open&per_page=15", full_repo);
        if let Ok(resp) = gh_get(token, &prs_url).await {
            return Ok(format_github_pr_list(&resp));
        }
    }

    // ── Commits ───────────────────────────────────────────────────────────────
    if contains_any(&lower, &["commit", "push", "history", "log", "change"]) {
        let branch = extract_branch(hint).unwrap_or_else(|| "main".to_string());
        let url = format!("https://api.github.com/repos/{}/commits?sha={}&per_page=20", full_repo, branch);
        if let Ok(resp) = gh_get(token, &url).await {
            return Ok(format_commits(&resp, "GitHub", &branch));
        }
    }

    // ── Branches ─────────────────────────────────────────────────────────────
    if contains_any(&lower, &["branch", "branche"]) {
        let url = format!("https://api.github.com/repos/{}/branches?per_page=30", full_repo);
        if let Ok(resp) = gh_get(token, &url).await {
            return Ok(format_branches(&resp, "GitHub"));
        }
    }

    // ── Releases ─────────────────────────────────────────────────────────────
    if contains_any(&lower, &["release", "version", "tag"]) {
        let url = format!("https://api.github.com/repos/{}/releases?per_page=10", full_repo);
        if let Ok(resp) = gh_get(token, &url).await {
            return Ok(format_releases(&resp));
        }
    }

    // ── Default: open issues + PRs ────────────────────────────────────────────
    let mut items: Vec<(String, String)> = Vec::new();
    let issues_url = format!("https://api.github.com/repos/{}/issues?state=open&per_page=20", full_repo);
    if let Ok(resp) = gh_get(token, &issues_url).await {
        for item in resp.as_array().cloned().unwrap_or_default() {
            if item.get("pull_request").is_some() { continue; }
            let num = item["number"].as_u64().unwrap_or(0);
            let title = item["title"].as_str().unwrap_or("Untitled").to_string();
            let labels: Vec<&str> = item["labels"].as_array()
                .map(|a| a.iter().filter_map(|l| l["name"].as_str()).collect())
                .unwrap_or_default();
            items.push((format!("Issue #{} — {}", num, title), format!("Labels: {}", labels.join(", "))));
        }
    }
    let prs_url = format!("https://api.github.com/repos/{}/pulls?state=open&per_page=10", full_repo);
    if let Ok(resp) = gh_get(token, &prs_url).await {
        for item in resp.as_array().cloned().unwrap_or_default() {
            let num = item["number"].as_u64().unwrap_or(0);
            let title = item["title"].as_str().unwrap_or("Untitled").to_string();
            let head = item["head"]["ref"].as_str().unwrap_or("?");
            let base_ref = item["base"]["ref"].as_str().unwrap_or("?");
            let author = item["user"]["login"].as_str().unwrap_or("?");
            items.push((format!("PR #{} — {}", num, title), format!("{} → {} | {}", head, base_ref, author)));
        }
    }
    Ok(format_list("GitHub", &items))
}

fn format_github_issue_full(issue: &Value, repo: &str) -> String {
    let num = issue["number"].as_u64().unwrap_or(0);
    let title = issue["title"].as_str().unwrap_or("Untitled");
    let state = issue["state"].as_str().unwrap_or("?");
    let author = issue["user"]["login"].as_str().unwrap_or("?");
    let body = issue["body"].as_str().unwrap_or("Pas de description");
    let labels: Vec<&str> = issue["labels"].as_array()
        .map(|a| a.iter().filter_map(|l| l["name"].as_str()).collect())
        .unwrap_or_default();
    let assignees: Vec<&str> = issue["assignees"].as_array()
        .map(|a| a.iter().filter_map(|x| x["login"].as_str()).collect())
        .unwrap_or_default();
    let created = issue["created_at"].as_str().unwrap_or("?");
    format!(
        "=== GitHub Issue #{} ({}) ===\nTitre: {}\nStatut: {} | Auteur: {}\nLabels: {} | Assignés: {}\nCréé: {}\n\nContenu:\n{}\n",
        num, repo, title, state, author,
        labels.join(", "), assignees.join(", "),
        created,
        body.chars().take(2000).collect::<String>()
    )
}

fn format_github_pr_full(pr: &Value) -> String {
    let num = pr["number"].as_u64().unwrap_or(0);
    let title = pr["title"].as_str().unwrap_or("Untitled");
    let state = pr["state"].as_str().unwrap_or("?");
    let author = pr["user"]["login"].as_str().unwrap_or("?");
    let head = pr["head"]["ref"].as_str().unwrap_or("?");
    let base_ref = pr["base"]["ref"].as_str().unwrap_or("?");
    let body = pr["body"].as_str().unwrap_or("");
    let created = pr["created_at"].as_str().unwrap_or("?");
    let mergeable = pr["mergeable"].as_bool().map(|b| if b { "oui" } else { "non" }).unwrap_or("?");
    format!(
        "=== GitHub PR #{} ===\nTitre: {}\nStatut: {} | Auteur: {}\nBranche: {} → {}\nFusionnable: {} | Créé: {}\n\nDescription:\n{}\n",
        num, title, state, author, head, base_ref, mergeable, created,
        body.chars().take(2000).collect::<String>()
    )
}

fn format_github_pr_list(resp: &Value) -> String {
    let mut out = String::from("=== Pull Requests GitHub (ouvertes) ===\n");
    for pr in resp.as_array().cloned().unwrap_or_default() {
        let num = pr["number"].as_u64().unwrap_or(0);
        let title = pr["title"].as_str().unwrap_or("Untitled");
        let head = pr["head"]["ref"].as_str().unwrap_or("?");
        let base_ref = pr["base"]["ref"].as_str().unwrap_or("?");
        let author = pr["user"]["login"].as_str().unwrap_or("?");
        out.push_str(&format!("• PR #{} — {} ({} → {}) | {}\n", num, title, head, base_ref, author));
    }
    out
}

fn format_github_comments(comments: &Value) -> String {
    let mut out = String::from("\n--- Commentaires ---\n");
    for c in comments.as_array().cloned().unwrap_or_default() {
        let author = c["user"]["login"].as_str().unwrap_or("?");
        let body = c["body"].as_str().unwrap_or("").chars().take(300).collect::<String>();
        let created = c["created_at"].as_str().unwrap_or("?");
        out.push_str(&format!("[{author} @ {created}] {body}\n"));
    }
    out
}

fn format_github_reviews(reviews: &Value) -> String {
    let mut out = String::from("\n--- Reviews ---\n");
    for r in reviews.as_array().cloned().unwrap_or_default() {
        let author = r["user"]["login"].as_str().unwrap_or("?");
        let state = r["state"].as_str().unwrap_or("?");
        let body = r["body"].as_str().unwrap_or("").chars().take(300).collect::<String>();
        out.push_str(&format!("[{author}] {state}: {body}\n"));
    }
    out
}

// ── Jira ──────────────────────────────────────────────────────────────────────

async fn live_query_jira(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let base_url = config["base_url"].as_str().ok_or("Jira config missing base_url")?.trim_end_matches('/');
    let email = config["email"].as_str().ok_or("Jira config missing email")?;
    let project_key = config["project_key"].as_str().unwrap_or("");
    let lower = hint.to_lowercase();

    // ── Specific issue by key (e.g. PROJ-123) ─────────────────────────────────
    if let Some(key) = extract_jira_key(hint) {
        let url = format!("{}/rest/api/2/issue/{}?fields=summary,description,status,priority,assignee,issuetype,comment,created,updated", base_url, key);
        if let Ok(issue) = jira_get(email, token, &url).await {
            let mut out = format_jira_issue_full(&issue, &key);
            if contains_any(&lower, &["comment", "discussion"]) {
                let comments = &issue["fields"]["comment"]["comments"];
                out.push_str(&format_jira_comments(comments));
            }
            return Ok(out);
        }
    }

    // ── Transitions / workflow ────────────────────────────────────────────────
    if contains_any(&lower, &["transition", "statut", "workflow", "status"]) {
        if let Some(key) = extract_jira_key(hint) {
            let url = format!("{}/rest/api/2/issue/{}/transitions", base_url, key);
            if let Ok(resp) = jira_get(email, token, &url).await {
                let mut out = format!("=== Transitions disponibles pour {} ===\n", key);
                for t in resp["transitions"].as_array().cloned().unwrap_or_default() {
                    let name = t["name"].as_str().unwrap_or("?");
                    let id = t["id"].as_str().unwrap_or("?");
                    out.push_str(&format!("• {} (id: {})\n", name, id));
                }
                return Ok(out);
            }
        }
    }

    // ── Sprint / active sprint ─────────────────────────────────────────────────
    if contains_any(&lower, &["sprint", "board", "active"]) {
        if project_key.is_empty() {
            return Err("Jira project_key is required for sprint queries. Please configure it in the integration settings.".to_string());
        }
        let jql = format!("project={} AND sprint in openSprints() ORDER BY updated DESC", project_key);
        let url = format!("{}/rest/api/2/search?jql={}&maxResults=20&fields=summary,status,priority,assignee,issuetype",
            base_url, urlencoded_query(&jql));
        if let Ok(resp) = jira_get(email, token, &url).await {
            return Ok(format_jira_list(&resp, "Sprint actif Jira"));
        }
    }

    // ── Done / resolved ───────────────────────────────────────────────────────
    if contains_any(&lower, &["done", "resolved", "closed", "terminé", "fermé"]) {
        let jql = if !project_key.is_empty() {
            format!("project={} AND status=Done ORDER BY updated DESC", project_key)
        } else {
            "status=Done ORDER BY updated DESC".to_string()
        };
        let url = format!("{}/rest/api/2/search?jql={}&maxResults=20&fields=summary,status,priority,assignee,issuetype",
            base_url, urlencoded_query(&jql));
        if let Ok(resp) = jira_get(email, token, &url).await {
            return Ok(format_jira_list(&resp, "Issues Jira résolues"));
        }
    }

    // ── Default: open issues in project ──────────────────────────────────────
    let jql = if !project_key.is_empty() {
        format!("project={} AND status!=Done ORDER BY updated DESC", project_key)
    } else {
        format!("text ~ \"{}\" AND status!=Done ORDER BY updated DESC", hint.replace('"', "'"))
    };
    let url = format!(
        "{}/rest/api/2/search?jql={}&maxResults=20&fields=summary,status,priority,assignee,issuetype",
        base_url, urlencoded_query(&jql)
    );
    let resp = jira_get(email, token, &url).await?;
    Ok(format_jira_list(&resp, "Issues Jira"))
}

fn format_jira_issue_full(issue: &Value, key: &str) -> String {
    let fields = &issue["fields"];
    let summary = fields["summary"].as_str().unwrap_or("Untitled");
    let status = fields["status"]["name"].as_str().unwrap_or("?");
    let priority = fields["priority"]["name"].as_str().unwrap_or("?");
    let issue_type = fields["issuetype"]["name"].as_str().unwrap_or("?");
    let assignee = fields["assignee"]["displayName"].as_str().unwrap_or("Non assigné");
    let desc = fields["description"].as_str().unwrap_or("Pas de description");
    let created = fields["created"].as_str().unwrap_or("?");
    let updated = fields["updated"].as_str().unwrap_or("?");
    format!(
        "=== Jira {} ===\nRésumé: {}\nType: {} | Statut: {} | Priorité: {}\nAssigné: {} | Créé: {} | MàJ: {}\n\nDescription:\n{}\n",
        key, summary, issue_type, status, priority, assignee, created, updated,
        desc.chars().take(2000).collect::<String>()
    )
}

fn format_jira_comments(comments: &Value) -> String {
    let mut out = String::from("\n--- Commentaires ---\n");
    for c in comments.as_array().cloned().unwrap_or_default().iter().take(10) {
        let author = c["author"]["displayName"].as_str().unwrap_or("?");
        let body = c["body"].as_str().unwrap_or("").chars().take(300).collect::<String>();
        let created = c["created"].as_str().unwrap_or("?");
        out.push_str(&format!("[{author} @ {created}] {body}\n"));
    }
    out
}

fn format_jira_list(resp: &Value, title: &str) -> String {
    let issues = resp["issues"].as_array().cloned().unwrap_or_default();
    if issues.is_empty() {
        return format!("Aucune issue trouvée dans {}", title);
    }
    let mut out = format!("=== {} ===\n", title);
    for issue in &issues {
        let key = issue["key"].as_str().unwrap_or("");
        let fields = &issue["fields"];
        let summary = fields["summary"].as_str().unwrap_or("Untitled");
        let status = fields["status"]["name"].as_str().unwrap_or("?");
        let priority = fields["priority"]["name"].as_str().unwrap_or("?");
        let issue_type = fields["issuetype"]["name"].as_str().unwrap_or("?");
        let assignee = fields["assignee"]["displayName"].as_str().unwrap_or("Unassigned");
        out.push_str(&format!("• {} — {} [{} | {} | {} | {}]\n", key, summary, issue_type, status, priority, assignee));
    }
    out
}

// ── Confluence ────────────────────────────────────────────────────────────────

async fn live_query_confluence(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let base_url = config["base_url"].as_str().ok_or("Confluence config missing base_url")?.trim_end_matches('/');
    let email = config["email"].as_str().ok_or("Confluence config missing email")?;
    let space_key = config["space_key"].as_str().unwrap_or("");
    let lower = hint.to_lowercase();

    // ── Specific page by ID ───────────────────────────────────────────────────
    if let Some(page_id) = extract_confluence_page_id(hint) {
        let url = format!("{}/wiki/rest/api/content/{}?expand=body.storage,version,space", base_url, page_id);
        if let Ok(page) = cf_get(email, token, &url).await {
            return Ok(format_confluence_page_full(&page));
        }
    }

    // ── Search by keyword ─────────────────────────────────────────────────────
    let search_term = extract_search_term(hint);
    if !search_term.is_empty() && !contains_any(&lower, &["list", "liste", "all", "tout", "récent", "recent"]) {
        let cql = if !space_key.is_empty() {
            format!("space={} AND title ~ \"{}\" OR text ~ \"{}\" ORDER BY lastmodified DESC", space_key, search_term, search_term)
        } else {
            format!("title ~ \"{}\" OR text ~ \"{}\" ORDER BY lastmodified DESC", search_term, search_term)
        };
        let url = format!("{}/wiki/rest/api/content/search?cql={}&limit=10&expand=version,space",
            base_url, urlencoded_query(&cql));
        if let Ok(resp) = cf_get(email, token, &url).await {
            if resp["results"].as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                return Ok(format_confluence_list(&resp));
            }
        }
    }

    // ── Default: recent pages in space ────────────────────────────────────────
    let url = if !space_key.is_empty() {
        format!("{}/wiki/rest/api/content?spaceKey={}&limit=15&orderby=modified&type=page&expand=version,space", base_url, space_key)
    } else {
        format!("{}/wiki/rest/api/content?limit=15&orderby=modified&type=page&expand=version,space", base_url)
    };
    let resp = cf_get(email, token, &url).await?;
    Ok(format_confluence_list(&resp))
}

fn format_confluence_page_full(page: &Value) -> String {
    let title = page["title"].as_str().unwrap_or("Untitled");
    let space = page["space"]["key"].as_str().unwrap_or("?");
    let version = page["version"]["number"].as_u64().unwrap_or(0);
    let author = page["version"]["by"]["displayName"].as_str().unwrap_or("?");
    let modified = page["version"]["when"].as_str().unwrap_or("?");
    // Extract plain text from storage format (rough extraction)
    let raw_body = page["body"]["storage"]["value"].as_str().unwrap_or("");
    let body_text = strip_html_tags(raw_body);
    format!(
        "=== Confluence: {} (Space: {}) ===\nVersion: {} | Modifié par: {} le {}\n\nContenu:\n{}\n",
        title, space, version, author, modified,
        body_text.chars().take(3000).collect::<String>()
    )
}

fn format_confluence_list(resp: &Value) -> String {
    let pages = resp["results"].as_array().cloned().unwrap_or_default();
    if pages.is_empty() {
        return "Aucune page Confluence trouvée.".to_string();
    }
    let mut out = String::from("=== Pages Confluence récentes ===\n");
    for page in &pages {
        let title = page["title"].as_str().unwrap_or("Untitled");
        let space = page["space"]["key"].as_str().unwrap_or("?");
        let modified = page["version"]["when"].as_str().unwrap_or("?");
        let author = page["version"]["by"]["displayName"].as_str().unwrap_or("?");
        out.push_str(&format!("• {} [Space: {}] — Modifié: {} par {}\n", title, space, modified, author));
    }
    out
}

// ── Notion ────────────────────────────────────────────────────────────────────

async fn live_query_notion(token: &str, _config: &Value, hint: &str) -> Result<String, String> {
    let lower = hint.to_lowercase();

    // ── Fetch specific page blocks ────────────────────────────────────────────
    if let Some(page_id) = extract_notion_page_id(hint) {
        let blocks_url = format!("https://api.notion.com/v1/blocks/{}/children?page_size=50", page_id);
        if let Ok(resp) = notion_get(token, &blocks_url).await {
            let mut out = format!("=== Contenu Notion page {} ===\n", page_id);
            for block in resp["results"].as_array().cloned().unwrap_or_default() {
                out.push_str(&extract_notion_block_text(&block));
            }
            return Ok(out);
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────
    let query = if lower.contains("all") || lower.contains("tout") || lower.contains("list") {
        "".to_string()
    } else {
        extract_search_term(hint)
    };

    let body = json!({ "query": query, "page_size": 15 });
    let resp = notion_post(token, "https://api.notion.com/v1/search", &body).await?;
    let results = resp["results"].as_array().cloned().unwrap_or_default();

    if results.is_empty() {
        return Ok("Aucune page Notion trouvée.".to_string());
    }

    let mut out = String::from("=== Pages/Bases Notion ===\n");
    for page in &results {
        let object_type = page["object"].as_str().unwrap_or("page");
        let title = extract_notion_title(page);
        let last_edited = page["last_edited_time"].as_str().unwrap_or("?");
        let url = page["url"].as_str().unwrap_or("");
        out.push_str(&format!("• [{}] {} — Modifié: {} | {}\n", object_type, title, last_edited, url));
    }
    Ok(out)
}

fn extract_notion_title(page: &Value) -> String {
    // Try properties.title then properties.Name
    if let Some(title_arr) = page["properties"]["title"]["title"].as_array()
        .or_else(|| page["properties"]["Name"]["title"].as_array()) {
        return title_arr.iter()
            .filter_map(|t| t["plain_text"].as_str())
            .collect::<Vec<_>>()
            .join("");
    }
    "Sans titre".to_string()
}

fn extract_notion_block_text(block: &Value) -> String {
    let block_type = block["type"].as_str().unwrap_or("");
    let rich_text = &block[block_type]["rich_text"];
    if let Some(texts) = rich_text.as_array() {
        let text: String = texts.iter()
            .filter_map(|t| t["plain_text"].as_str())
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return format!("{}\n", text);
        }
    }
    String::new()
}

// ── Salesforce ────────────────────────────────────────────────────────────────

async fn live_query_salesforce(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let instance_url = config["instance_url"].as_str()
        .ok_or("Salesforce config missing instance_url")?
        .trim_end_matches('/');
    let lower = hint.to_lowercase();

    // Detect object type and fields from hint
    let (object, fields) = derive_sf_object_and_fields(&lower);

    // Build WHERE clause from hint keywords
    let search_term = extract_search_term(hint);
    let soql = if !search_term.is_empty() && search_term.len() > 2 {
        format!("SELECT+{}+FROM+{}+WHERE+Name+LIKE+'%{}%'+LIMIT+20", fields, object, search_term)
    } else {
        format!("SELECT+{}+FROM+{}+ORDER+BY+LastModifiedDate+DESC+LIMIT+20", fields, object)
    };

    let url = format!("{}/services/data/v58.0/query?q={}", instance_url, soql);
    let resp = sf_get(token, &url).await?;
    let records = resp["records"].as_array().cloned().unwrap_or_default();

    if records.is_empty() {
        return Ok(format!("Aucun enregistrement Salesforce ({}) trouvé.", object));
    }

    let mut out = format!("=== Salesforce {} ===\n", object);
    for rec in &records {
        let name = rec["Name"].as_str().unwrap_or("?").to_string();
        // Collect any extra fields present
        let extra: Vec<String> = ["Email", "Phone", "Status", "StageName", "Amount", "Description"]
            .iter()
            .filter_map(|f| rec[f].as_str().map(|v| format!("{}: {}", f, v)))
            .collect();
        out.push_str(&format!("• {}", name));
        if !extra.is_empty() {
            out.push_str(&format!(" | {}", extra.join(" | ")));
        }
        out.push('\n');
    }
    Ok(out)
}

fn derive_sf_object_and_fields(lower: &str) -> (&'static str, &'static str) {
    if lower.contains("contact") {
        ("Contact", "Id,Name,Email,Phone,Title,AccountId")
    } else if lower.contains("opportunit") || lower.contains("deal") {
        ("Opportunity", "Id,Name,StageName,Amount,CloseDate,AccountId")
    } else if lower.contains("case") || lower.contains("ticket") || lower.contains("support") {
        ("Case", "Id,CaseNumber,Subject,Status,Priority,Description")
    } else if lower.contains("lead") {
        ("Lead", "Id,Name,Email,Phone,Company,Status")
    } else if lower.contains("task") || lower.contains("activit") {
        ("Task", "Id,Subject,Status,Priority,ActivityDate,Description")
    } else {
        ("Account", "Id,Name,Phone,Website,Industry,Description")
    }
}

// ── Shopify ───────────────────────────────────────────────────────────────────

async fn live_query_shopify(token: &str, config: &Value, hint: &str) -> Result<String, String> {
    let shop_domain = config["shop_domain"].as_str()
        .ok_or("Shopify config missing shop_domain")?
        .trim_end_matches('/');
    let lower = hint.to_lowercase();

    // ── Specific product by ID ────────────────────────────────────────────────
    if contains_any(&lower, &["product", "produit"]) {
        if let Some(id) = extract_number(hint) {
            let url = format!("https://{}/admin/api/2023-10/products/{}.json", shop_domain, id);
            if let Ok(resp) = shopify_get(token, &url).await {
                let p = &resp["product"];
                return Ok(format_shopify_product_full(p));
            }
        }
    }

    // ── Orders ────────────────────────────────────────────────────────────────
    if contains_any(&lower, &["order", "commande", "achat"]) {
        if let Some(id) = extract_number(hint) {
            let url = format!("https://{}/admin/api/2023-10/orders/{}.json", shop_domain, id);
            if let Ok(resp) = shopify_get(token, &url).await {
                return Ok(format_shopify_order_full(&resp["order"]));
            }
        }
        // List recent orders
        let url = format!("https://{}/admin/api/2023-10/orders.json?limit=20&status=any&fields=id,name,email,financial_status,fulfillment_status,total_price,created_at", shop_domain);
        if let Ok(resp) = shopify_get(token, &url).await {
            return Ok(format_shopify_orders(&resp["orders"]));
        }
    }

    // ── Inventory ─────────────────────────────────────────────────────────────
    if contains_any(&lower, &["inventory", "stock", "inventaire"]) {
        let url = format!("https://{}/admin/api/2023-10/inventory_levels.json?limit=20", shop_domain);
        if let Ok(resp) = shopify_get(token, &url).await {
            let mut out = String::from("=== Shopify Inventaire ===\n");
            for lvl in resp["inventory_levels"].as_array().cloned().unwrap_or_default() {
                let variant_id = lvl["inventory_item_id"].as_u64().unwrap_or(0);
                let qty = lvl["available"].as_i64().unwrap_or(0);
                out.push_str(&format!("• Item {} — Stock: {}\n", variant_id, qty));
            }
            return Ok(out);
        }
    }

    // ── Customers ─────────────────────────────────────────────────────────────
    if contains_any(&lower, &["customer", "client", "acheteur"]) {
        let search = extract_search_term(hint);
        let url = if !search.is_empty() {
            format!("https://{}/admin/api/2023-10/customers/search.json?query={}&limit=20&fields=id,email,first_name,last_name,orders_count,total_spent", shop_domain, urlencoded_query(&search))
        } else {
            format!("https://{}/admin/api/2023-10/customers.json?limit=20&fields=id,email,first_name,last_name,orders_count,total_spent", shop_domain)
        };
        if let Ok(resp) = shopify_get(token, &url).await {
            return Ok(format_shopify_customers(&resp["customers"]));
        }
    }

    // ── Default: product list with optional search ────────────────────────────
    let search = extract_search_term(hint);
    let url = if !search.is_empty() && !contains_any(&lower, &["all", "tout", "list", "liste"]) {
        format!("https://{}/admin/api/2023-10/products.json?title={}&limit=20&fields=id,title,product_type,status,tags,variants", shop_domain, urlencoded_query(&search))
    } else {
        format!("https://{}/admin/api/2023-10/products.json?limit=20&fields=id,title,product_type,status,tags,variants", shop_domain)
    };
    let resp = shopify_get(token, &url).await?;
    Ok(format_shopify_product_list(&resp["products"]))
}

fn format_shopify_product_full(p: &Value) -> String {
    let id = p["id"].as_u64().unwrap_or(0);
    let title = p["title"].as_str().unwrap_or("?");
    let product_type = p["product_type"].as_str().unwrap_or("?");
    let status = p["status"].as_str().unwrap_or("?");
    let tags = p["tags"].as_str().unwrap_or("");
    let desc = p["body_html"].as_str().unwrap_or("");
    let variants: Vec<String> = p["variants"].as_array().cloned().unwrap_or_default()
        .iter().map(|v| {
            let price = v["price"].as_str().unwrap_or("?");
            let sku = v["sku"].as_str().unwrap_or("?");
            let inv = v["inventory_quantity"].as_i64().unwrap_or(0);
            format!("SKU: {} | Prix: {} | Stock: {}", sku, price, inv)
        }).collect();
    format!(
        "=== Shopify Produit #{} ===\nTitre: {}\nType: {} | Statut: {}\nTags: {}\nVariantes:\n{}\n\nDescription:\n{}\n",
        id, title, product_type, status, tags,
        variants.join("\n"),
        strip_html_tags(desc).chars().take(1000).collect::<String>()
    )
}

fn format_shopify_product_list(products: &Value) -> String {
    let arr = products.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return "Aucun produit Shopify trouvé.".to_string(); }
    let mut out = String::from("=== Produits Shopify ===\n");
    for p in &arr {
        let id = p["id"].as_u64().unwrap_or(0);
        let title = p["title"].as_str().unwrap_or("?");
        let product_type = p["product_type"].as_str().unwrap_or("");
        let status = p["status"].as_str().unwrap_or("?");
        let price = p["variants"].as_array()
            .and_then(|v| v.first())
            .and_then(|v| v["price"].as_str())
            .unwrap_or("?");
        out.push_str(&format!("• #{} — {} [{}] {} — {}€\n", id, title, product_type, status, price));
    }
    out
}

fn format_shopify_orders(orders: &Value) -> String {
    let arr = orders.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return "Aucune commande Shopify trouvée.".to_string(); }
    let mut out = String::from("=== Commandes Shopify ===\n");
    for o in &arr {
        let name = o["name"].as_str().unwrap_or("?");
        let email = o["email"].as_str().unwrap_or("?");
        let fin = o["financial_status"].as_str().unwrap_or("?");
        let ful = o["fulfillment_status"].as_str().unwrap_or("unfulfilled");
        let total = o["total_price"].as_str().unwrap_or("?");
        let created = o["created_at"].as_str().unwrap_or("?");
        out.push_str(&format!("• {} — {} | Paiement: {} | Livraison: {} | Total: {} | {}\n", name, email, fin, ful, total, created));
    }
    out
}

fn format_shopify_order_full(order: &Value) -> String {
    let name = order["name"].as_str().unwrap_or("?");
    let email = order["email"].as_str().unwrap_or("?");
    let fin = order["financial_status"].as_str().unwrap_or("?");
    let ful = order["fulfillment_status"].as_str().unwrap_or("?");
    let total = order["total_price"].as_str().unwrap_or("?");
    let created = order["created_at"].as_str().unwrap_or("?");
    let note = order["note"].as_str().unwrap_or("");
    let items: Vec<String> = order["line_items"].as_array().cloned().unwrap_or_default()
        .iter().map(|i| {
            let title = i["title"].as_str().unwrap_or("?");
            let qty = i["quantity"].as_u64().unwrap_or(0);
            let price = i["price"].as_str().unwrap_or("?");
            format!("  {}x {} @ {}", qty, title, price)
        }).collect();
    format!(
        "=== Commande Shopify {} ===\nClient: {}\nPaiement: {} | Livraison: {} | Total: {}\nCréée: {}\nArticles:\n{}\nNote: {}\n",
        name, email, fin, ful, total, created, items.join("\n"), note
    )
}

fn format_shopify_customers(customers: &Value) -> String {
    let arr = customers.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return "Aucun client Shopify trouvé.".to_string(); }
    let mut out = String::from("=== Clients Shopify ===\n");
    for c in &arr {
        let first = c["first_name"].as_str().unwrap_or("");
        let last = c["last_name"].as_str().unwrap_or("");
        let email = c["email"].as_str().unwrap_or("?");
        let orders = c["orders_count"].as_u64().unwrap_or(0);
        let spent = c["total_spent"].as_str().unwrap_or("0");
        out.push_str(&format!("• {} {} <{}> — {} commandes | {}€ dépensés\n", first, last, email, orders, spent));
    }
    out
}

// ── Shared formatters ─────────────────────────────────────────────────────────

fn format_notes(notes: &Value, provider: &str) -> String {
    let arr = notes.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return format!("\n--- Aucun commentaire ({}) ---\n", provider); }
    let mut out = String::from("\n--- Commentaires ---\n");
    for note in arr.iter().take(20) {
        let author = note["author"]["username"]
            .as_str()
            .or_else(|| note["author"]["name"].as_str())
            .unwrap_or("?");
        let body = note["body"].as_str().unwrap_or("").chars().take(300).collect::<String>();
        let created = note["created_at"].as_str().unwrap_or("?");
        out.push_str(&format!("[{author} @ {created}] {body}\n"));
    }
    out
}

fn format_commits(resp: &Value, provider: &str, branch: &str) -> String {
    let arr = resp.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return format!("Aucun commit trouvé sur {} branche {}.", provider, branch); }
    let mut out = format!("=== Commits {} ({}) ===\n", provider, branch);
    for commit in arr.iter().take(20) {
        // GitHub uses .sha, GitLab uses .id
        let sha = commit["sha"].as_str()
            .or_else(|| commit["id"].as_str())
            .unwrap_or("?");
        let short_sha = &sha[..sha.len().min(8)];
        // GitHub: commit.message, GitLab: .message
        let msg = commit["commit"]["message"].as_str()
            .or_else(|| commit["message"].as_str())
            .unwrap_or("?");
        let first_line = msg.lines().next().unwrap_or(msg);
        // GitHub: commit.author.name, GitLab: .author_name
        let author = commit["commit"]["author"]["name"].as_str()
            .or_else(|| commit["author_name"].as_str())
            .unwrap_or("?");
        let date = commit["commit"]["author"]["date"].as_str()
            .or_else(|| commit["created_at"].as_str())
            .or_else(|| commit["authored_date"].as_str())
            .unwrap_or("?");
        out.push_str(&format!("• {} — {} | {} @ {}\n", short_sha, first_line, author, date));
    }
    out
}

fn format_pipelines(resp: &Value) -> String {
    let arr = resp.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return "Aucun pipeline GitLab trouvé.".to_string(); }
    let mut out = String::from("=== Pipelines GitLab ===\n");
    for p in arr.iter().take(10) {
        let id = p["id"].as_u64().unwrap_or(0);
        let status = p["status"].as_str().unwrap_or("?");
        let reference = p["ref"].as_str().unwrap_or("?");
        let created = p["created_at"].as_str().unwrap_or("?");
        out.push_str(&format!("• Pipeline #{} — {} | Branche: {} | {}\n", id, status, reference, created));
    }
    out
}

fn format_branches(resp: &Value, provider: &str) -> String {
    let arr = resp.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return format!("Aucune branche {} trouvée.", provider); }
    let mut out = format!("=== Branches {} ===\n", provider);
    for b in &arr {
        let name = b["name"].as_str().unwrap_or("?");
        // GitLab: commit.committed_date, GitHub: commit.commit.author.date
        let last_commit = b["commit"]["committed_date"].as_str()
            .or_else(|| b["commit"]["commit"]["author"]["date"].as_str())
            .unwrap_or("?");
        let protected = if b["protected"].as_bool().unwrap_or(false) { " 🔒" } else { "" };
        out.push_str(&format!("• {}{} — dernier commit: {}\n", name, protected, last_commit));
    }
    out
}

fn format_releases(resp: &Value) -> String {
    let arr = resp.as_array().cloned().unwrap_or_default();
    if arr.is_empty() { return "Aucune release GitHub trouvée.".to_string(); }
    let mut out = String::from("=== Releases GitHub ===\n");
    for r in &arr {
        let tag = r["tag_name"].as_str().unwrap_or("?");
        let name = r["name"].as_str().unwrap_or(tag);
        let published = r["published_at"].as_str().unwrap_or("?");
        let prerelease = if r["prerelease"].as_bool().unwrap_or(false) { " [pre-release]" } else { "" };
        out.push_str(&format!("• {} — {}{} | {}\n", tag, name, prerelease, published));
    }
    out
}

fn format_list(provider: &str, items: &[(String, String)]) -> String {
    if items.is_empty() { return format!("Aucun résultat trouvé dans {}", provider); }
    let lines: Vec<String> = items.iter()
        .map(|(title, preview)| format!("• {}: {}", title, &preview[..preview.len().min(200)]))
        .collect();
    format!("=== Données en temps réel depuis {} ===\n{}", provider, lines.join("\n"))
}

// ── SQL Databases (PostgreSQL / MySQL) ────────────────────────────────────────

async fn live_query_database(
    token: &str,
    config: &Value,
    hint: &str,
) -> Result<String, String> {
    crate::knowledge::integrations::database::live_snapshot(token, config, hint).await
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

fn gitlab_base_url(gitlab_url: &str) -> String {
    let base = gitlab_url.trim_end_matches('/');
    if base.is_empty() || base == "https://gitlab.com" || base == "http://gitlab.com" {
        "https://gitlab.com/api/v4".to_string()
    } else {
        format!("{}/api/v4", base)
    }
}

async fn gl_get(token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .header("PRIVATE-TOKEN", token)
        .header("User-Agent", "Lamu/1.0")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn gh_get(token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "Lamu/1.0")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn jira_get(email: &str, api_token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn cf_get(email: &str, api_token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .basic_auth(email, Some(api_token))
        .header("Accept", "application/json")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn notion_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .bearer_auth(access_token)
        .header("Notion-Version", "2022-06-28")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn notion_post(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new().post(url)
        .bearer_auth(access_token)
        .header("Notion-Version", "2022-06-28")
        .json(body)
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn sf_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

async fn shopify_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new().get(url)
        .header("X-Shopify-Access-Token", access_token)
        .header("Accept", "application/json")
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Text / URL extraction helpers ─────────────────────────────────────────────

fn url_encode(s: &str) -> String {
    s.replace('/', "%2F").replace(' ', "%20")
}

fn urlencoded_query(s: &str) -> String {
    s.chars().map(|c| match c {
        'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
        ' ' => "+".to_string(),
        other => {
            let mut buf = [0u8; 4];
            let bytes = other.encode_utf8(&mut buf);
            bytes.bytes().map(|b| format!("%{:02X}", b)).collect()
        }
    }).collect()
}

fn base64_decode(s: &str) -> String {
    // GitLab returns base64 with newlines; strip them first
    let clean: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    // Simple base64 decode using the ALPHABET
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let lookup: std::collections::HashMap<u8, u8> = ALPHA.iter().enumerate()
        .map(|(i, &c)| (c, i as u8)).collect();
    let bytes: Vec<u8> = clean.as_bytes().chunks(4).flat_map(|chunk| {
        let get = |c: u8| *lookup.get(&c).unwrap_or(&0);
        match chunk.len() {
            4 => {
                let b0 = (get(chunk[0]) << 2) | (get(chunk[1]) >> 4);
                let b1 = (get(chunk[1]) << 4) | (get(chunk[2]) >> 2);
                let b2 = (get(chunk[2]) << 6) | get(chunk[3]);
                if chunk[2] == b'=' { vec![b0] }
                else if chunk[3] == b'=' { vec![b0, b1] }
                else { vec![b0, b1, b2] }
            }
            _ => vec![],
        }
    }).collect();
    String::from_utf8_lossy(&bytes).to_string()
}

/// Extract a file path from strings like "file src/main.rs", "fichier path/to/file.ts"
fn extract_file_path(hint: &str) -> Option<String> {
    let re = Regex::new(r"(?:file|fichier|path|chemin)\s+([^\s]+\.[a-zA-Z0-9]+)").unwrap();
    re.captures(hint).map(|c| c[1].to_string())
        .or_else(|| {
            // Fallback: any token that looks like a file path (contains / and a dot)
            let re2 = Regex::new(r"([a-zA-Z0-9_\-./]+/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)").unwrap();
            re2.captures(hint).map(|c| c[1].to_string())
        })
}

/// Extract a branch name from strings like "branch main", "on develop", "branche feature/xyz"
fn extract_branch(hint: &str) -> Option<String> {
    let re = Regex::new(r"(?:branch|branche|on|ref)\s+([a-zA-Z0-9_/\-\.]+)").unwrap();
    re.captures(hint).map(|c| c[1].to_string())
}

/// Extract a Confluence page ID (numeric)
fn extract_confluence_page_id(hint: &str) -> Option<String> {
    let lower = hint.to_lowercase();
    if lower.contains("page") {
        let re = Regex::new(r"\b(\d{8,})\b").unwrap(); // Confluence page IDs are long
        return re.captures(hint).map(|c| c[1].to_string());
    }
    None
}

/// Extract a Notion page/block UUID
fn extract_notion_page_id(hint: &str) -> Option<String> {
    let re = Regex::new(r"\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b").unwrap();
    re.captures(hint).map(|c| c[1].to_string())
}

/// Extract a meaningful search term from a hint (remove common filler words)
fn extract_search_term(hint: &str) -> String {
    let stop_words = ["show", "me", "get", "fetch", "list", "find", "search", "query",
        "montre", "affiche", "cherche", "donne", "les", "des", "the", "a", "an",
        "issue", "issues", "mr", "pr", "page", "pages", "product", "produit",
        "comment", "comments", "commit", "commits", "branch", "branches",
        "gitlab", "github", "jira", "confluence", "notion", "salesforce", "shopify"];
    let words: Vec<&str> = hint.split_whitespace()
        .filter(|w| !stop_words.contains(&w.to_lowercase().as_str()))
        .filter(|w| !w.starts_with('#') && w.parse::<u64>().is_err())
        .collect();
    words.join(" ")
}

fn strip_html_tags(html: &str) -> String {
    let re = Regex::new(r"<[^>]+>").unwrap();
    let text = re.replace_all(html, " ");
    // Collapse whitespace
    let re2 = Regex::new(r"\s+").unwrap();
    re2.replace_all(&text, " ").trim().to_string()
}
