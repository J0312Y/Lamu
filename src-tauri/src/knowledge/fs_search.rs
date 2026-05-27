use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

// ── Result type ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FsFileResult {
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified_at: i64,        // Unix ms
    pub content_preview: String, // first 200 chars (text files only)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn systime_to_ms(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

/// Extensions whose text content is worth scanning for matches.
fn is_text_searchable(ext: &str) -> bool {
    matches!(ext, "txt" | "md" | "markdown" | "rst" | "csv" | "json" | "toml" | "yaml" | "yml")
}

/// Supported KB-ingestable extensions.
pub fn is_kb_ingestable(ext: &str) -> bool {
    matches!(ext, "txt" | "md" | "markdown" | "rst" | "pdf" | "docx" | "csv")
}

/// Read first `max_chars` characters from a text file.
fn read_preview(path: &Path, max_chars: usize) -> String {
    use std::io::Read;
    let Ok(mut f) = std::fs::File::open(path) else {
        return String::new();
    };
    let mut buf = vec![0u8; max_chars * 4]; // over-read to handle multi-byte chars
    let n = f.read(&mut buf).unwrap_or(0);
    buf.truncate(n);
    String::from_utf8_lossy(&buf)
        .chars()
        .take(max_chars)
        .collect()
}

// ── Core search ───────────────────────────────────────────────────────────────

/// Recursively search `root` for files whose name or text content contains
/// any of the `query` terms. Returns up to `limit` results, newest-first.
pub fn search_files(root: &Path, query: &str, limit: usize) -> Vec<FsFileResult> {
    let terms: Vec<String> = query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .map(|s| s.to_string())
        .filter(|s| s.len() > 1)
        .collect();

    if terms.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<FsFileResult> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut visited = 0usize;
    const MAX_SCAN: usize = 100_000;

    while let Some(dir) = stack.pop() {
        if visited >= MAX_SCAN {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                let name_lower = name.to_lowercase();
                // Skip hidden dirs, system dirs, and noisy dirs
                if name.starts_with('.')
                    || name.starts_with('$')
                    || matches!(name, "node_modules" | "target" | "__pycache__" | ".git" | "dist" | "build")
                    || matches!(name_lower.as_str(),
                        "windows" | "program files" | "program files (x86)" | "programdata"
                        | "appdata" | "recovery" | "system volume information"
                        | "msocache" | "intel" | "perflogs" | "config.msi"
                        | ".cache" | ".local" | ".npm" | ".cargo" | ".rustup"
                        | "__pycache__" | "site-packages" | "venv" | ".venv"
                        | "obj" | "bin" | "debug" | "release" | "packages"
                    )
                {
                    continue;
                }
                stack.push(path);
                continue;
            }

            if !path.is_file() {
                continue;
            }
            visited += 1;

            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let filename_lower = filename.to_lowercase();

            // 1. Filename match (cheap)
            let name_match = terms.iter().any(|t| filename_lower.contains(t.as_str()));

            // 2. Content match for text files (slightly more expensive)
            let content_text = if !name_match && is_text_searchable(&extension) {
                read_preview(&path, 4000)
            } else {
                String::new()
            };
            let content_lower = content_text.to_lowercase();
            let content_match = !content_text.is_empty()
                && terms.iter().any(|t| content_lower.contains(t.as_str()));

            if !name_match && !content_match {
                continue;
            }

            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            let modified_at = meta.modified().map(systime_to_ms).unwrap_or(0);
            let content_preview = if !content_text.is_empty() {
                content_text.chars().take(200).collect()
            } else if name_match && is_text_searchable(&extension) {
                read_preview(&path, 200)
            } else {
                String::new()
            };

            results.push(FsFileResult {
                path: path.to_string_lossy().replace('\\', "/"),
                filename: filename.to_string(),
                extension,
                size_bytes: meta.len(),
                modified_at,
                content_preview,
            });
        }
    }

    results.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    results.truncate(limit);
    results
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Default search roots when no path is specified — all available drives.
/// On Windows: enumerates C:\, D:\, E:\, etc.
/// On other platforms: starts from the home directory.
fn default_search_roots(home: &Path) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Enumerate all drive letters A-Z
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() {
                roots.push(path);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On macOS/Linux: home + common mount points
        roots.push(home.to_path_buf());
        for mount in &["/mnt", "/media", "/Volumes"] {
            let p = PathBuf::from(mount);
            if p.exists() {
                roots.push(p);
            }
        }
    }

    if roots.is_empty() {
        roots.push(home.to_path_buf());
    }
    roots
}

/// Search the filesystem for files matching `query`.
/// `search_path` defaults to common user folders (Desktop, Documents, Downloads).
#[tauri::command]
pub async fn fs_search_files(
    app: AppHandle,
    query: String,
    search_path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<FsFileResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let effective_limit = limit.unwrap_or(50).min(200);

    let roots: Vec<PathBuf> = match search_path {
        Some(p) => {
            let path = PathBuf::from(p);
            if !path.exists() {
                return Err(format!("Search path does not exist: {}", path.display()));
            }
            vec![path]
        }
        None => {
            let home = app
                .path()
                .home_dir()
                .map_err(|e| format!("Cannot determine home directory: {}", e))?;
            default_search_roots(&home)
        }
    };

    let results = tokio::task::spawn_blocking(move || {
        let per_root_limit = effective_limit;
        let mut all: Vec<FsFileResult> = roots
            .iter()
            .flat_map(|root| search_files(root, &query, per_root_limit))
            .collect();
        all.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        all.dedup_by(|a, b| a.path == b.path);
        all.truncate(effective_limit);
        all
    })
    .await
    .map_err(|e| format!("Search task failed: {}", e))?;

    Ok(results)
}

/// Open a native folder picker and return the selected path (or None if cancelled).
#[tauri::command]
pub async fn fs_open_folder_dialog(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog()
        .file()
        .set_title("Choisir un dossier à explorer")
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });

    let result = rx.await.map_err(|_| "Dialog closed unexpectedly".to_string())?;
    Ok(result.map(|p| p.to_string().replace('\\', "/")))
}

/// Read a file from disk and ingest it into the Knowledge Base.
/// Avoids shipping large file bytes over IPC.
#[tauri::command]
pub async fn fs_ingest_file_by_path(
    app: AppHandle,
    path: String,
) -> Result<super::commands::KbDocument, String> {
    let p = PathBuf::from(&path);
    let filename = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Chemin de fichier invalide")?
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !is_kb_ingestable(&ext) {
        return Err(format!(
            "Format non supporté: .{}. Formats acceptés: txt, md, pdf, docx, csv",
            ext
        ));
    }

    let file_bytes =
        std::fs::read(&p).map_err(|e| format!("Impossible de lire le fichier: {}", e))?;

    super::commands::kb_ingest_file(app, filename, file_bytes).await
}
