use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_machine_uid::MachineUidExt;

fn get_app_endpoint() -> Result<String, String> {
    // 1. Runtime override (e.g. from .env loaded by the shell)
    if let Ok(endpoint) = env::var("APP_ENDPOINT") {
        return Ok(endpoint);
    }
    // 2. Compile-time bake-in (CI/CD sets APP_ENDPOINT before `cargo tauri build`)
    if let Some(endpoint) = option_env!("APP_ENDPOINT") {
        return Ok(endpoint.to_string());
    }
    // 3. Auto-detect: debug builds always use localhost, release builds need APP_ENDPOINT
    #[cfg(debug_assertions)]
    { return Ok("http://localhost:3000".to_string()); }
    #[cfg(not(debug_assertions))]
    { Err("Backend URL not configured. Set APP_ENDPOINT at build time: APP_ENDPOINT=https://api.lamuka.com cargo tauri build".to_string()) }
}

fn get_api_access_key() -> Result<String, String> {
    if let Ok(key) = env::var("API_ACCESS_KEY") {
        return Ok(key);
    }
    if let Some(key) = option_env!("API_ACCESS_KEY") {
        return Ok(key.to_string());
    }
    // In debug builds, allow empty key (backend accepts requests without auth when key is unset)
    #[cfg(debug_assertions)]
    { return Ok(String::new()); }
    #[cfg(not(debug_assertions))]
    { Err("API_ACCESS_KEY not configured. Set it at build time: API_ACCESS_KEY=xxx cargo tauri build".to_string()) }
}

// Secure storage functions
fn get_secure_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

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

pub async fn get_stored_credentials(
    app: &AppHandle,
) -> Result<(String, String, Option<Model>), String> {
    let storage_path = get_secure_storage_path(app)?;

    if !storage_path.exists() {
        return Err("No license found. Please activate your license first.".to_string());
    }

    let content = fs::read_to_string(&storage_path)
        .map_err(|e| format!("Failed to read storage file: {}", e))?;

    let storage: SecureStorage = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse storage file: {}", e))?;

    let license_key = storage
        .license_key
        .ok_or("License key not found".to_string())?;
    let instance_id = storage
        .instance_id
        .ok_or("Instance ID not found".to_string())?;

    let selected_model: Option<Model> = storage
        .selected_lamu_model
        .and_then(|json_str| serde_json::from_str(&json_str).ok());

    Ok((license_key, instance_id, selected_model))
}

// Audio API Structs
#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResponse {
    success: bool,
    transcription: Option<String>,
    error: Option<String>,
}

// Chat API Structs
#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    user_message: String,
    system_prompt: Option<String>,
    image_base64: Option<serde_json::Value>, // Can be string or array
    history: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    success: bool,
    message: Option<String>,
    error: Option<String>,
}

