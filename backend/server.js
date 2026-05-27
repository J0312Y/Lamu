'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

const WEBAPP_JWT_SECRET = process.env.WEBAPP_JWT_SECRET || 'lamu-webapp-change-me-in-prod';
const app = express();

// ─── Mailer — config chargée dynamiquement depuis la DB ──────────────────────

// Interpolation de template {{variable}}
function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function getSmtpSettings() {
  try {
    const rows = await db.query(
      "SELECT `key`, value FROM settings WHERE `key` IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from')"
    );
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    return {
      host: s.smtp_host || process.env.SMTP_HOST || '',
      port: parseInt(s.smtp_port || process.env.SMTP_PORT || '587'),
      user: s.smtp_user || process.env.SMTP_USER || '',
      pass: s.smtp_pass || process.env.SMTP_PASS || '',
      from: s.smtp_from || process.env.SMTP_FROM || 'Lamuka <noreply@lamuka.com>',
    };
  } catch {
    return {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'Lamuka <noreply@lamuka.com>',
    };
  }
}

async function getSetting(key, fallback = '') {
  try {
    const row = await db.queryOne("SELECT value FROM settings WHERE `key` = ?", [key]);
    return row?.value ?? fallback;
  } catch { return fallback; }
}

// ─── AI provider config (DB > .env, cached 30s) ───────────────────────────────
let _aiConfigCache = null;
let _aiConfigCacheTs = 0;

async function getAiConfig() {
  if (_aiConfigCache && Date.now() - _aiConfigCacheTs < 30000) return _aiConfigCache;
  try {
    const rows = await db.query(
      "SELECT `key`, value FROM settings WHERE `key` IN ('ai_primary_url','ai_primary_key','ai_primary_model','ai_fallback_url','ai_fallback_key','ai_fallback_model','ai_fallback_enabled','ai_body_extras')"
    );
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    const fallbackOn = s.ai_fallback_enabled === '1';
    _aiConfigCache = {
      primaryUrl:    s.ai_primary_url    || process.env.AI_CHAT_URL     || '',
      primaryKey:    s.ai_primary_key    || process.env.AI_CHAT_API_KEY || '',
      primaryModel:  s.ai_primary_model  || process.env.AI_MODEL        || 'gpt-4o',
      fallbackUrl:   fallbackOn ? (s.ai_fallback_url   || process.env.AI_FALLBACK_URL   || '') : '',
      fallbackKey:   fallbackOn ? (s.ai_fallback_key   || process.env.AI_FALLBACK_KEY   || '') : '',
      fallbackModel: fallbackOn ? (s.ai_fallback_model || process.env.AI_FALLBACK_MODEL || 'gpt-4o') : '',
      bodyExtras:    s.ai_body_extras    || process.env.AI_BODY_EXTRAS  || '{}',
    };
  } catch {
    _aiConfigCache = {
      primaryUrl:    process.env.AI_CHAT_URL     || '',
      primaryKey:    process.env.AI_CHAT_API_KEY || '',
      primaryModel:  process.env.AI_MODEL        || 'gpt-4o',
      fallbackUrl:   process.env.AI_FALLBACK_URL   || '',
      fallbackKey:   process.env.AI_FALLBACK_KEY   || '',
      fallbackModel: process.env.AI_FALLBACK_MODEL || 'gpt-4o',
      bodyExtras:    process.env.AI_BODY_EXTRAS  || '{}',
    };
  }
  _aiConfigCacheTs = Date.now();
  return _aiConfigCache;
}

function invalidateAiConfigCache() { _aiConfigCache = null; }

async function extractTextFromFile(name, base64) {
  const buffer = Buffer.from(base64, 'base64')
  const lower = (name || '').toLowerCase()

  if (lower.endsWith('.pdf') || buffer.slice(0, 4).toString() === '%PDF') {
    const data = await pdfParse(buffer)
    return (data.text || '').trim()
  }

  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer })
    return (result.value || '').trim()
  }

  return buffer.toString('utf8').trim()
}

// Templates par défaut
const DEFAULT_LICENSE_SUBJECT = '🎉 Votre licence Lamuka {{plan_name}} est prête';
const DEFAULT_LICENSE_HTML = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0f;color:#fff;padding:40px 20px;margin:0">
<div style="max-width:520px;margin:0 auto">
  <div style="text-align:center;margin-bottom:32px">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px">⚡</div>
    <h1 style="margin:0;font-size:24px;font-weight:800">Paiement confirmé !</h1>
    <p style="color:rgba(255,255,255,0.5);margin-top:8px">Bonjour {{name}}, votre licence est active.</p>
  </div>
  <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);border-radius:14px;padding:20px 24px;margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:10px">CLÉ DE LICENCE</div>
    <div style="font-family:monospace;font-size:15px;color:#4ade80;word-break:break-all;line-height:1.5">{{license_key}}</div>
  </div>
  <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:18px 20px;margin-bottom:24px">
    <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:8px">Plan : {{plan_name}} — {{amount}} {{currency}}</div>
    <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:12px">COMMENT ACTIVER</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8">1. Ouvrez Lamuka sur votre bureau<br>2. Allez dans Paramètres → Licence<br>3. Collez votre clé de licence<br>4. Cliquez sur Activer</div>
  </div>
  <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.7">
    Conservez cet email précieusement.<br>
    Besoin d'aide ? <a href="mailto:support@lamuka.com" style="color:#818cf8">support@lamuka.com</a>
  </p>
</div></body></html>`;

const DEFAULT_RECOVER_SUBJECT = 'Récupération de votre licence Lamuka';
const DEFAULT_RECOVER_HTML = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0f;color:#fff;padding:40px 20px;margin:0">
<div style="max-width:520px;margin:0 auto">
  <h1 style="text-align:center;font-size:22px;font-weight:800;margin-bottom:8px">Vos licences Lamuka</h1>
  <p style="text-align:center;color:rgba(255,255,255,0.5);margin-bottom:28px">Voici vos licences associées à {{email}}</p>
  {{license_list}}
  <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.25);margin-top:24px">
    Besoin d'aide ? <a href="mailto:support@lamuka.com" style="color:#818cf8">support@lamuka.com</a>
  </p>
</div></body></html>`;

const DEFAULT_SUPPORT_REPLY_SUBJECT = 'Nous avons bien reçu votre message — Lamuka Support';
const DEFAULT_SUPPORT_REPLY_HTML = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0f;color:#fff;padding:40px 20px;margin:0">
<div style="max-width:520px;margin:0 auto">
  <div style="text-align:center;margin-bottom:28px">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:12px">✉️</div>
    <h1 style="margin:0;font-size:22px;font-weight:800">Message reçu !</h1>
    <p style="color:rgba(255,255,255,0.5);margin-top:8px">Bonjour {{name}}, nous avons bien reçu votre demande.</p>
  </div>
  <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:14px;padding:20px 24px;margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:1px;margin-bottom:8px">VOTRE MESSAGE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7;white-space:pre-wrap">{{message}}</div>
  </div>
  <p style="font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.7">
    Nous vous répondrons sous <strong style="color:#fff">24–48h</strong> les jours ouvrables.<br>
    Référence : <code style="color:#818cf8">{{ticket_id}}</code>
  </p>
  <p style="text-align:center;font-size:12px;color:rgba(255,255,255,0.25);margin-top:24px">
    <a href="mailto:support@lamuka.com" style="color:#818cf8">support@lamuka.com</a>
  </p>
