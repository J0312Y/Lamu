use super::{db, embed};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

// ── Score weights ─────────────────────────────────────────────────────────────
const SEMANTIC_WEIGHT: f32 = 0.70;
const BM25_WEIGHT: f32 = 0.30;
const RERANK_FACTOR: usize = 3;

// BM25 hyperparameters
const BM25_K1: f32 = 1.5;
const BM25_B: f32 = 0.75;

#[derive(Debug, Serialize)]
pub struct KbSearchResult {
    pub chunk_id: String,
    pub document_id: String,
    pub document_name: String,
    pub source_type: String,
    pub content: String,
    pub similarity: f32,
    pub chunk_index: usize,
    // Debug fields (only populated in debug mode)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic_score: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyword_score: Option<f32>,
}

pub async fn search(
    db_path: &Path,
    config: &embed::KbEmbedConfig,
    query: &str,
    top_k: usize,
) -> Result<Vec<KbSearchResult>, String> {
    search_internal(db_path, config, query, top_k, false).await
}

pub async fn debug_search(
    db_path: &Path,
    config: &embed::KbEmbedConfig,
    query: &str,
    top_k: usize,
) -> Result<Vec<KbSearchResult>, String> {
    search_internal(db_path, config, query, top_k, true).await
}

// Internal raw chunk holder for two-pass scoring
struct RawChunk {
    chunk_id: String,
    document_id: String,
    document_name: String,
    source_type: String,
    content: String,
    chunk_index: usize,
    blob: Vec<u8>,
}