// Model API Structs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Model {
    provider: String,
    name: String,
    id: String,
    model: String,
    description: String,
    modality: String,
    #[serde(rename = "isAvailable")]
    is_available: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsResponse {
    models: Vec<Model>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemPromptResponse {
    prompt_name: String,
    system_prompt: String,
}

// Lamu Prompts API
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LamuPrompt {
    title: String,
    prompt: String,
    #[serde(rename = "modelId")]
    model_id: String,
    #[serde(rename = "modelName")]
    model_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LamuPromptsResponse {
    prompts: Vec<LamuPrompt>,
    total: i32,
    #[serde(rename = "last_updated")]
    last_updated: Option<String>,
}

// API Response Configuration Structs
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponseConfig {
    url: String,
    user_token: String,
    model: String,
    #[serde(rename = "fallback_url")]
    fallback_url: Option<String>,
    #[serde(rename = "fallback_user_token")]
    fallback_user_token: Option<String>,
    #[serde(rename = "fallback_model")]
    fallback_model: Option<String>,
    body: String,
    customer_id: Option<i64>,
    customer_email: Option<String>,
    customer_name: Option<String>,
    license_key: String,
    instance_id: String,
    #[serde(rename = "user_audio")]
    user_audio: Option<UserAudioConfig>,
    errors: Option<Vec<ApiConfigError>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiConfigError {
    includes: String,
    error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAudioHeader {
    key: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAudioConfig {
    url: String,
    #[serde(rename = "fallback_url")]
    fallback_url: Option<String>,
    model: String,
    #[serde(rename = "fallback_model")]
    fallback_model: Option<String>,
    #[serde(rename = "user_token")]
    user_token: String,
    #[serde(rename = "fallback_user_token")]
    fallback_user_token: Option<String>,
    headers: Option<Vec<UserAudioHeader>>,
}

// Audio API Command
#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    audio_base64: String,
    language: Option<String>,
) -> Result<AudioResponse, String> {
    let (_, _, selected_model) = get_stored_credentials(&app).await?;
    let provider = selected_model.as_ref().map(|model| model.provider.clone());
    let model = selected_model.as_ref().map(|model| model.model.clone());

    let api_config = fetch_api_response_config(&app, provider.clone(), model.clone()).await?;
    let user_audio_config = api_config.user_audio.as_ref().ok_or_else(|| {
        "Audio transcription is not configured for this workspace. Please contact support."
            .to_string()
    })?;

    let audio_bytes = decode_audio_base64(&audio_base64)?;
    let client = reqwest::Client::new();
    let error_provider = provider.clone();
    let error_model = model.clone();
    match perform_user_audio_transcription(
        &client,
        &user_audio_config.url,
        &user_audio_config.user_token,
        &user_audio_config.model,
        user_audio_config.headers.as_ref(),
        &audio_bytes,
        language.as_deref(),
    )
    .await
    {
        Ok(transcription) => Ok(AudioResponse {
            success: true,
            transcription: Some(transcription),
            error: None,
        }),
        Err(primary_error) => {
            let fallback_error_message = if let (Some(fallback_url), Some(fallback_token)) = (
                user_audio_config.fallback_url.as_ref(),
                user_audio_config.fallback_user_token.as_ref(),
            ) {
                let fallback_model = user_audio_config
                    .fallback_model
                    .as_ref()
                    .unwrap_or(&user_audio_config.model);

                match perform_user_audio_transcription(
                    &client,
                    fallback_url,
                    fallback_token,
                    fallback_model,
                    user_audio_config.headers.as_ref(),
                    &audio_bytes,
                    language.as_deref(),
                )
                .await
                {
                    Ok(transcription) => {
                        return Ok(AudioResponse {
                            success: true,
                            transcription: Some(transcription),
                            error: None,
                        });
                    }
                    Err(fallback_error) => Some(fallback_error),
                }
            } else {
                Some("fallback not configured".to_string())
            };

            tracing::warn!(
                primary_error = %primary_error,
                fallback_error = %fallback_error_message
                    .as_deref()
                    .unwrap_or("not attempted"),
                "Audio transcription failed for all configured endpoints"
            );
            tauri::async_runtime::spawn({
                let app = app.clone();
                let error_msg = if let Some(fallback_err) = fallback_error_message {
                    format!("Primary: {} | Fallback: {}", primary_error, fallback_err)
                } else {
                    primary_error.clone()
                };
                async move {
                    report_api_error(
                        app,
                        error_msg,
                        "/api/transcribe".to_string(),
                        error_model,
                        error_provider,
                    )
                    .await;
                }
            });
            Err("Transcription failed. Please try again.".to_string())
        }
    }
}

// Helper function to fetch API response configuration
async fn fetch_api_response_config(
    app: &AppHandle,
    provider: Option<String>,
    model: Option<String>,
) -> Result<ApiResponseConfig, String> {
    // Get environment variables
    let app_endpoint = get_app_endpoint()?;
    let api_access_key = get_api_access_key()?;
    let machine_id: String = app.machine_uid().get_machine_uid()
        .ok().and_then(|u| u.id).unwrap_or_default();

    // Get stored credentials
    let (license_key, instance_id, _) = get_stored_credentials(app).await?;

    // Make HTTP request to response endpoint
    let client = reqwest::Client::new();
    let url = format!("{}/api/response", app_endpoint);

    let mut request = client
        .get(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("license_key", &license_key)
        .header("instance", &instance_id)
        .header("machine_id", &machine_id);

    // Add optional headers
    if let Some(p) = provider {
        request = request.header("provider", p);
    }
    if let Some(m) = model {
        request = request.header("model", m);
    }

    let response = request.send().await.map_err(|e| {
        let error_msg = format!("{}", e);
        if error_msg.contains("url (") {
            let parts: Vec<&str> = error_msg.split(" for url (").collect();
            if parts.len() > 1 {
                format!("Failed to fetch API config: {}", parts[0])
            } else {
                format!("Failed to fetch API config: {}", error_msg)
            }
        } else {
            format!("Failed to fetch API config: {}", error_msg)
        }
    })?;

    // Check if the response is successful
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown server error".to_string());

        // Try to parse error as JSON to get a more specific error message
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
            if let Some(error_msg) = error_json.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Server error ({}): {}", status, error_msg));
            } else if let Some(message) = error_json.get("message").and_then(|m| m.as_str()) {
                return Err(format!("Server error ({}): {}", status, message));
            }
        }

        return Err(format!("Server error ({}): {}", status, error_text));
    }
    let api_config: ApiResponseConfig = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API config response: {}", e))?;
    Ok(api_config)
}

fn map_api_error_message(error_rules: &[ApiConfigError], sources: &[String]) -> String {
    for source in sources {
        for rule in error_rules {
            if !rule.includes.is_empty() && source.contains(&rule.includes) {
                return rule.error.clone();
            }
        }
    }

    if let Some(default_rule) = error_rules
        .iter()
        .find(|rule| rule.includes.trim().is_empty())
    {
        return default_rule.error.clone();
    }

    error_rules
        .first()
        .map(|rule| rule.error.clone())
        .unwrap_or_else(|| {
            "Something went wrong. Please try switching to a different model or contact support."
                .to_string()
        })
}

fn decode_audio_base64(audio_base64: &str) -> Result<Vec<u8>, String> {
    let trimmed = audio_base64.trim();
    let base64_str = if let Some(idx) = trimmed.find(',') {
        &trimmed[idx + 1..]
    } else {
        trimmed
    };

    general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| format!("Failed to decode audio data: {}", e))
}

async fn perform_user_audio_transcription(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    model: &str,
    headers: Option<&Vec<UserAudioHeader>>,
    audio_bytes: &[u8],
    language: Option<&str>,
) -> Result<String, String> {
    let audio_part = Part::bytes(audio_bytes.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to prepare audio payload: {}", e))?;

    let mut form = Form::new()
        .part("file", audio_part)
        .text("model", model.to_string());

    // Inject language hint when provided (Whisper BCP-47 codes)
    if let Some(lang) = language {
        if !lang.is_empty() {
            form = form.text("language", lang.to_string());
        }
    }

    if let Some(extra_headers) = headers {
        for header in extra_headers {
            let key = header.key.trim();
            if key.is_empty() {
                continue;
            }

            form = form.text(key.to_string(), header.value.clone());
        }
    }

    let response = client
        .post(url)
        .bearer_auth(token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Transcription request failed to send: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unable to read transcription error response".to_string());
        return Err(format!(
            "Transcription request returned {} with body: {}",
            status, error_text
        ));
    }

    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read transcription response: {}", e))?;

    if body_text.trim().is_empty() {
        return Err("Transcription response was empty".to_string());
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_text) {
        if let Some(text) = json.get("text").and_then(|value| value.as_str()) {
            return Ok(text.to_string());
        }

        if let Some(text) = json
            .get("transcription")
            .and_then(|value| value.as_str())
            .or_else(|| json.get("result").and_then(|value| value.as_str()))
        {
            return Ok(text.to_string());
        }

        return Ok(json.to_string());
    }

    Ok(body_text)
}

#[tauri::command]
pub async fn chat_stream_response(
    app: AppHandle,
    user_message: String,
    system_prompt: Option<String>,
    image_base64: Option<serde_json::Value>,
    history: Option<String>,
) -> Result<String, String> {
    // Get stored credentials to get selected model
    let (_, _, selected_model) = get_stored_credentials(&app).await?;
    let (provider, model) = selected_model.as_ref().map_or((None, None), |m| {
        (Some(m.provider.clone()), Some(m.model.clone()))
    });

    // Fetch API configuration
    let api_config = fetch_api_response_config(&app, provider.clone(), model.clone()).await?;

    // Parse the body from API config to merge with our request
    let mut extra_body: serde_json::Value = if !api_config.body.is_empty() {
        serde_json::from_str(&api_config.body).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Build messages array in OpenAI format
    let mut messages: Vec<serde_json::Value> = Vec::new();

    // Add system message if provided
    if let Some(sys_prompt) = system_prompt {
        messages.push(serde_json::json!({
            "role": "system",
            "content": sys_prompt
        }));
    }

    // Add history if provided
    if let Some(history_str) = history {
        if let Ok(history_messages) = serde_json::from_str::<Vec<serde_json::Value>>(&history_str) {
            messages.extend(history_messages);
        }
    }

    // Build user message content
    let mut user_content: Vec<serde_json::Value> = Vec::new();

    // Add text content
    user_content.push(serde_json::json!({
        "type": "text",
        "text": user_message
    }));

    // Add image content if provided
    if let Some(image_data) = image_base64 {
        if image_data.is_string() {
            // Single image — screenshots are PNG; strip any accidental prefix before building URL
            let raw = image_data.as_str().unwrap_or_default();
            let base64_data = if raw.contains(',') { raw.splitn(2, ',').nth(1).unwrap_or(raw) } else { raw };
            user_content.push(serde_json::json!({
                "type": "image_url",
                "image_url": {
                    "url": format!("data:image/png;base64,{}", base64_data)
                }
            }));
        } else if image_data.is_array() {
            // Multiple images
            if let Some(images) = image_data.as_array() {
                for image in images {
                    if let Some(img_str) = image.as_str() {
                        let base64_data = if img_str.contains(',') { img_str.splitn(2, ',').nth(1).unwrap_or(img_str) } else { img_str };
                        user_content.push(serde_json::json!({
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/png;base64,{}", base64_data)
                            }
                        }));
                    }
                }
            }
        }
    }

    // Add user message — use plain string when text-only, array when images present
    let user_content_value = if user_content.len() == 1 {
        serde_json::Value::String(user_message.clone())
    } else {
        serde_json::Value::Array(user_content)
    };
    messages.push(serde_json::json!({
        "role": "user",
        "content": user_content_value
    }));

    // Build request body
    let mut request_body = serde_json::json!({
        "model": api_config.model,
        "messages": messages,
        "stream": true
    });

    // Merge extra body parameters from API config
    if let Some(extra_obj) = extra_body.as_object_mut() {
        if let Some(req_obj) = request_body.as_object_mut() {
            for (key, value) in extra_obj.iter() {
                req_obj.insert(key.clone(), value.clone());
            }
        }
    }

    // Make HTTP request — try primary, then fallback if configured
    let client = reqwest::Client::new();
    let error_rules = api_config.errors.clone().unwrap_or_default();

    // Attempt primary provider
    let primary_result = client
        .post(&api_config.url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_config.user_token))
        .json(&request_body)
        .send()
        .await;

    // Determine if we need to fall back (network error or non-2xx)
    let use_fallback = match &primary_result {
        Err(_) => true,
        Ok(resp) => !resp.status().is_success(),
    };

    let response = if use_fallback {
        // Try fallback if configured
        if let (Some(fb_url), Some(fb_token)) = (
            api_config.fallback_url.as_deref(),
            api_config.fallback_user_token.as_deref(),
        ) {
            // Swap model in request body for the fallback provider
            let mut fb_body = request_body.clone();
            if let Some(fb_model) = &api_config.fallback_model {
                if let Some(obj) = fb_body.as_object_mut() {
                    obj.insert("model".to_string(), serde_json::Value::String(fb_model.clone()));
                }
            }
            let fb_result = client
                .post(fb_url)
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", fb_token))
                .json(&fb_body)
                .send()
                .await;

            match fb_result {
                Ok(fb_resp) if fb_resp.status().is_success() => {
                    // Notify frontend that fallback is in use
                    let _ = app.emit("chat_stream_chunk", "*[Using fallback provider]*\n\n");
                    fb_resp
                }
                Ok(fb_resp) => {
                    let status = fb_resp.status();
                    let error_text = fb_resp.text().await.unwrap_or_default();
                    let sources = vec![error_text, status.to_string()];
                    return Err(map_api_error_message(&error_rules, &sources));
                }
                Err(e) => {
                    // Both primary and fallback failed
                    let primary_msg = match primary_result {
                        Err(pe) => pe.to_string(),
                        Ok(pr) => format!("HTTP {}", pr.status()),
                    };
                    return Err(format!(
                        "Primary provider failed ({}) and fallback also failed: {}",
                        primary_msg, e
                    ));
                }
            }
        } else {
            // No fallback configured — propagate the original error
            match primary_result {
                Ok(resp) => {
                    // Non-2xx response
                    let status = resp.status();
                    let error_text = resp.text().await.unwrap_or_default();
                    let mut sources = vec![error_text.clone(), status.to_string()];
                    if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
                        if let Some(msg) = error_json.get("error").and_then(|e| e.as_str()) {
                            sources.push(msg.to_string());
                        }
                        if let Some(msg) = error_json.get("message").and_then(|m| m.as_str()) {
                            sources.push(msg.to_string());
                        }
                    }
                    tauri::async_runtime::spawn({
                        let app = app.clone(); let provider = provider.clone(); let model = model.clone();
                        let err = format!("{}: {}", status, error_text);
                        async move { report_api_error(app, err, "/api/chat".to_string(), model, provider).await; }
                    });
                    return Err(map_api_error_message(&error_rules, &sources));
                }
                Err(e) => {
                    let mut sources = vec![e.to_string()];
                    if let Ok(url) = Url::parse(&api_config.url) { sources.push(url.to_string()); }
                    tauri::async_runtime::spawn({
                        let app = app.clone(); let provider = provider.clone(); let model = model.clone();
                        let err = e.to_string();
                        async move { report_api_error(app, err, "/api/chat".to_string(), model, provider).await; }
                    });
                    return Err(map_api_error_message(&error_rules, &sources));
                }
            }
        }
    } else {
        primary_result.unwrap()
    };

    // Handle streaming response
    let mut stream = response.bytes_stream();
    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut usage: Option<serde_json::Value> = None;
    let mut stream_started = false;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let chunk_str = String::from_utf8_lossy(&bytes);
                buffer.push_str(&chunk_str);

                // Process complete lines
                let lines: Vec<&str> = buffer.split('\n').collect();
                let incomplete_line = lines.last().unwrap_or(&"").to_string();

                for line in &lines[..lines.len() - 1] {
                    // Process all but the last (potentially incomplete) line
                    let trimmed_line = line.trim();

                    if trimmed_line.starts_with("data: ") {
                        let json_str = trimmed_line.strip_prefix("data: ").unwrap_or("");

                        if json_str == "[DONE]" {
                            break;
                        }

                        if !json_str.is_empty() {
                            // Try to parse the JSON and extract content
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str)
                            {
                                if usage.is_none() {
                                    if let Some(collected) = parsed.get("usage") {
                                        if !collected.is_null() {
                                            usage = Some(collected.clone());
                                        }
                                    }
                                }
                                if let Some(choices) =
                                    parsed.get("choices").and_then(|c| c.as_array())
                                {
                                    if let Some(first_choice) = choices.first() {
                                        if let Some(delta) = first_choice.get("delta") {
                                            if let Some(content) =
                                                delta.get("content").and_then(|c| c.as_str())
                                            {
                                                full_response.push_str(content);
                                                // Emit just the content to frontend
                                                let _ = app.emit("chat_stream_chunk", content);
                                                stream_started = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Update buffer with incomplete line
                buffer = incomplete_line;
            }
            Err(e) => {
                let sources = vec![e.to_string()];
                let final_message = map_api_error_message(&error_rules, &sources);
                tauri::async_runtime::spawn({
                    let app = app.clone();
                    let provider = provider.clone();
                    let model = model.clone();
                    let error_msg = e.to_string();
                    async move {
                        report_api_error(app, error_msg, "/api/chat".to_string(), model, provider)
                            .await;
                    }
                });
                return Err(final_message);
            }
        }
    }

    // Emit completion event
    let _ = app.emit("chat_stream_complete", &full_response);

    // Log activity based on response type
    if !full_response.is_empty() {
        let activity_type = if stream_started {
            "chat_streaming"
        } else {
            "chat_complete"
        };

        tauri::async_runtime::spawn({
            let activity_app = app.clone();
            let activity_model = api_config.model.clone();
            let activity_app_version = app.package_info().version.to_string();
            
            // If no usage metrics were captured from the stream, estimate tokens
            let captured_metrics = if usage.is_none() {
                // Estimate tokens: roughly 1 token = 4 characters (standard tokenization approximation)
                let estimated_tokens = (full_response.len() as f64 / 4.0).ceil() as i64;
                Some(serde_json::json!({
                    "total_tokens": estimated_tokens,
                    "prompt_tokens": 0,
                    "completion_tokens": estimated_tokens
                }))
            } else {
                usage.clone()
            };
            
            async move {
                let _ = user_activity_with_type(
                    activity_app,
                    captured_metrics,
                    activity_model,
                    activity_app_version,
                    activity_type.to_string(),
                )
                .await;
            }
        });
    }

    Ok(full_response)
}

async fn user_activity_with_type(
    app: AppHandle,
    activity_metrics: Option<serde_json::Value>,
    configured_model: String,
    app_version: String,
    activity_type: String,
) -> Result<(), String> {
    let app_endpoint = match get_app_endpoint() {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };

    let api_access_key = match get_api_access_key() {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };

    let (license_key, instance_id, stored_model) = match get_stored_credentials(&app).await {
        Ok(values) => values,
        Err(_) => return Ok(()),
    };

    let machine_id = match app.machine_uid().get_machine_uid() {
        Ok(id) => id.id.unwrap_or_else(String::new),
        Err(_) => String::new(),
    };

    if machine_id.is_empty() {
        return Ok(());
    }

    let ai_model = stored_model
        .as_ref()
        .map(|model| model.model.clone())
        .unwrap_or(configured_model);

    let mut payload = serde_json::json!({
        "license": license_key,
        "instance": instance_id,
        "machine_id": machine_id,
        "app_version": app_version,
        "ai_model": ai_model,
        "activity_type": activity_type,
    });

    if let Some(metrics) = activity_metrics {
        if let Some(obj) = payload.as_object_mut() {
            const METRIC_FIELD_BYTES: [u8; 5] = [117, 115, 97, 103, 101];
            if let Ok(field) = std::str::from_utf8(&METRIC_FIELD_BYTES) {
                obj.insert(field.to_string(), metrics);
            }
        }
    }

    let activity_url = format!("{}/api/activity", app_endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();

    let _ = client
        .post(&activity_url)
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    Ok(())
}

// Public functions for different activity types
#[tauri::command]
pub async fn log_meeting_summary(
    app: AppHandle,
    summary_text: String,
    model: String,
    activity_metrics: Option<serde_json::Value>,
) -> Result<(), String> {
    let app_version = app.package_info().version.to_string();
    
    // If no usage metrics provided, estimate tokens from summary text
    let captured_metrics = if activity_metrics.is_none() {
        let estimated_tokens = (summary_text.len() as f64 / 4.0).ceil() as i64;
        Some(serde_json::json!({
            "total_tokens": estimated_tokens,
            "prompt_tokens": 0,
            "completion_tokens": estimated_tokens
        }))
    } else {
        activity_metrics
    };
    
    user_activity_with_type(app, captured_metrics, model, app_version, "meeting_summary".to_string()).await
}

#[tauri::command]
pub async fn log_stt_transcription(
    app: AppHandle,
    transcription_text: String,
    model: String,
    activity_metrics: Option<serde_json::Value>,
) -> Result<(), String> {
    let app_version = app.package_info().version.to_string();
    
    // If no usage metrics provided, estimate tokens from transcription text
    let captured_metrics = if activity_metrics.is_none() {
        let estimated_tokens = (transcription_text.len() as f64 / 4.0).ceil() as i64;
        Some(serde_json::json!({
            "total_tokens": estimated_tokens,
            "prompt_tokens": 0,
            "completion_tokens": estimated_tokens
        }))
    } else {
        activity_metrics
    };
    
    user_activity_with_type(app, captured_metrics, model, app_version, "stt_transcription".to_string()).await
}

async fn report_api_error(
    app: AppHandle,
    error_message: String,
    endpoint: String,
    model: Option<String>,
    provider: Option<String>,
) {
    let app_endpoint = match get_app_endpoint() {
        Ok(value) => value,
        Err(_) => return,
    };

    let api_access_key = match get_api_access_key() {
        Ok(value) => value,
        Err(_) => return,
    };

    let (license_key, instance_id, stored_model) = match get_stored_credentials(&app).await {
        Ok(values) => values,
        Err(_) => return,
    };

    let machine_id = match app.machine_uid().get_machine_uid() {
        Ok(id) => id.id.unwrap_or_default(),
        Err(_) => return,
    };

    if machine_id.is_empty() {
        return;
    }

    let app_version = app.package_info().version.to_string();

    let final_model = model
        .or_else(|| stored_model.as_ref().map(|m| m.model.clone()))
        .unwrap_or_default();

    let final_provider = provider
        .or_else(|| stored_model.as_ref().map(|m| m.provider.clone()))
        .unwrap_or_default();

    let payload = serde_json::json!({
        "machine_id": machine_id,
        "error_message": error_message,
        "app_version": app_version,
        "instance": instance_id,
        "license_key": license_key,
        "endpoint": endpoint,
        "model": final_model,
        "provider": final_provider
    });

    let error_url = format!("{}/api/error", app_endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();

    tracing::debug!("Reporting API error: {:?}", payload);

    if let Err(e) = client
        .post(&error_url)
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
    {
        tracing::warn!("Failed to report API error: {}", e);
    }
}

// Models API Command
#[tauri::command]
pub async fn fetch_models(app: AppHandle) -> Result<Vec<Model>, String> {
    // Get environment variables
    let app_endpoint = get_app_endpoint()?;
    let api_access_key = get_api_access_key()?;

    let (license_key, instance_id) = match get_stored_credentials(&app).await {
        Ok((lk, id, _)) => (lk, id),
        Err(_) => ("".to_string(), "".to_string()),
    };
    let machine_id = app
        .machine_uid()
        .get_machine_uid()
        .ok()
        .and_then(|uid| uid.id)
        .unwrap_or_else(|| "".to_string());
    let app_version = app.package_info().version.to_string();

    // Make HTTP request to models endpoint
    let client = reqwest::Client::new();
    let url = format!("{}/api/models", app_endpoint);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("license_key", &license_key)
        .header("instance", &instance_id)
        .header("machine_id", &machine_id)
        .header("app_version", &app_version)
        .send()
        .await
        .map_err(|e| {
            let error_msg = format!("{}", e);
            if error_msg.contains("url (") {
                // Remove the URL part from the error message
                let parts: Vec<&str> = error_msg.split(" for url (").collect();
                if parts.len() > 1 {
                    format!("Failed to make models request: {}", parts[0])
                } else {
                    format!("Failed to make models request: {}", error_msg)
                }
            } else {
                format!("Failed to make models request: {}", error_msg)
            }
        })?;

    // Check if the response is successful
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown server error".to_string());

        // Try to parse error as JSON to get a more specific error message
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
            if let Some(error_msg) = error_json.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Server error ({}): {}", status, error_msg));
            } else if let Some(message) = error_json.get("message").and_then(|m| m.as_str()) {
                return Err(format!("Server error ({}): {}", status, message));
            }
        }

        return Err(format!("Server error ({}): {}", status, error_text));
    }

    let models_response: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    Ok(models_response.models)
}

// ── Conversation Sync ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub attached_files: Option<String>,
}

#[derive(Serialize)]
struct SyncConversationPayload {
    conversation_id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
    messages: Vec<SyncMessage>,
    machine_id: String,
}

/// Syncs a single conversation (+ messages) to the Lamu backend.
/// Called only when the user has given explicit consent in Settings.
#[tauri::command]
pub async fn sync_conversation(
    app: AppHandle,
    conversation_id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
    messages: Vec<SyncMessage>,
) -> Result<(), String> {
    let app_endpoint = match get_app_endpoint() {
        Ok(e) => e,
        Err(_) => return Ok(()), // backend unreachable — silently skip
    };
    let api_access_key = match get_api_access_key() {
        Ok(k) => k,
        Err(_) => return Ok(()),
    };
    let (license_key, ..) = match get_stored_credentials(&app).await {
        Ok(creds) => creds,
        Err(_) => ("".to_string(), "".to_string(), None),
    };
    let machine_id = app
        .machine_uid()
        .get_machine_uid()
        .ok()
        .and_then(|uid| uid.id)
        .unwrap_or_default();

    let payload = SyncConversationPayload {
        conversation_id,
        title,
        created_at,
        updated_at,
        messages,
        machine_id,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let _ = client
        .post(format!("{}/api/sync/conversation", app_endpoint))
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("license_key", &license_key)
        .json(&payload)
        .send()
        .await; // fire-and-forget: ignore errors so sync never blocks the UI

    Ok(())
}

// Fetch Lamu Prompts API
#[tauri::command]
pub async fn fetch_prompts() -> Result<LamuPromptsResponse, String> {
    let app_endpoint = get_app_endpoint()?;
    let api_access_key = get_api_access_key()?;

    let client = reqwest::Client::new();
    let url = format!("{}/api/prompts", app_endpoint);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .send()
        .await
        .map_err(|e| {
            let error_msg = format!("{}", e);
            if error_msg.contains("url (") {
                let parts: Vec<&str> = error_msg.split(" for url (").collect();
                if parts.len() > 1 {
                    format!("Failed to make prompts request: {}", parts[0])
                } else {
                    format!("Failed to make prompts request: {}", error_msg)
                }
            } else {
                format!("Failed to make prompts request: {}", error_msg)
            }
        })?;

    // Check if the response is successful
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown server error".to_string());

        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
            if let Some(error_msg) = error_json.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Server error ({}): {}", status, error_msg));
            } else if let Some(message) = error_json.get("message").and_then(|m| m.as_str()) {
                return Err(format!("Server error ({}): {}", status, message));
            }
        }

        return Err(format!("Server error ({}): {}", status, error_text));
    }

    let prompts_response: LamuPromptsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse prompts response: {}", e))?;

    Ok(prompts_response)
}