</div></body></html>`;

async function createMailer() {
  const s = await getSmtpSettings();
  if (!s.host || !s.user || !s.pass) return null;
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
  });
}

async function sendLicenseEmail({ to, name, licenseKey, planName, amount, currency, txId }) {
  const mailer = await createMailer();
  if (!mailer) { console.log('[email] SMTP non configuré — email skippé pour', to); return; }
  const smtp = await getSmtpSettings();

  const subjectTpl = await getSetting('email_subject_license', DEFAULT_LICENSE_SUBJECT);
  const htmlTpl    = await getSetting('email_template_license', DEFAULT_LICENSE_HTML);

  const vars = { name, license_key: licenseKey, plan_name: planName, amount: String(amount), currency, tx_id: txId };

  await mailer.sendMail({
    from: smtp.from,
    to,
    subject: renderTemplate(subjectTpl, vars),
    html:    renderTemplate(htmlTpl, vars),
  });
  console.log(`[email] ✓ Licence envoyée à ${to}`);
}

app.use(express.json({ limit: '10mb' }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_ACCESS_KEY = process.env.API_ACCESS_KEY || '';

if (!API_ACCESS_KEY) {
  console.warn('[warn] API_ACCESS_KEY is not set. All requests will be accepted without authentication.');
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!API_ACCESS_KEY) return next();
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== API_ACCESS_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Webapp user-level auth — JWT issued at /api/webapp/login
function requireWebAuth(req, res, next) {
  const token = req.headers['x-webapp-token'] || '';
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.webUser = jwt.verify(token, WEBAPP_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// ─── GET /api/response ────────────────────────────────────────────────────────

app.get('/api/response', requireAuth, async (req, res) => {
  // Validate license before giving AI credentials
  const licenseKey = req.headers['license_key'] || '';
  if (licenseKey) {
    try {
      const lic = await db.queryOne(
        'SELECT is_active FROM licenses WHERE license_key = ? LIMIT 1',
        [licenseKey]
      );
      // License exists in DB but is revoked → hard block
      if (lic && !lic.is_active) {
        return res.status(403).json({
          error: 'Votre licence a été révoquée. Contactez le support.',
        });
      }
    } catch { /* DB error — allow through so a DB outage doesn't block users */ }
  }

  const ai = await getAiConfig();
  const sttUrl   = process.env.STT_URL    || '';
  const sttApiKey = process.env.STT_API_KEY || '';
  const sttModel  = process.env.STT_MODEL   || 'whisper-1';

  if (!ai.primaryUrl || !ai.primaryKey) {
    return res.status(503).json({
      error: 'AI provider not configured. Set AI_CHAT_URL and AI_CHAT_API_KEY in the backend .env or via the admin settings.',
    });
  }

  let parsedBodyExtras = {};
  try { parsedBodyExtras = JSON.parse(ai.bodyExtras); } catch {
    console.warn('[warn] ai_body_extras is not valid JSON, ignoring.');
  }

  res.json({
    url: ai.primaryUrl,
    user_token: ai.primaryKey,
    model: ai.primaryModel,
    fallback_url:        ai.fallbackUrl   || null,
    fallback_user_token: ai.fallbackKey   || null,
    fallback_model:      ai.fallbackModel || null,
    body: JSON.stringify(parsedBodyExtras),
    customer_id: null,
    customer_email: null,
    customer_name: null,
    license_key: req.headers['license_key'] || '',
    instance_id: req.headers['instance'] || '',
    user_audio: sttUrl && sttApiKey
      ? { url: sttUrl, model: sttModel, user_token: sttApiKey, fallback_url: null, fallback_model: null, fallback_user_token: null, headers: null }
      : null,
    errors: [
      { includes: 'insufficient_quota', error: 'Your AI provider quota is exhausted. Please check your billing.' },
      { includes: 'invalid_api_key', error: 'Invalid AI API key. Please check your provider settings.' },
      { includes: 'model_not_found', error: 'The selected model was not found. Please check your model configuration.' },
      { includes: 'context_length_exceeded', error: 'The conversation is too long. Please start a new chat.' },
      { includes: '', error: 'Something went wrong. Please try again or contact support@lamuka-tech.com.' },
    ],
  });
});

// ─── POST /api/models ─────────────────────────────────────────────────────────

app.post('/api/models', requireAuth, async (req, res) => {
  try {
    // Resolve the caller's plan from their license key (if provided)
    let callerPlan = null;
    const licenseKey = req.headers['license_key'] || req.body?.license_key || '';
    if (licenseKey) {
      try {
        const lic = await db.queryOne(
          'SELECT plan FROM licenses WHERE license_key = ? AND is_active = 1 LIMIT 1',
          [licenseKey]
        );
        if (lic?.plan) callerPlan = lic.plan;
      } catch { /* ignore — plan filtering is best-effort */ }
    }

    const rows = await db.query(
      'SELECT id, provider, name, model, description, modality, is_available, allowed_plan_ids FROM models WHERE is_available = 1 ORDER BY sort_order ASC, provider ASC'
    );

    const models = rows
      .filter(r => {
        // null / empty allowed_plan_ids → available to all plans
        if (!r.allowed_plan_ids) return true;
        // If caller has no plan, only serve unrestricted models
        if (!callerPlan) return false;
        const allowed = r.allowed_plan_ids.split(',').map(s => s.trim()).filter(Boolean);
        return allowed.includes(callerPlan);
      })
      .map(r => ({
        provider: r.provider,
        name: r.name,
        id: r.id,
        model: r.model,
        description: r.description,
        modality: r.modality,
        isAvailable: r.is_available === 1,
      }));

    res.json({ models });
  } catch (err) {
    console.error('[/api/models] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

// ─── POST /api/prompts ────────────────────────────────────────────────────────

app.post('/api/prompts', requireAuth, async (req, res) => {
  const defaultModel = process.env.AI_MODEL || 'gpt-4o';
  try {
    const rows = await db.query(
      'SELECT title, prompt, model_id, model_name FROM prompts WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    const prompts = rows.map(r => ({
      title: r.title,
      prompt: r.prompt,
      modelId: r.model_id || defaultModel,
      modelName: r.model_name || 'Default Model',
    }));
    res.json({ prompts, total: prompts.length, last_updated: new Date().toISOString() });
  } catch (err) {
    console.error('[/api/prompts] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load prompts' });
  }
});

// ─── POST /api/prompt ─────────────────────────────────────────────────────────

app.post('/api/prompt', requireAuth, async (req, res) => {
  const { user_prompt } = req.body;
  if (!user_prompt || !user_prompt.trim()) {
    return res.status(400).json({ error: 'user_prompt is required' });
  }

  const chatUrl = process.env.AI_CHAT_URL || '';
  const chatApiKey = process.env.AI_CHAT_API_KEY || '';
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!chatUrl || !chatApiKey) {
    return res.json({
      prompt_name: 'Custom Assistant',
      system_prompt: `You are a helpful, knowledgeable assistant specializing in: ${user_prompt.trim()}. Provide accurate, thoughtful, and concise responses. Always aim to be genuinely useful.`,
    });
  }

  try {
    const aiResponse = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chatApiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a system prompt engineer. Your job is to write detailed, effective system prompts for AI assistants.\n\nGiven a user\'s description, generate a professional system prompt. Return ONLY a JSON object with exactly two fields:\n- "prompt_name": a short, descriptive name for this assistant (3-5 words max)\n- "system_prompt": the complete system prompt text\n\nReturn valid JSON only, no markdown fences, no extra text.' },
          { role: 'user', content: user_prompt.trim() },
        ],
        stream: false,
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI provider returned ${aiResponse.status}`);

    const data = await aiResponse.json();
    const content = data.choices?.[0]?.message?.content || '';

    let result;
    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, '').trim();
      result = JSON.parse(cleaned);
      if (!result.prompt_name || !result.system_prompt) throw new Error('Missing fields');
    } catch {
      result = { prompt_name: 'Custom Assistant', system_prompt: content.trim() || `You are a helpful assistant specialized in: ${user_prompt.trim()}.` };
    }

    res.json(result);
  } catch (error) {
    console.error('[/api/prompt] Error generating prompt:', error.message);
    res.json({
      prompt_name: 'Custom Assistant',
      system_prompt: `You are a helpful, knowledgeable assistant specializing in: ${user_prompt.trim()}. Provide accurate, thoughtful, and concise responses.`,
    });
  }
});

// ─── POST /api/activity ───────────────────────────────────────────────────────

