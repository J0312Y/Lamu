//! External database integration: PostgreSQL, MySQL
//! Read-only (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH) for live queries.
//! Full write access through the confirmed LAMU_ACTION path.

use serde_json::Value;
use sqlx::{Column, Pool, Row, TypeInfo};
use sqlx::any::{Any, AnyPoolOptions, AnyRow};
use std::time::Duration;

type AnyPool = Pool<Any>;

pub const PROVIDER_POSTGRES: &str = "postgres";
pub const PROVIDER_MYSQL:    &str = "mysql";

// ── Connection helpers ────────────────────────────────────────────────────────

fn build_connection_string(db_type: &str, config: &Value, password: &str) -> String {
    let host     = config["host"].as_str().unwrap_or("localhost");
    let port     = config["port"].as_u64().unwrap_or(if db_type == PROVIDER_MYSQL { 3306 } else { 5432 });
    let dbname   = config["dbname"].as_str().unwrap_or("postgres");
    let username = config["username"].as_str().unwrap_or("postgres");
    let ssl      = config["ssl"].as_bool().unwrap_or(false);

    match db_type {
        PROVIDER_POSTGRES => {
            let ssl_mode = if ssl { "require" } else { "disable" };
            format!("postgresql://{}:{}@{}:{}/{}?sslmode={}",
                username, urlenc(password), host, port, dbname, ssl_mode)
        }
        PROVIDER_MYSQL => {
            format!("mysql://{}:{}@{}:{}/{}", username, urlenc(password), host, port, dbname)
        }
        _ => format!("postgresql://{}:{}@{}:{}/{}", username, urlenc(password), host, port, dbname),
    }
}

async fn get_pool(db_type: &str, config: &Value, password: &str) -> Result<AnyPool, String> {
    let conn_str = build_connection_string(db_type, config, password);
    AnyPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(15))
        .connect(&conn_str)
        .await
        .map_err(|e| format!("Connexion échouée: {}", e))
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Test connectivity — used when adding the integration.
pub async fn verify(password: &str, config: &Value) -> Result<(), String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool = get_pool(db_type, config, password).await?;
    pool.close().await;
    Ok(())
}

/// Return the database schema as a human-readable string.
pub async fn get_schema(password: &str, config: &Value) -> Result<String, String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool    = get_pool(db_type, config, password).await?;

    let schema_sql = match db_type {
        "postgres" => {
            "SELECT table_name, column_name, data_type, is_nullable, column_default \
             FROM information_schema.columns \
             WHERE table_schema = 'public' \
             ORDER BY table_name, ordinal_position"
        }
        "mysql" => {
            "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT \
             FROM INFORMATION_SCHEMA.COLUMNS \
             WHERE TABLE_SCHEMA = DATABASE() \
             ORDER BY TABLE_NAME, ORDINAL_POSITION"
        }
        _ => return Err("Unsupported database type".into()),
    };

    let rows: Vec<AnyRow> = sqlx::query(schema_sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Erreur schéma: {}", e))?;
    pool.close().await;

    // Group columns by table
    let mut tables: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    for row in &rows {
        let table:    String = cell_to_string(row, 0);
        let col:      String = cell_to_string(row, 1);
        let dtype:    String = cell_to_string(row, 2);
        let nullable: String = cell_to_string(row, 3);
        let default:  String = cell_to_string(row, 4);
        let mut info = format!("{} {}", col, dtype);
        if nullable == "NO" { info.push_str(" NOT NULL"); }
        if default != "NULL" && !default.is_empty() {
            info.push_str(&format!(" DEFAULT {}", &default[..default.len().min(30)]));
        }
        tables.entry(table).or_default().push(info);
    }

    let db_alias = config["alias"].as_str().unwrap_or(db_type);
    let mut out = format!("=== Schéma {} ({}) ===\n\n", db_alias, db_type.to_uppercase());
    for (table, cols) in &tables {
        out.push_str(&format!("TABLE {}:\n", table));
        for c in cols { out.push_str(&format!("  - {}\n", c)); }
        out.push('\n');
    }
    if tables.is_empty() {
        out.push_str("Aucune table trouvée (vérifiez les permissions).\n");
    }
    Ok(out)
}

/// Run a query and return formatted results.
/// `allow_write` should only be true when coming from a confirmed LAMU_ACTION.
pub async fn execute_query(
    password: &str,
    config: &Value,
    sql: &str,
    allow_write: bool,
) -> Result<String, String> {
    if !allow_write && !is_read_only(sql) {
        return Err(
            "Seules les requêtes SELECT/SHOW/DESCRIBE/EXPLAIN sont autorisées en mode live query."
                .into(),
        );
    }

    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool    = get_pool(db_type, config, password).await?;

    let rows: Vec<AnyRow> = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Erreur requête: {}", e))?;
    pool.close().await;

    if rows.is_empty() {
        return Ok(format!("Requête exécutée. 0 résultat.\nSQL: {}", sql));
    }

    // Column names (use Column trait via Row::columns)
    use sqlx::Column as _;
    let col_count = rows[0].columns().len();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| rows[0].columns()[i].name().to_string())
        .collect();

    // Collect data first, then compute widths
    let data: Vec<Vec<String>> = rows.iter().take(200).map(|row| {
        (0..col_count).map(|i| cell_to_string(row, i)).collect()
    }).collect();

    let mut widths: Vec<usize> = col_names.iter().map(|n| n.len()).collect();
    for row_vals in &data {
        for (i, v) in row_vals.iter().enumerate() {
            widths[i] = widths[i].max(v.len().min(40));
        }
    }

    // Format table
    let header: Vec<String> = col_names.iter().enumerate()
        .map(|(i, n)| format!("{:width$}", n, width = widths[i]))
        .collect();
    let separator: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();

    let mut out = format!(
        "=== Résultats ({} lignes) ===\nSQL: {}\n\n{}\n{}\n",
        rows.len().min(200), sql,
        header.join(" | "),
        separator.join("-+-")
    );
    for row_vals in &data {
        let cells: Vec<String> = row_vals.iter().enumerate()
            .map(|(i, v)| format!("{:width$}", &v[..v.len().min(40)], width = widths[i]))
            .collect();
        out.push_str(&cells.join(" | "));
        out.push('\n');
    }
    if rows.len() > 200 {
        out.push_str(&format!("... ({} lignes supplémentaires non affichées)\n", rows.len() - 200));
    }
    Ok(out)
}

