/// Salesforce integration — fetches records via the REST API using SOQL.
///
/// Auth: OAuth 2.0 Authorization Code flow (requires a Connected App in Salesforce).
/// Scopes: api, refresh_token
/// Docs: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
use reqwest::Client;
use serde_json::Value;
use tracing::{info, warn};

use crate::knowledge::oauth::{run_oauth_flow, OAuthConfig};
use tauri::AppHandle;

pub const PROVIDER: &str = "salesforce";

/// Run OAuth flow. `instance_url` is the Salesforce org URL, e.g. https://login.salesforce.com
/// or https://yourorg.my.salesforce.com.
pub async fn connect(
    app: &AppHandle,
    client_id: &str,
    client_secret: &str,
    instance_url: &str,
) -> Result<(String, Option<String>, Option<u64>, String), String> {
    let base = instance_url.trim_end_matches('/');
    let auth_url = format!("{}/services/oauth2/authorize", base);
    let token_url = format!("{}/services/oauth2/token", base);

    let tokens = run_oauth_flow(
        app,
        OAuthConfig {
            auth_url,
            token_url,
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            scopes: vec!["api".to_string(), "refresh_token".to_string()],
            extra_auth_params: vec![],
            extra_token_params: vec![],
        },
    )
    .await?;

    // The access_token response from Salesforce also includes the instance_url
    let name = fetch_user_name(&tokens.access_token, base)
        .await
        .unwrap_or_else(|_| "Salesforce Org".to_string());

    Ok((tokens.access_token, tokens.refresh_token, tokens.expires_in, name))
}

async fn fetch_user_name(access_token: &str, instance_url: &str) -> Result<String, String> {
    let url = format!("{}/services/oauth2/userinfo", instance_url);
    let v: Value = sf_get(access_token, &url).await?;
    Ok(v["name"]
        .as_str()
        .or_else(|| v["email"].as_str())
        .unwrap_or("Salesforce")
        .to_string())
}

/// Fetch records from Accounts, Contacts, Opportunities, Cases, and Knowledge Articles.
pub async fn fetch_all_records(
    access_token: &str,
    instance_url: &str,
) -> Result<Vec<(String, String)>, String> {
    let base = instance_url.trim_end_matches('/');
    let mut results = Vec::new();

    // Accounts
    let accounts = soql_query(
        access_token, base,
        "SELECT Id, Name, Description, Industry, Website FROM Account LIMIT 500",
    ).await;
    for rec in accounts {
        let name = rec["Name"].as_str().unwrap_or("Account").to_string();
        let desc = rec["Description"].as_str().unwrap_or("").to_string();
        let industry = rec["Industry"].as_str().unwrap_or("").to_string();
        let website = rec["Website"].as_str().unwrap_or("").to_string();
        let text = format!(
            "Account: {}\nIndustry: {}\nWebsite: {}\n\n{}",
            name, industry, website, desc
        );
        results.push((name, text));
    }

    // Contacts
    let contacts = soql_query(
        access_token, base,
        "SELECT Id, FirstName, LastName, Title, Email, Department FROM Contact LIMIT 500",
    ).await;
    for rec in contacts {
        let first = rec["FirstName"].as_str().unwrap_or("").to_string();
        let last = rec["LastName"].as_str().unwrap_or("").to_string();
        let name = format!("{} {}", first, last).trim().to_string();
        let title = rec["Title"].as_str().unwrap_or("").to_string();
        let email = rec["Email"].as_str().unwrap_or("").to_string();
        let dept = rec["Department"].as_str().unwrap_or("").to_string();
        let text = format!(
            "Contact: {}\nTitle: {}\nEmail: {}\nDepartment: {}",
            name, title, email, dept
        );
        if !name.is_empty() {
            results.push((name, text));
        }
    }

    // Opportunities
    let opps = soql_query(
        access_token, base,
        "SELECT Id, Name, Description, StageName, Amount, CloseDate FROM Opportunity LIMIT 500",
    ).await;
    for rec in opps {
        let name = rec["Name"].as_str().unwrap_or("Opportunity").to_string();
        let desc = rec["Description"].as_str().unwrap_or("").to_string();
        let stage = rec["StageName"].as_str().unwrap_or("").to_string();
        let amount = rec["Amount"].as_f64().map(|a| format!("${:.0}", a)).unwrap_or_default();
        let close = rec["CloseDate"].as_str().unwrap_or("").to_string();
        let text = format!(
            "Opportunity: {}\nStage: {}\nAmount: {}\nClose Date: {}\n\n{}",
            name, stage, amount, close, desc
        );
        results.push((name, text));
    }

    // Cases
    let cases = soql_query(
        access_token, base,
        "SELECT Id, Subject, Description, Status, Priority FROM Case LIMIT 500",
    ).await;
    for rec in cases {
        let subject = rec["Subject"].as_str().unwrap_or("Case").to_string();
        let desc = rec["Description"].as_str().unwrap_or("").to_string();
        let status = rec["Status"].as_str().unwrap_or("").to_string();
        let priority = rec["Priority"].as_str().unwrap_or("").to_string();
        let text = format!(
            "Case: {}\nStatus: {}\nPriority: {}\n\n{}",
            subject, status, priority, desc
        );
        if !subject.is_empty() {
            results.push((subject, text));
        }
    }

    // Knowledge Articles (if Knowledge is enabled)
    let articles = soql_query(
        access_token, base,
        "SELECT Id, Title, Summary FROM KnowledgeArticleVersion WHERE PublishStatus='Online' LIMIT 200",
    ).await;
    for rec in articles {
        let title = rec["Title"].as_str().unwrap_or("Article").to_string();
        let summary = rec["Summary"].as_str().unwrap_or("").to_string();
        if !summary.is_empty() {
            results.push((title, summary));
        }
    }

    info!("Salesforce: fetched {} records", results.len());
    Ok(results)
}