app.post('/api/activity', requireAuth, async (req, res) => {
  const { ai_model, app_version, machine_id, usage, activity_type } = req.body || {};
  console.log(`[activity] type=${activity_type} model=${ai_model} version=${app_version} machine=${machine_id?.slice(0, 8)}...`);

  const today = todayDate();
  const tokens = (usage && typeof usage.total_tokens === 'number') ? usage.total_tokens : 0;

  try {
    // Upsert daily aggregate
    await db.query(
      `INSERT INTO activity (date, requests, tokens) VALUES (?, 1, ?)
       ON DUPLICATE KEY UPDATE requests = requests + 1, tokens = tokens + ?`,
      [today, tokens, tokens]
    );
    // Insert detail log row
    await db.query(
      `INSERT INTO activity_log (ai_model, app_version, machine_id, activity_type, prompt_tokens, completion_tokens, total_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ai_model || null, app_version || null, machine_id || null, activity_type || 'chat_streaming',
       usage?.prompt_tokens || 0, usage?.completion_tokens || 0, tokens]
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[/api/activity] DB error:', err.message);
    res.status(500).json({ error: 'Failed to record activity' });
  }
});

// ─── GET /api/activity ────────────────────────────────────────────────────────

app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    // Build 30-day window
    const rows = await db.query(
      `SELECT date, requests, tokens FROM activity
       WHERE date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
       ORDER BY date ASC`
    );

    const byDate = {};
    for (const r of rows) {
      const key = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      byDate[key] = r;
    }

    const data = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      data.push({ date: dateStr, requests: byDate[dateStr]?.requests || 0 });
    }

    const [totals] = await db.query('SELECT SUM(tokens) as total FROM activity');
    res.json({ success: true, data, total_tokens_used: Number(totals?.total || 0) });
  } catch (err) {
    console.error('[/api/activity] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ─── POST /api/error ──────────────────────────────────────────────────────────

app.post('/api/error', requireAuth, (req, res) => {
  const { error_message, endpoint, model, provider } = req.body || {};
  console.error(`[error report] endpoint=${endpoint} model=${model} provider=${provider} — ${error_message}`);
  res.status(200).json({ ok: true });
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000);
}

// GET /api/kb
app.get('/api/kb', requireAuth, async (req, res) => {
  try {
    const docs = await db.query(
      'SELECT id, type, name, url, created_at as createdAt, chars FROM kb_documents ORDER BY created_at DESC'
    );
    res.json({ docs });
  } catch (err) {
    console.error('[/api/kb] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load KB' });
  }
});

// GET /api/kb/:id
app.get('/api/kb/:id', requireAuth, async (req, res) => {
  try {
    const doc = await db.queryOne(
      'SELECT id, type, name, url, content, created_at as createdAt, chars FROM kb_documents WHERE id = ?',
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json({ doc });
  } catch (err) {
    console.error('[/api/kb/:id] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// GET /api/kb/search
app.get('/api/kb/search', requireAuth, async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  try {
    if (!query) {
      const docs = await db.query(
        'SELECT id, type, name, url, chars, created_at as createdAt FROM kb_documents ORDER BY created_at DESC'
      );
      return res.json({ docs, query });
    }

    const needle = `%${query}%`;
    const docs = await db.query(
      `SELECT id, type, name, url, chars, created_at as createdAt,
        CASE
          WHEN LOCATE(?, content) > 0 THEN CONCAT('...', SUBSTRING(content, GREATEST(1, LOCATE(?, content) - 80), 180), '...')
          ELSE ''
        END AS excerpt
      FROM kb_documents
      WHERE name LIKE ? OR url LIKE ? OR content LIKE ?
      ORDER BY created_at DESC`,
      [query, query, needle, needle, needle]
    );
    res.json({ docs, query });
  } catch (err) {
    console.error('[/api/kb/search] DB error:', err.message);
    res.status(500).json({ error: 'Failed to search KB' });
  }
});

// GET /api/kb/stats
app.get('/api/kb/stats', requireAuth, async (req, res) => {
  try {
    const stats = await db.queryOne('SELECT COUNT(*) AS total, COALESCE(SUM(chars),0) AS chars FROM kb_documents');
    res.json({ stats });
  } catch (err) {
    console.error('[/api/kb/stats] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load KB stats' });
  }
});

// POST /api/kb/url
app.post('/api/kb/url', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Lamu-Bot/1.0' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return res.status(400).json({ error: `Fetch failed: ${resp.status}` });
    const html = await resp.text();
    const content = stripHtml(html);
    if (!content) return res.status(400).json({ error: 'No readable content found at that URL' });
    const id = crypto.randomUUID();
    const name = new URL(url).hostname;
    await db.query(
      'INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 'url', name, url, content, content.length]
    );
    const doc = await db.queryOne('SELECT id, type, name, url, created_at as createdAt, chars FROM kb_documents WHERE id = ?', [id]);
    res.json({ doc });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to fetch URL' });
  }
});

// POST /api/kb/text
app.post('/api/kb/text', requireAuth, async (req, res) => {
  const { name, content, type = 'file' } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content are required' });

  let text = ''
  try {
    if (type === 'file') {
      text = await extractTextFromFile(name, content)
    } else {
      text = Buffer.from(content, 'base64').toString('utf8')
    }
  } catch (err) {
    console.error('[/api/kb/text] parse error:', err.message || err)
    return res.status(400).json({ error: 'Unable to parse uploaded document. Please upload a supported file type.' })
  }

  if (!text.trim()) return res.status(400).json({ error: 'No readable content found in the uploaded document' })
  text = text.slice(0, 12000);
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, NULL, ?, ?)',
      [id, type, name, text, text.length]
    );
    const doc = await db.queryOne('SELECT id, type, name, url, created_at as createdAt, chars FROM kb_documents WHERE id = ?', [id]);
    res.json({ doc });
  } catch (err) {
    console.error('[/api/kb/text] DB error:', err.message);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

// DELETE /api/kb/:id
app.delete('/api/kb/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM kb_documents WHERE id = ?', [req.params.id]);
    res.json({ removed: result.affectedRows });
  } catch (err) {
    console.error('[/api/kb/:id] DB error:', err.message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// POST /api/kb/summarize
app.post('/api/kb/summarize', requireAuth, async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });

  try {
    const doc = await db.queryOne('SELECT name, content FROM kb_documents WHERE id = ?', [id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const chatUrl = process.env.AI_CHAT_URL || '';
    const chatApiKey = process.env.AI_CHAT_API_KEY || '';
    const model = process.env.AI_MODEL || 'gpt-4o';

    if (!chatUrl || !chatApiKey) {
      return res.status(503).json({ error: 'AI provider not configured on the server.' });
    }

    const prompt = `Please provide a concise summary of the following document. Focus on the main points and key information:\n\n${doc.content.slice(0, 8000)}`;

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatApiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to generate summary' });
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'Summary not available';

    res.json({ summary });
  } catch (err) {
    console.error('[/api/kb/summarize] error:', err.message);
    res.status(500).json({ error: 'Failed to summarize document' });
  }
});

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', requireAuth, async (req, res) => {
  // ── Webapp trial message limit check ──
  const webToken = req.headers['x-webapp-token'] || '';
  if (webToken) {
    try {
      const decoded = jwt.verify(webToken, WEBAPP_JWT_SECRET);
      if (decoded.trial) {
        const trial = await db.queryOne('SELECT messages_used, max_messages FROM webapp_trials WHERE email = ?', [decoded.email]);
        if (trial && trial.messages_used >= (trial.max_messages || WEBAPP_FREE_MESSAGES)) {
          return res.status(403).json({ error: `Vous avez utilisé vos ${trial.max_messages} messages gratuits. Passez à un plan payant pour continuer.`, trial_exhausted: true });
        }
        // Increment counter
        await db.query('UPDATE webapp_trials SET messages_used = messages_used + 1, last_active_at = NOW() WHERE email = ?', [decoded.email]);
      }
    } catch { /* token invalid — let requireAuth handle it */ }
  }

  const ai = await getAiConfig();
  if (!ai.primaryUrl || !ai.primaryKey) {
    return res.status(503).json({ error: 'AI provider not configured on the server.' });
  }

  const { messages = [], model, system, kbIds } = req.body || {};

  // Inject KB context
  let systemContent = system || '';
  try {
    let kbDocs = []
    if (Array.isArray(kbIds) && kbIds.length > 0) {
      const placeholders = kbIds.map(() => '?').join(',')
      kbDocs = await db.query(
        `SELECT name, content FROM kb_documents WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
        kbIds
      )
    } else {
      kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
    }
    if (kbDocs.length > 0) {
      const context = kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n').slice(0, 24000);
      const kbBlock = `\n\n## Knowledge Base\nUse the following documents to answer questions accurately:\n\n${context}`;
      systemContent = systemContent ? systemContent + kbBlock : 'You are a helpful AI assistant.' + kbBlock;
    }
  } catch (err) {
    console.error('[/api/chat] KB load error:', err.message);
  }

  const fullMessages = systemContent
    ? [{ role: 'system', content: systemContent }, ...messages]
    : messages;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let parsedExtras = {};
    try { parsedExtras = JSON.parse(ai.bodyExtras || '{}'); } catch {}

    // Try primary provider, fall back if configured
    let aiRes = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: model || ai.primaryModel, messages: fullMessages, stream: true, ...parsedExtras }),
    }).catch(() => null);

    if (!aiRes || !aiRes.ok) {
      if (ai.fallbackUrl && ai.fallbackKey) {
        console.warn(`[/api/chat] Primary provider failed, trying fallback (${ai.fallbackUrl})`);
        send({ delta: '*[Using fallback provider]*\n\n' });
        aiRes = await fetch(ai.fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.fallbackKey}` },
          body: JSON.stringify({ model: model || ai.fallbackModel, messages: fullMessages, stream: true, ...parsedExtras }),
        }).catch(() => null);
      }
    }

    if (!aiRes || !aiRes.ok) {
      const errText = aiRes ? await aiRes.text().catch(() => '') : 'Network error';
      send({ error: `AI provider error: ${errText.slice(0, 200)}` });
      return res.end();
    }

    const decoder = new TextDecoder();
    for await (const chunk of aiRes.body) {
      const text = decoder.decode(chunk, { stream: true });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) send({ delta });
          } catch {}
        }
      }
    }

    send({ done: true });
    res.end();
  } catch (err) {
    console.error('[/api/chat] Error:', err.message);
    send({ error: 'Internal server error. Please try again.' });
    res.end();
  }
});

// ─── Payment & License ────────────────────────────────────────────────────────

// Payment gateway — désactivé (API externe non configurée)
// Les licences sont créées manuellement depuis l'admin et envoyées par email au client.

async function ensureSettingsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  // Seed SMTP from env vars only if the rows don't exist yet
  const envSmtp = [
    ['smtp_host', process.env.SMTP_HOST || ''],
    ['smtp_port', process.env.SMTP_PORT || '587'],
    ['smtp_user', process.env.SMTP_USER || ''],
    ['smtp_pass', process.env.SMTP_PASS || ''],
    ['smtp_from', process.env.SMTP_FROM || 'Lamuka <noreply@lamuka.com>'],
  ];
  for (const [key, value] of envSmtp) {
    if (value) {
      await db.query(
        'INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)',
        [key, value]
      );
    }
  }
}

async function importActivityJson() {
  const activityPath = path.join(__dirname, 'activity.json');
  if (!fs.existsSync(activityPath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
    const daily = raw.daily || {};
    let imported = 0;
    for (const [date, entry] of Object.entries(daily)) {
      const requests = entry.requests || 0;
      const tokens = entry.tokens || 0;
      if (!requests && !tokens) continue;
      await db.query(
        `INSERT INTO activity (date, requests, tokens) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           requests = GREATEST(requests, VALUES(requests)),
           tokens   = GREATEST(tokens,   VALUES(tokens))`,
        [date, requests, tokens]
      );
      imported++;
    }
    if (imported > 0) console.log(`[activity] Imported ${imported} day(s) from activity.json into MySQL`);
  } catch (e) {
    console.error('[activity import]', e.message);
  }
}

async function ensureActivityTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS activity (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      requests INT DEFAULT 0,
      tokens BIGINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ai_model VARCHAR(150),
      app_version VARCHAR(20),
      machine_id VARCHAR(100),
      prompt_tokens INT DEFAULT 0,
      completion_tokens INT DEFAULT 0,
      total_tokens INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureMonitoringTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS provider_incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(20) NOT NULL,
      provider_url VARCHAR(500),
      status VARCHAR(20) NOT NULL,
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

async function ensureLicenseTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id          VARCHAR(50) PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      features    TEXT,
      max_requests INT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      license_key        VARCHAR(200) NOT NULL UNIQUE,
      plan               VARCHAR(50) DEFAULT 'pro',
      customer_name      VARCHAR(200),
      customer_email     VARCHAR(200),
      is_active          TINYINT(1) DEFAULT 1,
      bound_instance_id  VARCHAR(200) NULL,
      activated_at       TIMESTAMP NULL,
      expires_at         TIMESTAMP NULL,
      max_requests       INT NULL,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_key      (license_key),
      INDEX idx_email    (customer_email),
      INDEX idx_instance (bound_instance_id)
    )
  `);
  // Insert default plans if not present
  await db.query(`
    INSERT IGNORE INTO plans (id, name, features) VALUES
      ('pro',   'Pro',      '["drag_window","screenshot","audio_capture","file_attachments","contact_support","knowledge_base","meeting_mode"]'),
      ('basic', 'Basic',    '["drag_window","audio_capture","meeting_mode"]'),
      ('dev',   'Developer','["drag_window","screenshot","audio_capture","file_attachments","contact_support","knowledge_base","meeting_mode"]')
  `);
}