// Create System Prompt API Command
#[tauri::command]
pub async fn create_system_prompt(
    app: AppHandle,
    user_prompt: String,
) -> Result<SystemPromptResponse, String> {
    // Get environment variables
    let app_endpoint = get_app_endpoint()?;
    let api_access_key = get_api_access_key()?;
    let (license_key, instance_id, _) = get_stored_credentials(&app).await?;
    let machine_id: String = app.machine_uid().get_machine_uid()
        .ok().and_then(|u| u.id).unwrap_or_default();
    let app_version: String = app.package_info().version.to_string();
    // Make HTTP request to models endpoint
    let client = reqwest::Client::new();
    let url = format!("{}/api/prompt", app_endpoint);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("license_key", &license_key)
        .header("instance", &instance_id)
        .header("machine_id", &machine_id)
        .header("app_version", &app_version)
        .json(&serde_json::json!({
            "user_prompt": user_prompt
        }))
        .send()
        .await
        .map_err(|e| {
            let error_msg = format!("{}", e);
            if error_msg.contains("url (") {
                // Remove the URL part from the error message
                let parts: Vec<&str> = error_msg.split(" for url (").collect();
                if parts.len() > 1 {
                    format!("Failed to make models request: {}", parts[0])
                } else {
                    format!("Failed to make models request: {}", error_msg)
                }
            } else {
                format!("Failed to make models request: {}", error_msg)
            }
        })?;

    // Check if the response is successful
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown server error".to_string());

        // Try to parse error as JSON to get a more specific error message
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
            if let Some(error_msg) = error_json.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Server error ({}): {}", status, error_msg));
            } else if let Some(message) = error_json.get("message").and_then(|m| m.as_str()) {
                return Err(format!("Server error ({}): {}", status, message));
            }
        }

        return Err(format!("Server error ({}): {}", status, error_text));
    }

    let system_prompt_response: SystemPromptResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse system prompt response: {}", e))?;

    Ok(system_prompt_response)
}

