'use strict';

/**
 * Full data migration — reads from ALL sources and writes to MySQL lamu_admin:
 *   1. Tauri lamu.db       → conversations, messages, system_prompts→prompts
 *   2. Tauri knowledge.db  → kb_documents, kb_chunks
 *   3. backend/kb.json     → kb_documents (legacy flat file)
 *   4. backend/activity.json → activity table
 *   5. Website license records → licenses (from Pricing.tsx payment format)
 *
 * Usage: node migrate_all.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { pool, query } = require('./db');

const SQLITE_LAMU      = 'C:/Users/joeld/AppData/Roaming/com.lamuka.lamu/lamu.db';
const SQLITE_KNOWLEDGE = 'C:/Users/joeld/AppData/Roaming/com.lamuka.lamu/knowledge.db';
const KB_JSON          = path.join(__dirname, 'kb.json');
const ACTIVITY_JSON    = path.join(__dirname, 'activity.json');

let totalImported = 0;
let totalSkipped  = 0;

// ── helpers ────────────────────────────────────────────────────────────────────

function log(msg)  { console.log('  ' + msg); }
function ok(n, label) { log(`✓ ${n} ${label}`); totalImported += n; }
function skip(n, label) { if (n > 0) log(`↷ ${n} ${label} (already exist)`); totalSkipped += n; }

async function upsertMany(rows, sql) {
  let inserted = 0, skipped = 0;
  for (const row of rows) {
    try {
      const result = await query(sql, row);
      if (result.affectedRows > 0) inserted++;
      else skipped++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') { skipped++; }
      else throw e;
    }
  }
  return { inserted, skipped };
}

function openSQLite(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ SQLite file not found: ${filePath}`);
    return null;
  }
  return new Database(filePath, { readonly: true });
}

// ── 1. Tauri lamu.db ──────────────────────────────────────────────────────────

async function migrateLamuDb() {
  console.log('\n📱 Tauri lamu.db → conversations + messages + prompts');
  const db = openSQLite(SQLITE_LAMU);
  if (!db) return;

  // Conversations
  const convs = db.prepare('SELECT id, title, created_at, updated_at FROM conversations').all();
  let ci = 0, cs = 0;
  for (const c of convs) {
    try {
      await query(
        `INSERT INTO conversations (id, title, created_at, updated_at, source)
         VALUES (?, ?, ?, ?, 'tauri')`,
        [c.id, c.title || 'Untitled', c.created_at, c.updated_at]
      );
      ci++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') cs++; else throw e; }
  }
  ok(ci, 'conversations'); skip(cs, 'conversations');

  // Messages
  const msgs = db.prepare('SELECT id, conversation_id, role, content, timestamp, attached_files FROM messages').all();
  let mi = 0, ms = 0;
  for (const m of msgs) {
    try {
      await query(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, attached_files, source)
         VALUES (?, ?, ?, ?, ?, ?, 'tauri')`,
        [m.id, m.conversation_id, m.role, m.content, m.timestamp, m.attached_files || null]
      );
      mi++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') ms++; else throw e; }
  }
  ok(mi, 'messages'); skip(ms, 'messages');

  // System prompts → prompts table
  const sysPrompts = db.prepare('SELECT name, prompt, created_at FROM system_prompts').all();
  let pi = 0, ps = 0;
  for (const p of sysPrompts) {
    try {
      // Check if a prompt with same title already exists
      const existing = await query('SELECT id FROM prompts WHERE title = ?', [p.name]);
      if (existing.length > 0) { ps++; continue; }
      await query(
        `INSERT INTO prompts (title, prompt, model_id, model_name, is_active, sort_order)
         VALUES (?, ?, NULL, 'Default Model', 1, 99)`,
        [p.name, p.prompt]
      );
      pi++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') ps++; else throw e; }
  }
  ok(pi, 'system prompts → prompts'); skip(ps, 'system prompts');

  db.close();
}

// ── 2. Tauri knowledge.db ────────────────────────────────────────────────────

async function migrateKnowledgeDb() {
  console.log('\n📚 Tauri knowledge.db → kb_documents + kb_chunks');
  const db = openSQLite(SQLITE_KNOWLEDGE);
  if (!db) return;

  // KB documents
  const docs = db.prepare(
    'SELECT id, name, source_type, content_hash, chunk_count, access_level, created_at, updated_at FROM kb_documents'
  ).all();

  let di = 0, ds = 0;
  for (const d of docs) {
    // Build a combined content placeholder — actual content is in chunks
    const placeholder = `[Document: ${d.name} — ${d.chunk_count} chunks indexed in kb_chunks]`;
    try {
      await query(
        `INSERT INTO kb_documents (id, type, name, url, content, chars, source_type, chunk_count, content_hash, access_level, source)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'tauri')`,
        [
          d.id, d.source_type || 'file', d.name,
          placeholder, placeholder.length,
          d.source_type || 'file', d.chunk_count || 0,
          d.content_hash || null, d.access_level || 'internal',
        ]
      );
      di++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') ds++; else throw e; }
  }
  ok(di, 'kb_documents'); skip(ds, 'kb_documents');

  // KB chunks
  const chunks = db.prepare(
    'SELECT id, document_id, content, chunk_index FROM kb_chunks ORDER BY document_id, chunk_index'
  ).all();

  let chi = 0, chs = 0;
  for (const c of chunks) {
    try {
      await query(
        `INSERT INTO kb_chunks (id, document_id, content, chunk_index, source)
         VALUES (?, ?, ?, ?, 'tauri')`,
        [c.id, c.document_id, c.content, c.chunk_index]
      );
      chi++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') chs++; else throw e; }
  }
  ok(chi, 'kb_chunks'); skip(chs, 'kb_chunks');

  db.close();
}

// ── 3. Legacy kb.json ────────────────────────────────────────────────────────

async function migrateKbJson() {
  if (!fs.existsSync(KB_JSON)) { log('↷ kb.json not found, skipping'); return; }
  console.log('\n📄 backend/kb.json → kb_documents');
  const docs = JSON.parse(fs.readFileSync(KB_JSON, 'utf8'));
  if (!Array.isArray(docs) || docs.length === 0) { log('↷ kb.json is empty'); return; }

  let di = 0, ds = 0;
  for (const d of docs) {
    try {
      await query(
        `INSERT INTO kb_documents (id, type, name, url, content, chars, source_type, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'file', 'backend', FROM_UNIXTIME(?/1000))`,
        [
          d.id, d.type || 'file', d.name, d.url || null,
          d.content, d.content?.length || 0,
          d.createdAt || Date.now(),
        ]
      );
      di++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') ds++; else throw e; }
  }
  ok(di, 'kb_documents from kb.json'); skip(ds, 'kb_documents');
}

// ── 4. activity.json ──────────────────────────────────────────────────────────

async function migrateActivity() {
  if (!fs.existsSync(ACTIVITY_JSON)) { log('↷ activity.json not found, skipping'); return; }
  console.log('\n📊 backend/activity.json → activity');
  const data = JSON.parse(fs.readFileSync(ACTIVITY_JSON, 'utf8'));
  let ai = 0, as_ = 0;
  for (const [date, day] of Object.entries(data.daily || {})) {
    try {
      await query(
        `INSERT INTO activity (date, requests, tokens) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE requests = VALUES(requests), tokens = VALUES(tokens)`,
        [date, day.requests || 0, day.tokens || 0]
      );
      ai++;
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') as_++; else throw e; }
  }
  ok(ai, 'activity days'); skip(as_, 'activity days');
}

// ── 5. Website licenses ───────────────────────────────────────────────────────
// Licenses are generated client-side (localStorage) by the website Pricing page.
// Format: LMKA-{txId}  — paid via mobile money at 2 XAF
// We register the known license here. Add more with: node migrate_all.js --add-license

async function migrateWebsiteLicenses() {
  console.log('\n🔑 Website licenses → licenses table');

  // Known licenses from the website (format LMKA-{txId})
  // The website stores these in localStorage. Add any known keys here:
  const websiteLicenses = [
    // Populated from Pricing.tsx payment records
    // { key: 'LMKA-xxxxx', name: '', email: '', phone: '', amount: 2, currency: 'XAF', plan: 'pro' }
  ];

  // Check if there are any license args passed: node migrate_all.js --license LMKA-XXX --name "John" --email "j@x.com"
  const args = process.argv.slice(2);
  const licIdx = args.indexOf('--license');
  if (licIdx !== -1 && args[licIdx + 1]) {
    const nameIdx = args.indexOf('--name');
    const emailIdx = args.indexOf('--email');
    const phoneIdx = args.indexOf('--phone');
    websiteLicenses.push({
      key: args[licIdx + 1],
      name: nameIdx !== -1 ? args[nameIdx + 1] : '',
      email: emailIdx !== -1 ? args[emailIdx + 1] : '',
      phone: phoneIdx !== -1 ? args[phoneIdx + 1] : '',
      amount: 2, currency: 'XAF', plan: 'pro',
    });
  }

  if (websiteLicenses.length === 0) {
    log('↷ No website licenses to import');
    log('  To add a license: node migrate_all.js --license LMKA-xxx --name "Customer" --email "email@x.com"');
    return;
  }

  let li = 0, ls = 0;
  for (const lic of websiteLicenses) {
    try {
      await query(
        `INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, is_active, notes)
         VALUES (?, ?, ?, ?, 9999999, 1, ?)
         ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), customer_email = VALUES(customer_email)`,
        [lic.key, lic.name || null, lic.email || null, lic.plan || 'pro',
         JSON.stringify({ phone: lic.phone, amount: lic.amount, currency: lic.currency, source: 'website' })]
      );
      li++;
    } catch (e) {
      // notes column might not exist yet — add it
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await query('ALTER TABLE licenses ADD COLUMN IF NOT EXISTS notes TEXT');
        await query(
          `INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, is_active)
           VALUES (?, ?, ?, ?, 9999999, 1)
           ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name)`,
          [lic.key, lic.name || null, lic.email || null, lic.plan || 'pro']
        );
        li++;
      } else if (e.code === 'ER_DUP_ENTRY') { ls++; }
      else throw e;
    }
  }
  ok(li, 'website licenses'); skip(ls, 'licenses');
}

// ── Schema migrations (idempotent) ────────────────────────────────────────────

async function ensureSchema() {
  // licenses.notes
  try { await query('ALTER TABLE licenses ADD COLUMN notes TEXT'); log('+ Added notes column to licenses'); } catch { /* already exists */ }
  // licenses.bound_instance_id — machine fingerprint of the first device to activate this key
  try { await query('ALTER TABLE licenses ADD COLUMN bound_instance_id VARCHAR(255) NULL DEFAULT NULL'); log('+ Added bound_instance_id column to licenses'); } catch { /* already exists */ }
  // licenses.activated_at — when the license was first bound to a machine
  try { await query('ALTER TABLE licenses ADD COLUMN activated_at DATETIME NULL DEFAULT NULL'); log('+ Added activated_at column to licenses'); } catch { /* already exists */ }
  // models.allowed_plan_ids — null = all plans, comma-separated plan IDs = restricted
  try { await query('ALTER TABLE models ADD COLUMN allowed_plan_ids TEXT NULL DEFAULT NULL'); log('+ Added allowed_plan_ids column to models'); } catch { /* already exists */ }
  // trials — one row per instance_id, records first_seen_at for trial tracking
  await query(`
    CREATE TABLE IF NOT EXISTS trials (
      instance_id VARCHAR(255) PRIMARY KEY,
      user_name VARCHAR(255) NULL,
      first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Add columns to existing trials table if they don't exist
  try { await query('ALTER TABLE trials ADD COLUMN user_name VARCHAR(255) NULL'); } catch { /* already exists */ }
  try { await query('ALTER TABLE trials ADD COLUMN last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch { /* already exists */ }
  log('✓ trials table ready');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Lamu — Full Data Migration to MySQL');
  console.log('═══════════════════════════════════════════════');

  await ensureSchema();
  await migrateLamuDb();
  await migrateKnowledgeDb();
  await migrateKbJson();
  await migrateActivity();
  await migrateWebsiteLicenses();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Done! Imported: ${totalImported}  Skipped: ${totalSkipped}`);
  console.log('═══════════════════════════════════════════════\n');

  // Print final counts
  const tables = ['conversations','messages','kb_documents','kb_chunks','activity','licenses','models','prompts','admin_users'];
  console.log('MySQL table counts:');
  for (const t of tables) {
    const [r] = await query(`SELECT COUNT(*) as c FROM ${t}`);
    console.log(`  ${t.padEnd(20)} ${r.c}`);
  }

  await pool.end();
}

run().catch(err => {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
