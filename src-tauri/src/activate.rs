use crate::api::get_stored_credentials;
use crate::app_config::fetch_app_config;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

fn lamu_api_url() -> &'static str {
    option_env!("LAMU_API_URL").unwrap_or("http://localhost:3000")
}

// ── In-app payment commands (no CORS — called via Tauri invoke) ───────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentInitResult {
    pub success: bool,
    pub transaction_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentStatusResult {
    pub confirmed: bool,
}

#[tauri::command]
pub async fn initiate_payment(msisdn: String, reference: String) -> Result<PaymentInitResult, String> {
    let cfg = fetch_app_config().await;
    let client = reqwest::Client::new();
    let response = client
        .post(&cfg.payment_pay_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "amount": cfg.payment_amount,
            "msisdn": msisdn,
            "reference": reference,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let result: serde_json::Value = response.json().await
        .map_err(|e| format!("Invalid response: {}", e))?;

    let success = result["status"]["success"].as_bool().unwrap_or(false);
    if success {
        let tx_id = result["data"]["transaction"]["id"]
            .as_str()
            .unwrap_or("")
            .to_string();
        Ok(PaymentInitResult { success: true, transaction_id: Some(tx_id), error: None })
    } else {
        let msg = result["status"]["message"]
            .as_str()
            .unwrap_or("Échec du paiement")
            .to_string();
        Ok(PaymentInitResult { success: false, transaction_id: None, error: Some(msg) })
    }
}

#[tauri::command]
pub async fn check_payment_status(transaction_id: String) -> Result<PaymentStatusResult, String> {
    let cfg = fetch_app_config().await;
    let client = reqwest::Client::new();
    let response = client
        .post(&cfg.payment_validate_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "code": transaction_id }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let result: serde_json::Value = response.json().await
        .map_err(|e| format!("Invalid response: {}", e))?;

    let confirmed = result["status"]["success"].as_bool().unwrap_or(false);
    Ok(PaymentStatusResult { confirmed })
}

// Secure storage functions using Tauri's app data directory
fn get_secure_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create the directory if it doesn't exist
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("secure_storage.json"))
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct SecureStorage {
    license_key: Option<String>,
    instance_id: Option<String>,
    selected_lamu_model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageItem {
    key: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageResult {
    license_key: Option<String>,
    instance_id: Option<String>,
    selected_lamu_model: Option<String>,
}

#[tauri::command]
pub async fn secure_storage_save(app: AppHandle, items: Vec<StorageItem>) -> Result<(), String> {
    let storage_path = get_secure_storage_path(&app)?;

    let mut storage = if storage_path.exists() {
        let content = fs::read_to_string(&storage_path)
            .map_err(|e| format!("Failed to read storage file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SecureStorage::default()
    };

    for item in items {
        match item.key.as_str() {
            "lamu_license_key" => storage.license_key = Some(item.value),
            "lamu_instance_id" => storage.instance_id = Some(item.value),
            "selected_lamu_model" => storage.selected_lamu_model = Some(item.value),
            _ => return Err(format!("Invalid storage key: {}", item.key)),
        }
    }

    let content = serde_json::to_string(&storage)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;

    fs::write(&storage_path, content)
        .map_err(|e| format!("Failed to write storage file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn secure_storage_get(app: AppHandle) -> Result<StorageResult, String> {
    let storage_path = get_secure_storage_path(&app)?;

    if !storage_path.exists() {
        return Ok(StorageResult {
            license_key: None,
            instance_id: None,
            selected_lamu_model: None,
        });
    }

    let content = fs::read_to_string(&storage_path)
        .map_err(|e| format!("Failed to read storage file: {}", e))?;

    let storage: SecureStorage = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse storage file: {}", e))?;

    Ok(StorageResult {
        license_key: storage.license_key,
        instance_id: storage.instance_id,
        selected_lamu_model: storage.selected_lamu_model,
    })
}

#[tauri::command]
pub async fn secure_storage_remove(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    let storage_path = get_secure_storage_path(&app)?;

    if !storage_path.exists() {
        return Ok(()); // Nothing to remove
    }

    let content = fs::read_to_string(&storage_path)
        .map_err(|e| format!("Failed to read storage file: {}", e))?;

    let mut storage: SecureStorage = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse storage file: {}", e))?;

    for key in keys {
        match key.as_str() {
            "lamu_license_key" => storage.license_key = None,
            "lamu_instance_id" => storage.instance_id = None,
            "selected_lamu_model" => storage.selected_lamu_model = None,
            _ => return Err(format!("Invalid storage key: {}", key)),
        }
    }

    let content = serde_json::to_string(&storage)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;

    fs::write(&storage_path, content)
        .map_err(|e| format!("Failed to write storage file: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivationResponse {
    activated: bool,
    error: Option<String>,
    license_key: Option<String>,
    instance: Option<InstanceInfo>,
    is_dev_license: bool,
    plan_id: Option<String>,
    plan_name: Option<String>,
    features: Vec<String>,
    max_requests: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateResponse {
    is_active: bool,
    last_validated_at: Option<String>,
    is_dev_license: bool,
    plan_id: Option<String>,
    plan_name: Option<String>,
    features: Vec<String>,
    max_requests: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceInfo {
    id: String,
    name: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutResponse {
    success: Option<bool>,
    checkout_url: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn activate_license_api(
    _app: AppHandle,
    license_key: String,
) -> Result<ActivationResponse, String> {
    let key = license_key.trim().to_string();
    if key.is_empty() {
        return Ok(ActivationResponse {
            activated: false,
            error: Some("License key cannot be empty".to_string()),
            license_key: None,
            instance: None,
            is_dev_license: false,
            plan_id: None,
            plan_name: None,
            features: vec![],
            max_requests: None,
        });
    }

    let client = reqwest::Client::new();
    // Use the stable machine fingerprint (survives reinstalls)
    let instance_id = machine_instance_id();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 1. Activate via backend Lamu (MySQL) — binds license to this machine
    let activate_url = format!("{}/api/license/activate", lamu_api_url());
    if let Ok(resp) = client
        .post(&activate_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "license_key": key, "instance_id": instance_id }))
        .send()
        .await
    {
        if let Ok(result) = resp.json::<serde_json::Value>().await {
            if result["activated"].as_bool().unwrap_or(false) {
                let plan_id = result["plan_id"].as_str().map(|s| s.to_string());
                let plan_name_str = result["plan_name"].as_str().unwrap_or("Pro").to_string();
                let features: Vec<String> = result["features"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();
                let max_requests = result["max_requests"].as_i64();
                return Ok(ActivationResponse {
                    activated: true,
                    error: None,
                    license_key: Some(key),
                    instance: Some(InstanceInfo {
                        id: instance_id,
                        name: format!("Lamuka {}", plan_name_str),
                        created_at: format!("{}", ts),
                    }),
                    is_dev_license: false,
                    plan_id,
                    plan_name: Some(plan_name_str),
                    features,
                    max_requests,
                });
            } else {
                // Backend returned an explicit error (e.g. already bound to another machine)
                let err_msg = result["error"]
                    .as_str()
                    .unwrap_or("Invalid or already used license key.")
                    .to_string();
                return Ok(ActivationResponse {
                    activated: false,
                    error: Some(err_msg),
                    license_key: None,
                    instance: None,
                    is_dev_license: false,
                    plan_id: None,
                    plan_name: None,
                    features: vec![],
                    max_requests: None,
                });
            }
        }
    }

    // Backend unreachable or returned unparseable JSON
    Ok(ActivationResponse {
        activated: false,
        error: Some("Impossible de contacter le serveur de licences. Vérifiez votre connexion.".to_string()),
        license_key: None,
        instance: None,
        is_dev_license: false,
        plan_id: None,
        plan_name: None,
        features: vec![],
        max_requests: None,
    })
}

/// Login with email — retrieves the license associated with this email and binds it to this machine.
/// Allows the user to recover access on a new device without needing the license key.
#[tauri::command]
pub async fn login_with_email(
    app: AppHandle,
    email: String,
    user_name: Option<String>,
) -> Result<ActivationResponse, String> {
    let email = email.trim().to_lowercase();
    if email.is_empty() {
        return Ok(ActivationResponse {
            activated: false,
            error: Some("L'adresse email est requise.".to_string()),
            license_key: None,
            instance: None,
            is_dev_license: false,
            plan_id: None,
            plan_name: None,
            features: vec![],
            max_requests: None,
        });
    }

    let instance_id = machine_instance_id();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default();

    let login_url = format!("{}/api/license/login", lamu_api_url());
    let resp = client
        .post(&login_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "email": email,
            "instance_id": instance_id,
            "user_name": user_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Erreur réseau: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Réponse invalide: {}", e))?;

    if !data["success"].as_bool().unwrap_or(false) {
        let err_msg = data["error"]
            .as_str()
            .unwrap_or("Connexion échouée.")
            .to_string();
        return Ok(ActivationResponse {
            activated: false,
            error: Some(err_msg),
            license_key: None,
            instance: None,
            is_dev_license: false,
            plan_id: None,
            plan_name: None,
            features: vec![],
            max_requests: None,
        });
    }

    let license_key = data["license_key"].as_str().unwrap_or("").to_string();
    let plan_id = data["plan_id"].as_str().map(|s| s.to_string());
    let plan_name_str = data["plan_name"].as_str().unwrap_or("Pro").to_string();
    let features: Vec<String> = data["features"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    // Persist license_key + instance_id in secure storage
    let storage_path = get_secure_storage_path(&app)?;
    let mut storage: SecureStorage = if storage_path.exists() {
        let content = std::fs::read_to_string(&storage_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SecureStorage::default()
    };
    storage.license_key = Some(license_key.clone());
    storage.instance_id = Some(instance_id.clone());
    let content = serde_json::to_string(&storage)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;
    std::fs::write(&storage_path, content)
        .map_err(|e| format!("Failed to write storage: {}", e))?;

    Ok(ActivationResponse {
        activated: true,
        error: None,
        license_key: Some(license_key),
        instance: Some(InstanceInfo {
            id: instance_id,
            name: format!("Lamuka {}", plan_name_str),
            created_at: format!("{}", ts),
        }),
        is_dev_license: false,
        plan_id,
        plan_name: Some(plan_name_str),
        features,
        max_requests: data["max_requests"].as_i64(),
    })
}

#[tauri::command]
pub async fn deactivate_license_api(_app: AppHandle) -> Result<ActivationResponse, String> {
    // Deactivation is handled locally — license is cleared from secure storage by the caller
    Ok(ActivationResponse {
        activated: false,
        error: None,
        license_key: None,
        instance: None,
        is_dev_license: false,
        plan_id: None,
        plan_name: None,
        features: vec![],
        max_requests: None,
    })
}

#[tauri::command]
pub async fn validate_license_api(app: AppHandle) -> Result<ValidateResponse, String> {
    let result = get_stored_credentials(&app).await;
    let (license_key, instance_id, _) = match result {
        Ok(creds) => creds,
        Err(_) => return Ok(ValidateResponse {
            is_active: false,
            last_validated_at: None,
            is_dev_license: false,
            plan_id: None,
            plan_name: None,
            features: vec![],
            max_requests: None,
        }),
    };

    let locally_active = !license_key.is_empty() && !instance_id.is_empty();
    if !locally_active {
        return Ok(ValidateResponse {
            is_active: false,
            last_validated_at: None,
            is_dev_license: false,
            plan_id: None,
            plan_name: None,
            features: vec![],
            max_requests: None,
        });
    }

    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

    // Vérifie via le backend (avec fallback offline si backend indisponible)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .unwrap_or_default();

    // Use the stable hardware fingerprint so the server can enforce machine-binding
    let current_instance_id = machine_instance_id();

    let backend_url = format!("{}/api/license/validate", lamu_api_url());
    match client
        .post(&backend_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "license_key": license_key, "instance_id": current_instance_id }))
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                let is_active = data["is_active"].as_bool().unwrap_or(false);
                let plan_id = data["plan_id"].as_str().map(|s| s.to_string());
                let plan_name = data["plan_name"].as_str().map(|s| s.to_string());
                let features: Vec<String> = data["features"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();
                let max_requests = data["max_requests"].as_i64();
                // Server responded — trust it unconditionally (including is_active: false = revoked)
                // Cache last successful validation timestamp for offline fallback
                if is_active {
                    if let Ok(dir) = app.path().app_data_dir() {
                        let _ = fs::create_dir_all(&dir);
                        let _ = fs::write(dir.join("last_validated_at.txt"), format!("{}", ts));
                    }
                }
                return Ok(ValidateResponse {
                    is_active,
                    last_validated_at: Some(format!("{}", ts)),
                    is_dev_license: is_active,
                    plan_id,
                    plan_name,
                    features,
                    max_requests,
                });
            }
            // Server reached but returned unparseable JSON — treat as revoked (safer than allowing)
            return Ok(ValidateResponse {
                is_active: false,
                last_validated_at: Some(format!("{}", ts)),
                is_dev_license: false,
                plan_id: None,
                plan_name: None,
                features: vec![],
                max_requests: None,
            });
        }
        Err(_) => {
            // Backend genuinely unreachable (no network) — offline fallback below
        }
    }

    // Offline fallback — only when backend is completely unreachable (network error).
    // A server that responded with is_active:false NEVER reaches this point.
    // Time-bound: only allow offline fallback within 72 hours of last successful validation.
    const OFFLINE_MAX_SECS: u64 = 72 * 3600; // 72 hours
    let cache_path = app.path().app_data_dir().ok()
        .map(|d| d.join("last_validated_at.txt"));
    let last_ok_ts: u64 = cache_path.as_ref()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let offline_valid = locally_active && last_ok_ts > 0 && (ts - last_ok_ts) < OFFLINE_MAX_SECS;
    Ok(ValidateResponse {
        is_active: offline_valid,
        last_validated_at: Some(format!("{}", last_ok_ts)),
        is_dev_license: offline_valid,
        plan_id: if offline_valid { Some("pro".to_string()) } else { None },
        plan_name: if offline_valid { Some("Pro".to_string()) } else { None },
        features: if offline_valid {
            vec![
                "drag_window".to_string(),
                "screenshot".to_string(),
                "audio_capture".to_string(),
                "file_attachments".to_string(),
                "contact_support".to_string(),
                "knowledge_base".to_string(),
                "meeting_mode".to_string(),
            ]
        } else {
            vec![]
        },
        max_requests: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrialStatus {
    pub trial_expires_at: i64, // unix timestamp in milliseconds
    pub is_trial_active: bool,
    pub offline: bool, // true when backend was unreachable — frontend uses its own fallback
}

/// Derives a stable instance_id from the machine's hardware UID.
/// Uses SHA-256 so the raw OS identifier is never sent to the server.
/// Returns the same string across reinstalls on the same machine.
fn machine_instance_id() -> String {
    let raw = machine_uid::get().unwrap_or_else(|_| Uuid::new_v4().to_string());
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hasher.update(b"lamu-trial-v1"); // domain separation — change this to invalidate all trials
    format!("{:x}", hasher.finalize())
}

/// Returns the OS-level username (Windows: %USERNAME%, Unix: $USER).
/// Used to pre-fill the onboarding name field.
#[tauri::command]
pub fn get_os_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}

/// Called on every app launch (and again after onboarding sets a name).
/// Derives instance_id from machine hardware (survives reinstalls), then asks
/// the backend to record/return the first-seen date for this device.
/// Returns Err("offline") when the backend is unreachable so the frontend
/// can fall back to its locally-cached trial_expires_at value.
#[tauri::command]
pub async fn get_trial_status(app: AppHandle, user_name: Option<String>) -> Result<TrialStatus, String> {
    // ── 1. Derive instance_id from hardware (stable across reinstalls) ────────
    let instance_id = machine_instance_id();

    // Also persist it in secure storage so the license activation flow can use it
    let storage_path = get_secure_storage_path(&app)?;
    let mut storage: SecureStorage = if storage_path.exists() {
        let content = fs::read_to_string(&storage_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SecureStorage::default()
    };
    if storage.instance_id.as_deref() != Some(&instance_id) {
        storage.instance_id = Some(instance_id.clone());
        let content = serde_json::to_string(&storage)
            .map_err(|e| format!("Failed to serialize storage: {}", e))?;
        let _ = fs::write(&storage_path, content);
    }

    // ── 2. Ask the backend ────────────────────────────────────────────────────
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let url = format!("{}/api/trial/init", lamu_api_url());
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "instance_id": instance_id,
            "user_name": user_name.unwrap_or_default(),
        }))
        .send()
        .await
    {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(data) => {
                if let Some(expires_at) = data["trial_expires_at"].as_i64() {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    return Ok(TrialStatus {
                        trial_expires_at: expires_at,
                        is_trial_active: expires_at > now_ms,
                        offline: false,
                    });
                }
                Err("invalid_response".to_string())
            }
            Err(_) => Err("invalid_response".to_string()),
        },
        Err(_) => Err("offline".to_string()),
    }
}

#[tauri::command]
pub fn mask_license_key_cmd(license_key: String) -> String {
    if license_key.len() <= 8 {
        return "*".repeat(license_key.len());
    }

    let first_four = &license_key[..4];
    let last_four = &license_key[license_key.len() - 4..];
    let middle_stars = "*".repeat(license_key.len() - 8);

    format!("{}{}{}", first_four, middle_stars, last_four)
}

#[tauri::command]
pub async fn get_checkout_url() -> Result<CheckoutResponse, String> {
    // Redirected to website — this command is kept for compatibility
    Ok(CheckoutResponse {
        success: Some(true),
        checkout_url: Some("https://lamuka.com/pricing".to_string()),
        error: None,
    })
}
