//! External database integration: PostgreSQL, MySQL
//! Full CRUD support: read queries run freely, write operations require explicit allow_write flag.
//! Server-level management: list databases, switch database, create/drop databases.

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
    let username = config["username"].as_str().unwrap_or("postgres");
    let ssl      = config["ssl"].as_bool().unwrap_or(false);

    // dbname can be empty for "server mode" — connect without targeting a specific DB
    let dbname_raw = config["dbname"].as_str().unwrap_or("");
    let server_mode = dbname_raw.is_empty() || dbname_raw == "*";

    match db_type {
        PROVIDER_POSTGRES => {
            // PostgreSQL requires a database name — use "postgres" (system DB) for server mode
            let dbname = if server_mode { "postgres" } else { dbname_raw };
            let ssl_mode = if ssl { "require" } else { "disable" };
            format!("postgresql://{}:{}@{}:{}/{}?sslmode={}",
                username, urlenc(password), host, port, dbname, ssl_mode)
        }
        PROVIDER_MYSQL => {
            // MySQL allows connecting without a database (empty path = server level)
            if server_mode {
                format!("mysql://{}:{}@{}:{}/information_schema", username, urlenc(password), host, port)
            } else {
                format!("mysql://{}:{}@{}:{}/{}", username, urlenc(password), host, port, dbname_raw)
            }
        }
        _ => {
            let dbname = if server_mode { "postgres" } else { dbname_raw };
            format!("postgresql://{}:{}@{}:{}/{}", username, urlenc(password), host, port, dbname)
        }
    }
}

/// Check if this config is in server mode (no specific DB selected).
#[allow(dead_code)]
pub fn is_server_mode(config: &Value) -> bool {
    let dbname = config["dbname"].as_str().unwrap_or("");
    dbname.is_empty() || dbname == "*"
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

    // Try the Any driver first; if it fails due to unsupported types (DATE, DECIMAL in MySQL),
    // fall back to a CAST-wrapped query that converts all columns to text.
    let result = execute_query_inner(&pool, sql, db_type).await;
    pool.close().await;
    result
}

async fn execute_query_inner(pool: &AnyPool, sql: &str, db_type: &str) -> Result<String, String> {
    let rows: Vec<AnyRow> = match sqlx::query(sql).fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("{}", e);
            // If the Any driver can't handle a MySQL type (DATE, DECIMAL, etc.),
            // retry by wrapping the query to cast all columns to CHAR
            if db_type == PROVIDER_MYSQL && err_msg.contains("Any driver does not support") {
                return execute_mysql_cast_fallback(pool, sql).await;
            }
            return Err(format!("Erreur requête: {}", e));
        }
    };

    format_any_rows(&rows, sql)
}

