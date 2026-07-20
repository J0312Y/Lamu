'use strict';

/**
 * WhatsApp multi-tenant (Modèle B) — chaque client Lamu connecte SON numéro
 * WhatsApp Business. Un seul webhook partagé route les messages par
 * `phone_number_id` vers le bon client. Identifiants stockés chiffrés au repos.
 *
 * Onboarding manuel (Option 1) : le client colle son phone_number_id + access_token
 * dans l'app. Le webhook GET utilise un verify_token GLOBAL (WHATSAPP_VERIFY_TOKEN)
 * que tous les clients saisissent côté Meta.
 */

const crypto = require('crypto');
const db = require('./db');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

// ── Chiffrement AES-256-GCM (même schéma que userdb.js) ───────────────────────
function getKey() {
  const secret = process.env.DB_CRED_SECRET || process.env.API_ACCESS_KEY || 'lamu-default-dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
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

// ── Tables ────────────────────────────────────────────────────────────────────
let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await db.query(`CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id VARCHAR(64) PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    phone_number_id VARCHAR(64) NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    business_name VARCHAR(255),
    system_prompt TEXT,
    enabled TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id VARCHAR(64) PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    wa_from VARCHAR(32) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_wa_conv (user_email, wa_from, created_at)
  )`);
  _ready = true;
}

// ── CRUD connexions (scopées par email client) ────────────────────────────────
async function saveConnection(userEmail, cfg) {
  await ensureTables();
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO whatsapp_connections (id, user_email, phone_number_id, access_token, business_name, system_prompt, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE phone_number_id=VALUES(phone_number_id), access_token=VALUES(access_token),
       business_name=VALUES(business_name), system_prompt=VALUES(system_prompt), enabled=VALUES(enabled)`,
    [
      id,
      userEmail,
      String(cfg.phone_number_id || '').trim(),
      encrypt(cfg.access_token),
      cfg.business_name || null,
      cfg.system_prompt || null,
      cfg.enabled === false ? 0 : 1,
    ],
  );
}

async function getConnection(userEmail) {
  await ensureTables();
  const row = await db.queryOne('SELECT * FROM whatsapp_connections WHERE user_email = ?', [userEmail]);
  if (!row) return null;
  return {
    user_email: row.user_email,
    phone_number_id: row.phone_number_id,
    access_token: decrypt(row.access_token),
    business_name: row.business_name || '',
    system_prompt: row.system_prompt || '',
    enabled: !!row.enabled,
  };
}

/** Vue publique (token masqué) pour l'affichage dans l'app. */
async function getConnectionPublic(userEmail) {
  const c = await getConnection(userEmail);
  if (!c) return null;
  const tok = c.access_token || '';
  return {
    phone_number_id: c.phone_number_id,
    access_token_masked: tok ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : '',
    business_name: c.business_name,
    system_prompt: c.system_prompt,
    enabled: c.enabled,
  };
}

async function deleteConnection(userEmail) {
  await ensureTables();
  await db.query('DELETE FROM whatsapp_connections WHERE user_email = ?', [userEmail]);
}

/** Route un message entrant : trouve le client propriétaire du numéro. */
async function findByPhoneNumberId(phoneNumberId) {
  await ensureTables();
  const row = await db.queryOne(
    'SELECT * FROM whatsapp_connections WHERE phone_number_id = ? AND enabled = 1',
    [String(phoneNumberId)],
  );
  if (!row) return null;
  return {
    user_email: row.user_email,
    phone_number_id: row.phone_number_id,
    access_token: decrypt(row.access_token),
    business_name: row.business_name || '',
    system_prompt: row.system_prompt || '',
  };
}

// ── Historique de conversation (contexte, par client + numéro client) ─────────
async function addMessage(userEmail, waFrom, role, content) {
  await ensureTables();
  await db.query(
    'INSERT INTO whatsapp_messages (id, user_email, wa_from, role, content) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), userEmail, waFrom, role, (content || '').slice(0, 8000)],
  );
}
async function getHistory(userEmail, waFrom, limit = 12) {
  await ensureTables();
  const rows = await db.query(
    'SELECT role, content FROM whatsapp_messages WHERE user_email = ? AND wa_from = ? ORDER BY created_at DESC LIMIT ?',
    [userEmail, waFrom, limit],
  );
  return rows.reverse(); // ordre chronologique
}

// ── Envoi d'un message texte via l'API Graph de Meta ──────────────────────────
async function sendText(conn, to, body) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${conn.phone_number_id}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.access_token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: (body || '').slice(0, 4096) },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`WhatsApp send failed (${resp.status}): ${t.slice(0, 200)}`);
  }
  return resp.json().catch(() => ({}));
}

// ── Vérification du webhook (GET) — verify_token GLOBAL ───────────────────────
function verifyWebhook(query) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || 'lamu-whatsapp-verify';
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === expected) return challenge;
  return null;
}

/**
 * Extrait les messages texte entrants du corps du webhook Meta.
 * Retourne [{ phoneNumberId, from, text, name }].
 */
function parseIncoming(body) {
  const out = [];
  const entries = (body && body.entry) || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata && value.metadata.phone_number_id;
      const contacts = value.contacts || [];
      const name = contacts[0] && contacts[0].profile && contacts[0].profile.name;
      for (const msg of value.messages || []) {
        if (msg.type === 'text' && msg.text) {
          out.push({ phoneNumberId, from: msg.from, text: msg.text.body || '', name: name || '' });
        } else if (msg.type) {
          // Types non-texte (image, audio…) : on répond qu'on ne gère que le texte pour l'instant.
          out.push({ phoneNumberId, from: msg.from, text: '', name: name || '', unsupported: msg.type });
        }
      }
    }
  }
  return out;
}

module.exports = {
  ensureTables,
  saveConnection,
  getConnection,
  getConnectionPublic,
  deleteConnection,
  findByPhoneNumberId,
  addMessage,
  getHistory,
  sendText,
  verifyWebhook,
  parseIncoming,
};
