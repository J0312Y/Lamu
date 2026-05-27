/// Shopify integration — fetches products, pages, and blog articles via the Admin REST API.
///
/// Auth: Admin API access token (generated from a private app or custom app in the Shopify admin).
/// Docs: https://shopify.dev/docs/api/admin-rest
use reqwest::Client;
use serde_json::Value;
use tracing::{info, warn};

pub const PROVIDER: &str = "shopify";
const API_VERSION: &str = "2024-01";

/// Verify credentials and return the shop name.
pub async fn verify(shop_domain: &str, access_token: &str) -> Result<String, String> {
    let url = format!(
        "https://{}/admin/api/{}/shop.json",
        shop_domain.trim_end_matches('/'),
        API_VERSION
    );
    let resp = shopify_get(access_token, &url).await?;
    let name = resp["shop"]["name"]
        .as_str()
        .unwrap_or("Shopify Store")
        .to_string();
    Ok(name)
}

/// Fetch all content (products, pages, blog articles) and return (title, text) pairs.
pub async fn fetch_all_content(
    shop_domain: &str,
    access_token: &str,
) -> Result<Vec<(String, String)>, String> {
    let base = format!(
        "https://{}/admin/api/{}",
        shop_domain.trim_end_matches('/'),
        API_VERSION
    );
    let mut results = Vec::new();

    // 1. Products
    let page_info: Option<String> = None;
    loop {
        let url = match &page_info {
            Some(cursor) => format!("{}/products.json?limit=50&page_info={}", base, cursor),
            None => format!("{}/products.json?limit=50&fields=id,title,body_html,product_type,tags", base),
        };
        let resp = match shopify_get(access_token, &url).await {
            Ok(r) => r,
            Err(e) => { warn!("Shopify products error: {}", e); break; }
        };
        let products = resp["products"].as_array().cloned().unwrap_or_default();
        let fetched = products.len();

        for p in products {
            let title = p["title"].as_str().unwrap_or("Untitled Product").to_string();
            let body = strip_html(p["body_html"].as_str().unwrap_or(""));
            let product_type = p["product_type"].as_str().unwrap_or("").to_string();
            let tags = p["tags"].as_str().unwrap_or("").to_string();
            let text = format!(
                "Product: {}\nType: {}\nTags: {}\n\n{}",
                title, product_type, tags, body
            );
            if !body.trim().is_empty() {
                results.push((title, text));
            }
        }

        // Shopify uses cursor-based pagination via Link header — simplified: stop if < 50
        if fetched < 50 { break; }
        // For full pagination support, parse Link header; here we stop after first page
        break;
    }

    // 2. Pages (static pages like About, FAQ, etc.)
    let pages_url = format!("{}/pages.json?limit=250&fields=id,title,body_html", base);
    if let Ok(resp) = shopify_get(access_token, &pages_url).await {
        for page in resp["pages"].as_array().cloned().unwrap_or_default() {
            let title = page["title"].as_str().unwrap_or("Untitled Page").to_string();
            let body = strip_html(page["body_html"].as_str().unwrap_or(""));
            if !body.trim().is_empty() {
                results.push((title, body));
            }
        }
    }

    // 3. Blog articles
    let blogs_url = format!("{}/blogs.json?limit=250&fields=id,title", base);
    if let Ok(resp) = shopify_get(access_token, &blogs_url).await {
        for blog in resp["blogs"].as_array().cloned().unwrap_or_default() {
            let blog_id = match blog["id"].as_u64() {
                Some(id) => id,
                None => continue,
            };
            let articles_url = format!(
                "{}/blogs/{}/articles.json?limit=250&fields=id,title,body_html,author,tags",
                base, blog_id
            );
            match shopify_get(access_token, &articles_url).await {
                Ok(art_resp) => {
                    for article in art_resp["articles"].as_array().cloned().unwrap_or_default() {
                        let title = article["title"].as_str().unwrap_or("Untitled Article").to_string();
                        let body = strip_html(article["body_html"].as_str().unwrap_or(""));
                        let author = article["author"].as_str().unwrap_or("").to_string();
                        let tags = article["tags"].as_str().unwrap_or("").to_string();
                        let text = format!(
                            "Article: {}\nAuthor: {}\nTags: {}\n\n{}",
                            title, author, tags, body
                        );
                        if !body.trim().is_empty() {
                            results.push((title, text));
                        }
                    }
                }
                Err(e) => warn!("Shopify blog {} articles error: {}", blog_id, e),
            }
        }
    }

    info!("Shopify: fetched {} items", results.len());
    Ok(results)
}

/// Very lightweight HTML stripper — removes tags, decodes common entities.
fn strip_html(html: &str) -> String {
    use scraper::{Html, Selector};
    let doc = Html::parse_fragment(html);
    let sel = Selector::parse("p,h1,h2,h3,h4,h5,h6,li,td,span,div").expect("valid");
    let mut parts: Vec<String> = Vec::new();
    for elem in doc.select(&sel) {
        let text: String = elem.text().collect::<Vec<_>>().join(" ");
        let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if text.len() > 5 {
            parts.push(text);
        }
    }
    parts.dedup();
    if parts.is_empty() {
        // fallback: raw text via scraper root
        let doc2 = Html::parse_document(html);
        doc2.root_element().text().collect::<Vec<_>>().join(" ")
            .split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        parts.join("\n")
    }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async fn shopify_get(access_token: &str, url: &str) -> Result<Value, String> {
    Client::new()
        .get(url)
        .header("X-Shopify-Access-Token", access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Shopify request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Shopify response parse failed: {}", e))
}

async fn shopify_post(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .post(url)
        .header("X-Shopify-Access-Token", access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Shopify request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Shopify response parse failed: {}", e))
}

async fn shopify_put(access_token: &str, url: &str, body: &Value) -> Result<Value, String> {
    Client::new()
        .put(url)
        .header("X-Shopify-Access-Token", access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Shopify request failed: {}", e))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Shopify response parse failed: {}", e))
}

// ── Write functions ───────────────────────────────────────────────────────────

/// Create a new product in the Shopify store with a single variant at the given price.
pub async fn create_product(
    shop_domain: &str,
    token: &str,
    title: &str,
    body_html: &str,
    price: &str,
) -> Result<Value, String> {
    let url = format!(
        "https://{}/admin/api/2023-10/products.json",
        shop_domain.trim_end_matches('/')
    );
    let payload = serde_json::json!({
        "product": {
            "title": title,
            "body_html": body_html,
            "variants": [{ "price": price }]
        }
    });
    shopify_post(token, &url, &payload).await
}

/// Update an existing product's title and/or body_html.
pub async fn update_product(
    shop_domain: &str,
    token: &str,
    product_id: u64,
    title: Option<&str>,
    body_html: Option<&str>,
) -> Result<Value, String> {
    let url = format!(
        "https://{}/admin/api/2023-10/products/{}.json",
        shop_domain.trim_end_matches('/'),
        product_id
    );
    let mut product = serde_json::json!({ "id": product_id });
    if let Some(t) = title {
        product["title"] = serde_json::json!(t);
    }
    if let Some(b) = body_html {
        product["body_html"] = serde_json::json!(b);
    }
    let payload = serde_json::json!({ "product": product });
    shopify_put(token, &url, &payload).await
}