/// Run a SOQL query and return the records array. Returns empty vec on error.
async fn soql_query(access_token: &str, instance_url: &str, query: &str) -> Vec<Value> {
    let encoded = query.replace(' ', "+");
    let url = format!("{}/services/data/v58.0/query?q={}", instance_url, encoded);
    match sf_get(access_token, &url).await {
        Ok(resp) => resp["records"].as_array().cloned().unwrap_or_default(),
        Err(e) => {
            warn!("Salesforce SOQL error ({}): {}", query, e);
            Vec::new()
        }
    }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async fn sf_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Salesforce request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Salesforce response parse failed: {}", e))
}

async fn sf_post(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Salesforce request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Salesforce response parse failed: {}", e))
}

async fn sf_patch(access_token: &str, url: &str, body: &Value) -> Result<(), String> {
    let resp = Client::new()
        .patch(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Salesforce request failed: {}", e))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Salesforce PATCH failed with status: {}", resp.status()))
    }
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new Salesforce record of any sObject type (e.g. "Account", "Contact", "Case").
/// `fields` is a JSON object of field name → value pairs.
pub async fn create_record(
    token: &str,
    instance_url: &str,
    object_type: &str,
    fields: serde_json::Value,
) -> Result<Value, String> {
    let url = format!(
        "{}/services/data/v58.0/sobjects/{}/",
        instance_url.trim_end_matches('/'),
        object_type
    );
    sf_post(token, &url, &fields).await
}

/// Update an existing Salesforce record by ID.
/// `fields` is a JSON object of field name → value pairs to update.
pub async fn update_record(
    token: &str,
    instance_url: &str,
    object_type: &str,
    record_id: &str,
    fields: serde_json::Value,
) -> Result<(), String> {
    let url = format!(
        "{}/services/data/v58.0/sobjects/{}/{}",
        instance_url.trim_end_matches('/'),
        object_type,
        record_id
    );
    sf_patch(token, &url, &fields).await
}