/// Fallback for MySQL: discover columns via temp table, then CAST all to CHAR.
async fn execute_mysql_cast_fallback(pool: &AnyPool, sql: &str) -> Result<String, String> {
    let temp_table = "_lamu_tmp_cols";
    let drop_sql = format!("DROP TEMPORARY TABLE IF EXISTS {}", temp_table);
    let create_sql = format!(
        "CREATE TEMPORARY TABLE {} AS SELECT * FROM ({}) AS _sq LIMIT 0",
        temp_table,
        sql.trim().trim_end_matches(';')
    );

    // Drop old temp table
    let _ = sqlx::query(&drop_sql).execute(pool).await;

    // Create temp table to discover columns
    sqlx::query(&create_sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Erreur requête: {}", e))?;

    // Get column names
    let col_rows: Vec<AnyRow> = sqlx::query(&format!("SHOW COLUMNS FROM {}", temp_table))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erreur requête: {}", e))?;

    let col_names: Vec<String> = col_rows.iter()
        .map(|r| cell_to_string(r, 0))
        .collect();

    // Drop temp table
    let _ = sqlx::query(&drop_sql).execute(pool).await;

    if col_names.is_empty() {
        return Err("Impossible de déterminer les colonnes".into());
    }

    // Build CAST query — cast every column to CHAR
    let cast_cols: Vec<String> = col_names.iter()
        .map(|c| format!("CAST(`{}` AS CHAR) AS `{}`", c, c))
        .collect();
    let cast_sql = format!(
        "SELECT {} FROM ({}) AS _sq",
        cast_cols.join(", "),
        sql.trim().trim_end_matches(';')
    );

    // Run the CAST query — now all columns are strings, Any driver can handle it
    let rows: Vec<AnyRow> = sqlx::query(&cast_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erreur requête: {}", e))?;

    format_any_rows(&rows, sql)
}

fn format_any_rows(rows: &[AnyRow], sql: &str) -> Result<String, String> {
    if rows.is_empty() {
        return Ok(format!("Requête exécutée. 0 résultat.\nSQL: {}", sql));
    }

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

/// List all databases on the server.
pub async fn list_databases(password: &str, config: &Value) -> Result<Vec<String>, String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool = get_pool(db_type, config, password).await?;

    let sql = match db_type {
        "postgres" => "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
        "mysql" => "SHOW DATABASES",
        _ => return Err("Unsupported database type".into()),
    };

    let rows: Vec<AnyRow> = sqlx::query(sql).fetch_all(&pool).await
        .map_err(|e| format!("List databases error: {}", e))?;
    pool.close().await;

    let dbs: Vec<String> = rows.iter().map(|r| cell_to_string(r, 0)).collect();
    Ok(dbs)
}

/// Connect to a different database on the same server (returns new config).
pub fn switch_database(config: &Value, new_dbname: &str) -> Value {
    let mut new_config = config.clone();
    new_config["dbname"] = serde_json::json!(new_dbname);
    // Update alias to reflect new DB
    if let Some(alias) = config["alias"].as_str() {
        let base = alias.split('(').next().unwrap_or(alias).trim();
        new_config["alias"] = serde_json::json!(format!("{} ({})", base, new_dbname));
    }
    new_config
}

/// Get table list with row counts for a database.
pub async fn list_tables(password: &str, config: &Value) -> Result<String, String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool = get_pool(db_type, config, password).await?;

    let sql = match db_type {
        "postgres" => {
            "SELECT schemaname || '.' || relname AS table_name, n_live_tup AS row_count \
             FROM pg_stat_user_tables ORDER BY n_live_tup DESC"
        }
        "mysql" => {
            "SELECT TABLE_NAME, TABLE_ROWS \
             FROM INFORMATION_SCHEMA.TABLES \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' \
             ORDER BY TABLE_ROWS DESC"
        }
        _ => return Err("Unsupported database type".into()),
    };

    let rows: Vec<AnyRow> = sqlx::query(sql).fetch_all(&pool).await
        .map_err(|e| format!("List tables error: {}", e))?;
    pool.close().await;

    let db_alias = config["alias"].as_str().unwrap_or(db_type);
    let dbname = config["dbname"].as_str().unwrap_or("unknown");
    let mut out = format!("=== Tables in {} ({}) ===\n\n", dbname, db_alias);
    out.push_str(&format!("{:<40} {:<12}\n", "TABLE", "ROWS"));
    out.push_str(&format!("{:<40} {:<12}\n", "-".repeat(40), "-".repeat(12)));
    for row in &rows {
        let name = cell_to_string(row, 0);
        let count = cell_to_string(row, 1);
        out.push_str(&format!("{:<40} {:<12}\n", name, count));
    }
    if rows.is_empty() {
        out.push_str("No tables found.\n");
    }
    out.push_str(&format!("\nTotal: {} tables\n", rows.len()));
    Ok(out)
}

/// Get detailed info about a specific table (columns, indexes, foreign keys).
pub async fn describe_table(password: &str, config: &Value, table_name: &str) -> Result<String, String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool = get_pool(db_type, config, password).await?;
    let mut out = format!("=== Table: {} ===\n\n", table_name);

    // Columns
    let col_sql = match db_type {
        "postgres" => format!(
            "SELECT column_name, data_type, is_nullable, column_default, character_maximum_length \
             FROM information_schema.columns \
             WHERE table_schema = 'public' AND table_name = '{}' \
             ORDER BY ordinal_position", table_name),
        "mysql" => format!(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH \
             FROM INFORMATION_SCHEMA.COLUMNS \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}' \
             ORDER BY ORDINAL_POSITION", table_name),
        _ => return Err("Unsupported".into()),
    };

    let rows: Vec<AnyRow> = sqlx::query(&col_sql).fetch_all(&pool).await
        .map_err(|e| format!("Describe error: {}", e))?;

    out.push_str("COLUMNS:\n");
    for row in &rows {
        let name = cell_to_string(row, 0);
        let dtype = cell_to_string(row, 1);
        let nullable = cell_to_string(row, 2);
        let default = cell_to_string(row, 3);
        let max_len = cell_to_string(row, 4);
        let mut info = format!("  {} {}", name, dtype);
        if max_len != "NULL" && !max_len.is_empty() { info.push_str(&format!("({})", max_len)); }
        if nullable == "NO" { info.push_str(" NOT NULL"); }
        if default != "NULL" && !default.is_empty() { info.push_str(&format!(" DEFAULT {}", &default[..default.len().min(30)])); }
        out.push_str(&info);
        out.push('\n');
    }

    // Indexes
    let idx_sql = match db_type {
        "postgres" => format!(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '{}' AND schemaname = 'public'", table_name),
        "mysql" => format!(
            "SHOW INDEX FROM {}", table_name),
        _ => return Err("Unsupported".into()),
    };

    if let Ok(idx_rows) = sqlx::query(&idx_sql).fetch_all(&pool).await {
        if !idx_rows.is_empty() {
            out.push_str("\nINDEXES:\n");
            for row in &idx_rows {
                let name = cell_to_string(row, 0);
                let def = cell_to_string(row, 1);
                out.push_str(&format!("  {} — {}\n", name, &def[..def.len().min(80)]));
            }
        }
    }

    // Row count
    let count_sql = format!("SELECT COUNT(*) FROM {}", table_name);
    if let Ok(count_rows) = sqlx::query(&count_sql).fetch_all(&pool).await {
        if let Some(row) = count_rows.first() {
            out.push_str(&format!("\nROW COUNT: {}\n", cell_to_string(row, 0)));
        }
    }

    pool.close().await;
    Ok(out)
}

/// Execute a write query (INSERT/UPDATE/DELETE/CREATE/ALTER/DROP) and return affected rows.
pub async fn execute_write(
    password: &str,
    config: &Value,
    sql: &str,
) -> Result<String, String> {
    let db_type = config["db_type"].as_str().unwrap_or("postgres");
    let pool = get_pool(db_type, config, password).await?;

    let result = sqlx::query(sql)
        .execute(&pool)
        .await
        .map_err(|e| format!("Write error: {}", e))?;

    pool.close().await;
    let affected = result.rows_affected();
    Ok(format!("Query executed successfully. {} row(s) affected.\nSQL: {}", affected, sql))
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn is_read_only(sql: &str) -> bool {
    // Strip leading SQL comments (-- … and /* … */) so that
    // "-- DB: bonrsto\nSELECT …" is correctly recognised as read-only.
    let mut s = sql.trim();
    loop {
        if s.starts_with("--") {
            s = s.find('\n').map_or("", |i| &s[i + 1..]).trim_start();
        } else if s.starts_with("/*") {
            s = s.find("*/").map_or("", |i| &s[i + 2..]).trim_start();
        } else {
            break;
        }
    }
    let upper = s.to_uppercase();
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
