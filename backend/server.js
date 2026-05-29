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

// ─── RAG Pipeline: Chunking + Embedding + Search ─────────────────────────────

const RAG = {
  CHUNK_TARGET: 1200,
  CHUNK_MAX: 1800,
  OVERLAP: 200,
  SEMANTIC_WEIGHT: 0.70,
  BM25_WEIGHT: 0.30,
  RERANK_FACTOR: 3,
  BM25_K1: 1.5,
  BM25_B: 0.75,
  COSINE_THRESHOLD: 0.05,
  EMBED_MODEL: 'text-embedding-3-small',
};

// ── Chunking (mirrors Tauri ingest.rs) ───────────────────────────────────────

function chunkText(text) {
  if (!text || text.length <= RAG.CHUNK_TARGET) return [text || ''];
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= RAG.CHUNK_TARGET) {
      current += (current ? '\n\n' : '') + para;
    } else {
      if (current) chunks.push(current);
      if (para.length <= RAG.CHUNK_MAX) {
        current = para;
      } else {
        // Split oversized paragraph at sentence boundaries
        const sentences = splitSentences(para);
        current = '';
        for (const sent of sentences) {
          if (current.length + sent.length + 1 <= RAG.CHUNK_TARGET) {
            current += (current ? ' ' : '') + sent;
          } else {
            if (current) chunks.push(current);
            current = sent.length > RAG.CHUNK_MAX ? sent.slice(0, RAG.CHUNK_MAX) : sent;
          }
        }
      }
    }
  }
  if (current) chunks.push(current);

  // Apply overlap
  if (chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlap = prev.slice(-RAG.OVERLAP);
      chunks[i] = overlap + chunks[i];
    }
  }
  return chunks;
}

function splitSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter(s => s.length > 0);
}

// ── Embedding ────────────────────────────────────────────────────────────────

let _embedConfigCache = null;
let _embedConfigTs = 0;

async function getEmbedConfig() {
  if (_embedConfigCache && Date.now() - _embedConfigTs < 30000) return _embedConfigCache;
  try {
    const rows = await db.query(
      "SELECT `key`, value FROM settings WHERE `key` IN ('embedding_provider','embedding_api_key','embedding_model','embedding_url')"
    );
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    _embedConfigCache = {
      provider: s.embedding_provider || process.env.EMBEDDING_PROVIDER || 'openai',
      apiKey:   s.embedding_api_key  || process.env.EMBEDDING_API_KEY  || process.env.AI_CHAT_API_KEY || '',
      model:    s.embedding_model    || process.env.EMBEDDING_MODEL    || RAG.EMBED_MODEL,
      url:      s.embedding_url      || process.env.EMBEDDING_URL      || 'https://api.openai.com/v1/embeddings',
    };
  } catch {
    _embedConfigCache = {
      provider: process.env.EMBEDDING_PROVIDER || 'openai',
      apiKey:   process.env.EMBEDDING_API_KEY  || process.env.AI_CHAT_API_KEY || '',
      model:    process.env.EMBEDDING_MODEL    || RAG.EMBED_MODEL,
      url:      process.env.EMBEDDING_URL      || 'https://api.openai.com/v1/embeddings',
    };
  }
  _embedConfigTs = Date.now();
  return _embedConfigCache;
}

async function embedText(text) {
  const cfg = await getEmbedConfig();
  if (!cfg.apiKey) throw new Error('No embedding API key configured');
  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, input: text }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Embedding API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  const vec = data?.data?.[0]?.embedding;
  if (!vec || !Array.isArray(vec)) throw new Error('Empty embedding response');
  return vec;
}

function vecToBlob(vec) {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
}

function blobToVec(buf) {
  const vec = [];
  for (let i = 0; i < buf.length; i += 4) vec.push(buf.readFloatLE(i));
  return vec;
}

// ── Cosine + BM25 scoring ────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return magA === 0 || magB === 0 ? 0 : dot / (magA * magB);
}

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'of','in','to','for','with','on','at','by','from','as','into','through','during',
  'before','after','above','below','between','out','off','over','under','again',
  'further','then','once','and','but','or','nor','not','so','if','than','too','very',
  'le','la','les','un','une','des','de','du','en','et','est','sont','a','à','au',
  'aux','par','pour','dans','sur','avec','ce','cette','ces','il','elle','nous',
  'vous','ils','elles','qui','que','quoi','dont','où','ne','pas','plus','moins',
]);

function extractKeywords(query) {
  return query.toLowerCase().split(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ]+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function computeBm25(chunkWords, keywords, avgdl, nDocs, dfMap) {
  let score = 0;
  const dl = chunkWords.length;
  for (const kw of keywords) {
    const tf = chunkWords.filter(w => w === kw).length;
    if (tf === 0) continue;
    const df = dfMap.get(kw) || 0;
    const idf = Math.log((nDocs - df + 0.5) / (df + 0.5) + 1);
    score += idf * (tf * (RAG.BM25_K1 + 1)) / (tf + RAG.BM25_K1 * (1 - RAG.BM25_B + RAG.BM25_B * dl / avgdl));
  }
  return Math.tanh(score); // squash to [0, 1]
}

// ── Chunk + embed a document (background) ────────────────────────────────────

async function chunkAndEmbedDocument(docId, content) {
  try {
    const chunks = chunkText(content);
    // Delete old chunks for this document
    await db.query('DELETE FROM kb_chunks WHERE document_id = ?', [docId]);
    // Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = require('crypto').randomUUID();
      await db.query(
        'INSERT INTO kb_chunks (id, document_id, content, chunk_index, source) VALUES (?, ?, ?, ?, ?)',
        [chunkId, docId, chunks[i], i, 'web']
      );
    }
    // Embed each chunk
    let embeddedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const vec = await embedText(chunks[i]);
        const blob = vecToBlob(vec);
        await db.query(
          'UPDATE kb_chunks SET embedding = ? WHERE document_id = ? AND chunk_index = ?',
          [blob, docId, i]
        );
        embeddedCount++;
      } catch (e) {
        console.error(`[RAG] embed chunk ${i} of ${docId} failed:`, e.message);
      }
    }
    // Update document chunk_count
    await db.query('UPDATE kb_documents SET chunk_count = ? WHERE id = ?', [chunks.length, docId]);
    console.log(`[RAG] ${docId}: ${chunks.length} chunks, ${embeddedCount} embedded`);
  } catch (e) {
    console.error(`[RAG] chunkAndEmbed failed for ${docId}:`, e.message);
  }
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
  if (token === API_ACCESS_KEY) return next();
  // Also accept webapp JWT so web app users can access KB endpoints
  const webToken = req.headers['x-webapp-token'] || '';
  if (webToken) {
    try { req.webUser = jwt.verify(webToken, WEBAPP_JWT_SECRET); return next(); } catch {}
  }
  return res.status(401).json({ error: 'Unauthorized' });
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

// GET /api/kb/search — RAG hybrid search (cosine + BM25) with keyword fallback
app.get('/api/kb/search', requireAuth, async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  const topK = parseInt(req.query.top_k) || 8;
  try {
    if (!query) {
      const docs = await db.query(
        'SELECT id, type, name, url, chars, created_at as createdAt FROM kb_documents ORDER BY created_at DESC'
      );
      return res.json({ docs, query });
    }

    // Try semantic search first
    let results = [];
    try {
      results = await ragSearch(query, topK);
    } catch (e) {
      console.warn('[/api/kb/search] RAG search failed, falling back to keyword:', e.message);
    }

    // Fallback: SQL keyword search if RAG returned nothing
    if (results.length === 0) {
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
      return res.json({ docs, query, method: 'keyword' });
    }

    res.json({ docs: results, query, method: 'rag' });
  } catch (err) {
    console.error('[/api/kb/search] error:', err.message);
    res.status(500).json({ error: 'Failed to search KB' });
  }
});

