'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('../db');

const app = express();
const PORT = parseInt(process.env.ADMIN_PORT || '3001', 10);
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'change_me_in_production';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Admin JWT auth ───────────────────────────────────────────────────────────

function requireAdminAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── POST /admin/api/login ────────────────────────────────────────────────────

app.post('/admin/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  try {
    const user = await db.queryOne(
      'SELECT id, username, email, password_hash, role FROM admin_users WHERE username = ? AND is_active = 1',
      [username]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    await db.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    console.error('[admin/login] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── License events table + expiry CRON ──────────────────────────────────────

async function ensureLicenseEventsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS license_events (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      license_id    INT NOT NULL,
      event_type    ENUM('expiring_soon','expired','renewed','activated','deactivated') NOT NULL,
      customer_name VARCHAR(150),
      customer_email VARCHAR(150),
      plan          VARCHAR(50),
      expires_at    DATE,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_le_created (created_at),
      INDEX idx_le_license (license_id),
      INDEX idx_le_type    (event_type)
    )
  `);
}

// Runs once daily: insert events for licenses expiring soon or just expired.
// Skips licenses that already generated the same event today (idempotent).
async function runLicenseExpiryCheck() {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // ── 1. Licences expirant dans <= 7 jours (non notifiées aujourd'hui) ──
    const expiringSoon = await db.query(`
      SELECT l.id, l.customer_name, l.customer_email, l.plan, l.expires_at
      FROM licenses l
      WHERE l.is_active = 1
        AND l.expires_at IS NOT NULL
        AND l.expires_at > CURDATE()
        AND l.expires_at <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND NOT EXISTS (
          SELECT 1 FROM license_events le
          WHERE le.license_id = l.id
            AND le.event_type = 'expiring_soon'
            AND DATE(le.created_at) = ?
        )
    `, [today]);

    for (const lic of expiringSoon) {
      await db.query(
        `INSERT INTO license_events (license_id, event_type, customer_name, customer_email, plan, expires_at)
         VALUES (?, 'expiring_soon', ?, ?, ?, ?)`,
        [lic.id, lic.customer_name || null, lic.customer_email || null, lic.plan || null, lic.expires_at]
      );
    }

    // ── 2. Licences expirées (hier ou avant), non notifiées comme expired ──
    const expired = await db.query(`
      SELECT l.id, l.customer_name, l.customer_email, l.plan, l.expires_at
      FROM licenses l
      WHERE l.expires_at IS NOT NULL
        AND l.expires_at < CURDATE()
        AND NOT EXISTS (
          SELECT 1 FROM license_events le
          WHERE le.license_id = l.id
            AND le.event_type = 'expired'
            AND DATE(le.created_at) = ?
        )
    `, [today]);

    for (const lic of expired) {
      await db.query(
        `INSERT INTO license_events (license_id, event_type, customer_name, customer_email, plan, expires_at)
         VALUES (?, 'expired', ?, ?, ?, ?)`,
        [lic.id, lic.customer_name || null, lic.customer_email || null, lic.plan || null, lic.expires_at]
      );
      // Also mark license inactive if it isn't already
      await db.query('UPDATE licenses SET is_active = 0 WHERE id = ? AND is_active = 1', [lic.id]);
    }

    if (expiringSoon.length || expired.length) {
      console.log(`[license-cron] ${expiringSoon.length} expiring-soon, ${expired.length} expired`);
    }
  } catch (err) {
    console.error('[license-cron] Error:', err.message);
  }
}

// ─── Ensure settings table exists ────────────────────────────────────────────

async function ensureSettingsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

// ─── Settings CRUD ────────────────────────────────────────────────────────────

app.get('/admin/api/settings', requireAdminAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT `key`, value FROM settings');
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/settings', requireAdminAuth, async (req, res) => {
  const { settings } = req.body || {};
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required' });
  try {
    for (const [key, value] of Object.entries(settings)) {
      await db.query(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()',
        [key, value, value]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post('/admin/api/settings/test-smtp', requireAdminAuth, async (req, res) => {
  const { host, port, user, pass, from, to } = req.body || {};
  if (!host || !user || !pass || !to) return res.status(400).json({ error: 'host, user, pass, to requis' });
  try {
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port || '587'), secure: parseInt(port || '587') === 465,
      auth: { user, pass },
    });
    await transporter.verify();
    await transporter.sendMail({
      from: from || `Lamuka <${user}>`,
      to,
      subject: 'Test SMTP — Lamuka Admin',
      html: '<div style="font-family:sans-serif;padding:24px"><h2>✅ SMTP fonctionne !</h2><p>La configuration SMTP de Lamuka est correcte.</p></div>',
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Ensure plans table exists ───────────────────────────────────────────────

async function ensurePlansTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'XAF',
      billing_period ENUM('free','lifetime','monthly','yearly') DEFAULT 'lifetime',
      max_requests INT DEFAULT 9999999,
      features JSON,
      color VARCHAR(30) DEFAULT '#6C3AE8',
      is_active TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // All paid plans grant these technical feature identifiers (checked by the app)
  const ALL_APP_FEATURES = ['drag_window','screenshot','audio_capture','file_attachments','contact_support','knowledge_base','meeting_mode'];

  // Seed default plans if empty
  const [{ c }] = await db.query('SELECT COUNT(*) as c FROM plans');
  if (c === 0) {
    const defaults = [
      { id: 'free',       name: 'Free',       price: 0,    billing_period: 'free',     max_requests: 100,     color: '#4ade80', sort_order: 0, description: 'Usage gratuite avec clés API personnelles', features: JSON.stringify([]) },
      { id: 'basic',      name: 'Basic',      price: 500,  billing_period: 'monthly',  max_requests: 5000,    color: '#60a5fa', sort_order: 1, description: 'Pour les utilisateurs réguliers', features: JSON.stringify(['drag_window','audio_capture','contact_support']) },
      { id: 'pro',        name: 'Pro',        price: 2,    billing_period: 'lifetime', max_requests: 9999999, color: '#818cf8', sort_order: 2, description: 'Accès complet à vie — paiement unique', features: JSON.stringify(ALL_APP_FEATURES) },
      { id: 'enterprise', name: 'Enterprise', price: 0,    billing_period: 'yearly',   max_requests: 9999999, color: '#f97316', sort_order: 3, description: 'Pour les équipes et organisations', features: JSON.stringify(ALL_APP_FEATURES) },
    ];
    for (const p of defaults) {
      await db.query(
        'INSERT IGNORE INTO plans (id,name,description,price,currency,billing_period,max_requests,features,color,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,1,?)',
        [p.id, p.name, p.description, p.price, 'XAF', p.billing_period, p.max_requests, p.features, p.color, p.sort_order]
      );
    }
  } else {
    // Migration: replace old marketing strings with technical feature keys for all known plans
    const CORRECT_FEATURES = {
      free:       [],
      basic:      ['drag_window', 'audio_capture', 'contact_support'],
      pro:        ALL_APP_FEATURES,
      enterprise: ALL_APP_FEATURES,
    };
    const existingPlans = await db.query("SELECT id, features FROM plans WHERE id IN ('free','basic','pro','enterprise')");
    for (const plan of existingPlans) {
      let feats = [];
      try { feats = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []); } catch { feats = []; }
      // Detect old marketing strings: any feature that is not a known technical key
      const knownKeys = new Set(ALL_APP_FEATURES);
      const hasOldStrings = feats.some(f => !knownKeys.has(f));
      if (hasOldStrings) {
        const correct = CORRECT_FEATURES[plan.id] ?? [];
        await db.query('UPDATE plans SET features = ? WHERE id = ?', [JSON.stringify(correct), plan.id]);
        console.log(`[plans] Migrated features for plan: ${plan.id}`);
      }
    }
  }
}

// ─── Plans CRUD ───────────────────────────────────────────────────────────────

app.get('/admin/api/plans', requireAdminAuth, async (req, res) => {
  try {
    const plans = await db.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM licenses l WHERE l.plan = p.id) as license_count,
        (SELECT COUNT(*) FROM licenses l WHERE l.plan = p.id AND l.is_active = 1) as active_count
      FROM plans p ORDER BY sort_order ASC, name ASC
    `);
    res.json({ plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/api/plans', requireAdminAuth, async (req, res) => {
  const { id, name, description, price, currency, billing_period, max_requests, features, color, sort_order } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  try {
    await db.query(
      'INSERT INTO plans (id,name,description,price,currency,billing_period,max_requests,features,color,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,?,1,?)',
      [id, name, description || '', price || 0, currency || 'XAF', billing_period || 'lifetime', max_requests || 9999999, JSON.stringify(features || []), color || '#6C3AE8', sort_order || 0]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/plans/:id', requireAdminAuth, async (req, res) => {
  const { name, description, price, currency, billing_period, max_requests, features, color, is_active, sort_order } = req.body;
  try {
    await db.query(
      'UPDATE plans SET name=?,description=?,price=?,currency=?,billing_period=?,max_requests=?,features=?,color=?,is_active=?,sort_order=? WHERE id=?',
      [name, description, price, currency, billing_period, max_requests, JSON.stringify(features || []), color, is_active ? 1 : 0, sort_order, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/plans/:id', requireAdminAuth, async (req, res) => {
  try {
    const [{ c }] = await db.query('SELECT COUNT(*) as c FROM licenses WHERE plan = ?', [req.params.id]);
    if (c > 0) return res.status(400).json({ error: `Cannot delete: ${c} license(s) use this plan` });
    await db.query('DELETE FROM plans WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Models CRUD ─────────────────────────────────────────────────────────────

app.get('/admin/api/models', requireAdminAuth, async (req, res) => {
  try {
    const models = await db.query('SELECT * FROM models ORDER BY sort_order ASC, provider ASC');
    res.json({ models });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/api/models', requireAdminAuth, async (req, res) => {
  const { id, provider, name, model, description, modality, is_available, sort_order, allowed_plan_ids } = req.body;
  if (!id || !provider || !name || !model) return res.status(400).json({ error: 'id, provider, name, model are required' });
  // Ensure column exists (idempotent)
  try { await db.query('ALTER TABLE models ADD COLUMN allowed_plan_ids TEXT NULL DEFAULT NULL'); } catch { /* already exists */ }
  try {
    await db.query(
      'INSERT INTO models (id, provider, name, model, description, modality, is_available, sort_order, allowed_plan_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, provider, name, model, description || '', modality || 'text', is_available !== false ? 1 : 0, sort_order || 0, allowed_plan_ids || null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/models/:id', requireAdminAuth, async (req, res) => {
  const { provider, name, model, description, modality, is_available, sort_order, allowed_plan_ids } = req.body;
  // Ensure column exists (idempotent)
  try { await db.query('ALTER TABLE models ADD COLUMN allowed_plan_ids TEXT NULL DEFAULT NULL'); } catch { /* already exists */ }
  try {
    await db.query(
      'UPDATE models SET provider=?, name=?, model=?, description=?, modality=?, is_available=?, sort_order=?, allowed_plan_ids=? WHERE id=?',
      [provider, name, model, description, modality, is_available ? 1 : 0, sort_order, allowed_plan_ids || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/models/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM models WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Prompts CRUD ─────────────────────────────────────────────────────────────

app.get('/admin/api/prompts', requireAdminAuth, async (req, res) => {
  try {
    const prompts = await db.query('SELECT * FROM prompts ORDER BY sort_order ASC');
    res.json({ prompts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/api/prompts', requireAdminAuth, async (req, res) => {
  const { title, prompt, model_id, model_name, sort_order } = req.body;
  if (!title || !prompt) return res.status(400).json({ error: 'title and prompt are required' });
  try {
    await db.query(
      'INSERT INTO prompts (title, prompt, model_id, model_name, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
      [title, prompt, model_id || null, model_name || 'Default Model', sort_order || 0]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/prompts/:id', requireAdminAuth, async (req, res) => {
  const { title, prompt, model_id, model_name, is_active, sort_order } = req.body;
  try {
    await db.query(
      'UPDATE prompts SET title=?, prompt=?, model_id=?, model_name=?, is_active=?, sort_order=? WHERE id=?',
      [title, prompt, model_id, model_name, is_active ? 1 : 0, sort_order, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/prompts/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM prompts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Activity stats ───────────────────────────────────────────────────────────

app.get('/admin/api/activity', requireAdminAuth, async (req, res) => {
  try {
    const daily = await db.query(
      'SELECT date, requests, tokens FROM activity ORDER BY date DESC LIMIT 30'
    );
    const [totals] = await db.query('SELECT SUM(requests) as total_requests, SUM(tokens) as total_tokens FROM activity');
    const [modelStats] = await db.query(
      'SELECT ai_model, COUNT(*) as count, SUM(total_tokens) as tokens FROM activity_log GROUP BY ai_model ORDER BY count DESC LIMIT 10'
    );
    res.json({
      daily,
      total_requests: Number(totals?.total_requests || 0),
      total_tokens: Number(totals?.total_tokens || 0),
      by_model: modelStats || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/activity/logs', requireAdminAuth, async (req, res) => {
  try {
    const logs = await db.query(
      'SELECT id, ai_model, app_version, machine_id, prompt_tokens, completion_tokens, total_tokens, created_at FROM activity_log ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── KB documents ─────────────────────────────────────────────────────────────

app.get('/admin/api/kb', requireAdminAuth, async (req, res) => {
  try {
    const docs = await db.query('SELECT id, type, name, url, chars, created_at FROM kb_documents ORDER BY created_at DESC');
    res.json({ docs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/kb/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM kb_documents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Admin users ──────────────────────────────────────────────────────────────

app.get('/admin/api/users', requireAdminAuth, async (req, res) => {
  try {
    const users = await db.query('SELECT id, username, email, role, is_active, last_login, created_at FROM admin_users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/api/users', requireAdminAuth, async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email, password are required' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hash, role || 'admin']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/users/:id/password', requireAdminAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password is required' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE admin_users SET password_hash=? WHERE id=?', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/users/:id/toggle', requireAdminAuth, async (req, res) => {
  try {
    await db.query('UPDATE admin_users SET is_active = NOT is_active WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Licenses ─────────────────────────────────────────────────────────────────

app.get('/admin/api/licenses', requireAdminAuth, async (req, res) => {
  try {
    const licenses = await db.query('SELECT * FROM licenses ORDER BY created_at DESC');
    res.json({ licenses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/api/licenses', requireAdminAuth, async (req, res) => {
  const { customer_name, customer_email, plan, max_requests, expires_at } = req.body;
  const key = 'LMU-' + Math.random().toString(36).slice(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
  try {
    await db.query(
      'INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [key, customer_name || null, customer_email || null, plan || 'basic', max_requests || 1000, expires_at || null]
    );
    res.json({ ok: true, license_key: key });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/api/licenses/:id/toggle', requireAdminAuth, async (req, res) => {
  try {
    await db.query('UPDATE licenses SET is_active = NOT is_active WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/licenses/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM licenses WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Trials monitoring ───────────────────────────────────────────────────────

// Migrate trials table to add monitoring columns (idempotent)
async function ensureTrialsColumns() {
  const cols = [
    'ALTER TABLE trials ADD COLUMN email VARCHAR(150) NULL',
    'ALTER TABLE trials ADD COLUMN request_count INT DEFAULT 0',
    'ALTER TABLE trials ADD COLUMN app_version VARCHAR(30) NULL',
    'ALTER TABLE trials ADD COLUMN last_model VARCHAR(100) NULL',
    'ALTER TABLE trials ADD COLUMN trial_expires_at DATETIME NULL',
    'ALTER TABLE trials ADD COLUMN converted_at DATETIME NULL',
  ];
  for (const sql of cols) { try { await db.query(sql); } catch { /* already exists */ } }

  // Back-fill request_count from activity_log for existing trials
  await db.query(`
    UPDATE trials t
    JOIN (SELECT machine_id, COUNT(*) as cnt, MAX(ai_model) as last_model
          FROM activity_log GROUP BY machine_id) al
      ON al.machine_id = t.instance_id
    SET t.request_count = al.cnt, t.last_model = al.last_model
    WHERE t.request_count = 0 AND al.cnt > 0
  `).catch(() => {});
}

// Compute trial status label
function trialStatus(t) {
  if (t.converted_at) return 'converted';
  const now = Date.now();
  const lastSeen = new Date(t.last_seen_at).getTime();
  const daysSince = (now - lastSeen) / 86400000;
  if (daysSince < 1) return 'active';
  if (daysSince < 3) return 'warm';
  if (daysSince < 7) return 'at_risk';
  return 'churned';
}

// GET /admin/api/trials — enriched trial users list
app.get('/admin/api/trials', requireAdminAuth, async (req, res) => {
  try {
    const trials = await db.query(`
      SELECT t.instance_id, t.user_name, t.email, t.request_count, t.app_version,
             t.last_model, t.trial_expires_at, t.converted_at,
             t.first_seen_at, t.last_seen_at,
             COALESCE(al.req_count, 0) as total_requests,
             al.last_model_used
      FROM trials t
      LEFT JOIN (
        SELECT machine_id, COUNT(*) as req_count, MAX(ai_model) as last_model_used
        FROM activity_log GROUP BY machine_id
      ) al ON al.machine_id = t.instance_id
      ORDER BY t.last_seen_at DESC
    `);

    const enriched = trials.map(t => ({
      ...t,
      request_count: Number(t.total_requests) || Number(t.request_count) || 0,
      last_model: t.last_model_used || t.last_model || null,
      status: trialStatus(t),
    }));

    // Summary stats
    const total      = enriched.length;
    const active     = enriched.filter(t => t.status === 'active').length;
    const at_risk    = enriched.filter(t => t.status === 'at_risk').length;
    const converted  = enriched.filter(t => t.status === 'converted').length;
    const churned    = enriched.filter(t => t.status === 'churned').length;
    const new_today  = enriched.filter(t => new Date(t.first_seen_at) > new Date(Date.now() - 86400000)).length;

    // Read configured trial duration
    let trial_duration_hours = 48;
    try {
      const row = await db.queryOne("SELECT value FROM settings WHERE `key` = 'trial_duration_hours'", []);
      if (row?.value) trial_duration_hours = parseInt(row.value, 10) || 48;
    } catch { /* use default */ }

    res.json({ trials: enriched, stats: { total, active, at_risk, converted, churned, new_today }, trial_duration_hours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/api/trials/stats — quick KPIs for dashboard
app.get('/admin/api/trials/stats', requireAdminAuth, async (req, res) => {
  try {
    const [{ total }]     = await db.query('SELECT COUNT(*) as total FROM trials');
    const [{ new_today }] = await db.query('SELECT COUNT(*) as new_today FROM trials WHERE first_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    const [{ active }]    = await db.query('SELECT COUNT(*) as active FROM trials WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    const [{ converted }] = await db.query('SELECT COUNT(*) as converted FROM trials WHERE converted_at IS NOT NULL');
    res.json({ ok: true, total: Number(total), new_today: Number(new_today), active: Number(active), converted: Number(converted) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Conversations ────────────────────────────────────────────────────────────

app.get('/admin/api/conversations', requireAdminAuth, async (req, res) => {
  try {
    const convs = await db.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at, c.source,
              COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 100`
    );
    res.json({ conversations: convs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/conversations/:id/messages', requireAdminAuth, async (req, res) => {
  try {
    const msgs = await db.query(
      'SELECT id, role, content, timestamp, attached_files FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
      [req.params.id]
    );
    res.json({ messages: msgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/api/conversations/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    await db.query('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Import website license (LMKA- format) ────────────────────────────────────

app.post('/admin/api/licenses/import', requireAdminAuth, async (req, res) => {
  const { license_key, customer_name, customer_email, customer_phone, notes } = req.body;
  if (!license_key) return res.status(400).json({ error: 'license_key is required' });
  if (!license_key.startsWith('LMKA-')) return res.status(400).json({ error: 'Website licenses must start with LMKA-' });
  try {
    await db.query(
      `INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, is_active, notes)
       VALUES (?, ?, ?, 'pro', 9999999, 1, ?)
       ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), customer_email = VALUES(customer_email), notes = VALUES(notes)`,
      [license_key, customer_name || null, customer_email || null,
       JSON.stringify({ phone: customer_phone, source: 'website_payment', notes })]
    );
    res.json({ ok: true, license_key });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── KB Chunks ─────────────────────────────────────────────────────────────────

app.get('/admin/api/kb/:id/chunks', requireAdminAuth, async (req, res) => {
  try {
    const chunks = await db.query(
      'SELECT id, chunk_index, CHAR_LENGTH(content) as content_length, LEFT(content, 200) as preview FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index',
      [req.params.id]
    );
    res.json({ chunks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Monitoring ───────────────────────────────────────────────────────────────

async function ensureMonitoringTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS provider_incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(20) NOT NULL COMMENT 'primary or fallback',
      provider_url VARCHAR(500),
      status VARCHAR(20) NOT NULL COMMENT 'operational, degraded, down',
      latency_ms INT DEFAULT NULL,
      error_msg TEXT,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      is_notified TINYINT DEFAULT 0
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS provider_status (
      provider VARCHAR(20) PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'unknown',
      latency_ms INT DEFAULT NULL,
      last_check_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      uptime_24h DECIMAL(5,2) DEFAULT 100.00
    )
  `);
}

// GET /admin/api/monitoring — current provider status + recent incidents
app.get('/admin/api/monitoring', requireAdminAuth, async (req, res) => {
  try {
    const [status, incidents] = await Promise.all([
      db.query('SELECT * FROM provider_status ORDER BY provider'),
      db.query('SELECT * FROM provider_incidents ORDER BY detected_at DESC LIMIT 100'),
    ]);

    // Calculate uptime for last 24h per provider
    const uptime = await db.query(`
      SELECT provider,
        ROUND(100 - (COUNT(CASE WHEN status = 'down' THEN 1 END) / COUNT(*) * 100), 2) as uptime_24h
      FROM provider_incidents
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY provider
    `);

    res.json({ status, incidents, uptime });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/api/monitoring/check — trigger manual health check via main server
app.post('/admin/api/monitoring/check', requireAdminAuth, async (req, res) => {
  try {
    const mainPort = process.env.PORT || '3000';
    const result = await fetch(`http://localhost:${mainPort}/health/providers`).then(r => r.json()).catch(() => null);
    res.json({ ok: true, result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /admin/api/notifications ────────────────────────────────────────────
// Agrège les événements récents de plusieurs tables en un flux unifié

app.get('/admin/api/notifications', requireAdminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 40;
    const since = req.query.since || null;

    const [incidents, paymentsConfirmed, paymentsPending, newLicenses, trialsNew, trialsAtRisk, licenseEvents] = await Promise.all([

      // Provider incidents (down / degraded) — last 48h only
      db.query(
        `SELECT 'incident' as type, id, provider as subject,
          CASE status WHEN 'down' THEN 'error' WHEN 'degraded' THEN 'warning' ELSE 'info' END as severity,
          CONCAT('Provider ', provider, ' est ', status) as title,
          CONCAT('URL: ', COALESCE(provider_url,'—'), IF(error_msg IS NOT NULL, CONCAT(' — ', error_msg), '')) as body,
          detected_at as created_at
         FROM provider_incidents
         WHERE status IN ('down','degraded')
           AND detected_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
           ${since ? 'AND detected_at > ?' : ''}
         ORDER BY detected_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ),

      // Paiements confirmés récents
      db.query(
        `SELECT 'payment' as type, tx_id as id, customer_name as subject,
          'success' as severity,
          CONCAT('Paiement confirmé — ', COALESCE(customer_name,'Client inconnu')) as title,
          CONCAT(COALESCE(amount,''),' ',COALESCE(currency,''), ' — Plan: ', COALESCE(plan_id,'—')) as body,
          confirmed_at as created_at
         FROM pending_payments
         WHERE status = 'confirmed' AND confirmed_at IS NOT NULL ${since ? 'AND confirmed_at > ?' : ''}
         ORDER BY confirmed_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ),

      // Paiements en attente depuis plus de 30 minutes
      db.query(
        `SELECT 'payment_pending' as type, tx_id as id, customer_name as subject,
          'warning' as severity,
          CONCAT('Paiement en attente — ', COALESCE(customer_name,'Client inconnu')) as title,
          CONCAT('Depuis plus de 30 min — ', COALESCE(amount,''),' ',COALESCE(currency,'')) as body,
          created_at
         FROM pending_payments
         WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE) ${since ? 'AND created_at > ?' : ''}
         ORDER BY created_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ),

      // Nouvelles licences créées récemment (48h)
      db.query(
        `SELECT 'license_new' as type, id, customer_email as subject,
          'info' as severity,
          CONCAT('Nouvelle licence — ', COALESCE(plan,'—')) as title,
          CONCAT('Client: ', COALESCE(customer_name,'—'), ' — ', COALESCE(customer_email,'—')) as body,
          created_at
         FROM licenses
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) ${since ? 'AND created_at > ?' : ''}
         ORDER BY created_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ),

      // Nouveaux trials (< 48h)
      db.query(
        `SELECT 'trial_new' as type, instance_id as id,
          COALESCE(email, user_name, instance_id) as subject,
          'info' as severity,
          CONCAT('Nouvel utilisateur trial — ', COALESCE(user_name,'Inconnu')) as title,
          CONCAT('Depuis ', DATE_FORMAT(first_seen_at,'%d/%m/%Y %H:%i'), COALESCE(CONCAT(' — ', email),'')) as body,
          first_seen_at as created_at
         FROM trials
         WHERE first_seen_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) ${since ? 'AND first_seen_at > ?' : ''}
           AND converted_at IS NULL
         ORDER BY first_seen_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ).catch(() => []),

      // Trials actifs à risque (inactifs depuis 3-7 jours, pas convertis)
      db.query(
        `SELECT 'trial_at_risk' as type, instance_id as id,
          COALESCE(email, user_name, instance_id) as subject,
          'warning' as severity,
          CONCAT('Trial inactif — ', COALESCE(user_name,'Inconnu')) as title,
          CONCAT('Dernière activité : ', DATE_FORMAT(last_seen_at,'%d/%m/%Y'), COALESCE(CONCAT(' — ', CAST(request_count AS CHAR), ' requêtes'),'')) as body,
          last_seen_at as created_at
         FROM trials
         WHERE last_seen_at BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY) AND DATE_SUB(NOW(), INTERVAL 3 DAY)
           AND converted_at IS NULL
           ${since ? 'AND last_seen_at > ?' : ''}
         ORDER BY last_seen_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ).catch(() => []),

      // Événements d'expiration de licences (table license_events)
      db.query(
        `SELECT
          CASE event_type
            WHEN 'expiring_soon' THEN 'license_expiring'
            WHEN 'expired'       THEN 'license_expired'
            WHEN 'renewed'       THEN 'license_renewed'
            ELSE event_type
          END as type,
          le.id,
          COALESCE(le.customer_email, le.customer_name, 'Client inconnu') as subject,
          CASE event_type
            WHEN 'expiring_soon' THEN 'warning'
            WHEN 'expired'       THEN 'error'
            WHEN 'renewed'       THEN 'success'
            ELSE 'info'
          END as severity,
          CASE event_type
            WHEN 'expiring_soon' THEN CONCAT('Licence expire bientôt — ', COALESCE(le.customer_name, le.customer_email,'—'))
            WHEN 'expired'       THEN CONCAT('Licence expirée — ', COALESCE(le.customer_name, le.customer_email,'—'))
            WHEN 'renewed'       THEN CONCAT('Licence renouvelée — ', COALESCE(le.customer_name, le.customer_email,'—'))
            ELSE CONCAT('Licence — ', event_type)
          END as title,
          CASE event_type
            WHEN 'expiring_soon' THEN CONCAT('Plan: ', COALESCE(le.plan,'—'), ' — Expire le ', DATE_FORMAT(le.expires_at,'%d/%m/%Y'))
            WHEN 'expired'       THEN CONCAT('Plan: ', COALESCE(le.plan,'—'), ' — Expiré le ', DATE_FORMAT(le.expires_at,'%d/%m/%Y'))
            ELSE CONCAT('Plan: ', COALESCE(le.plan,'—'))
          END as body,
          le.created_at
         FROM license_events le
         WHERE 1=1 ${since ? 'AND le.created_at > ?' : ''}
         ORDER BY le.created_at DESC LIMIT ?`,
        since ? [since, limit] : [limit]
      ).catch(() => []), // graceful if table doesn't exist yet

    ]);

    // Load dismissed notifications
    const dismissed = await db.query('SELECT notif_type, notif_id FROM dismissed_notifications').catch(() => []);
    const dismissedSet = new Set(dismissed.map(d => `${d.notif_type}::${d.notif_id}`));

    // Merge + dedupe + filter dismissed + sort
    const all = [...incidents, ...paymentsConfirmed, ...paymentsPending, ...newLicenses, ...trialsNew, ...trialsAtRisk, ...licenseEvents]
      .filter((n, i, arr) => arr.findIndex(x => String(x.id) === String(n.id) && x.type === n.type) === i)
      .filter(n => !dismissedSet.has(`${n.type}::${String(n.id)}`))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    // Unread = events newer than last 24h (badge logic is refined per-client via localStorage)
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const unread = all.filter(n => new Date(n.created_at) > new Date(cutoff)).length;

    res.json({ ok: true, notifications: all, unread });
  } catch (err) {
    console.error('[notifications]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/api/notifications/incidents/:id — delete a single provider incident
app.delete('/admin/api/notifications/incidents/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM provider_incidents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/api/notifications/dismiss — dismiss any notification by type+id
app.post('/admin/api/notifications/dismiss', requireAdminAuth, async (req, res) => {
  try {
    const { type, id } = req.body || {};
    if (!type || !id) return res.status(400).json({ error: 'type and id required' });
    await db.query(
      `INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id) VALUES (?, ?)`,
      [String(type), String(id)]
    );
    // Also hard-delete if it's a provider incident
    if (type === 'incident') {
      await db.query('DELETE FROM provider_incidents WHERE id = ?', [id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/api/notifications/clear — clear all: hard-delete incidents + dismiss the rest
app.delete('/admin/api/notifications/clear', requireAdminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM provider_incidents WHERE detected_at < NOW()');
    // Dismiss all current non-incident notifications
    const notifs = res.locals._lastNotifs; // not available here, so we mass-insert from a subquery approach
    // Simpler: just truncate dismissed table and re-populate — or mark everything as dismissed
    await db.query(`DELETE FROM dismissed_notifications WHERE 1=1`);
    // Insert dismiss entries for all current notifications from each source
    await Promise.all([
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT 'payment', tx_id FROM pending_payments WHERE status = 'confirmed' AND confirmed_at IS NOT NULL`),
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT 'payment_pending', tx_id FROM pending_payments WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`),
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT 'license_new', CAST(id AS CHAR) FROM licenses WHERE created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)`),
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT 'trial_new', instance_id FROM trials WHERE first_seen_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) AND converted_at IS NULL`).catch(() => {}),
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT 'trial_at_risk', instance_id FROM trials WHERE last_seen_at BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY) AND DATE_SUB(NOW(), INTERVAL 3 DAY) AND converted_at IS NULL`).catch(() => {}),
      db.query(`INSERT IGNORE INTO dismissed_notifications (notif_type, notif_id)
        SELECT CASE event_type WHEN 'expiring_soon' THEN 'license_expiring' WHEN 'expired' THEN 'license_expired' WHEN 'renewed' THEN 'license_renewed' ELSE event_type END, CAST(id AS CHAR) FROM license_events`).catch(() => {}),
    ]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/api/license-check — force manual expiry check (superadmin)
app.post('/admin/api/license-check', requireAdminAuth, async (req, res) => {
  try {
    await runLicenseExpiryCheck();
    res.json({ ok: true, message: 'Licence expiry check done' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Serve admin SPA ─────────────────────────────────────────────────────────

app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => res.redirect('/admin'));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch (e) { console.error('[admin db] Error:', e.message); }
  if (dbOk) {
    try { await ensureSettingsTable(); } catch (e) { console.error('[admin settings] Error:', e.message); }
    try { await ensurePlansTable(); } catch (e) { console.error('[admin plans] Error:', e.message); }
    try { await ensureMonitoringTable(); } catch (e) { console.error('[admin monitoring] Error:', e.message); }
    try { await ensureLicenseEventsTable(); } catch (e) { console.error('[admin license_events] Error:', e.message); }
    try { await ensureTrialsColumns(); } catch (e) { console.error('[admin trials] Error:', e.message); }

    // Run license expiry check now + every 24h
    runLicenseExpiryCheck();
    setInterval(runLicenseExpiryCheck, 24 * 60 * 60 * 1000);
  }
  console.log(`\nLamu Admin Dashboard running at http://localhost:${PORT}/admin`);
  console.log(`  Database  : ${dbOk ? '✓ connected' : '✗ NOT connected'}`);
  console.log('');
});
