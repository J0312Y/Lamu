use std::io::Read;
use tracing::warn;

/// Target chunk size in characters (~350–500 tokens)
const CHUNK_TARGET: usize = 1200;
/// Maximum chunk size — hard ceiling before forced split
const CHUNK_MAX: usize = 1800;
/// Overlap kept between consecutive chunks for continuity
const OVERLAP: usize = 200;

/// Extract plain text from file bytes given the filename (extension determines parser)
pub fn extract_text(filename: &str, bytes: &[u8]) -> Result<String, String> {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "txt" | "md" | "markdown" | "rst" => {
            String::from_utf8(bytes.to_vec())
                .map_err(|e| format!("Cannot decode text file as UTF-8: {}", e))
        }
        "pdf" => extract_pdf(bytes),
        "docx" => extract_docx(bytes),
        "csv" => extract_csv(bytes),
        _ => String::from_utf8(bytes.to_vec())
            .map_err(|_| format!("Unsupported or binary file type: .{}", ext)),
    }
}

fn extract_pdf(bytes: &[u8]) -> Result<String, String> {
    let doc = lopdf::Document::load_mem(bytes)
        .map_err(|e| format!("Failed to parse PDF: {}", e))?;

    let mut text = String::new();
    let pages: Vec<u32> = doc.get_pages().keys().cloned().collect();

    for page_num in pages {
        match doc.extract_text(&[page_num]) {
            Ok(page_text) => {
                text.push_str(&page_text);
                text.push('\n');
            }
            Err(e) => warn!("PDF page {} extraction failed: {}", page_num, e),
        }
    }

    if text.trim().is_empty() {
        return Err(
            "PDF has no extractable text (may be a scanned image — OCR not yet supported)"
                .to_string(),
        );
    }
    Ok(text)
}

fn extract_docx(bytes: &[u8]) -> Result<String, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use std::io::Cursor;

    let cursor = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open DOCX archive: {}", e))?;

    let mut xml_content = String::new();
    {
        let mut doc_file = archive
            .by_name("word/document.xml")
            .map_err(|_| "Invalid DOCX: missing word/document.xml".to_string())?;
        doc_file
            .read_to_string(&mut xml_content)
            .map_err(|e| format!("Failed to read DOCX content: {}", e))?;
    }

    let mut reader = Reader::from_str(&xml_content);

    let mut text = String::new();
    let mut buf = Vec::new();
    let mut in_text_elem = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                if name.as_ref() == b"w:t" {
                    in_text_elem = true;
                } else if name.as_ref() == b"w:p" {
                    text.push('\n');
                }
            }
            Ok(Event::End(ref e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text_elem = false;
                }
            }
            Ok(Event::Text(ref e)) if in_text_elem => {
                if let Ok(t) = e.unescape() {
                    text.push_str(&t);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                warn!("DOCX XML parse error: {}", e);
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    if text.trim().is_empty() {
        return Err("DOCX has no extractable text".to_string());
    }
    Ok(text)
}

fn extract_csv(bytes: &[u8]) -> Result<String, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(bytes);

    let mut lines: Vec<String> = Vec::new();

    // Include headers
    if let Ok(headers) = reader.headers() {
        lines.push(headers.iter().collect::<Vec<_>>().join(", "));
    }

    for result in reader.records() {
        match result {
            Ok(record) => lines.push(record.iter().collect::<Vec<_>>().join(", ")),
            Err(e) => warn!("CSV row error: {}", e),
        }
    }

    if lines.is_empty() {
        return Err("CSV appears to be empty".to_string());
    }
    Ok(lines.join("\n"))
}

/// Split text into semantically-aware overlapping chunks.
///
/// Strategy (priority order):
///   1. Split at double-newline paragraph boundaries when possible.
///   2. Within over-sized paragraphs, split at sentence boundaries (`. `, `! `, `? `).
///   3. Fall back to hard character split with overlap for pathological inputs.
///
/// Adjacent chunks share `OVERLAP` characters of context so the LLM always
/// sees a smooth transition at chunk boundaries.
pub fn chunk_text(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }

    // Fast path: whole text fits in one chunk
    if text.chars().count() <= CHUNK_TARGET {
        return vec![text.to_string()];
    }

    // ── Step 1: split into paragraphs ──────────────────────────────────────
    let paragraphs: Vec<&str> = text
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    // ── Step 2: accumulate paragraphs into chunks ──────────────────────────
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for para in &paragraphs {
        let para_len = para.chars().count();

        // If the paragraph alone exceeds the max, break it at sentence boundaries
        if para_len > CHUNK_MAX {
            // Flush whatever we have so far
            if !current.trim().is_empty() {
                chunks.push(current.trim().to_string());
                current = String::new();
            }
            // Split the oversized paragraph at sentence ends
            for sentence_chunk in split_at_sentences(para) {
                chunks.push(sentence_chunk);
            }
            continue;
        }

        // Would adding this paragraph exceed the target?
        let combined_len = current.chars().count() + para_len + 2; // +2 for \n\n
        if !current.is_empty() && combined_len > CHUNK_TARGET {
            // Flush current chunk
            chunks.push(current.trim().to_string());
            // Start new chunk with overlap from end of previous
            current = tail_chars(&current, OVERLAP);
            current.push_str("\n\n");
        }

        current.push_str(para);
        current.push_str("\n\n");
    }

    // Flush any remaining content
    let tail = current.trim().to_string();
    if !tail.is_empty() {
        chunks.push(tail);
    }

    chunks
}

/// Split a large text block at sentence boundaries, targeting CHUNK_TARGET chars.
fn split_at_sentences(text: &str) -> Vec<String> {
    // Sentence-ending sequences we split after
    const ENDINGS: &[&str] = &[". ", "! ", "? ", ".\n", "!\n", "?\n"];

    let mut chunks: Vec<String> = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    let len = text.len();

    while start < len {
        let target_end = (start + CHUNK_TARGET).min(len);

        // If the remainder fits, grab it all
        if len - start <= CHUNK_MAX {
            let slice = text[start..].trim().to_string();
            if !slice.is_empty() {
                chunks.push(slice);
            }
            break;
        }

        // Find the last sentence boundary before target_end
        let mut split_at = target_end;
        let search_from = start + (CHUNK_TARGET / 2); // don't split too early
        let search_to = target_end.min(start + CHUNK_MAX);

        'outer: for pos in (search_from..search_to).rev() {
            for ending in ENDINGS {
                if pos + ending.len() <= len {
                    if &bytes[pos..pos + ending.len()] == ending.as_bytes() {
                        split_at = pos + ending.len();
                        break 'outer;
                    }
                }
            }
        }

        let slice = text[start..split_at].trim().to_string();
        if !slice.is_empty() {
            chunks.push(slice);
        }

        // Overlap: step back by OVERLAP chars to retain context
        start = if split_at > OVERLAP { split_at - OVERLAP } else { split_at };
    }

    chunks
}

/// Return the last `n` characters of `s` (by char boundary, UTF-8 safe).
fn tail_chars(s: &str, n: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= n {
        return s.to_string();
    }
    chars[chars.len() - n..].iter().collect()
}