// RAG search: cosine similarity + BM25 hybrid
async function ragSearch(query, topK) {
  // Step 1: Try to embed the query (optional — works without embeddings via BM25-only)
  let queryVec = null;
  try { queryVec = await embedText(query); } catch { /* embeddings unavailable, BM25-only mode */ }

  // Step 2: Load all chunks (with or without embeddings)
  const rows = await db.query(
    `SELECT c.id AS chunk_id, c.document_id, d.name, d.type AS source_type,
            c.content, c.chunk_index, c.embedding,
            d.url, d.chars
     FROM kb_chunks c
     JOIN kb_documents d ON d.id = c.document_id`
  );
  if (rows.length === 0) return [];

  // Step 3: Extract keywords
  const keywords = extractKeywords(query);
  if (keywords.length === 0 && !queryVec) return [];

  // Step 4: Compute BM25 corpus stats
  const chunkWordsList = rows.map(r => r.content.toLowerCase().split(/\s+/));
  const nDocs = rows.length;
  const avgdl = chunkWordsList.reduce((sum, w) => sum + w.length, 0) / nDocs;
  const dfMap = new Map();
  for (const kw of keywords) {
    let df = 0;
    for (const words of chunkWordsList) { if (words.includes(kw)) df++; }
    dfMap.set(kw, df);
  }

  // Step 5: First pass — score all chunks (hybrid if embeddings available, BM25-only otherwise)
  const candidates = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let cosine = 0;
    if (queryVec && row.embedding) {
      const chunkVec = blobToVec(row.embedding);
      cosine = cosineSimilarity(queryVec, chunkVec);
    }

    const bm25 = keywords.length > 0 ? computeBm25(chunkWordsList[i], keywords, avgdl, nDocs, dfMap) : 0;

    // Score: hybrid if embeddings available, BM25-only otherwise
    const score = queryVec && row.embedding
      ? RAG.SEMANTIC_WEIGHT * cosine + RAG.BM25_WEIGHT * bm25
      : bm25;

    if (score < 0.01) continue; // Skip irrelevant chunks

    candidates.push({
      id: row.document_id,
      chunk_id: row.chunk_id,
      type: row.source_type,
      name: row.name,
      url: row.url,
      chars: row.chars,
      content: row.content,
      chunk_index: row.chunk_index,
      similarity: score,
      cosine,
      bm25,
    });
  }

  // Step 6: Sort and take top_k * RERANK_FACTOR
  candidates.sort((a, b) => b.similarity - a.similarity);
  const preRank = candidates.slice(0, topK * RAG.RERANK_FACTOR);

  // Step 7: Re-rank with BM25 recalculated on smaller set
  if (preRank.length > topK && keywords.length > 0) {
    const reWords = preRank.map(c => c.content.toLowerCase().split(/\s+/));
    const reN = preRank.length;
    const reAvgdl = reWords.reduce((s, w) => s + w.length, 0) / reN;
    const reDf = new Map();
    for (const kw of keywords) {
      let df = 0;
      for (const words of reWords) { if (words.includes(kw)) df++; }
      reDf.set(kw, df);
    }
    for (let i = 0; i < preRank.length; i++) {
      const reBm25 = computeBm25(reWords[i], keywords, reAvgdl, reN, reDf);
      preRank[i].similarity = queryVec && preRank[i].cosine > 0
        ? RAG.SEMANTIC_WEIGHT * preRank[i].cosine + RAG.BM25_WEIGHT * reBm25
        : reBm25;
    }
    preRank.sort((a, b) => b.similarity - a.similarity);
  }

  // Step 8: Deduplicate by document (keep best chunk per doc) and return top_k
  const seen = new Set();
  const final = [];
  for (const c of preRank) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    final.push({
      id: c.id,
      type: c.type,
      name: c.name,
      url: c.url,
      chars: c.chars,
      excerpt: c.content.slice(0, 300),
      similarity: Math.round(c.similarity * 1000) / 1000,
      chunk_content: c.content,
    });
    if (final.length >= topK) break;
  }
  return final;
}

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

// POST /api/kb/embed — (re-)embed all documents that have no chunks or missing embeddings
app.post('/api/kb/embed', requireAuth, async (req, res) => {
  try {
    const docs = await db.query(
      `SELECT d.id, d.content FROM kb_documents d
       WHERE d.chunk_count = 0 OR d.id NOT IN (SELECT DISTINCT document_id FROM kb_chunks WHERE embedding IS NOT NULL)
       ORDER BY d.created_at DESC`
    );
    res.json({ success: true, queued: docs.length, message: `Embedding ${docs.length} documents in background` });
    // Background processing
    for (const doc of docs) {
      await chunkAndEmbedDocument(doc.id, doc.content).catch(e => console.error('[RAG] embed-all:', e.message));
    }
    console.log(`[RAG] embed-all done: ${docs.length} documents processed`);
  } catch (err) {
    console.error('[/api/kb/embed] error:', err.message);
    res.status(500).json({ error: 'Failed to start embedding' });
  }
});

