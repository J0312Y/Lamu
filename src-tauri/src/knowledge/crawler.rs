use reqwest::Client;
use scraper::{Html, Selector};

/// Fetch a URL and return (title, plain text, final_url).
/// Handles HTML pages and plain-text documents.
pub async fn fetch_url(url: &str) -> Result<(String, String), String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Lamu/1.0; +https://lamuka-tech.com)")
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {} fetching {}",
            resp.status().as_u16(),
            url
        ));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    if content_type.contains("text/html") || looks_like_html(&body) {
        let (title, text) = extract_html_text(&body);
        let display_name = if title.is_empty() {
            url.to_string()
        } else {
            title
        };
        if text.trim().is_empty() {
            return Err("Page has no extractable text content".to_string());
        }
        Ok((display_name, text))
    } else {
        // Plain text, JSON, Markdown, etc.
        if body.trim().is_empty() {
            return Err("URL returned empty content".to_string());
        }
        Ok((url.to_string(), body))
    }
}

/// Returns true if the string looks like an HTML document.
fn looks_like_html(s: &str) -> bool {
    let lower = s.trim_start().to_lowercase();
    lower.starts_with("<!doctype html") || lower.starts_with("<html")
}

/// Parse HTML and extract (page title, cleaned plain text).
fn extract_html_text(html: &str) -> (String, String) {
    let document = Html::parse_document(html);

    // Extract <title>
    let title = {
        let sel = Selector::parse("title").expect("valid selector");
        document
            .select(&sel)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    };

    // Try to find the main content container
    let content_selectors = ["article", "main", "[role=main]", ".content", "#content", "body"];
    let mut text_parts: Vec<String> = Vec::new();

    'outer: for sel_str in &content_selectors {
        if let Ok(container_sel) = Selector::parse(sel_str) {
            if let Some(container) = document.select(&container_sel).next() {
                // Extract headings + paragraphs + list items from the container
                if let Ok(para_sel) = Selector::parse("h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote") {
                    for elem in container.select(&para_sel) {
                        let text: String = elem.text().collect::<Vec<_>>().join(" ");
                        let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
                        if text.len() > 15 {
                            text_parts.push(text);
                        }
                    }
                }
                if !text_parts.is_empty() {
                    break 'outer;
                }
            }
        }
    }

    // Deduplicate (parent/child elements both match → duplicate text)
    text_parts.dedup();

    (title, text_parts.join("\n"))
}