/// Return recent data from the N largest tables (for live query context).
pub async fn live_snapshot(password: &str, config: &Value, query_hint: &str) -> Result<String, String> {
    let db_type   = config["db_type"].as_str().unwrap_or("postgres");
    let pool      = get_pool(db_type, config, password).await?;
    let db_alias  = config["alias"].as_str().unwrap_or(db_type);
    let hint_low  = query_hint.to_lowercase();

    // 1. Get table list
    let tables_sql = match db_type {
        "postgres" => "SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 30",
        "mysql"    => "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() LIMIT 30",
        _ => return Err("Unsupported type".into()),
    };
    let table_rows: Vec<AnyRow> = sqlx::query(tables_sql).fetch_all(&pool).await
        .map_err(|e| format!("Table list error: {}", e))?;
    let all_tables: Vec<String> = table_rows.iter()
        .map(|r| cell_to_string(r, 0))
        .collect();

    // 2. Find tables most relevant to the query hint
    let mut scored: Vec<(i32, String)> = all_tables.into_iter().map(|t| {
        let t_low = t.to_lowercase();
        let score: i32 = hint_low.split_whitespace()
            .map(|word| if t_low.contains(word) { 10i32 } else { 0i32 })
            .sum();
        (score, t)
    }).collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let target_tables: Vec<String> = scored.into_iter().take(3).map(|(_, t)| t).collect();

    // 3. Get schema + sample rows from target tables
    let schema = get_schema(password, config).await.unwrap_or_default();
    let mut out = format!("=== Base de données: {} ({}) ===\n\n", db_alias, db_type.to_uppercase());
    out.push_str(&schema);
    out.push_str("\n=== Données récentes ===\n");

    for table in &target_tables {
        let sample_sql = format!("SELECT * FROM {} LIMIT 5", table);
        if let Ok(sample_rows) = sqlx::query(&sample_sql).fetch_all(&pool).await {
            let rows: Vec<AnyRow> = sample_rows;
            if !rows.is_empty() {
                use sqlx::Column as _;
                let col_count = rows[0].columns().len();
                let col_names: Vec<String> = (0..col_count)
                    .map(|i| rows[0].columns()[i].name().to_string()).collect();
                out.push_str(&format!("\n-- {} --\n", table));
                out.push_str(&col_names.join(" | "));
                out.push('\n');
                for row in rows.iter().take(5) {
                    let vals: Vec<String> = (0..col_count)
                        .map(|i| cell_to_string(row, i))
                        .collect();
                    out.push_str(&vals.join(" | "));
                    out.push('\n');
                }
            }
        }
    }
    pool.close().await;
    Ok(out)
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn is_read_only(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("DESC ")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("WITH ") // CTEs are usually SELECT
}

fn cell_to_string(row: &AnyRow, idx: usize) -> String {
    // Try types in order; use type hint from column metadata when available
    let type_name = row.columns()[idx].type_info().name().to_uppercase();

    if type_name.contains("INT") || type_name.contains("SERIAL") || type_name == "BIGINT" || type_name == "SMALLINT" {
        if let Ok(v) = row.try_get::<i64, _>(idx) { return v.to_string(); }
        if let Ok(v) = row.try_get::<i32, _>(idx) { return v.to_string(); }
    }
    if type_name.contains("FLOAT") || type_name.contains("DOUBLE")
        || type_name.contains("DECIMAL") || type_name.contains("NUMERIC")
        || type_name == "REAL"
    {
        if let Ok(v) = row.try_get::<f64, _>(idx) {
            return format!("{:.4}", v).trim_end_matches('0').trim_end_matches('.').to_string();
        }
    }
    if type_name == "BOOL" || type_name == "BOOLEAN" {
        if let Ok(v) = row.try_get::<bool, _>(idx) { return v.to_string(); }
    }

    // Generic fallback: try as String, then numerics
    row.try_get::<String, _>(idx)
        .or_else(|_| row.try_get::<i64, _>(idx).map(|v| v.to_string()))
        .or_else(|_| row.try_get::<f64, _>(idx).map(|v| format!("{:.4}", v)))
        .or_else(|_| row.try_get::<bool, _>(idx).map(|v| v.to_string()))
        .or_else(|_| row.try_get::<i32, _>(idx).map(|v| v.to_string()))
        .unwrap_or_else(|_| "NULL".to_string())
}

fn urlenc(s: &str) -> String {
    s.chars().map(|c| match c {
        'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
        other => {
            let mut buf = [0u8; 4];
            let bytes = other.encode_utf8(&mut buf);
            bytes.bytes().map(|b| format!("%{:02X}", b)).collect()
        }
    }).collect()
}