async fn search_internal(
    db_path: &Path,
    config: &embed::KbEmbedConfig,
    query: &str,
    top_k: usize,
    debug: bool,
) -> Result<Vec<KbSearchResult>, String> {
    // ── Step 1: embed the query ───────────────────────────────────────────
    let query_vec = embed::embed_text(config, query).await?;

    // ── Step 2: extract keywords ──────────────────────────────────────────
    let keywords = extract_keywords(query);

    // ── Step 3: load all chunks from DB ──────────────────────────────────
    let conn = db::open(db_path).map_err(|e| format!("KB DB open error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.document_id, d.name, d.source_type, c.content, c.chunk_index, c.embedding
             FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id
             WHERE c.embedding IS NOT NULL",
        )
        .map_err(|e| format!("KB query prepare error: {}", e))?;

    // Pass A: collect all rows and compute BM25 corpus stats
    let raw_chunks: Vec<RawChunk> = stmt
        .query_map([], |row| {
            Ok(RawChunk {
                chunk_id:      row.get(0)?,
                document_id:   row.get(1)?,
                document_name: row.get(2)?,
                source_type:   row.get(3)?,
                content:       row.get(4)?,
                chunk_index:   row.get(5)?,
                blob:          row.get(6)?,
            })
        })
        .map_err(|e| format!("KB query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let n_docs = raw_chunks.len();
    let total_words: f32 = raw_chunks
        .iter()
        .map(|c| c.content.split_whitespace().count() as f32)
        .sum();
    let avgdl = if n_docs > 0 { total_words / n_docs as f32 } else { 1.0 };

    // Per-keyword document frequency
    let mut doc_freqs: HashMap<String, usize> = HashMap::new();
    for kw in &keywords {
        let df = raw_chunks
            .iter()
            .filter(|c| c.content.to_lowercase().contains(kw.as_str()))
            .count();
        doc_freqs.insert(kw.clone(), df);
    }

    // Pass B: cosine + BM25 scoring, pre-filter low cosine
    let candidate_k = top_k * RERANK_FACTOR;

    let mut candidates: Vec<(f32, f32, KbSearchResult)> = raw_chunks
        .into_iter()
        .filter_map(|c| {
            let chunk_vec = embed::blob_to_vec(&c.blob);
            if chunk_vec.len() != query_vec.len() {
                return None;
            }
            let sem = cosine_similarity(&query_vec, &chunk_vec);
            if sem < 0.05 {
                return None;
            }
            let bm25 = bm25_score(&c.content, &keywords, n_docs, &doc_freqs, avgdl);
            let final_score = SEMANTIC_WEIGHT * sem + BM25_WEIGHT * bm25;
            Some((sem, bm25, KbSearchResult {
                chunk_id:      c.chunk_id,
                document_id:   c.document_id,
                document_name: c.document_name,
                source_type:   c.source_type,
                content:       c.content,
                similarity:    final_score,
                chunk_index:   c.chunk_index,
                semantic_score: None,
                keyword_score:  None,
            }))
        })
        .collect();

    // Sort by final score descending, take candidates
    candidates.sort_by(|a, b| {
        let sa = SEMANTIC_WEIGHT * a.0 + BM25_WEIGHT * a.1;
        let sb = SEMANTIC_WEIGHT * b.0 + BM25_WEIGHT * b.1;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    candidates.truncate(candidate_k);

    // Re-rank with full BM25 on top candidates
    let mut results: Vec<KbSearchResult> = candidates
        .into_iter()
        .map(|(sem, _, mut r)| {
            let bm25 = bm25_score(&r.content, &keywords, n_docs, &doc_freqs, avgdl);
            r.similarity = SEMANTIC_WEIGHT * sem + BM25_WEIGHT * bm25;
            if debug {
                r.semantic_score = Some(sem);
                r.keyword_score = Some(bm25);
            }
            r
        })
        .collect();

    results.sort_by(|a, b| {
        b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(top_k);

    Ok(results)
}

/// BM25 score for a single chunk, normalised to 0–1 via tanh squashing.
fn bm25_score(
    content: &str,
    keywords: &[String],
    n_docs: usize,
    doc_freqs: &HashMap<String, usize>,
    avgdl: f32,
) -> f32 {
    if keywords.is_empty() || n_docs == 0 {
        return 0.0;
    }
    let lower = content.to_lowercase();
    let dl = lower.split_whitespace().count() as f32;
    let mut score = 0.0f32;

    for kw in keywords {
        let tf = lower
            .split_whitespace()
            .filter(|w| w.contains(kw.as_str()))
            .count() as f32;
        if tf == 0.0 {
            continue;
        }
        let df = *doc_freqs.get(kw).unwrap_or(&0) as f32;
        let idf = ((n_docs as f32 - df + 0.5) / (df + 0.5) + 1.0).ln();
        let numerator = tf * (BM25_K1 + 1.0);
        let denominator = tf + BM25_K1 * (1.0 - BM25_B + BM25_B * dl / avgdl.max(1.0));
        score += idf * numerator / denominator;
    }
    // Squash to 0–1
    score.tanh()
}

/// Extract meaningful keywords from a query (removes stop words, FR+EN).
pub fn extract_keywords(query: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        // English
        "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "of", "in", "on", "at", "to",
        "for", "with", "by", "from", "and", "or", "but", "not", "no", "so",
        "what", "how", "when", "where", "who", "why", "which", "this", "that",
        "these", "those", "it", "its", "i", "me", "my", "you", "your", "we",
        "our", "they", "their", "tell", "give", "show", "find",
        // French
        "le", "la", "les", "un", "une", "des", "du", "de", "et", "en", "au",
        "aux", "par", "sur", "sous", "dans", "avec", "pour", "que", "qui",
        "quoi", "dont", "où", "est", "sont", "était", "ont", "avoir", "être",
        "ce", "se", "si", "ne", "pas", "plus", "mais", "ou", "donc", "or",
        "ni", "car", "il", "elle", "ils", "elles", "je", "tu", "nous", "vous",
        "mon", "ton", "son", "ma", "ta", "sa", "mes", "tes", "ses", "nos",
        "vos", "leurs", "me", "te", "lui", "y", "en",
    ];
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .map(|w| w.trim().to_string())
        .filter(|w| w.len() > 1 && !STOP_WORDS.contains(&w.as_str()))
        .collect()
}

/// Keyword-based fallback search (no embeddings needed).
pub fn keyword_search(
    db_path: &Path,
    query: &str,
    top_k: usize,
) -> Result<Vec<KbSearchResult>, String> {
    let keywords = extract_keywords(query);
    let search_terms: Vec<String> = if keywords.is_empty() {
        vec![query.to_lowercase()]
    } else {
        keywords
    };

    let conn = db::open(db_path).map_err(|e| format!("KB DB open error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.document_id, d.name, d.source_type, c.content, c.chunk_index
             FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id",
        )
        .map_err(|e| format!("KB query prepare error: {}", e))?;

    let mut scored: Vec<(f32, KbSearchResult)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, usize>(5)?,
            ))
        })
        .map_err(|e| format!("KB query error: {}", e))?
        .filter_map(|r| r.ok())
        .filter_map(|(chunk_id, document_id, document_name, source_type, content, chunk_index)| {
            let lower = content.to_lowercase();
            let matches = search_terms.iter().filter(|t| lower.contains(t.as_str())).count();
            if matches == 0 {
                return None;
            }
            let similarity = matches as f32 / search_terms.len() as f32;
            Some((similarity, KbSearchResult {
                chunk_id,
                document_id,
                document_name,
                source_type,
                content,
                similarity,
                chunk_index,
                semantic_score: None,
                keyword_score: None,
            }))
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);
    Ok(scored.into_iter().map(|(_, r)| r).collect())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}
