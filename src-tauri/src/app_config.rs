/// Fetches the full app configuration from the Lamu backend at runtime.
/// This replaces all hardcoded constants (payment URLs, amount, feature flags, etc.)
/// so that everything can be managed from the admin dashboard without recompiling.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn lamu_api_url() -> &'static str {
    // Debug builds (cargo tauri dev) → localhost:3000 automatically.
    // Release builds (cargo tauri build) → set LAMU_API_URL at build time,
    //   e.g.  LAMU_API_URL=https://api.lamuka.com cargo tauri build
    #[cfg(debug_assertions)]
    { option_env!("LAMU_API_URL").unwrap_or("http://localhost:3000") }
    #[cfg(not(debug_assertions))]
    { option_env!("LAMU_API_URL").unwrap_or("https://api.lamuka.com") }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    // Payment
    pub payment_pay_url:      String,
    pub payment_validate_url: String,
    pub payment_amount:       u32,
    pub payment_currency:     String,
    // Branding
    pub price_label:          String,
    pub license_key_prefix:   String,
    pub app_name:             String,
    pub support_email:        String,
    // Limits
    pub max_file_attachments: u32,
    pub max_kb_chunk_size:    u32,
    pub max_ai_tokens:        u32,
    // Analytics
    pub posthog_api_key:      String,
    pub app_update_url:       String,
}

impl AppConfig {
    /// Default fallback values used when the backend is unreachable.
    pub fn defaults() -> Self {
        AppConfig {
            payment_pay_url:      "https://paiement.elembotech.net/api/pay".to_string(),
            payment_validate_url: "https://paiement.elembotech.net/reponse/ghost".to_string(),
            payment_amount:       2,
            payment_currency:     "XAF".to_string(),
            price_label:          "2 XAF".to_string(),
            license_key_prefix:   "LMU-".to_string(),
            app_name:             "Lamu".to_string(),
            support_email:        "support@lamuka.com".to_string(),
            max_file_attachments: 6,
            max_kb_chunk_size:    1200,
            max_ai_tokens:        500,
            posthog_api_key:      String::new(),
            app_update_url:       "http://localhost:3000/api/update".to_string(),
        }
    }
}

/// Fetches app config from the backend. Falls back to defaults if unreachable.
pub async fn fetch_app_config() -> AppConfig {
    let url = format!("{}/api/app-config", lamu_api_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let raw: HashMap<String, String> = match client.get(&url).send().await {
        Ok(resp) => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => json
                    .get("config")
                    .and_then(|c| c.as_object())
                    .map(|obj| obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect())
                    .unwrap_or_default(),
                Err(_) => HashMap::new(),
            }
        }
        Err(_) => HashMap::new(),
    };

    let get_str = |key: &str, default: &str| -> String {
        raw.get(key).cloned().filter(|v| !v.is_empty()).unwrap_or_else(|| default.to_string())
    };
    let get_u32 = |key: &str, default: u32| -> u32 {
        raw.get(key).and_then(|v| v.parse().ok()).unwrap_or(default)
    };

    let defaults = AppConfig::defaults();
    AppConfig {
        payment_pay_url:      get_str("payment_pay_url",      &defaults.payment_pay_url),
        payment_validate_url: get_str("payment_validate_url", &defaults.payment_validate_url),
        payment_amount:       get_u32("payment_amount",       defaults.payment_amount),
        payment_currency:     get_str("payment_currency",     &defaults.payment_currency),
        price_label:          get_str("price_label",          &defaults.price_label),
        license_key_prefix:   get_str("license_key_prefix",   &defaults.license_key_prefix),
        app_name:             get_str("app_name",             &defaults.app_name),
        support_email:        get_str("support_email_address",&defaults.support_email),
        max_file_attachments: get_u32("max_file_attachments", defaults.max_file_attachments),
        max_kb_chunk_size:    get_u32("max_kb_chunk_size",    defaults.max_kb_chunk_size),
        max_ai_tokens:        get_u32("max_ai_tokens",        defaults.max_ai_tokens),
        posthog_api_key:      get_str("posthog_api_key",      &defaults.posthog_api_key),
        app_update_url:       get_str("app_update_url",       &defaults.app_update_url),
    }
}

/// Tauri command — exposes app config to the frontend.
#[tauri::command]
pub async fn get_app_config() -> Result<AppConfig, String> {
    Ok(fetch_app_config().await)
}
