use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::info;

pub struct OAuthConfig {
    pub auth_url: String,
    pub token_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub scopes: Vec<String>,
    /// Additional query params for the auth URL (e.g. tenant for SharePoint)
    pub extra_auth_params: Vec<(String, String)>,
    /// Additional body fields for the token exchange
    pub extra_token_params: Vec<(String, String)>,
}

pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Seconds until expiry (from the provider)
    pub expires_in: Option<u64>,
}

const CALLBACK_HTML_OK: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
    <html><body style='font-family:sans-serif;text-align:center;padding-top:60px'>\
    <h2>✓ Authentication successful</h2><p>You can close this window and return to Lamu.</p>\
    </body></html>";

const CALLBACK_HTML_ERR: &str = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n\
    <html><body style='font-family:sans-serif;text-align:center;padding-top:60px'>\
    <h2>✗ Authentication failed</h2><p>Please close this window and try again.</p>\
    </body></html>";

/// Run a complete OAuth 2.0 Authorization Code flow:
/// 1. Bind a random localhost port for the redirect_uri
/// 2. Open the browser to the authorization URL
/// 3. Wait (up to 3 minutes) for the callback with the auth code
/// 4. Exchange the code for tokens
/// Returns the token set on success.
pub async fn run_oauth_flow(app: &AppHandle, config: OAuthConfig) -> Result<OAuthTokens, String> {
    // 1. Pick a random available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Cannot bind OAuth callback server: {}", e))?;
    let port = listener.local_addr().unwrap().port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    // 2. Build the authorization URL
    let scope_str = config.scopes.join(" ");
    let state_token = uuid::Uuid::new_v4().to_string();

    let mut params = vec![
        ("client_id", config.client_id.clone()),
        ("redirect_uri", redirect_uri.clone()),
        ("response_type", "code".to_string()),
        ("scope", scope_str),
        ("state", state_token.clone()),
        ("access_type", "offline".to_string()), // request refresh token (Google)
        ("prompt", "consent".to_string()),
    ];
    for (k, v) in &config.extra_auth_params {
        params.push((k, v.clone()));
    }

    let auth_url = reqwest::Url::parse_with_params(&config.auth_url, &params)
        .map_err(|e| format!("Invalid auth URL: {}", e))?;

    info!("Opening OAuth browser: {}", auth_url);

    // 3. Open browser
    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // 4. Wait for callback (3 minute timeout)
    let (mut stream, _) = tokio::time::timeout(Duration::from_secs(180), listener.accept())
        .await
        .map_err(|_| "OAuth timed out — no response from browser within 3 minutes".to_string())?
        .map_err(|e| format!("Callback server accept error: {}", e))?;

    // Read the HTTP GET request
    let mut buf = vec![0u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read callback: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract path from "GET /callback?code=xxx&state=yyy HTTP/1.1"
    let path = request
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .unwrap_or("");

    let query = path.split('?').nth(1).unwrap_or("");
    let params: HashMap<String, String> = query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let k = parts.next()?.to_string();
            let v = parts.next().unwrap_or("").to_string();
            Some((k, v))
        })
        .collect();

    // Validate state
    let returned_state = params.get("state").map(String::as_str).unwrap_or("");
    if returned_state != state_token {
        let _ = stream.write_all(CALLBACK_HTML_ERR.as_bytes()).await;
        return Err("OAuth state mismatch — possible CSRF attack".to_string());
    }

    let code = match params.get("code") {
        Some(c) => c.clone(),
        None => {
            let err = params
                .get("error_description")
                .or_else(|| params.get("error"))
                .map(String::as_str)
                .unwrap_or("Unknown error");
            let _ = stream.write_all(CALLBACK_HTML_ERR.as_bytes()).await;
            return Err(format!("OAuth authorization denied: {}", err));
        }
    };

    // Send success page to browser
    let _ = stream.write_all(CALLBACK_HTML_OK.as_bytes()).await;
    drop(stream);

    // 5. Exchange code for tokens
    exchange_code(config, code, redirect_uri).await
}

async fn exchange_code(
    config: OAuthConfig,
    code: String,
    redirect_uri: String,
) -> Result<OAuthTokens, String> {
    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: Option<u64>,
        error: Option<String>,
        error_description: Option<String>,
    }

    let mut body: Vec<(String, String)> = vec![
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("client_id".to_string(), config.client_id.clone()),
        ("client_secret".to_string(), config.client_secret.clone()),
        ("code".to_string(), code),
        ("redirect_uri".to_string(), redirect_uri),
    ];
    for (k, v) in config.extra_token_params {
        body.push((k, v));
    }

    let resp = Client::new()
        .post(&config.token_url)
        .form(&body)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    let token: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(err) = token.error {
        let desc = token.error_description.unwrap_or_default();
        return Err(format!("Token exchange error: {} — {}", err, desc));
    }

    Ok(OAuthTokens {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
    })
}

/// Refresh an access token using a refresh token.
#[allow(dead_code)]
pub async fn refresh_token(
    token_url: &str,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
    extra_params: &[(&str, &str)],
) -> Result<OAuthTokens, String> {
    #[derive(Deserialize)]
    struct Resp {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: Option<u64>,
    }

    let mut body: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
    ];
    body.extend_from_slice(extra_params);

    let resp = Client::new()
        .post(token_url)
        .form(&body)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let token: Resp = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    Ok(OAuthTokens {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
    })
}
