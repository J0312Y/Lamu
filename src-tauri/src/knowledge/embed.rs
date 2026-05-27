use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KbEmbedConfig {
    /// "ollama" | "openai" | "none"
    pub provider: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub openai_key: String,
    pub openai_model: String,
}

impl Default for KbEmbedConfig {
    fn default() -> Self {
        Self {
            provider: "ollama".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            ollama_model: "nomic-embed-text".to_string(),
            openai_key: String::new(),
            openai_model: "text-embedding-3-small".to_string(),
        }
    }
}

pub async fn embed_text(config: &KbEmbedConfig, text: &str) -> Result<Vec<f32>, String> {
    match config.provider.as_str() {
        "ollama" => embed_ollama(config, text).await,
        "openai" => embed_openai(config, text).await,
        _ => Err(
            "No embedding provider configured. Set provider to 'ollama' or 'openai' in \
             Knowledge Base settings."
                .to_string(),
        ),
    }
}

async fn embed_ollama(config: &KbEmbedConfig, text: &str) -> Result<Vec<f32>, String> {
    #[derive(Serialize)]
    struct Req<'a> {
        model: &'a str,
        prompt: &'a str,
    }
    #[derive(Deserialize)]
    struct Resp {
        embedding: Vec<f32>,
    }

    let url = format!("{}/api/embeddings", config.ollama_url.trim_end_matches('/'));
    let resp = Client::new()
        .post(&url)
        .json(&Req {
            model: &config.ollama_model,
            prompt: text,
        })
        .send()
        .await
        .map_err(|e| {
            error!("Ollama embed request failed: {}", e);
            format!("Cannot reach Ollama at {}: {}", config.ollama_url, e)
        })?;

    let body: Resp = resp.json().await.map_err(|e| {
        error!("Ollama embed parse failed: {}", e);
        format!("Failed to parse Ollama response: {}", e)
    })?;

    Ok(body.embedding)
}

async fn embed_openai(config: &KbEmbedConfig, text: &str) -> Result<Vec<f32>, String> {
    #[derive(Serialize)]
    struct Req<'a> {
        model: &'a str,
        input: &'a str,
    }
    #[derive(Deserialize)]
    struct EmbData {
        embedding: Vec<f32>,
    }
    #[derive(Deserialize)]
    struct Resp {
        data: Vec<EmbData>,
    }

    let resp = Client::new()
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(&config.openai_key)
        .json(&Req {
            model: &config.openai_model,
            input: text,
        })
        .send()
        .await
        .map_err(|e| format!("OpenAI embed request failed: {}", e))?;

    let body: Resp = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    body.data
        .into_iter()
        .next()
        .map(|d| d.embedding)
        .ok_or_else(|| "OpenAI returned empty embedding".to_string())
}

/// Serialize f32 slice to raw little-endian bytes for BLOB storage
pub fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize raw little-endian bytes back to f32 vector
pub fn blob_to_vec(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}