// Helper command to check if license is available
#[tauri::command]
pub async fn check_license_status(app: AppHandle) -> Result<bool, String> {
    match get_stored_credentials(&app).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[allow(dead_code)]
#[tauri::command]
pub async fn get_activity(app: AppHandle) -> Result<serde_json::Value, String> {
    let app_endpoint = get_app_endpoint()?;
    let api_access_key = get_api_access_key()?;

    let (license_key, instance_id, _) = get_stored_credentials(&app).await?;

    let machine_id = match app.machine_uid().get_machine_uid() {
        Ok(id) => id.id.unwrap_or_default(),
        Err(_) => String::new(),
    };

    if machine_id.is_empty() {
        return Err("Machine identifier unavailable".to_string());
    }

    let app_version = app.package_info().version.to_string();

    let client = reqwest::Client::new();
    let activity_url = format!("{}/api/activity", app_endpoint.trim_end_matches('/'));

    let response = client
        .get(&activity_url)
        .header("Authorization", format!("Bearer {}", api_access_key))
        .header("license_key", &license_key)
        .header("instance_name", &instance_id)
        .header("machine_id", machine_id)
        .header("app_version", app_version)
        .send()
        .await
        .map_err(|e| {
            let error_msg = format!("{}", e);
            if error_msg.contains("url (") {
                let parts: Vec<&str> = error_msg.split(" for url (").collect();
                if parts.len() > 1 {
                    format!("Failed to request activity: {}", parts[0])
                } else {
                    format!("Failed to request activity: {}", error_msg)
                }
            } else {
                format!("Failed to request activity: {}", error_msg)
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown server error".to_string());

        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
            if let Some(message) = error_json
                .get("message")
                .and_then(|m| m.as_str())
                .or_else(|| error_json.get("error").and_then(|m| m.as_str()))
            {
                return Err(format!("Server error ({}): {}", status, message));
            }
        }

        return Err(format!("Server error ({}): {}", status, error_text));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse activity response: {}", e))
}