async function ensurePaymentTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tx_id VARCHAR(200) NOT NULL UNIQUE,
      msisdn VARCHAR(50),
      plan_id VARCHAR(50) DEFAULT 'pro',
      amount DECIMAL(10,2) DEFAULT 2,
      currency VARCHAR(10) DEFAULT 'XAF',
      customer_name VARCHAR(200),
      customer_email VARCHAR(200),
      status ENUM('pending','confirmed','failed','expired') DEFAULT 'pending',
      license_key VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TIMESTAMP NULL,
      INDEX idx_tx (tx_id),
      INDEX idx_status (status)
    )
  `);
}

// Dead payment endpoints removed — use /api/license/* instead

// ── License lookup helper ──────────────────────────────────────────────────────
async function getLicense(license_key) {
  return db.queryOne(
    `SELECT l.*, p.name as plan_name, p.features as plan_features
     FROM licenses l
     LEFT JOIN plans p ON p.id = l.plan
     WHERE l.license_key = ?`,
    [license_key]
  );
}

// POST /api/license/activate — binds a license to a machine on first use
// instance_id = SHA-256 of machine hardware UID (from Tauri)
app.post('/api/license/activate', async (req, res) => {
  const { license_key, instance_id } = req.body || {};
  if (!license_key) return res.status(400).json({ activated: false, error: 'license_key requis' });
  if (!instance_id) return res.status(400).json({ activated: false, error: 'instance_id requis' });

  try {
    const license = await getLicense(license_key);

    if (!license) return res.json({ activated: false, error: 'Licence introuvable ou invalide.' });
    if (!license.is_active) return res.json({ activated: false, error: 'Licence désactivée.' });
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      // Permanently deactivate — an expired license can never be reused or reactivated
      await db.query(`UPDATE licenses SET is_active = 0 WHERE license_key = ?`, [license_key]);
      console.log(`[license/activate] ✗ ${license_key} expired — permanently deactivated`);
      return res.json({ activated: false, error: 'Licence expirée. Veuillez renouveler votre abonnement sur lamuka.com/pricing.' });
    }

    // First activation — bind to this machine
    if (!license.bound_instance_id) {
      await db.query(
        `UPDATE licenses SET bound_instance_id = ?, activated_at = NOW() WHERE license_key = ?`,
        [instance_id, license_key]
      );
      // Mark trial as converted if this instance_id was a trial user
      db.query(
        `UPDATE trials SET converted_at = NOW() WHERE instance_id = ? AND converted_at IS NULL`,
        [instance_id]
      ).catch(() => {});
      console.log(`[license/activate] ✓ ${license_key} bound to ${instance_id.slice(0, 12)}...`);
    }
    // Same machine re-activating (e.g. after reinstall) — allow
    else if (license.bound_instance_id === instance_id) {
      console.log(`[license/activate] ✓ ${license_key} re-activated by same machine`);
    }
    // Different machine — reject
    else {
      console.log(`[license/activate] ✗ ${license_key} already bound to different machine`);
      return res.json({
        activated: false,
        error: 'Cette licence est déjà activée sur un autre appareil. Contactez support@lamuka-tech.com pour transférer votre licence.',
      });
    }

    res.json({
      activated: true,
      plan_id: license.plan,
      plan_name: license.plan_name || license.plan,
      features: parseFeaturesSafe(license.plan_features),
      max_requests: license.max_requests,
      expires_at: license.expires_at || null,
      customer_name: license.customer_name || null,
    });
  } catch (err) {
    console.error('[license/activate]', err.message);
    res.status(500).json({ activated: false, error: 'Erreur serveur.' });
  }
});

// POST /api/license/validate  — appelé par l'app Tauri à chaque démarrage
// Vérifie que la licence est toujours valide ET que le machine fingerprint correspond
app.post('/api/license/validate', async (req, res) => {
  const { license_key, instance_id } = req.body || {};
  if (!license_key) return res.status(400).json({ is_active: false, error: 'license_key requis' });

  try {
    const license = await getLicense(license_key);

    if (!license) return res.json({ is_active: false, error: 'Licence introuvable' });
    if (!license.is_active) return res.json({ is_active: false, error: 'Licence désactivée' });
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      // Permanently deactivate — an expired license can never be reused or reactivated
      await db.query(`UPDATE licenses SET is_active = 0 WHERE license_key = ?`, [license_key]);
      console.log(`[license/validate] ✗ ${license_key} expired — permanently deactivated`);
      return res.json({ is_active: false, error: 'Licence expirée. Veuillez renouveler votre abonnement sur lamuka.com/pricing.' });
    }

    // Verify machine binding — reject if license was activated on a different machine
    if (instance_id && license.bound_instance_id && license.bound_instance_id !== instance_id) {
      console.log(`[license/validate] ✗ ${license_key} machine mismatch`);
      return res.json({ is_active: false, error: 'Licence liée à un autre appareil. Contactez support@lamuka-tech.com pour transférer votre licence.' });
    }

    res.json({
      is_active: true,
      plan_id: license.plan,
      plan_name: license.plan_name || license.plan,
      features: parseFeaturesSafe(license.plan_features),
      max_requests: license.max_requests,
      expires_at: license.expires_at || null,
      customer_name: license.customer_name || null,
    });
  } catch (err) {
    console.error('[license/validate]', err.message);
    res.status(500).json({ is_active: false, error: err.message });
  }
});

// POST /api/license/login — customer logs in with email to retrieve and rebind their license
// Allows accessing the platform on a new device without needing the license key
app.post('/api/license/login', async (req, res) => {
  const { email, instance_id, user_name } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email requis' });
  if (!instance_id) return res.status(400).json({ success: false, error: 'instance_id requis' });

  try {
    // Find the most recent active license for this email
    const license = await db.queryOne(
      `SELECT l.*, p.name as plan_name, p.features as plan_features
       FROM licenses l
       LEFT JOIN plans p ON p.id = l.plan
       WHERE l.customer_email = ? AND l.is_active = 1
       ORDER BY l.created_at DESC
       LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    if (!license) {
      return res.json({ success: false, error: 'Aucune licence active trouvée pour cet email. Vérifiez votre adresse ou contactez support@lamuka-tech.com.' });
    }

    // Check expiry — and permanently deactivate if expired
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await db.query(`UPDATE licenses SET is_active = 0 WHERE license_key = ?`, [license.license_key]);
      console.log(`[license/login] ✗ ${license.license_key} expired — permanently deactivated`);
      return res.json({ success: false, error: 'Licence expirée. Veuillez renouveler votre abonnement sur lamuka.com/pricing.' });
    }

    // Rebind to the new machine (transfers automatically — identity-based auth)
    const previousInstance = license.bound_instance_id;
    const isNewMachine = previousInstance && previousInstance !== instance_id;

    await db.query(
      `UPDATE licenses SET bound_instance_id = ?, activated_at = NOW()
       ${user_name ? ', customer_name = COALESCE(customer_name, ?)' : ''}
       WHERE license_key = ?`,
      user_name
        ? [instance_id, user_name, license.license_key]
        : [instance_id, license.license_key]
    );

    if (isNewMachine) {
      console.log(`[license/login] ✓ ${license.license_key} transferred ${previousInstance?.slice(0, 8)}… → ${instance_id.slice(0, 8)}… (email: ${email})`);
    } else {
      console.log(`[license/login] ✓ ${license.license_key} logged in (email: ${email})`);
    }

    res.json({
      success: true,
      license_key: license.license_key,
      plan_id: license.plan,
      plan_name: license.plan_name || license.plan,
      features: parseFeaturesSafe(license.plan_features),
      max_requests: license.max_requests,
      expires_at: license.expires_at || null,
      customer_name: license.customer_name || user_name || null,
      transferred: isNewMachine,
    });
  } catch (err) {
    console.error('[license/login]', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ─── Webapp Auth + Conversations ─────────────────────────────────────────────

// Ensure webapp tables/columns (idempotent)
const WEBAPP_FREE_MESSAGES = 20;
const WEBAPP_TRIAL_MAX_KB_DOCS = 1;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000;   // 1 OTP per minute per email

(async () => {
  try { await db.query('ALTER TABLE conversations ADD COLUMN user_email VARCHAR(255) NULL'); } catch { /* exists */ }
  try { await db.query('CREATE INDEX idx_conv_email ON conversations(user_email)'); } catch { /* exists */ }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS webapp_trials (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(150),
        messages_used INT DEFAULT 0,
        max_messages INT DEFAULT ${WEBAPP_FREE_MESSAGES},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (e) { console.error('[webapp] trial table error:', e.message); }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS webapp_otp (
        email VARCHAR(255) PRIMARY KEY,
        code VARCHAR(6) NOT NULL,
        name VARCHAR(150),
        attempts INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) { console.error('[webapp] otp table error:', e.message); }
})();

// POST /api/webapp/send-otp — send a 6-digit code to the email
app.post('/api/webapp/send-otp', requireAuth, async (req, res) => {
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  const emailLower = email.trim().toLowerCase();

  try {
    // Rate limit: max 1 OTP per minute per email
    const existing = await db.queryOne('SELECT created_at FROM webapp_otp WHERE email = ?', [emailLower]);
    if (existing) {
      const elapsed = Date.now() - new Date(existing.created_at).getTime();
      if (elapsed < OTP_RATE_LIMIT_MS) {
        const wait = Math.ceil((OTP_RATE_LIMIT_MS - elapsed) / 1000);
        return res.json({ success: false, error: `Attendez ${wait}s avant de renvoyer un code.` });
      }
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Upsert OTP
    await db.query(
      `INSERT INTO webapp_otp (email, code, name, attempts, created_at)
       VALUES (?, ?, ?, 0, NOW())
       ON DUPLICATE KEY UPDATE code = ?, name = ?, attempts = 0, created_at = NOW()`,
      [emailLower, code, name || null, code, name || null]
    );

    // Send email
    const mailer = await createMailer();
    if (!mailer) {
      console.error('[webapp/otp] SMTP not configured');
      return res.status(503).json({ success: false, error: 'Service email non disponible.' });
    }
    const smtp = await getSmtpSettings();
    await mailer.sendMail({
      from: smtp.from,
      to: emailLower,
      subject: `${code} — Votre code Lamu AI`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:12px;padding:12px 16px">
              <span style="color:#fff;font-size:20px;font-weight:800">Lamu AI</span>
            </div>
          </div>
          <h2 style="text-align:center;color:#1a1a2e;margin:0 0 8px">Votre code de vérification</h2>
          <p style="text-align:center;color:#666;font-size:14px;margin:0 0 24px">
            Entrez ce code dans l'application pour vous connecter${name ? `, ${name}` : ''}.
          </p>
          <div style="text-align:center;background:#f4f4f8;border-radius:12px;padding:20px;margin:0 0 24px">
            <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#6366f1">${code}</span>
          </div>
          <p style="text-align:center;color:#999;font-size:12px">
            Ce code expire dans 10 minutes. Si vous n'avez pas demandé ce code, ignorez cet email.
          </p>
        </div>`,
    });

    console.log(`[webapp/otp] ✓ Code sent to ${emailLower}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[webapp/otp]', err.message);
    res.status(500).json({ success: false, error: 'Impossible d\'envoyer le code.' });
  }
});

// POST /api/webapp/verify-otp — verify code and return JWT (creates trial if no license)
app.post('/api/webapp/verify-otp', requireAuth, async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ success: false, error: 'Email et code requis' });
  const emailLower = email.trim().toLowerCase();

  try {
    const otp = await db.queryOne('SELECT * FROM webapp_otp WHERE email = ?', [emailLower]);
    if (!otp) return res.json({ success: false, error: 'Aucun code envoyé. Demandez un nouveau code.' });

    // Check expiry
    const elapsed = Date.now() - new Date(otp.created_at).getTime();
    if (elapsed > OTP_EXPIRY_MS) {
      await db.query('DELETE FROM webapp_otp WHERE email = ?', [emailLower]);
      return res.json({ success: false, error: 'Code expiré. Demandez un nouveau code.' });
    }

    // Check attempts (max 5)
    if (otp.attempts >= 5) {
      await db.query('DELETE FROM webapp_otp WHERE email = ?', [emailLower]);
      return res.json({ success: false, error: 'Trop de tentatives. Demandez un nouveau code.' });
    }

    // Verify code
    if (otp.code !== code.trim()) {
      await db.query('UPDATE webapp_otp SET attempts = attempts + 1 WHERE email = ?', [emailLower]);
      return res.json({ success: false, error: `Code incorrect. ${4 - otp.attempts} tentative(s) restante(s).` });
    }

    // Code valid — delete OTP
    await db.query('DELETE FROM webapp_otp WHERE email = ?', [emailLower]);
    const nameFromOtp = otp.name;

    // ── 1. Check for active license ──
    const license = await db.queryOne(
      `SELECT l.*, p.name as plan_name, p.features as plan_features
       FROM licenses l LEFT JOIN plans p ON p.id = l.plan
       WHERE l.customer_email = ? AND l.is_active = 1
       ORDER BY l.created_at DESC LIMIT 1`,
      [emailLower]
    );

    if (license) {
      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        await db.query('UPDATE licenses SET is_active = 0 WHERE license_key = ?', [license.license_key]);
        // Fall through to trial
      } else {
        const token = jwt.sign(
          { email: emailLower, license_key: license.license_key, plan: license.plan, trial: false },
          WEBAPP_JWT_SECRET,
          { expiresIn: '7d' }
        );
        console.log(`[webapp/login] ✓ ${emailLower} (licensed, plan: ${license.plan})`);
        return res.json({
          success: true, token,
          user: {
            email: emailLower,
            name: license.customer_name || nameFromOtp || null,
            plan: license.plan,
            plan_name: license.plan_name || license.plan,
            features: parseFeaturesSafe(license.plan_features),
            max_requests: license.max_requests,
            expires_at: license.expires_at || null,
            trial: false,
          },
        });
      }
    }

    // ── 2. No active license → free trial ──
    await db.query(
      `INSERT INTO webapp_trials (email, name, messages_used, max_messages)
       VALUES (?, ?, 0, ${WEBAPP_FREE_MESSAGES})
       ON DUPLICATE KEY UPDATE
         last_active_at = NOW(),
         name = IF(? IS NOT NULL AND ? != '', ?, name)`,
      [emailLower, nameFromOtp || null, nameFromOtp, nameFromOtp, nameFromOtp || null]
    );

    const trial = await db.queryOne('SELECT * FROM webapp_trials WHERE email = ?', [emailLower]);
    const remaining = Math.max(0, (trial.max_messages || WEBAPP_FREE_MESSAGES) - (trial.messages_used || 0));

    const token = jwt.sign(
      { email: emailLower, plan: 'free_trial', trial: true },
      WEBAPP_JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`[webapp/login] ✓ ${emailLower} (free trial, ${remaining}/${trial.max_messages} messages left)`);
    res.json({
      success: true, token,
      user: {
        email: emailLower,
        name: trial.name || nameFromOtp || null,
        plan: 'free_trial',
        plan_name: 'Free Trial',
        features: [],
        max_requests: trial.max_messages || WEBAPP_FREE_MESSAGES,
        expires_at: null,
        trial: true,
        messages_used: trial.messages_used || 0,
        messages_remaining: remaining,
      },
    });
  } catch (err) {
    console.error('[webapp/verify-otp]', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// POST /api/webapp/login — kept for backward compat, now redirects to OTP flow
app.post('/api/webapp/login', requireAuth, async (req, res) => {
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  const emailLower = email.trim().toLowerCase();

  try {
    // ── 1. Check for active license ──
    const license = await db.queryOne(
      `SELECT l.*, p.name as plan_name, p.features as plan_features
       FROM licenses l
       LEFT JOIN plans p ON p.id = l.plan
       WHERE l.customer_email = ? AND l.is_active = 1
       ORDER BY l.created_at DESC LIMIT 1`,
      [emailLower]
    );

    if (license) {
      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        await db.query('UPDATE licenses SET is_active = 0 WHERE license_key = ?', [license.license_key]);
        // Fall through to trial
      } else {
        const token = jwt.sign(
          { email: emailLower, license_key: license.license_key, plan: license.plan, trial: false },
          WEBAPP_JWT_SECRET,
          { expiresIn: '7d' }
        );
        console.log(`[webapp/login] ✓ ${emailLower} (licensed, plan: ${license.plan})`);
        return res.json({
          success: true,
          token,
          user: {
            email: emailLower,
            name: license.customer_name || name || null,
            plan: license.plan,
            plan_name: license.plan_name || license.plan,
            features: parseFeaturesSafe(license.plan_features),
            max_requests: license.max_requests,
            expires_at: license.expires_at || null,
            trial: false,
          },
        });
      }
    }

    // ── 2. No active license → free trial ──
    await db.query(
      `INSERT INTO webapp_trials (email, name, messages_used, max_messages)
       VALUES (?, ?, 0, ${WEBAPP_FREE_MESSAGES})
       ON DUPLICATE KEY UPDATE
         last_active_at = NOW(),
         name = IF(? IS NOT NULL AND ? != '', ?, name)`,
      [emailLower, name || null, name, name, name || null]
    );

    const trial = await db.queryOne('SELECT * FROM webapp_trials WHERE email = ?', [emailLower]);
    const remaining = Math.max(0, (trial.max_messages || WEBAPP_FREE_MESSAGES) - (trial.messages_used || 0));

    const token = jwt.sign(
      { email: emailLower, plan: 'free_trial', trial: true },
      WEBAPP_JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`[webapp/login] ✓ ${emailLower} (free trial, ${remaining}/${trial.max_messages} messages left)`);
    res.json({
      success: true,
      token,
      user: {
        email: emailLower,
        name: trial.name || name || null,
        plan: 'free_trial',
        plan_name: 'Free Trial',
        features: [],
        max_requests: trial.max_messages || WEBAPP_FREE_MESSAGES,
        expires_at: null,
        trial: true,
        messages_used: trial.messages_used || 0,
        messages_remaining: remaining,
      },
    });
  } catch (err) {
    console.error('[webapp/login]', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// POST /api/webapp/verify — validate JWT, return user info (licensed or trial)
app.post('/api/webapp/verify', requireAuth, async (req, res) => {
  const token = req.headers['x-webapp-token'] || '';
  if (!token) return res.json({ valid: false });
  try {
    const decoded = jwt.verify(token, WEBAPP_JWT_SECRET);

    // ── Trial user ──
    if (decoded.trial) {
      const trial = await db.queryOne('SELECT * FROM webapp_trials WHERE email = ?', [decoded.email]);
      if (!trial) return res.json({ valid: false, error: 'Trial not found' });
      const remaining = Math.max(0, (trial.max_messages || WEBAPP_FREE_MESSAGES) - (trial.messages_used || 0));
      return res.json({
        valid: true,
        user: {
          email: decoded.email,
          name: trial.name || null,
          plan: 'free_trial',
          plan_name: 'Free Trial',
          features: [],
          max_requests: trial.max_messages || WEBAPP_FREE_MESSAGES,
          expires_at: null,
          trial: true,
          messages_used: trial.messages_used || 0,
          messages_remaining: remaining,
        },
      });
    }

    // ── Licensed user ──
    const license = await db.queryOne(
      `SELECT l.customer_name, l.plan, l.max_requests, l.expires_at, p.name as plan_name, p.features as plan_features
       FROM licenses l LEFT JOIN plans p ON p.id = l.plan
       WHERE l.license_key = ? AND l.is_active = 1 LIMIT 1`,
      [decoded.license_key]
    );
    if (!license) return res.json({ valid: false, error: 'License inactive' });
    res.json({
      valid: true,
      user: {
        email: decoded.email,
        name: license.customer_name || null,
        plan: license.plan,
        plan_name: license.plan_name || license.plan,
        features: parseFeaturesSafe(license.plan_features),
        max_requests: license.max_requests,
        expires_at: license.expires_at || null,
        trial: false,
      },
    });
  } catch {
    res.json({ valid: false, error: 'Token expired' });
  }
});

// GET /api/webapp/conversations — list user's conversations
app.get('/api/webapp/conversations', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const convs = await db.query(
      `SELECT c.id, c.title, c.created_at as createdAt, c.updated_at as updatedAt
       FROM conversations c
       WHERE c.user_email = ? AND c.source = 'webapp'
       ORDER BY c.updated_at DESC LIMIT 50`,
      [req.webUser.email]
    );
    // Load messages for each conversation
    const result = [];
    for (const c of convs) {
      const msgs = await db.query(
        'SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
        [c.id]
      );
      result.push({ ...c, messages: msgs });
    }
    res.json({ conversations: result });
  } catch (err) {
    console.error('[webapp/conversations]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webapp/conversations/save — upsert a conversation + its messages
app.post('/api/webapp/conversations/save', requireAuth, requireWebAuth, async (req, res) => {
  const { id, title, messages, createdAt } = req.body || {};
  if (!id || !Array.isArray(messages)) return res.status(400).json({ error: 'id and messages[] required' });
  try {
    const now = Date.now();
    await db.query(
      `INSERT INTO conversations (id, title, created_at, updated_at, source, user_email)
       VALUES (?, ?, ?, ?, 'webapp', ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = VALUES(updated_at)`,
      [id, title || 'New conversation', createdAt || now, now, req.webUser.email]
    );
    for (const m of messages) {
      if (!m.id || !m.role || !m.content) continue;
      await db.query(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, source)
         VALUES (?, ?, ?, ?, ?, 'webapp')
         ON DUPLICATE KEY UPDATE content = VALUES(content)`,
        [m.id, id, m.role, m.content, Date.now()]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[webapp/conversations/save]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/webapp/conversations/:id — delete a user's conversation
app.delete('/api/webapp/conversations/:id', requireAuth, requireWebAuth, async (req, res) => {
  try {
    // Only delete if owned by this user
    const conv = await db.queryOne(
      'SELECT id FROM conversations WHERE id = ? AND user_email = ?',
      [req.params.id, req.webUser.email]
    );
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    await db.query('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    await db.query('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/license/transfer — admin: manually rebind a license to a new machine (or clear binding)
app.post('/api/license/transfer', requireAuth, async (req, res) => {
  const { license_key, new_instance_id } = req.body || {};
  if (!license_key) return res.status(400).json({ error: 'license_key requis' });

  try {
    const license = await getLicense(license_key);
    if (!license) return res.status(404).json({ error: 'Licence introuvable' });

    const previous = license.bound_instance_id;

    await db.query(
      `UPDATE licenses SET bound_instance_id = ?, activated_at = ${new_instance_id ? 'NOW()' : 'activated_at'} WHERE license_key = ?`,
      [new_instance_id || null, license_key]
    );

    console.log(`[license/transfer] admin: ${license_key} ${previous?.slice(0, 8) || 'unbound'} → ${new_instance_id?.slice(0, 8) || 'unbound'}`);

    res.json({
      success: true,
      license_key,
      previous_instance_id: previous || null,
      new_instance_id: new_instance_id || null,
    });
  } catch (err) {
    console.error('[license/transfer]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/trial/init  — enregistre la première utilisation d'un instance_id et retourne trial_expires_at
app.post('/api/trial/init', async (req, res) => {
  const { instance_id, user_name, email, app_version } = req.body || {};
  if (!instance_id) return res.status(400).json({ error: 'instance_id requis' });

  try {
    // Read configurable trial duration from settings (default 48h)
    let trialHours = 48;
    try {
      const row = await db.queryOne(
        "SELECT value FROM settings WHERE `key` = 'trial_duration_hours'",
        []
      );
      if (row?.value) trialHours = Math.max(1, parseInt(row.value, 10) || 48);
    } catch { /* missing row → use default */ }

    const TRIAL_DURATION_MS = trialHours * 60 * 60 * 1000;

    // Upsert: insert on first call, update name + last_seen + email on subsequent calls
    await db.query(
      `INSERT INTO trials (instance_id, user_name, email, app_version, first_seen_at, last_seen_at, trial_expires_at)
       VALUES (?, ?, ?, ?, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         last_seen_at = NOW(),
         user_name    = IF(? IS NOT NULL AND ? != '', ?, user_name),
         email        = IF(? IS NOT NULL AND ? != '', ?, email),
         app_version  = COALESCE(?, app_version)`,
      [instance_id, user_name || null, email || null, app_version || null, trialHours,
       user_name, user_name, user_name || null,
       email, email, email || null,
       app_version || null]
    ).catch(() => {
      // Fallback for old schema without new columns
      return db.query(
        `INSERT INTO trials (instance_id, user_name, first_seen_at, last_seen_at)
         VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE last_seen_at = NOW(),
           user_name = IF(? IS NOT NULL AND ? != '', ?, user_name)`,
        [instance_id, user_name || null, user_name, user_name, user_name || null]
      );
    });

    const trial = await db.queryOne(
      'SELECT first_seen_at FROM trials WHERE instance_id = ?',
      [instance_id]
    );

    const firstSeenMs = new Date(trial.first_seen_at).getTime();
    const trialExpiresAt = firstSeenMs + TRIAL_DURATION_MS;
    const isTrialActive = Date.now() < trialExpiresAt;

    res.json({ trial_expires_at: trialExpiresAt, is_trial_active: isTrialActive, trial_duration_hours: trialHours });
  } catch (err) {
    console.error('[trial/init]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/license/register  — appelé par Tauri après confirmation Elembotech (fallback)
app.post('/api/license/register', async (req, res) => {
  const { license_key, msisdn, plan_id = 'pro', customer_name, customer_email } = req.body || {};
  if (!license_key) return res.status(400).json({ error: 'license_key requis' });

  try {
    const plan = await db.queryOne('SELECT * FROM plans WHERE id = ?', [plan_id]);
    await db.query(
      `INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, is_active, notes)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         customer_name = COALESCE(VALUES(customer_name), customer_name)`,
      [
        license_key,
        customer_name || null,
        customer_email || null,
        plan_id,
        plan?.max_requests || 9999999,
        JSON.stringify({ msisdn, source: 'tauri_register', plan: plan_id }),
      ]
    );
    console.log(`[license/register] ✓ ${license_key} (plan: ${plan_id})`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[license/register]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/app-config — configuration complète pour l'app desktop ─────────
// Sert TOUTE la configuration que l'app desktop a besoin au runtime.
// Authentifié par machine_id (faible — acceptable pour config desktop locale).
// NE PAS mettre ici : mots de passe DB, JWT secrets, clés d'infrastructure.

app.get('/api/app-config', async (req, res) => {
  try {
    const ALL_KEYS = [
      // Payment
      'payment_pay_url', 'payment_validate_url', 'payment_amount', 'payment_currency',
      // OAuth
      'google_client_id', 'google_client_secret',
      'github_client_id',
      'notion_client_id', 'notion_client_secret',
      'salesforce_client_id', 'salesforce_client_secret',
      'sharepoint_client_id', 'sharepoint_client_secret',
      // Lamu API / AI
      'lamu_api_url',
      'posthog_api_key',
      'app_update_url',
      // Branding
      'price_label', 'license_key_prefix', 'app_name', 'support_email_address',
      // Limits
      'max_file_attachments', 'max_kb_chunk_size', 'max_ai_tokens',
      // Feature flags (comma-separated list)
      'feature_flags',
      // Trial
      'trial_duration_hours',
    ];
    const placeholders = ALL_KEYS.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT \`key\`, value FROM settings WHERE \`key\` IN (${placeholders})`,
      ALL_KEYS
    );
    const config = {};
    for (const r of rows) if (r.value !== null && r.value !== '') config[r.key] = r.value;
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/oauth-config — credentials OAuth pour l'app desktop ────────────
// Public mais ne retourne que les clés publiques (client_id) + secrets côté app.
// Acceptable pour un desktop OAuth "installed app" flow (RFC 8252).

app.get('/api/oauth-config', async (req, res) => {
  try {
    const keys = [
      'google_client_id', 'google_client_secret',
      'github_client_id',
      'notion_client_id', 'notion_client_secret',
      'salesforce_client_id', 'salesforce_client_secret',
      'sharepoint_client_id', 'sharepoint_client_secret',
    ];
    const rows = await db.query(
      `SELECT \`key\`, value FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
      keys
    );
    const config = {};
    for (const r of rows) if (r.value) config[r.key] = r.value;
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/enabled-integrations — liste des connecteurs activés par l'admin ─
// Public — retourne uniquement la liste des slugs activés, pas de secrets.

app.get('/api/enabled-integrations', async (req, res) => {
  try {
    const row = await db.queryOne("SELECT value FROM settings WHERE `key` = 'enabled_integrations'");
    const ALL = ['github', 'gitlab', 'jira', 'slack', 'google', 'stripe', 'notion', 'database'];
    let enabled = ALL; // default: all enabled
    if (row?.value) {
      try { enabled = JSON.parse(row.value); } catch { /* keep default */ }
    }
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/conversation — real-time conversation sync from desktop ───
// Requires user consent (set in app Settings). Upserts conversation + messages.

app.post('/api/sync/conversation', requireAuth, async (req, res) => {
  const { conversation_id, title, created_at, updated_at, messages, machine_id } = req.body;
  if (!conversation_id || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'conversation_id and messages[] are required' });
  }
  try {
    // Ensure conversations table has machine_id column
    try { await db.query('ALTER TABLE conversations ADD COLUMN machine_id VARCHAR(100) NULL'); } catch { /* exists */ }

    // Upsert conversation
    await db.query(
      `INSERT INTO conversations (id, title, created_at, updated_at, source, machine_id)
       VALUES (?, ?, ?, ?, 'tauri_sync', ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = VALUES(updated_at), machine_id = VALUES(machine_id)`,
      [conversation_id, title || 'Untitled', created_at || Date.now(), updated_at || Date.now(), machine_id || null]
    );

    // Upsert messages (text only — skip attached_files for privacy)
    for (const m of messages) {
      if (!m.id || !m.role || !m.content) continue;
      await db.query(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, source)
         VALUES (?, ?, ?, ?, ?, 'tauri_sync')
         ON DUPLICATE KEY UPDATE content = VALUES(content)`,
        [m.id, conversation_id, m.role, m.content, m.timestamp || Date.now()]
      );
    }

    res.json({ ok: true, synced: messages.length });
  } catch (err) {
    console.error('[/api/sync/conversation] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/plans — public, pour le site web ───────────────────────────────

app.get('/api/plans', async (req, res) => {
  try {
    const plans = await db.query(
      `SELECT id, name, description, price, currency, billing_period, max_requests, features, color, sort_order
       FROM plans WHERE is_active = 1 ORDER BY sort_order ASC, price ASC`
    );
    res.json({ plans: plans.map(p => ({ ...p, features: parseFeaturesSafe(p.features) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/license/recover — récupération de licence par email ────────────

app.post('/api/license/recover', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email requis' });

  try {
    const licenses = await db.query(
      `SELECT l.license_key, l.plan, p.name as plan_name, l.is_active, l.created_at
       FROM licenses l LEFT JOIN plans p ON p.id = l.plan
       WHERE LOWER(l.customer_email) = LOWER(?) ORDER BY l.created_at DESC LIMIT 5`,
      [email]
    );

    if (!licenses.length) {
      // Ne pas révéler si l'email existe ou non
      return res.json({ sent: true });
    }

    // Envoyer les licences par email
    const active = licenses.filter(l => l.is_active);
    const list = (active.length ? active : licenses);

    const recoverMailer = await createMailer();
    if (recoverMailer) {
      const smtp = await getSmtpSettings();
      const subjectTpl = await getSetting('email_subject_recover', DEFAULT_RECOVER_SUBJECT);
      const htmlTpl    = await getSetting('email_template_recover', DEFAULT_RECOVER_HTML);
      const licenseListHtml = list.map(l => `
  <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);border-radius:14px;padding:20px 24px;margin-bottom:16px">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:700;letter-spacing:1px;margin-bottom:8px">
      ${l.plan_name || l.plan} — ${l.is_active ? '✓ Active' : '✗ Inactive'}
    </div>
    <div style="font-family:monospace;font-size:14px;color:#4ade80;word-break:break-all">${l.license_key}</div>
  </div>`).join('');
      const vars = { email, license_list: licenseListHtml };
      await recoverMailer.sendMail({
        from: smtp.from,
        to: email,
        subject: renderTemplate(subjectTpl, vars),
        html:    renderTemplate(htmlTpl, vars),
      }).catch(e => console.error('[email recover]', e.message));
    }

    console.log(`[recover] Email de récupération envoyé à ${email}`);
    res.json({ sent: true });
  } catch (err) {
    console.error('[license/recover]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/license/resend-email — renvoyer email depuis admin ─────────────

app.post('/api/license/resend-email', requireAuth, async (req, res) => {
  const { license_key } = req.body || {};
  if (!license_key) return res.status(400).json({ error: 'license_key requis' });

  try {
    const license = await db.queryOne(
      `SELECT l.*, p.name as plan_name FROM licenses l LEFT JOIN plans p ON p.id = l.plan WHERE l.license_key = ?`,
      [license_key]
    );
    if (!license) return res.status(404).json({ error: 'Licence introuvable' });
    if (!license.customer_email) return res.status(400).json({ error: 'Pas d\'email client pour cette licence' });

    const payment = await db.queryOne('SELECT * FROM pending_payments WHERE license_key = ?', [license_key]);

    await sendLicenseEmail({
      to: license.customer_email,
      name: license.customer_name || 'Client',
      licenseKey: license.license_key,
      planName: license.plan_name || license.plan,
      amount: payment?.amount || 0,
      currency: payment?.currency || 'XAF',
      txId: payment?.tx_id || license.license_key,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[license/resend-email]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payments — liste des paiements pour l'admin ────────────────────

app.get('/api/payments', requireAuth, async (req, res) => {
  try {
    const payments = await db.query(
      `SELECT pp.*, p.name as plan_name, p.color as plan_color
       FROM pending_payments pp LEFT JOIN plans p ON p.id = pp.plan_id
       ORDER BY pp.created_at DESC LIMIT 200`
    );
    const stats = await db.queryOne(
      `SELECT
        COUNT(*) as total,
        SUM(status = 'confirmed') as confirmed,
        SUM(status = 'pending') as pending,
        SUM(status = 'failed') as failed,
        SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END) as revenue
       FROM pending_payments`
    );
    res.json({ payments, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/support — formulaire de contact depuis site / app ──────────────

app.post('/api/support', requireAuth, async (req, res) => {
  const { name, email, subject, message, topic } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'name, email et message sont requis' });

  // Sanitize user inputs to prevent HTML injection
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeName = esc(name);
  const safeEmail = esc(email);
  const safeMessage = esc(message);

  const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
  const subjectLine = subject ? esc(subject) : (topic ? `[${esc(topic)}] Support Lamuka` : 'Support Lamuka');

  try {
    const mailer = await createMailer();
    if (!mailer) {
      console.log(`[support] SMTP non configuré — ticket ${ticketId} de ${safeEmail} ignoré`);
      return res.json({ sent: true, ticket_id: ticketId });
    }

    const smtp = await getSmtpSettings();
    const supportEmail = await getSetting('support_email', smtp.from || process.env.SUPPORT_EMAIL || '');

    // 1. Transférer le message à l'équipe support
    if (supportEmail) {
      await mailer.sendMail({
        from: smtp.from,
        to: supportEmail,
        replyTo: email,
        subject: `[${ticketId}] ${subjectLine}`,
        html: `<div style="font-family:sans-serif;padding:20px">
          <h2 style="margin-bottom:16px">Nouveau ticket support</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px">
            <tr><td style="padding:8px;font-weight:700;width:120px">Ticket</td><td style="padding:8px">${ticketId}</td></tr>
            <tr><td style="padding:8px;font-weight:700">Nom</td><td style="padding:8px">${safeName}</td></tr>
            <tr><td style="padding:8px;font-weight:700">Email</td><td style="padding:8px"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
            <tr><td style="padding:8px;font-weight:700">Sujet</td><td style="padding:8px">${subjectLine}</td></tr>
          </table>
          <hr style="margin:16px 0"/>
          <div style="white-space:pre-wrap;line-height:1.7">${safeMessage}</div>
        </div>`,
      }).catch(e => console.error('[support forward]', e.message));
    }

    // 2. Envoyer l'accusé de réception au client
    const replySubjectTpl = await getSetting('email_subject_support_reply', DEFAULT_SUPPORT_REPLY_SUBJECT);
    const replyHtmlTpl    = await getSetting('email_template_support_reply', DEFAULT_SUPPORT_REPLY_HTML);
    const vars = { name, email, subject: subjectLine, message, ticket_id: ticketId };

    await mailer.sendMail({
      from: smtp.from,
      to: email,
      subject: renderTemplate(replySubjectTpl, vars),
      html:    renderTemplate(replyHtmlTpl, vars),
    }).catch(e => console.error('[support reply]', e.message));

    console.log(`[support] ✓ Ticket ${ticketId} créé pour ${email}`);
    res.json({ sent: true, ticket_id: ticketId });
  } catch (err) {
    console.error('[/api/support]', err.message);
    res.status(500).json({ error: err.message });
  }
});

function parseFeaturesSafe(raw) {
  if (!raw) return [];
  try { const f = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(f) ? f : []; } catch { return []; }
}

// ─── GET /api/update ─────────────────────────────────────────────────────────
// Tauri updater protocol: compare client version with LATEST_VERSION env var.
// If a newer version exists, return { version, notes, pub_date, platforms }.
// If up-to-date, return 204 (no update).
//
// Required env vars:
//   LATEST_VERSION   e.g. "0.2.0"
//   APP_BASE_URL     e.g. "https://cdn.lamuka.com/releases"  (no trailing slash)
//
// Installer files expected at:
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_x64_en-US.msi.zip
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_x64_en-US.msi.zip.sig
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_x64.dmg.tar.gz
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_x64.dmg.tar.gz.sig
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_amd64.AppImage.tar.gz
//   $APP_BASE_URL/$LATEST_VERSION/Lamu_$LATEST_VERSION_amd64.AppImage.tar.gz.sig

app.get('/api/update', (req, res) => {
  const latestVersion = process.env.LATEST_VERSION;
  const baseUrl = process.env.APP_BASE_URL;
  const clientVersion = req.query.current_version || '0.0.0';

  // If not configured, tell client it's up to date
  if (!latestVersion || !baseUrl) {
    return res.status(204).send();
  }

  // Compare versions (simple semver: split by . and compare numerically)
  const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
  const [lMaj, lMin, lPat] = parse(latestVersion);
  const [cMaj, cMin, cPat] = parse(clientVersion);
  const isNewer =
    lMaj > cMaj ||
    (lMaj === cMaj && lMin > cMin) ||
    (lMaj === cMaj && lMin === cMin && lPat > cPat);

  if (!isNewer) {
    return res.status(204).send();
  }

  const v = latestVersion;
  const b = `${baseUrl}/${v}`;

  res.json({
    version: v,
    notes: process.env.RELEASE_NOTES || `Lamu ${v} — see lamuka.com for details.`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        url: `${b}/Lamu_${v}_x64_en-US.msi.zip`,
        signature: `${b}/Lamu_${v}_x64_en-US.msi.zip.sig`,
      },
      'darwin-x86_64': {
        url: `${b}/Lamu_${v}_x64.dmg.tar.gz`,
        signature: `${b}/Lamu_${v}_x64.dmg.tar.gz.sig`,
      },
      'darwin-aarch64': {
        url: `${b}/Lamu_${v}_aarch64.dmg.tar.gz`,
        signature: `${b}/Lamu_${v}_aarch64.dmg.tar.gz.sig`,
      },
      'linux-x86_64': {
        url: `${b}/Lamu_${v}_amd64.AppImage.tar.gz`,
        signature: `${b}/Lamu_${v}_amd64.AppImage.tar.gz.sig`,
      },
    },
  });
});

// ─── Provider Health Check ────────────────────────────────────────────────────

async function pingProvider(url, key, model) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
    });
    clearTimeout(tid);
    const latency = Date.now() - t0;
    const status = res.status >= 500 ? 'down' : res.status === 429 ? 'degraded' : 'operational';
    return { ok: res.status < 500, status, latency, httpStatus: res.status };
  } catch (e) {
    return { ok: false, status: 'down', latency: null, error: e.message };
  }
}

async function runProviderHealthCheck() {
  const ai = await getAiConfig();
  const primaryUrl   = ai.primaryUrl;
  const primaryKey   = ai.primaryKey;
  const primaryModel = ai.primaryModel;
  const fallbackUrl  = ai.fallbackUrl;
  const fallbackKey  = ai.fallbackKey;
  const fallbackModel = ai.fallbackModel;

  if (!primaryUrl || !primaryKey) return null;

  const results = {};

  // Check primary
  const primary = await pingProvider(primaryUrl, primaryKey, primaryModel);
  results.primary = primary;

  // Check fallback if configured
  if (fallbackUrl && fallbackKey) {
    const fallback = await pingProvider(fallbackUrl, fallbackKey, fallbackModel);
    results.fallback = fallback;
  }

  // Clean up old incidents (keep only last 7 days)
  try {
    await db.query("DELETE FROM provider_incidents WHERE detected_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  } catch { /* ignore */ }

  // Upsert status and log incidents in DB
  try {
    for (const [providerName, result] of Object.entries(results)) {
      const providerUrl = providerName === 'primary' ? primaryUrl : fallbackUrl;

      // Get previous status
      const prev = await db.queryOne('SELECT status FROM provider_status WHERE provider = ?', [providerName]);

      // Upsert current status
      await db.query(
        `INSERT INTO provider_status (provider, status, latency_ms, last_check_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE status = VALUES(status), latency_ms = VALUES(latency_ms), last_check_at = NOW()`,
        [providerName, result.status, result.latency || null]
      );

      // Log incident only when status actually changes (not on first insert)
      if (prev && prev.status !== result.status) {
        await db.query(
          'INSERT INTO provider_incidents (provider, provider_url, status, latency_ms, error_msg) VALUES (?, ?, ?, ?, ?)',
          [providerName, providerUrl, result.status, result.latency || null, result.error || null]
        );

        // Send alert email if went down
        if (result.status === 'down' || result.status === 'degraded') {
          sendProviderAlert(providerName, providerUrl, result).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[health-check] DB error:', e.message);
  }

  return results;
}

async function sendProviderAlert(providerName, providerUrl, result) {
  try {
    const smtp = await getSmtpSettings();
    if (!smtp.host || !smtp.user || !smtp.pass) return;

    const adminEmail = process.env.ADMIN_ALERT_EMAIL || smtp.from;
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const statusEmoji = result.status === 'down' ? '🔴' : '🟡';
    const subject = `${statusEmoji} Lamu Alert: ${providerName} provider is ${result.status}`;
    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#1E2B4A">${statusEmoji} Provider Alert</h2>
        <p><strong>Provider:</strong> ${providerName}</p>
        <p><strong>URL:</strong> ${providerUrl}</p>
        <p><strong>Status:</strong> <span style="color:${result.status === 'down' ? '#DC2626' : '#D97706'}">${result.status.toUpperCase()}</span></p>
        ${result.latency ? `<p><strong>Latency:</strong> ${result.latency}ms</p>` : ''}
        ${result.error ? `<p><strong>Error:</strong> ${result.error}</p>` : ''}
        <p style="color:#6B7280;font-size:12px">Detected at ${new Date().toISOString()}</p>
        <p style="color:#6B7280;font-size:12px">Check your <a href="http://localhost:3001/admin">Admin Dashboard → Monitoring</a> for details.</p>
      </div>`;

    await transporter.sendMail({ from: smtp.from, to: adminEmail, subject, html });
    console.log(`[health-check] Alert sent to ${adminEmail} for ${providerName} (${result.status})`);
  } catch (e) {
    console.error('[health-check] Email alert failed:', e.message);
  }
}

// GET /health/providers — trigger a health check (used by admin panel)
app.get('/health/providers', async (req, res) => {
  const result = await runProviderHealthCheck().catch(() => null);
  res.json({ ok: true, result });
});

// Run health check every 5 minutes
setInterval(() => runProviderHealthCheck().catch(e => console.error('[health-check]', e.message)), 5 * 60 * 1000);
// Run once at startup after 30s
setTimeout(() => runProviderHealthCheck().catch(e => console.error('[health-check]', e.message)), 30 * 1000);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch {}

  res.json({
    status: 'ok',
    version: '2.0.0',
    ai_configured: !!(process.env.AI_CHAT_URL && process.env.AI_CHAT_API_KEY),
    stt_configured: !!(process.env.STT_URL && process.env.STT_API_KEY),
    database: dbOk ? 'connected' : 'error',
  });
});

// ─── Agent endpoints ─────────────────────────────────────────────────────────

const agentModule = require('./agent');
const { getIntegrationTestFn, INTEGRATIONS } = require('./tools');

// ─── POST /api/integrations/test ──────────────────────────────────────────────
// Accepts client-provided credentials and routes to the correct testConnection.
// No auth required beyond the standard API key (same as all other endpoints).

app.post('/api/integrations/test', requireAuth, async (req, res) => {
  const { service, credentials: creds } = req.body || {};
  if (!service || !creds) return res.status(400).json({ ok: false, error: 'service and credentials are required' });

  const testFn = getIntegrationTestFn(service);
  if (!testFn) return res.status(400).json({ ok: false, error: `Unknown service: ${service}` });

  try {
    let result;
    switch (service) {
      case 'github':
        result = await testFn(creds.token);
        break;
      case 'gitlab':
        result = await testFn(creds.token, creds.baseUrl || 'https://gitlab.com');
        break;
      case 'jira':
        result = await testFn(creds.token, creds.email, creds.baseUrl);
        break;
      case 'slack':
        result = await testFn(creds.token);
        break;
      case 'google':
        result = await testFn(creds.serviceAccountJson);
        break;
      case 'stripe':
        result = await testFn(creds.apiKey);
        break;
      case 'notion':
        result = await testFn(creds.apiKey);
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown service: ${service}` });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/integrations/github/device-flow/start ─────────────────────────
// Initiates GitHub Device Flow using the admin-configured GitHub OAuth App client_id.

app.post('/api/integrations/github/device-flow/start', requireAuth, async (req, res) => {
  try {
    const clientId = await getSetting('github_oauth_client_id', process.env.GITHUB_OAUTH_CLIENT_ID || '');
    if (!clientId) return res.status(503).json({ ok: false, error: 'GitHub OAuth client_id not configured in admin settings' });
    const r = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo read:user' }),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ ok: false, error: data.error_description || data.error });
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/integrations/github/device-flow/poll ──────────────────────────

app.post('/api/integrations/github/device-flow/poll', requireAuth, async (req, res) => {
  const { device_code } = req.body || {};
  if (!device_code) return res.status(400).json({ error: 'device_code required' });
  try {
    const clientId     = await getSetting('github_oauth_client_id', process.env.GITHUB_OAUTH_CLIENT_ID || '');
    const clientSecret = await getSetting('github_oauth_client_secret', process.env.GITHUB_OAUTH_CLIENT_SECRET || '');
    if (!clientId || !clientSecret) return res.status(503).json({ error: 'GitHub OAuth not configured' });
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/run — start a new autonomous agent run
app.post('/api/agent/run', requireAuth, async (req, res) => {
  const { goal, integrations } = req.body || {};
  if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' });
  try {
    const aiConfig = await getAiConfig();
    if (!aiConfig.primaryUrl || !aiConfig.primaryKey) return res.status(503).json({ error: 'AI provider not configured' });
    const id = await agentModule.startAgentRun(goal.trim(), aiConfig, { getSmtp: getSmtpSettings, integrations: integrations || null });
    res.json({ ok: true, run_id: id });
  } catch (err) {
    console.error('[agent/run]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agent/run/:id — poll run status + steps
app.get('/api/agent/run/:id', requireAuth, async (req, res) => {
  try {
    const run = await agentModule.getAgentRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ run });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/run/:id/approve — approve or reject a pending tool call
app.post('/api/agent/run/:id/approve', requireAuth, async (req, res) => {
  const { approved } = req.body || {};
  try {
    const aiConfig = await getAiConfig();
    const result = await agentModule.approveToolCall(req.params.id, !!approved, aiConfig, { getSmtp: getSmtpSettings });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/run/:id/resume-tool — supply result of a client-side tool (db_schema, db_query)
app.post('/api/agent/run/:id/resume-tool', requireAuth, async (req, res) => {
  const { tool_result } = req.body || {};
  if (!tool_result) return res.status(400).json({ error: 'tool_result required' });
  try {
    const aiConfig = await getAiConfig();
    const result = await agentModule.resumeToolCall(req.params.id, tool_result, aiConfig, { getSmtp: getSmtpSettings });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/run/:id/cancel — cancel a running agent
app.post('/api/agent/run/:id/cancel', requireAuth, async (req, res) => {
  try {
    await db.query("UPDATE agent_runs SET status='cancelled', updated_at=NOW() WHERE id=? AND status IN ('running','waiting_approval')", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/agent/runs — list recent agent runs
app.get('/api/agent/runs', requireAuth, async (req, res) => {
  try {
    const runs = await agentModule.listAgentRuns(50);
    res.json({ runs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/agent/tasks — list created tasks
app.get('/api/agent/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await db.query('SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 100').catch(() => []);
    res.json({ tasks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  const aiOk = !!(process.env.AI_CHAT_URL && process.env.AI_CHAT_API_KEY);
  const sttOk = !!(process.env.STT_URL && process.env.STT_API_KEY);
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch (e) { console.error('[db] Connection failed:', e.message); }
  if (dbOk) {
    try { await ensureSettingsTable(); } catch (e) { console.error('[settings table]', e.message); }
    try { await ensureActivityTables(); } catch (e) { console.error('[activity tables]', e.message); }
    try { await ensureLicenseTables(); } catch (e) { console.error('[license tables]', e.message); }
    try { await ensurePaymentTable(); } catch (e) { console.error('[payment table]', e.message); }
    try { await importActivityJson(); } catch (e) { console.error('[activity import]', e.message); }
    try { await ensureMonitoringTables(); } catch (e) { console.error('[monitoring tables]', e.message); }
  }

  console.log(`\nLamu backend running at http://localhost:${PORT}`);
  console.log(`  AI chat   : ${aiOk ? '✓ configured' : '✗ NOT configured (set AI_CHAT_URL + AI_CHAT_API_KEY)'}`);
  console.log(`  STT       : ${sttOk ? '✓ configured' : '✗ not configured (optional)'}`);
  console.log(`  Auth key  : ${API_ACCESS_KEY ? '✓ set' : '⚠ not set (open access)'}`);
  console.log(`  Database  : ${dbOk ? '✓ connected (MySQL)' : '✗ NOT connected — check DB_HOST/DB_USER/DB_PASSWORD in .env'}`);
  console.log('');
});
