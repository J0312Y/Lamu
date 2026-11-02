'use strict';

/**
 * Connexions DB par utilisateur, stockées côté serveur (chiffrées au repos).
 * Permet d'exécuter les requêtes db_* depuis n'importe quel client (desktop,
 * mobile, web) — la connexion est liée à l'email du client, configurée une fois.
 */

const crypto = require('crypto');
const db = require('./db'); // pool MySQL interne de Lamu

// ── Chiffrement AES-256-GCM ───────────────────────────────────────────────────
function getKey() {
  const secret = process.env.DB_CRED_SECRET || process.env.API_ACCESS_KEY || 'lamu-default-dev-secret';
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return '';
  try {
    const [ivB, tagB, encB] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────
let _ready = false;
async function ensureTable() {
  if (_ready) return;
  await db.query(`CREATE TABLE IF NOT EXISTS user_db_connections (
    id VARCHAR(64) PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    dialect VARCHAR(16) NOT NULL DEFAULT 'mysql',
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL,
    db_user VARCHAR(255) NOT NULL,
    db_password TEXT,
    db_name VARCHAR(255) NOT NULL,
    use_ssl TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  _ready = true;
}

function defaultPort(dialect) {
  return dialect === 'postgres' ? 5432 : 3306;
}

async function saveConnection(userEmail, cfg) {
  await ensureTable();
  const dialect = cfg.dialect === 'postgres' ? 'postgres' : 'mysql';
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO user_db_connections (id, user_email, dialect, host, port, db_user, db_password, db_name, use_ssl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE dialect=VALUES(dialect), host=VALUES(host), port=VALUES(port),
       db_user=VALUES(db_user), db_password=VALUES(db_password), db_name=VALUES(db_name), use_ssl=VALUES(use_ssl)`,
    [
      id,
      userEmail,
      dialect,
      cfg.host,
      parseInt(cfg.port) || defaultPort(dialect),
      cfg.user,
      encrypt(cfg.password),
      cfg.database,
      cfg.ssl ? 1 : 0,
    ],
  );
}

async function getConnection(userEmail) {
  await ensureTable();
  const row = await db.queryOne('SELECT * FROM user_db_connections WHERE user_email = ?', [userEmail]);
  if (!row) return null;
  return {
    dialect: row.dialect,
    host: row.host,
    port: row.port,
    user: row.db_user,
    password: decrypt(row.db_password),
    database: row.db_name,
    ssl: !!row.use_ssl,
  };
}

/** Config publique (sans mot de passe) pour l'affichage. */
async function getConnectionPublic(userEmail) {
  const c = await getConnection(userEmail);
  if (!c) return null;
  return { dialect: c.dialect, host: c.host, port: c.port, user: c.user, database: c.database, ssl: c.ssl };
}

async function deleteConnection(userEmail) {
  await ensureTable();
  await db.query('DELETE FROM user_db_connections WHERE user_email = ?', [userEmail]);
}

// ── Exécution de requêtes contre la DB de l'utilisateur ──────────────────────
async function runQuery(conn, sql, params = []) {
  if (conn.dialect === 'postgres') {
    const { Client } = require('pg');
    const client = new Client({
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database,
      ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    try {
      const r = await client.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount };
    } finally {
      await client.end();
    }
  }
  // MySQL par défaut
  const mysql = require('mysql2/promise');
  const c = await mysql.createConnection({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
  try {
    const [rows] = await c.query(sql, params);
    return { rows, rowCount: Array.isArray(rows) ? rows.length : rows.affectedRows };
  } finally {
    await c.end();
  }
}

async function testConnection(cfg) {
  const conn = {
    dialect: cfg.dialect === 'postgres' ? 'postgres' : 'mysql',
    host: cfg.host,
    port: parseInt(cfg.port) || defaultPort(cfg.dialect),
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: !!cfg.ssl,
  };
  await runQuery(conn, 'SELECT 1');
  return true;
}

/** Exécute un outil db_* résolu (needs_client_execution) côté serveur. */
async function executeDbTool(userEmail, toolResult) {
  const conn = await getConnection(userEmail);
  if (!conn) return null; // pas de connexion serveur → laisse le fallback desktop
  const t = toolResult.tool;
  try {
    if (t === 'db_query' || toolResult.sql) {
      const r = await runQuery(conn, toolResult.sql);
      return { rows: r.rows, rowCount: r.rowCount, source: 'server' };
    }
    if (t === 'db_list_tables') {
      const sql =
        conn.dialect === 'postgres'
          ? `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
          : `SHOW TABLES`;
      const r = await runQuery(conn, sql);
      return { tables: r.rows, source: 'server' };
    }
    if (t === 'db_describe_table') {
      const sql =
        conn.dialect === 'postgres'
          ? `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1`
          : `DESCRIBE \`${toolResult.table}\``;
      const r = await runQuery(conn, sql, conn.dialect === 'postgres' ? [toolResult.table] : []);
      return { columns: r.rows, source: 'server' };
    }
    if (t === 'db_list_databases') {
      const sql = conn.dialect === 'postgres' ? `SELECT datname FROM pg_database` : `SHOW DATABASES`;
      const r = await runQuery(conn, sql);
      return { databases: r.rows, source: 'server' };
    }
    return { error: `Outil DB "${t}" non supporté côté serveur.` };
  } catch (e) {
    return { error: `Erreur DB: ${e.message}` };
  }
}

module.exports = {
  saveConnection,
  getConnection,
  getConnectionPublic,
  deleteConnection,
  testConnection,
  executeDbTool,
};