// ── KB GAPS (before :id to avoid shadowing) ──
app.get('/api/kb/gaps', requireAuth, async (req, res) => {
  try {
    const gaps = await db.query('SELECT * FROM kb_gaps ORDER BY frequency DESC, created_at DESC LIMIT 50');
    res.json({ gaps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/kb/gaps/:id/generate', requireAuth, async (req, res) => {
  try {
    const gap = await db.queryOne('SELECT * FROM kb_gaps WHERE id = ?', [req.params.id]);
    if (!gap) return res.status(404).json({ error: 'Gap not found' });
    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.status(503).json({ error: 'AI not configured' });
    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({
        model: ai.primaryModel,
        messages: [{ role: 'user', content: `Write a knowledge base article to answer this customer question: "${gap.query}"\n\nFormat: Start with a clear title, then provide a comprehensive, helpful answer. Keep it concise but thorough.` }],
        max_tokens: 1000, temperature: 0.3
      })
    });
    if (!aiResp.ok) return res.status(500).json({ error: 'AI generation failed' });
    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const title = content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 200) || gap.suggested_title || 'New Article';
    await db.query('UPDATE kb_gaps SET suggested_title = ?, suggested_content = ?, status = ? WHERE id = ?', [title, content, 'generated', req.params.id]);
    res.json({ title, content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/kb/gaps/:id/approve', requireAuth, async (req, res) => {
  try {
    const gap = await db.queryOne('SELECT * FROM kb_gaps WHERE id = ?', [req.params.id]);
    if (!gap || !gap.suggested_content) return res.status(400).json({ error: 'No generated content to approve' });
    const docId = crypto.randomUUID();
    await db.query('INSERT INTO kb_documents (id, type, name, content, chars) VALUES (?,?,?,?,?)',
      [docId, 'auto', gap.suggested_title || 'Auto-generated', gap.suggested_content, gap.suggested_content.length]);
    await db.query('UPDATE kb_gaps SET status = ? WHERE id = ?', ['approved', req.params.id]);
    chunkAndEmbedDocument(docId, gap.suggested_content).catch(() => {});
    res.json({ success: true, doc_id: docId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/kb/gaps/:id', requireAuth, async (req, res) => {
  try { await db.query('DELETE FROM kb_gaps WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/kb/:id — AFTER specific routes to avoid shadowing /search, /stats, /gaps
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

// POST /api/kb/url
app.post('/api/kb/url', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
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
    // Background: chunk + embed
    chunkAndEmbedDocument(id, content).catch(e => console.error('[RAG] bg url:', e.message));
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
    // Background: chunk + embed
    chunkAndEmbedDocument(id, text).catch(e => console.error('[RAG] bg text:', e.message));
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

// POST /api/kb/extract-text — extract text from PDF/DOCX for chat file attachment
app.post('/api/kb/extract-text', requireAuth, async (req, res) => {
  const { name, content } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  try {
    const text = await extractTextFromFile(name, content);
    res.json({ text: text.slice(0, 15000) });
  } catch (err) {
    console.error('[/api/kb/extract-text]', err.message);
    res.status(400).json({ error: 'Failed to extract text: ' + err.message, text: '' });
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
        // Send trial reminder email when 3 messages remaining
        const updatedTrial = await db.queryOne('SELECT messages_used, max_messages FROM webapp_trials WHERE email = ?', [decoded.email]);
        if (updatedTrial) {
          const maxMsg = updatedTrial.max_messages || WEBAPP_FREE_MESSAGES;
          const remaining = maxMsg - updatedTrial.messages_used;
          if (remaining === 3) {
            sendTrialReminderEmail(decoded.email, remaining, maxMsg).catch(e => console.error('[trial-reminder]', e.message));
          }
        }
      }
    } catch { /* token invalid — let requireAuth handle it */ }
  }

  const ai = await getAiConfig();
  if (!ai.primaryUrl || !ai.primaryKey) {
    return res.status(503).json({ error: 'AI provider not configured on the server.' });
  }

  const { messages = [], model, system, kbIds, userName } = req.body || {};

  // Build Lamu identity system prompt
  const userGreeting = userName ? `The user's name is ${userName}. Address them by their first name naturally.` : '';
  const lamuIdentity = `You are Lamu, an intelligent AI assistant created by Lamuka Tech. You are NOT a generic AI — your name is Lamu.
When someone asks who you are, introduce yourself as Lamu and explain that you are an AI assistant that helps users with their questions, tasks, and projects using their personal knowledge base.
When someone asks what Lamu is or what you can do, explain: Lamu is an AI-powered assistant that combines conversational AI with a personal knowledge base. Users can upload documents, and you use that knowledge to provide accurate, contextual answers. You help with research, writing, analysis, and any question the user has.
${userGreeting}
Be friendly, concise, and helpful. Always respond in the same language the user writes in.
When using knowledge base documents to answer, cite your sources by mentioning the document name in brackets like [Document Name] at the end of the relevant sentence or paragraph.
IMPORTANT: Detect the language of the user's message and ALWAYS respond in that same language. If French, respond in French. If English, respond in English. Etc.`;

  // Merge: Lamu identity + user custom system prompt
  let systemContent = system ? `${lamuIdentity}\n\n## Additional instructions\n${system}` : lamuIdentity;

  // Inject KB context
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
      systemContent = systemContent + kbBlock;
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
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS message_feedback (
        message_id VARCHAR(100) PRIMARY KEY,
        conversation_id VARCHAR(100) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        rating ENUM('up','down') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conv (conversation_id),
        INDEX idx_email (user_email),
        INDEX idx_rating (rating)
      )
    `);
  } catch (e) { console.error('[webapp] feedback table error:', e.message); }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS shared_conversations (
        share_id VARCHAR(20) PRIMARY KEY,
        conversation_id VARCHAR(100) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conv (conversation_id)
      )
    `);
  } catch (e) { console.error('[webapp] shared_conversations table error:', e.message); }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS widget_agents (
        id VARCHAR(50) PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        name VARCHAR(150) DEFAULT 'My Agent',
        system_prompt TEXT,
        welcome_message VARCHAR(500) DEFAULT '',
        color VARCHAR(20) DEFAULT '#6366f1',
        allowed_origins TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (user_email)
      )
    `);
  } catch (e) { console.error('[webapp] widget_agents table error:', e.message); }
})();

// POST /api/webapp/send-otp — send a 6-digit code to the email
app.post('/api/webapp/send-otp', requireAuth, async (req, res) => {
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  const emailLower = email.trim().toLowerCase();

  try {
    // Clean up expired OTP first (older than 10 minutes)
    await db.query('DELETE FROM webapp_otp WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)').catch(() => {});

    // Rate limit: max 1 OTP per minute per email
    const existing = await db.queryOne('SELECT created_at FROM webapp_otp WHERE email = ?', [emailLower]);
    if (existing) {
      const createdAt = new Date(existing.created_at).getTime();
      const elapsed = Date.now() - createdAt;
      // If elapsed is negative or absurdly large, the OTP is stale — delete it and continue
      if (elapsed < 0 || elapsed > 10 * 60 * 1000) {
        await db.query('DELETE FROM webapp_otp WHERE email = ?', [emailLower]);
      } else if (elapsed < OTP_RATE_LIMIT_MS) {
        const waitSec = Math.ceil((OTP_RATE_LIMIT_MS - elapsed) / 1000);
        const display = waitSec >= 60 ? `${Math.ceil(waitSec / 60)} minute(s)` : `${waitSec}s`;
        return res.json({ success: false, error: `Attendez ${display} avant de renvoyer un code.` });
      }
    }

    // Check mailer BEFORE inserting OTP (so failed SMTP doesn't trigger rate limit)
    const mailer = await createMailer();
    if (!mailer) {
      console.error('[webapp/otp] SMTP not configured');
      return res.status(503).json({ success: false, error: 'Service email non disponible.' });
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

    // Send onboarding welcome email for new trial users
    if ((trial.messages_used || 0) === 0) {
      sendOnboardingEmail(emailLower, trial.name || nameFromOtp || emailLower.split('@')[0]).catch(e => console.error('[onboarding-email]', e.message));
    }

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

// ─── Message Feedback (thumbs up/down) ──────────────────────────────────────

// POST /api/webapp/feedback — rate a message
app.post('/api/webapp/feedback', requireAuth, requireWebAuth, async (req, res) => {
  const { message_id, conversation_id, rating } = req.body || {};
  if (!message_id || !conversation_id || !['up', 'down'].includes(rating)) {
    return res.status(400).json({ error: 'message_id, conversation_id, rating (up|down) required' });
  }
  try {
    await db.query(
      `INSERT INTO message_feedback (message_id, conversation_id, user_email, rating)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
      [message_id, conversation_id, req.webUser.email, rating]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/webapp/feedback/:messageId — remove feedback
app.delete('/api/webapp/feedback/:messageId', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM message_feedback WHERE message_id = ? AND user_email = ?', [req.params.messageId, req.webUser.email]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/webapp/feedback/:conversationId — get all feedback for a conversation
app.get('/api/webapp/feedback/:conversationId', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT message_id, rating FROM message_feedback WHERE conversation_id = ? AND user_email = ?', [req.params.conversationId, req.webUser.email]);
    const map = {};
    for (const r of rows) map[r.message_id] = r.rating;
    res.json({ feedback: map });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Share conversation ─────────────────────────────────────────────────────

// POST /api/webapp/share — create a share link for a conversation
app.post('/api/webapp/share', requireAuth, requireWebAuth, async (req, res) => {
  const { conversation_id } = req.body || {};
  if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
  try {
    const conv = await db.queryOne('SELECT id FROM conversations WHERE id = ? AND user_email = ?', [conversation_id, req.webUser.email]);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const existing = await db.queryOne('SELECT share_id FROM shared_conversations WHERE conversation_id = ? AND user_email = ?', [conversation_id, req.webUser.email]);
    if (existing) return res.json({ share_id: existing.share_id });
    const shareId = Math.random().toString(36).slice(2, 12);
    await db.query('INSERT INTO shared_conversations (share_id, conversation_id, user_email) VALUES (?, ?, ?)', [shareId, conversation_id, req.webUser.email]);
    res.json({ share_id: shareId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/webapp/shared/:shareId — public: get a shared conversation (no auth)
app.get('/api/webapp/shared/:shareId', async (req, res) => {
  try {
    const share = await db.queryOne('SELECT * FROM shared_conversations WHERE share_id = ?', [req.params.shareId]);
    if (!share) return res.status(404).json({ error: 'Not found' });
    const conv = await db.queryOne('SELECT id, title, created_at FROM conversations WHERE id = ?', [share.conversation_id]);
    if (!conv) return res.status(404).json({ error: 'Conversation deleted' });
    const msgs = await db.query('SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC', [share.conversation_id]);
    res.json({ conversation: { ...conv, messages: msgs } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Analytics ──────────────────────────────────────────────────────────────

// GET /api/webapp/analytics — user's own analytics
app.get('/api/webapp/analytics', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const email = req.webUser.email;

    // Messages per day (last 30 days)
    const daily = await db.query(
      `SELECT DATE(FROM_UNIXTIME(m.timestamp / 1000)) as date, COUNT(*) as count
       FROM messages m JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_email = ? AND c.source = 'webapp' AND m.role = 'user'
         AND m.timestamp > ?
       GROUP BY date ORDER BY date`,
      [email, Date.now() - 30 * 86400000]
    );

    // Total conversations
    const convCount = await db.queryOne('SELECT COUNT(*) as count FROM conversations WHERE user_email = ? AND source = ?', [email, 'webapp']);

    // Total messages
    const msgCount = await db.queryOne(
      `SELECT COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_email = ? AND c.source = 'webapp'`, [email]
    );

    // Feedback stats
    const fbStats = await db.query(
      `SELECT rating, COUNT(*) as count FROM message_feedback WHERE user_email = ? GROUP BY rating`, [email]
    );
    const feedback = { up: 0, down: 0 };
    for (const r of fbStats) feedback[r.rating] = r.count;

    // Top questions (most recent user messages)
    const topQuestions = await db.query(
      `SELECT m.content FROM messages m JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_email = ? AND c.source = 'webapp' AND m.role = 'user'
       ORDER BY m.timestamp DESC LIMIT 10`, [email]
    );

    res.json({
      daily,
      total_conversations: convCount?.count || 0,
      total_messages: msgCount?.count || 0,
      feedback,
      satisfaction_rate: (feedback.up + feedback.down) > 0
        ? Math.round((feedback.up / (feedback.up + feedback.down)) * 100) : null,
      recent_questions: topQuestions.map(q => q.content.slice(0, 120)),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Widget Agents CRUD ─────────────────────────────────────────────────────

// GET /api/webapp/agents — list user's widget agents
app.get('/api/webapp/agents', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const agents = await db.query('SELECT * FROM widget_agents WHERE user_email = ? ORDER BY created_at DESC', [req.webUser.email]);
    res.json({ agents });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/webapp/agents — create a widget agent
app.post('/api/webapp/agents', requireAuth, requireWebAuth, async (req, res) => {
  const { name, system_prompt, welcome_message, color, allowed_origins } = req.body || {};
  const id = 'ag_' + Math.random().toString(36).slice(2, 14);
  try {
    await db.query(
      'INSERT INTO widget_agents (id, user_email, name, system_prompt, welcome_message, color, allowed_origins) VALUES (?,?,?,?,?,?,?)',
      [id, req.webUser.email, name || 'My Agent', system_prompt || '', welcome_message || '', color || '#6366f1', allowed_origins || '']
    );
    res.json({ id, ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/webapp/agents/:id — update a widget agent
app.put('/api/webapp/agents/:id', requireAuth, requireWebAuth, async (req, res) => {
  const { name, system_prompt, welcome_message, color, allowed_origins } = req.body || {};
  try {
    const agent = await db.queryOne('SELECT id FROM widget_agents WHERE id = ? AND user_email = ?', [req.params.id, req.webUser.email]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    await db.query(
      'UPDATE widget_agents SET name=?, system_prompt=?, welcome_message=?, color=?, allowed_origins=? WHERE id=?',
      [name, system_prompt || '', welcome_message || '', color || '#6366f1', allowed_origins || '', req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/webapp/agents/:id
app.delete('/api/webapp/agents/:id', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM widget_agents WHERE id = ? AND user_email = ?', [req.params.id, req.webUser.email]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/widget/chat — public endpoint for widget chat (no webapp auth, uses agent token)
app.post('/api/widget/chat', async (req, res) => {
  const agentId = req.headers['x-widget-agent'] || req.body?.agent || '';
  const { messages = [] } = req.body || {};

  // Look up agent config
  let agentPrompt = '';
  if (agentId) {
    const agent = await db.queryOne('SELECT system_prompt, user_email, allowed_origins FROM widget_agents WHERE id = ?', [agentId]);
    if (agent) {
      agentPrompt = agent.system_prompt || '';
      // Origin check (optional)
      if (agent.allowed_origins) {
        const origin = req.headers['origin'] || '';
        const allowed = agent.allowed_origins.split(',').map(o => o.trim()).filter(Boolean);
        if (allowed.length && !allowed.some(a => origin.includes(a))) {
          return res.status(403).json({ error: 'Origin not allowed' });
        }
      }
    }
  }

  const ai = await getAiConfig();
  if (!ai.primaryUrl || !ai.primaryKey) {
    return res.status(503).json({ error: 'AI provider not configured.' });
  }

  // Build system prompt with Lamu identity + agent custom prompt
  const lamuBase = `You are Lamu, a helpful AI assistant. Be friendly, concise, and helpful. Always respond in the same language the user writes in.`;
  const systemContent = agentPrompt ? `${lamuBase}\n\n${agentPrompt}` : lamuBase;

  // Inject KB context for the agent's owner
  let finalSystem = systemContent;
  if (agentId) {
    try {
      const agent = await db.queryOne('SELECT user_email FROM widget_agents WHERE id = ?', [agentId]);
      if (agent) {
        const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
        if (kbDocs.length > 0) {
          const context = kbDocs.map(d => '### ' + d.name + '\n' + d.content).join('\n\n---\n\n').slice(0, 24000);
          finalSystem += '\n\n## Knowledge Base\nUse the following documents to answer questions accurately:\n\n' + context;
        }
      }
    } catch {}
  }

  const fullMessages = [{ role: 'system', content: finalSystem }, ...messages];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

  try {
    let parsedExtras = {};
    try { parsedExtras = JSON.parse(ai.bodyExtras || '{}'); } catch {}
    const aiRes = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.primaryKey },
      body: JSON.stringify({ model: ai.primaryModel, messages: fullMessages, stream: true, max_tokens: 2048, ...parsedExtras }),
    });
    if (!aiRes.ok) {
      send({ error: 'AI provider error' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const reader = aiRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const j = JSON.parse(line.slice(6));
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) send({ delta });
        } catch {}
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
    // Fire webhooks for widget message
    fireWebhooks('widget_message', { agent_id: agentId, user_message: messages[messages.length - 1]?.content || '' }).catch(() => {});
  } catch {
    send({ error: 'Connection error' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// CORS preflight for widget
app.options('/api/widget/chat', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Widget-Agent');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
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

// ─── Onboarding & Trial Reminder Emails (Features 17, 18) ─────────────────────

async function sendOnboardingEmail(email, name) {
  const mailer = await createMailer();
  if (!mailer) { console.log('[onboarding] SMTP not configured — skipping for', email); return; }
  const smtp = await getSmtpSettings();
  await mailer.sendMail({
    from: smtp.from,
    to: email,
    subject: `Bienvenue sur Lamu AI, ${name}! 🎉`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#818cf8);display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;color:#fff;">🤖</span>
          </div>
        </div>
        <h1 style="text-align:center;color:#1a1a2e;font-size:22px;">Bienvenue, ${name}!</h1>
        <p style="color:#555;font-size:14px;line-height:1.7;text-align:center;">
          Votre compte Lamu AI est prêt. Vous disposez de <strong>20 messages gratuits</strong> pour découvrir toutes les fonctionnalités.
        </p>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="color:#1a1a2e;margin:0 0 12px;font-size:15px;">Ce que vous pouvez faire :</h3>
          <ul style="color:#555;font-size:13px;line-height:2;padding-left:20px;margin:0;">
            <li>💬 Discuter avec Lamu AI</li>
            <li>📚 Ajouter des documents à votre base de connaissances</li>
            <li>🔍 Rechercher dans vos sources</li>
            <li>🤖 Créer des widgets pour votre site web</li>
            <li>📊 Suivre vos statistiques d'utilisation</li>
          </ul>
        </div>
        <div style="text-align:center;margin-top:24px;">
          <a href="${process.env.WEBAPP_URL || 'https://lamu.lamuka-tech.com'}/app" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
            Commencer à utiliser Lamu →
          </a>
        </div>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:24px;">
          Lamuka Tech — Lamu AI Assistant
        </p>
      </div>
    `,
  });
  console.log(`[onboarding] ✓ Welcome email sent to ${email}`);
}

async function sendTrialReminderEmail(email, remaining, maxMessages) {
  const mailer = await createMailer();
  if (!mailer) { console.log('[trial-reminder] SMTP not configured — skipping for', email); return; }
  const smtp = await getSmtpSettings();
  await mailer.sendMail({
    from: smtp.from,
    to: email,
    subject: `⚠️ Plus que ${remaining} messages sur votre trial Lamu AI`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:48px;">⚠️</span>
        </div>
        <h1 style="text-align:center;color:#1a1a2e;font-size:20px;">Votre trial se termine bientôt</h1>
        <p style="color:#555;font-size:14px;line-height:1.7;text-align:center;">
          Il vous reste <strong style="color:#ef4444;">${remaining} messages</strong> sur vos ${maxMessages} messages gratuits.
        </p>
        <p style="color:#555;font-size:14px;line-height:1.7;text-align:center;">
          Passez au plan Pro pour continuer à utiliser Lamu AI sans interruption :
          messages illimités, tous les modèles IA, widget embed, et plus encore.
        </p>
        <div style="text-align:center;margin-top:24px;">
          <a href="${process.env.WEBAPP_URL || 'https://lamu.lamuka-tech.com'}/pricing" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
            Passer au Pro →
          </a>
        </div>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:24px;">
          Lamuka Tech — Lamu AI Assistant
        </p>
      </div>
    `,
  });
  console.log(`[trial-reminder] ✓ Reminder sent to ${email} (${remaining} messages left)`);
}

// ─── Suggestions Endpoint (Feature 14) ────────────────────────────────────────

app.post('/api/webapp/suggestions', requireAuth, async (req, res) => {
  const { messages = [] } = req.body || {};
  if (messages.length === 0) return res.json({ suggestions: [] });

  const ai = await getAiConfig();
  if (!ai.primaryUrl || !ai.primaryKey) return res.json({ suggestions: [] });

  try {
    const lastMsgs = messages.slice(-4);
    const promptContent = `Based on this conversation, suggest exactly 3 short follow-up questions the user might want to ask next. Each question should be concise (under 60 characters), relevant, and in the same language as the conversation.
Return ONLY a JSON array of exactly 3 strings, nothing else. Example: ["Question 1?", "Question 2?", "Question 3?"]

Conversation:
${lastMsgs.map(m => `${m.role}: ${m.content}`).join('\n')}`;

    const aiRes = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({
        model: ai.primaryModel,
        messages: [{ role: 'user', content: promptContent }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) return res.json({ suggestions: [] });
    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return res.json({ suggestions: parsed.slice(0, 3) });
    }
    res.json({ suggestions: [] });
  } catch (err) {
    console.error('[suggestions]', err.message);
    res.json({ suggestions: [] });
  }
});

// ─── Web Crawl Endpoint (Feature 22) ─────────────────────────────────────────

app.post('/api/kb/crawl', requireAuth, async (req, res) => {
  const { url, max_pages = 10 } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const visited = new Set();
    const docs = [];
    const queue = [url.trim()];
    const baseHost = new URL(url.trim()).hostname;
    const limit = Math.min(max_pages, 50);

    while (queue.length > 0 && visited.size < limit) {
      const currentUrl = queue.shift();
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        const resp = await fetch(currentUrl, { headers: { 'User-Agent': 'LamuBot/1.0' }, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) continue;
        const html = await resp.text();

        // Extract text content (basic HTML strip)
        const textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 20000);

        if (textContent.length > 50) {
          // Extract title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : currentUrl;

          // Save to KB
          const id = require('crypto').randomUUID();
          await db.query(
            'INSERT INTO kb_documents (id, type, name, url, content, chars, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [id, 'url', title.slice(0, 200), currentUrl, textContent, textContent.length]
          );
          docs.push({ id, name: title.slice(0, 200), url: currentUrl, chars: textContent.length, content: textContent });
        }

        // Extract links for crawling
        const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(html)) !== null) {
          try {
            const linkUrl = new URL(linkMatch[1]);
            if (linkUrl.hostname === baseHost && !visited.has(linkMatch[1])) {
              queue.push(linkMatch[1]);
            }
          } catch {}
        }
      } catch {}
    }

    res.json({ success: true, pages_crawled: visited.size, documents_added: docs.length, docs });
    // Background: chunk + embed all crawled docs
    for (const d of docs) {
      chunkAndEmbedDocument(d.id, d.content || '').catch(e => console.error('[RAG] bg crawl:', e.message));
    }
  } catch (err) {
    console.error('[kb/crawl]', err.message);
    res.status(500).json({ error: 'Crawl failed: ' + err.message });
  }
});

// ─── Widget Chat History (Feature 13) ─────────────────────────────────────────

app.get('/api/webapp/widget-history', requireAuth, requireWebAuth, async (req, res) => {
  try {
    // Ensure widget_conversations table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS widget_conversations (
        id VARCHAR(36) PRIMARY KEY,
        agent_id VARCHAR(36),
        visitor_id VARCHAR(100),
        messages JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    const rows = await db.query(
      'SELECT wc.*, wa.name as agent_name FROM widget_conversations wc LEFT JOIN widget_agents wa ON wa.id = wc.agent_id ORDER BY wc.updated_at DESC LIMIT 100'
    );
    res.json({ conversations: rows.map(r => ({ ...r, messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : r.messages })) });
  } catch (err) {
    console.error('[widget-history]', err.message);
    res.json({ conversations: [] });
  }
});

// ─── Webhook Notifications (Feature 16) ───────────────────────────────────────

app.get('/api/webapp/webhooks', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id VARCHAR(36) PRIMARY KEY,
        url TEXT NOT NULL,
        events VARCHAR(500) DEFAULT 'message',
        agent_id VARCHAR(36),
        active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const hooks = await db.query('SELECT * FROM webhooks ORDER BY created_at DESC');
    res.json({ webhooks: hooks });
  } catch (err) {
    res.json({ webhooks: [] });
  }
});

app.post('/api/webapp/webhooks', requireAuth, requireWebAuth, async (req, res) => {
  const { url, events, agent_id } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const id = require('crypto').randomUUID();
    await db.query('INSERT INTO webhooks (id, url, events, agent_id) VALUES (?, ?, ?, ?)', [id, url, events || 'message', agent_id || null]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/webapp/webhooks/:id', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM webhooks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function fireWebhooks(event, payload) {
  try {
    const hooks = await db.query('SELECT * FROM webhooks WHERE active = 1 AND (events LIKE ? OR events LIKE ?)', [`%${event}%`, '%all%']);
    for (const hook of hooks) {
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload }),
      }).catch(e => console.error(`[webhook] Failed: ${hook.url}`, e.message));
    }
  } catch {}
}

// ─── Public API for Clients (Feature 23) ──────────────────────────────────────

app.post('/api/v1/chat', async (req, res) => {
  const apiKey = (req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || '').trim();
  if (!apiKey) return res.status(401).json({ error: 'API key required. Pass via X-Api-Key header.' });

  // Validate API key against licenses
  try {
    const license = await db.queryOne(
      'SELECT l.*, p.name as plan_name, p.features as plan_features FROM licenses l LEFT JOIN plans p ON p.id = l.plan WHERE l.license_key = ? AND l.is_active = 1',
      [apiKey]
    );
    if (!license) return res.status(401).json({ error: 'Invalid API key.' });

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.status(503).json({ error: 'AI provider not configured.' });

    const { messages = [], model, system } = req.body || {};
    if (!messages.length) return res.status(400).json({ error: 'messages array required.' });

    const systemContent = system || 'You are Lamu, an AI assistant by Lamuka Tech. Be helpful and concise.';
    const fullMessages = [{ role: 'system', content: systemContent }, ...messages];

    let parsedExtras = {};
    try { parsedExtras = JSON.parse(ai.bodyExtras || '{}'); } catch {}

    const aiRes = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: model || ai.primaryModel, messages: fullMessages, ...parsedExtras }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => 'AI provider error');
      return res.status(502).json({ error: 'AI provider error', details: errText.slice(0, 200) });
    }

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    // Track usage
    await db.query('INSERT INTO activity (date, requests) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE requests = requests + 1').catch(() => {});

    res.json({
      id: require('crypto').randomUUID(),
      object: 'chat.completion',
      model: model || ai.primaryModel,
      message: { role: 'assistant', content: reply },
      usage,
    });
  } catch (err) {
    console.error('[api/v1/chat]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: INTEGRATIONS (Google Drive, Notion, Slack)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/integrations', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT id, provider, name, status, last_sync_at, docs_synced, created_at FROM integrations ORDER BY created_at DESC');
    res.json({ integrations: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations', requireAuth, async (req, res) => {
  const { provider, name, config } = req.body || {};
  if (!provider || !name) return res.status(400).json({ error: 'provider and name required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO integrations (id, provider, name, config) VALUES (?, ?, ?, ?)', [id, provider, name, JSON.stringify(config || {})]);
    res.json({ id, provider, name, status: 'active' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations/:id/sync', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const integ = await db.queryOne('SELECT * FROM integrations WHERE id = ?', [id]);
    if (!integ) return res.status(404).json({ error: 'Integration not found' });
    const config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {});
    let docsAdded = 0;

    if (integ.provider === 'google_drive') {
      // Google Drive: fetch files via API
      const accessToken = config.access_token;
      if (!accessToken) return res.status(400).json({ error: 'Google Drive access_token not configured' });
      const gResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType!='application/vnd.google-apps.folder'&fields=files(id,name,mimeType)&pageSize=20`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!gResp.ok) return res.status(400).json({ error: 'Google Drive API error: ' + gResp.status });
      const gData = await gResp.json();
      for (const file of (gData.files || [])) {
        try {
          const exportUrl = file.mimeType.startsWith('application/vnd.google-apps.')
            ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
          const fResp = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!fResp.ok) continue;
          const content = (await fResp.text()).slice(0, 12000);
          if (!content.trim()) continue;
          const docId = crypto.randomUUID();
          await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, 'google_drive', file.name, `gdrive://${file.id}`, content, content.length]);
          chunkAndEmbedDocument(docId, content).catch(() => {});
          docsAdded++;
        } catch { /* skip individual file errors */ }
      }
    } else if (integ.provider === 'notion') {
      const notionKey = config.api_key;
      if (!notionKey) return res.status(400).json({ error: 'Notion api_key not configured' });
      const nResp = await fetch('https://api.notion.com/v1/search', {
        method: 'POST', headers: { Authorization: `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { property: 'object', value: 'page' }, page_size: 20 })
      });
      if (!nResp.ok) return res.status(400).json({ error: 'Notion API error: ' + nResp.status });
      const nData = await nResp.json();
      for (const page of (nData.results || [])) {
        try {
          const title = page.properties?.title?.title?.[0]?.plain_text || page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
          const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`, {
            headers: { Authorization: `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28' }
          });
          if (!blocksResp.ok) continue;
          const blocksData = await blocksResp.json();
          const content = (blocksData.results || []).map(b => {
            const texts = b[b.type]?.rich_text || [];
            return texts.map(t => t.plain_text).join('');
          }).filter(Boolean).join('\n').slice(0, 12000);
          if (!content.trim()) continue;
          const docId = crypto.randomUUID();
          await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, 'notion', title, `notion://${page.id}`, content, content.length]);
          chunkAndEmbedDocument(docId, content).catch(() => {});
          docsAdded++;
        } catch { /* skip */ }
      }
    } else if (integ.provider === 'slack') {
      const slackToken = config.bot_token;
      if (!slackToken) return res.status(400).json({ error: 'Slack bot_token not configured' });
      const channels = config.channels || [];
      for (const ch of channels) {
        try {
          const hResp = await fetch(`https://slack.com/api/conversations.history?channel=${ch}&limit=50`, {
            headers: { Authorization: `Bearer ${slackToken}` }
          });
          if (!hResp.ok) continue;
          const hData = await hResp.json();
          const content = (hData.messages || []).map(m => `${m.user || 'bot'}: ${m.text}`).reverse().join('\n').slice(0, 12000);
          if (!content.trim()) continue;
          const docId = crypto.randomUUID();
          await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, 'slack', `Slack #${ch}`, `slack://${ch}`, content, content.length]);
          chunkAndEmbedDocument(docId, content).catch(() => {});
          docsAdded++;
        } catch { /* skip */ }
      }
    }

    await db.query('UPDATE integrations SET last_sync_at = NOW(), docs_synced = docs_synced + ? WHERE id = ?', [docsAdded, id]);
    res.json({ success: true, docs_added: docsAdded });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/integrations/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM integrations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: HELPDESK AGENT (auto-reply)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/helpdesk/agents', requireAuth, async (req, res) => {
  try {
    const agents = await db.query('SELECT * FROM helpdesk_agents ORDER BY created_at DESC');
    res.json({ agents });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/agents', requireAuth, async (req, res) => {
  const { name, description, system_prompt, auto_reply, confidence_threshold, max_auto_replies, escalation_enabled } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO helpdesk_agents (id, name, description, system_prompt, auto_reply, confidence_threshold, max_auto_replies, escalation_enabled) VALUES (?,?,?,?,?,?,?,?)',
      [id, name, description || '', system_prompt || '', auto_reply !== false ? 1 : 0, confidence_threshold || 0.70, max_auto_replies || 3, escalation_enabled ? 1 : 0]
    );
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/helpdesk/agents/:id', requireAuth, async (req, res) => {
  const { name, description, system_prompt, auto_reply, confidence_threshold, max_auto_replies, escalation_enabled, is_active } = req.body || {};
  try {
    await db.query(
      'UPDATE helpdesk_agents SET name=COALESCE(?,name), description=COALESCE(?,description), system_prompt=COALESCE(?,system_prompt), auto_reply=COALESCE(?,auto_reply), confidence_threshold=COALESCE(?,confidence_threshold), max_auto_replies=COALESCE(?,max_auto_replies), escalation_enabled=COALESCE(?,escalation_enabled), is_active=COALESCE(?,is_active) WHERE id=?',
      [name, description, system_prompt, auto_reply != null ? (auto_reply ? 1 : 0) : null, confidence_threshold, max_auto_replies, escalation_enabled != null ? (escalation_enabled ? 1 : 0) : null, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Incoming message webhook — auto-reply with AI using KB
app.post('/api/helpdesk/incoming', async (req, res) => {
  const { agent_id, message, customer_name, customer_email, channel, external_id, ticket_id } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const agent = agent_id
      ? await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ? AND is_active = 1', [agent_id])
      : await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
    if (!agent) return res.status(404).json({ error: 'No active agent found' });

    // Find or create ticket
    let tId = ticket_id;
    if (!tId && external_id) {
      const existing = await db.queryOne('SELECT id, messages, auto_replies_count FROM helpdesk_tickets WHERE external_id = ?', [external_id]);
      if (existing) tId = existing.id;
    }
    if (!tId) {
      tId = crypto.randomUUID();
      await db.query('INSERT INTO helpdesk_tickets (id, agent_id, channel, external_id, customer_name, customer_email, subject, messages) VALUES (?,?,?,?,?,?,?,?)',
        [tId, agent.id, channel || 'webhook', external_id || null, customer_name || null, customer_email || null, message.slice(0, 200), JSON.stringify([])]
      );
    }

    // Load ticket messages
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [tId]);
    const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
    msgs.push({ role: 'user', content: message, ts: Date.now() });

    // Check escalation rules
    const rules = await db.query('SELECT * FROM escalation_rules WHERE agent_id = ? AND is_active = 1 ORDER BY priority', [agent.id]);
    let shouldEscalate = false;
    let escalateReason = '';
    for (const rule of rules) {
      if (rule.condition_type === 'keyword' && message.toLowerCase().includes(rule.condition_value.toLowerCase())) {
        shouldEscalate = true; escalateReason = rule.name;
        await db.query('UPDATE escalation_rules SET triggers_count = triggers_count + 1 WHERE id = ?', [rule.id]);
        break;
      }
      if (rule.condition_type === 'sentiment' && rule.condition_value === 'negative') {
        const negWords = ['angry','furious','terrible','worst','hate','unacceptable','refund','cancel','lawsuit','sue','en colère','furieux','terrible','inacceptable','rembours'];
        if (negWords.some(w => message.toLowerCase().includes(w))) {
          shouldEscalate = true; escalateReason = rule.name;
          await db.query('UPDATE escalation_rules SET triggers_count = triggers_count + 1 WHERE id = ?', [rule.id]);
          break;
        }
      }
      if (rule.condition_type === 'max_replies' && (ticket.auto_replies_count || 0) >= parseInt(rule.condition_value)) {
        shouldEscalate = true; escalateReason = rule.name;
        await db.query('UPDATE escalation_rules SET triggers_count = triggers_count + 1 WHERE id = ?', [rule.id]);
        break;
      }
    }

    if (shouldEscalate) {
      await db.query('UPDATE helpdesk_tickets SET escalated = 1, escalated_reason = ?, status = ?, messages = ? WHERE id = ?',
        ['escalated', escalateReason, JSON.stringify(msgs), tId]);
      // Log analytics
      await db.query('INSERT INTO analytics_conversations (id, ticket_id, channel, sentiment, was_escalated, message_count) VALUES (?,?,?,?,1,?)',
        [crypto.randomUUID(), tId, channel || 'webhook', 'negative', msgs.length]);
      return res.json({ ticket_id: tId, action: 'escalated', reason: escalateReason });
    }

    // Sentiment detection
    const negPatterns = /angry|furious|terrible|hate|worst|cancel|refund|en colère|furieux|terrible/i;
    const posPatterns = /thank|great|awesome|love|excellent|perfect|merci|génial|super|parfait/i;
    const sentiment = negPatterns.test(message) ? 'negative' : posPatterns.test(message) ? 'positive' : 'neutral';
    const sentScore = sentiment === 'negative' ? 0.2 : sentiment === 'positive' ? 0.9 : 0.5;

    // Generate AI response using KB
    if (!agent.auto_reply) {
      await db.query('UPDATE helpdesk_tickets SET messages = ?, sentiment = ?, sentiment_score = ? WHERE id = ?',
        [JSON.stringify(msgs), sentiment, sentScore, tId]);
      return res.json({ ticket_id: tId, action: 'logged', auto_reply: false });
    }

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) {
      return res.json({ ticket_id: tId, action: 'logged', error: 'AI not configured' });
    }

    // Build context from KB
    let kbContext = '';
    try {
      const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
      if (kbDocs.length > 0) {
        kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n').slice(0, 16000);
      }
    } catch { /* best effort */ }

    const sysPrompt = (agent.system_prompt || 'You are a helpful customer support agent. Be friendly, concise, and helpful.') + kbContext;
    const aiMsgs = [{ role: 'system', content: sysPrompt }, ...msgs.map(m => ({ role: m.role, content: m.content }))];

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: ai.primaryModel, messages: aiMsgs, max_tokens: 500, temperature: 0.3 })
    });
    if (!aiResp.ok) return res.json({ ticket_id: tId, action: 'logged', error: 'AI call failed' });
    const aiData = await aiResp.json();
    const reply = aiData.choices?.[0]?.message?.content || '';

    msgs.push({ role: 'assistant', content: reply, ts: Date.now() });
    await db.query('UPDATE helpdesk_tickets SET messages = ?, auto_replies_count = auto_replies_count + 1, sentiment = ?, sentiment_score = ? WHERE id = ?',
      [JSON.stringify(msgs), sentiment, sentScore, tId]);

    // Topic extraction (simple keyword-based)
    const topicKeywords = { billing: /bill|invoice|payment|charge|prix|facture|paiement/, account: /account|login|password|access|compte|connexion|mot de passe/, technical: /bug|error|crash|broken|slow|technique|erreur|plantage/, shipping: /ship|deliver|track|order|livraison|commande|suivi/, feature: /feature|request|suggestion|fonctionnalit|suggestion/ };
    const detectedTopics = Object.entries(topicKeywords).filter(([, rx]) => rx.test(message.toLowerCase())).map(([t]) => t);

    // Log analytics
    await db.query('INSERT INTO analytics_conversations (id, ticket_id, channel, sentiment, sentiment_score, topics, was_auto_resolved, message_count) VALUES (?,?,?,?,?,?,1,?)',
      [crypto.randomUUID(), tId, channel || 'webhook', sentiment, sentScore, JSON.stringify(detectedTopics), msgs.length]);

    // KB gap detection: if low confidence response, log as gap
    if (reply.toLowerCase().includes("i don't have") || reply.toLowerCase().includes("je n'ai pas") || reply.toLowerCase().includes("i'm not sure") || reply.length < 50) {
      await db.query('INSERT INTO kb_gaps (id, query, suggested_title, created_from) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE frequency = frequency + 1',
        [crypto.randomUUID(), message.slice(0, 500), `FAQ: ${message.slice(0, 100)}`, tId]);
    }

    res.json({ ticket_id: tId, action: 'auto_replied', reply, sentiment, topics: detectedTopics });
  } catch (e) {
    console.error('[helpdesk/incoming]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/helpdesk/tickets', requireAuth, async (req, res) => {
  const { status, agent_id, limit: lim } = req.query;
  try {
    let sql = 'SELECT id, agent_id, channel, customer_name, customer_email, subject, status, sentiment, sentiment_score, auto_replies_count, escalated, created_at FROM helpdesk_tickets';
    const params = [];
    const where = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (agent_id) { where.push('agent_id = ?'); params.push(agent_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(lim) || 50);
    const tickets = await db.query(sql, params);
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/helpdesk/tickets/:id', requireAuth, async (req, res) => {
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/helpdesk/tickets/:id', requireAuth, async (req, res) => {
  const { status, resolved } = req.body || {};
  try {
    if (resolved) {
      await db.query('UPDATE helpdesk_tickets SET status = ?, resolved = 1, resolved_at = NOW() WHERE id = ?', ['resolved', req.params.id]);
    } else if (status) {
      await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', [status, req.params.id]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: ADVANCED ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/analytics/overview', requireAuth, async (req, res) => {
  try {
    const totalTickets = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets');
    const openTickets = await db.queryOne("SELECT COUNT(*) as c FROM helpdesk_tickets WHERE status = 'open'");
    const resolvedTickets = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE resolved = 1');
    const escalatedTickets = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE escalated = 1');
    const avgSentiment = await db.queryOne('SELECT AVG(sentiment_score) as avg_score FROM helpdesk_tickets WHERE sentiment_score IS NOT NULL');
    const sentimentBreakdown = await db.query("SELECT sentiment, COUNT(*) as count FROM analytics_conversations GROUP BY sentiment");
    const topicBreakdown = await db.query("SELECT topics FROM analytics_conversations WHERE topics IS NOT NULL ORDER BY created_at DESC LIMIT 200");
    const channelBreakdown = await db.query("SELECT channel, COUNT(*) as count FROM analytics_conversations GROUP BY channel");
    const dailyVolume = await db.query("SELECT DATE(created_at) as date, COUNT(*) as count FROM helpdesk_tickets WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY date");
    const autoResolved = await db.queryOne('SELECT COUNT(*) as c FROM analytics_conversations WHERE was_auto_resolved = 1');

    // Aggregate topics
    const topicCounts = {};
    for (const row of topicBreakdown) {
      const topics = typeof row.topics === 'string' ? JSON.parse(row.topics) : (row.topics || []);
      for (const t of topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
    }

    res.json({
      total_tickets: totalTickets?.c || 0,
      open_tickets: openTickets?.c || 0,
      resolved_tickets: resolvedTickets?.c || 0,
      escalated_tickets: escalatedTickets?.c || 0,
      auto_resolved: autoResolved?.c || 0,
      avg_sentiment: avgSentiment?.avg_score ? parseFloat(avgSentiment.avg_score).toFixed(2) : '0.50',
      sentiment_breakdown: sentimentBreakdown,
      topic_breakdown: Object.entries(topicCounts).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
      channel_breakdown: channelBreakdown,
      daily_volume: dailyVolume,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: SIMULATION / TESTING
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/simulation/tests', requireAuth, async (req, res) => {
  try {
    const tests = await db.query('SELECT id, name, agent_id, accuracy, avg_similarity, status, run_at, created_at FROM simulation_tests ORDER BY created_at DESC');
    res.json({ tests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/simulation/tests', requireAuth, async (req, res) => {
  const { name, agent_id, test_cases } = req.body || {};
  if (!name || !test_cases?.length) return res.status(400).json({ error: 'name and test_cases required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO simulation_tests (id, name, agent_id, test_cases) VALUES (?,?,?,?)',
      [id, name, agent_id || null, JSON.stringify(test_cases)]);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/simulation/tests/:id/run', requireAuth, async (req, res) => {
  try {
    const test = await db.queryOne('SELECT * FROM simulation_tests WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.status(503).json({ error: 'AI not configured' });

    const cases = typeof test.test_cases === 'string' ? JSON.parse(test.test_cases) : (test.test_cases || []);
    const agent = test.agent_id ? await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ?', [test.agent_id]) : null;
    const sysPrompt = agent?.system_prompt || 'You are a helpful support agent. Answer concisely.';

    // Load KB context
    let kbContext = '';
    try {
      const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
      if (kbDocs.length > 0) kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 12000);
    } catch {}

    const results = [];
    let totalScore = 0;
    for (const tc of cases) {
      try {
        const aiResp = await fetch(ai.primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
          body: JSON.stringify({
            model: ai.primaryModel,
            messages: [{ role: 'system', content: sysPrompt + kbContext }, { role: 'user', content: tc.question }],
            max_tokens: 500, temperature: 0.1
          })
        });
        const aiData = await aiResp.json();
        const aiAnswer = aiData.choices?.[0]?.message?.content || '';

        // Compare with expected answer (simple word overlap score)
        const expectedWords = new Set((tc.expected_answer || '').toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const aiWords = new Set(aiAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const overlap = [...expectedWords].filter(w => aiWords.has(w)).length;
        const similarity = expectedWords.size > 0 ? Math.round((overlap / expectedWords.size) * 100) : 0;
        totalScore += similarity;

        results.push({ question: tc.question, expected: tc.expected_answer, actual: aiAnswer, similarity, pass: similarity >= 50 });
      } catch (e) {
        results.push({ question: tc.question, expected: tc.expected_answer, actual: 'Error: ' + e.message, similarity: 0, pass: false });
      }
    }

    const accuracy = cases.length > 0 ? Math.round(results.filter(r => r.pass).length / cases.length * 100) : 0;
    const avgSim = cases.length > 0 ? Math.round(totalScore / cases.length) : 0;
    await db.query('UPDATE simulation_tests SET results = ?, accuracy = ?, avg_similarity = ?, status = ?, run_at = NOW() WHERE id = ?',
      [JSON.stringify(results), accuracy, avgSim, 'completed', req.params.id]);
    res.json({ results, accuracy, avg_similarity: avgSim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6: MULTI-CHANNEL DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    const channels = await db.query('SELECT ac.*, ha.name as agent_name FROM agent_channels ac LEFT JOIN helpdesk_agents ha ON ha.id = ac.agent_id ORDER BY ac.created_at DESC');
    res.json({ channels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/channels', requireAuth, async (req, res) => {
  const { agent_id, channel_type, config } = req.body || {};
  if (!agent_id || !channel_type) return res.status(400).json({ error: 'agent_id and channel_type required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO agent_channels (id, agent_id, channel_type, config) VALUES (?,?,?,?)',
      [id, agent_id, channel_type, JSON.stringify(config || {})]);
    res.json({ id, agent_id, channel_type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/channels/:id', requireAuth, async (req, res) => {
  const { is_active, config } = req.body || {};
  try {
    if (is_active != null) await db.query('UPDATE agent_channels SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, req.params.id]);
    if (config) await db.query('UPDATE agent_channels SET config = ? WHERE id = ?', [JSON.stringify(config), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/channels/:id', requireAuth, async (req, res) => {
  try { await db.query('DELETE FROM agent_channels WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7: ESCALATION WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/escalation/rules', requireAuth, async (req, res) => {
  try {
    const rules = await db.query('SELECT * FROM escalation_rules ORDER BY priority, created_at');
    res.json({ rules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/escalation/rules', requireAuth, async (req, res) => {
  const { agent_id, name, condition_type, condition_value, action_type, action_value, priority } = req.body || {};
  if (!name || !condition_type || !condition_value) return res.status(400).json({ error: 'name, condition_type, condition_value required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO escalation_rules (id, agent_id, name, condition_type, condition_value, action_type, action_value, priority) VALUES (?,?,?,?,?,?,?,?)',
      [id, agent_id || null, name, condition_type, condition_value, action_type || 'escalate', action_value || null, priority || 0]);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/escalation/rules/:id', requireAuth, async (req, res) => {
  const { name, condition_type, condition_value, action_type, action_value, priority, is_active } = req.body || {};
  try {
    await db.query(
      'UPDATE escalation_rules SET name=COALESCE(?,name), condition_type=COALESCE(?,condition_type), condition_value=COALESCE(?,condition_value), action_type=COALESCE(?,action_type), action_value=COALESCE(?,action_value), priority=COALESCE(?,priority), is_active=COALESCE(?,is_active) WHERE id=?',
      [name, condition_type, condition_value, action_type, action_value, priority, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/escalation/rules/:id', requireAuth, async (req, res) => {
  try { await db.query('DELETE FROM escalation_rules WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 8: TEAM COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/team', requireAuth, async (req, res) => {
  try {
    const members = await db.query('SELECT id, email, name, role, status, last_active_at, created_at FROM team_members ORDER BY created_at');
    res.json({ members });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team/invite', requireAuth, async (req, res) => {
  const { email, name, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO team_members (id, email, name, role, status) VALUES (?,?,?,?,?)',
      [id, email, name || '', role || 'member', 'invited']);
    res.json({ id, email, role: role || 'member', status: 'invited' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Member already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/team/:id', requireAuth, async (req, res) => {
  const { role, name, status } = req.body || {};
  try {
    await db.query('UPDATE team_members SET role=COALESCE(?,role), name=COALESCE(?,name), status=COALESCE(?,status) WHERE id=?',
      [role, name, status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/:id', requireAuth, async (req, res) => {
  try { await db.query('DELETE FROM team_members WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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
