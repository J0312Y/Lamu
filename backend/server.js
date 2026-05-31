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

const http = require('http');
const { Server: SocketServer } = require('socket.io');

const WEBAPP_JWT_SECRET = process.env.WEBAPP_JWT_SECRET || 'lamu-webapp-change-me-in-prod';
const app = express();
const httpServer = http.createServer(app);

// ─── Socket.io — real-time notifications ─────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/ws',
});

io.on('connection', (socket) => {
  const room = socket.handshake.query.room || 'admin';
  socket.join(room);
  socket.on('disconnect', () => {});
});

// Broadcast helper — call from any endpoint to push real-time events
function emitEvent(event, data, room = 'admin') {
  io.to(room).emit(event, { ...data, timestamp: new Date().toISOString() });
}

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
//
// Multi-provider routing via OpenRouter (1 API key → all providers)
// Models are assigned per use case for optimal cost/speed/quality balance:
//   - realtime:   fastest model (meetings, live coaching)
//   - helpdesk:   balanced quality/speed (ticket suggestions)
//   - chat:       cost-effective (general conversation)
//   - reasoning:  highest quality (complex analysis, coding)
//   - embeddings: vector generation (RAG pipeline)

const AI_MODELS = {
  realtime:   process.env.MODEL_REALTIME   || 'meta-llama/llama-4-scout',
  helpdesk:   process.env.MODEL_HELPDESK   || 'openai/gpt-4.1-mini',
  chat:       process.env.MODEL_CHAT       || 'google/gemini-2.5-flash',
  reasoning:  process.env.MODEL_REASONING  || 'anthropic/claude-sonnet-4.6',
  embeddings: process.env.MODEL_EMBEDDINGS || 'openai/text-embedding-3-small',
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';

let _aiConfigCache = null;
let _aiConfigCacheTs = 0;

async function getAiConfig() {
  if (_aiConfigCache && Date.now() - _aiConfigCacheTs < 30000) return _aiConfigCache;
  try {
    const rows = await db.query(
      "SELECT `key`, value FROM settings WHERE `key` IN ('ai_primary_url','ai_primary_key','ai_primary_model','ai_fallback_url','ai_fallback_key','ai_fallback_model','ai_fallback_enabled','ai_body_extras','ai_model_realtime','ai_model_helpdesk','ai_model_chat','ai_model_reasoning','ai_model_embeddings')"
    );
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    const fallbackOn = s.ai_fallback_enabled === '1';
    _aiConfigCache = {
      primaryUrl:    s.ai_primary_url    || process.env.AI_CHAT_URL     || OPENROUTER_URL,
      primaryKey:    s.ai_primary_key    || process.env.AI_CHAT_API_KEY || '',
      primaryModel:  s.ai_primary_model  || process.env.AI_MODEL        || AI_MODELS.chat,
      fallbackUrl:   fallbackOn ? (s.ai_fallback_url   || process.env.AI_FALLBACK_URL   || '') : '',
      fallbackKey:   fallbackOn ? (s.ai_fallback_key   || process.env.AI_FALLBACK_KEY   || '') : '',
      fallbackModel: fallbackOn ? (s.ai_fallback_model || process.env.AI_FALLBACK_MODEL || AI_MODELS.chat) : '',
      bodyExtras:    s.ai_body_extras    || process.env.AI_BODY_EXTRAS  || '{}',
      // Per use-case model overrides (DB settings > env > defaults)
      models: {
        realtime:   s.ai_model_realtime   || AI_MODELS.realtime,
        helpdesk:   s.ai_model_helpdesk   || AI_MODELS.helpdesk,
        chat:       s.ai_model_chat       || AI_MODELS.chat,
        reasoning:  s.ai_model_reasoning  || AI_MODELS.reasoning,
        embeddings: s.ai_model_embeddings || AI_MODELS.embeddings,
      },
    };
  } catch {
    _aiConfigCache = {
      primaryUrl:    process.env.AI_CHAT_URL     || OPENROUTER_URL,
      primaryKey:    process.env.AI_CHAT_API_KEY || '',
      primaryModel:  process.env.AI_MODEL        || AI_MODELS.chat,
      fallbackUrl:   process.env.AI_FALLBACK_URL   || '',
      fallbackKey:   process.env.AI_FALLBACK_KEY   || '',
      fallbackModel: process.env.AI_FALLBACK_MODEL || AI_MODELS.chat,
      bodyExtras:    process.env.AI_BODY_EXTRAS  || '{}',
      models: { ...AI_MODELS },
    };
  }
  _aiConfigCacheTs = Date.now();
  return _aiConfigCache;
}

function invalidateAiConfigCache() { _aiConfigCache = null; }

// Select the right model for a given use case
function getModelForUseCase(ai, useCase) {
  return ai.models?.[useCase] || ai.primaryModel;
}

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
      provider: s.embedding_provider || process.env.EMBEDDING_PROVIDER || 'openrouter',
      apiKey:   s.embedding_api_key  || process.env.EMBEDDING_API_KEY  || process.env.AI_CHAT_API_KEY || '',
      model:    s.embedding_model    || process.env.EMBEDDING_MODEL    || AI_MODELS.embeddings,
      url:      s.embedding_url      || process.env.EMBEDDING_URL      || OPENROUTER_EMBED_URL,
    };
  } catch {
    _embedConfigCache = {
      provider: process.env.EMBEDDING_PROVIDER || 'openrouter',
      apiKey:   process.env.EMBEDDING_API_KEY  || process.env.AI_CHAT_API_KEY || '',
      model:    process.env.EMBEDDING_MODEL    || AI_MODELS.embeddings,
      url:      process.env.EMBEDDING_URL      || OPENROUTER_EMBED_URL,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Webapp-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_ACCESS_KEY = process.env.API_ACCESS_KEY || '';
let _dbReady = false;

function requireDb(req, res, next) {
  if (!_dbReady) return res.status(503).json({ error: 'Database not connected. Check DB_HOST/DB_USER/DB_PASSWORD in .env' });
  next();
}

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
    // Multi-provider model routing (per use case)
    models: ai.models || {},
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
app.get('/api/kb/gaps', requireAuth, requireDb, async (req, res) => {
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
        model: getModelForUseCase(ai, 'helpdesk'),
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

  const { messages = [], model, system, kbIds, userName, useCase } = req.body || {};

  // Build Lamu identity system prompt
  const userGreeting = userName ? `The user's name is ${userName}. Address them by their first name naturally. / Le nom de l'utilisateur est ${userName}.` : '';
  const lamuIdentity = `Tu es Lamu, un assistant IA intelligent et polyvalent.

## RÈGLE ABSOLUE DE LANGUE
Détecte la langue du message de l'utilisateur. Si l'utilisateur écrit en français, tu DOIS répondre ENTIÈREMENT en français correct — pas de mélange avec l'anglais, pas de mots anglais, pas de phrases incomplètes. Si l'utilisateur écrit en anglais, réponds en anglais. Ne mélange JAMAIS les langues.

## Identité
- Tu t'appelles Lamu, tu es un assistant IA personnel.
- Tu combines l'IA conversationnelle avec une base de connaissances personnalisée.
- Les utilisateurs peuvent uploader des documents, et tu utilises ces connaissances pour fournir des réponses précises et contextuelles.
- Ne mentionne JAMAIS le nom de ton créateur, de l'entreprise ou de la technologie derrière toi. Tu es simplement "Lamu".

## Style de réponse — OBLIGATOIRE
- Sois amical, concis et utile. Va droit au but.
- Réponds en texte simple et naturel, comme dans une conversation humaine.
- N'utilise PAS de markdown (pas de **, ##, ###, >, - listes à puces, etc.).
- N'utilise PAS d'emojis sauf si l'utilisateur en utilise lui-même.
- Pas de titres, pas de sections, pas de listes numérotées sauf si explicitement demandé.
- Écris des paragraphes courts et lisibles.
- Quand tu utilises des documents de la base de connaissances, cite tes sources entre crochets [Nom du Document].

## Qualité du texte — CRITIQUE
- Chaque phrase DOIT être complète, grammaticalement correcte, avec tous les mots et espaces.
- Ne fusionne JAMAIS deux mots ensemble. Vérifie que chaque mot est séparé par un espace.
- Ne coupe pas les phrases, ne saute pas de mots.
- Ne liste JAMAIS tes capacités ou compétences sauf si on te le demande explicitement. Par exemple, si on te dit "aide-moi à coder", ne liste pas les langages que tu connais — demande simplement sur quoi tu peux aider.
- Ne commence pas tes réponses par "Bien sûr !" ou "Oui, bien sûr !". Réponds directement et naturellement.
- Ne répète pas le nom de l'utilisateur dans chaque phrase. Utilise-le une fois au début si pertinent, pas plus.

## CONNAISSANCE COMPLÈTE DE LA PLATEFORME LAMU
Tu connais parfaitement toutes les fonctionnalités de Lamu. Quand un utilisateur te demande comment faire quelque chose, explique-lui étape par étape de façon simple et claire.

### WebApp (accessible via navigateur)
ACCUEIL / ONBOARDING :
- L'onboarding guide les nouveaux utilisateurs en 3 étapes : connecter une source de connaissances, tester le chat, configurer le prompt système.
- Les actions rapides sur l'accueil permettent de démarrer un chat, gérer la base de connaissances, accéder aux paramètres.

CONVERSATIONS :
- L'utilisateur chatte directement avec toi. Le modèle IA est géré automatiquement par l'administrateur — l'utilisateur n'a pas besoin de s'en soucier.
- Il peut définir un prompt système personnalisé dans les Paramètres pour adapter ton comportement.
- Les conversations sont sauvegardées localement et accessibles dans la sidebar sous "Chats récents".

BASE DE CONNAISSANCES :
- Accessible depuis "Connaissances" dans le menu.
- L'utilisateur peut ajouter des documents de 4 façons : coller une URL, uploader un PDF, saisir du texte brut, ou crawler un site web entier.
- Les documents sont indexés automatiquement et utilisés pour enrichir les réponses IA (RAG).
- La section "Lacunes KB" détecte automatiquement les questions fréquentes auxquelles la base ne peut pas répondre.
- "Auto-Sync KB" permet de re-synchroniser les sources automatiquement à intervalle régulier.

INTÉGRATIONS :
- Connecter des services externes : Google Drive, Slack, GitHub (OAuth), ou Notion, GitLab, Zendesk, HubSpot, Freshdesk, Intercom, Confluence, Shopify, WooCommerce (par clé API).
- Chaque intégration peut être synchronisée manuellement pour importer les documents dans la KB.

HELPDESK IA :
- Système complet de gestion de tickets de support.
- Les tickets arrivent par email, widget chatbot, ou API.
- Lamu peut suggérer des réponses automatiquement basées sur la base de connaissances.
- Fonctionnalités : assignation, priorité (low/medium/high/urgent), tags, statut (open/resolved/closed), SLA.
- Actions en masse : sélectionner plusieurs tickets et appliquer une action (fermer, résoudre, assigner, catégoriser par IA).
- Recherche de tickets par mots-clés.

CANAUX :
- Configurer les canaux de réception des tickets : email entrant, widget, API.
- Chaque canal peut être assigné à un agent IA spécifique.

ESCALADE :
- Définir des règles d'escalade : quand un ticket contient certains mots-clés ou dépasse un seuil de sentiment négatif, il est automatiquement escaladé.

CSAT / NPS :
- Envoyer des enquêtes de satisfaction après résolution d'un ticket.
- Voir les scores CSAT et NPS en temps réel.

WORKFLOWS :
- Créer des automatisations : si condition X se produit (nouveau ticket, mot-clé, priorité haute), alors action Y (assigner, changer priorité, notifier, répondre automatiquement).

WIDGET CHATBOT :
- Accessible depuis "Widget" en bas du menu.
- Créer des agents IA personnalisés avec nom, prompt système, message d'accueil, couleur.
- Chaque agent génère un snippet HTML à copier-coller sur n'importe quel site web.
- Le widget apparaît en bas à droite du site et permet aux visiteurs de chatter avec l'agent IA.

ANALYTIQUES :
- Tableau de bord avec statistiques : nombre de requêtes par jour, tokens utilisés, temps de réponse.
- "Dashboards personnalisés" permet de créer ses propres vues de données.

A/B TESTS :
- Tester plusieurs prompts système en parallèle pour voir lequel donne les meilleures réponses.

SIMULATION :
- Simuler des conversations pour tester le comportement de l'agent avant déploiement.

ACTIONS IA :
- Déclencher des actions automatiques basées sur les réponses IA (envoyer un email, créer un ticket, notifier).

ÉQUIPE :
- Inviter des membres par email avec rôles : Membre, Éditeur, Admin.
- Chaque membre a ses propres permissions d'accès.

ARCHIVES :
- Retrouver les conversations et tickets archivés.

PARAMÈTRES :
- Définir le prompt système global.
- Configurer les préférences de l'agent.

PROFIL :
- Voir son plan actuel, les messages utilisés/restants.
- Gérer son compte.

TARIFS :
- Voir les différents plans disponibles et upgrader.

### Application Desktop (Tauri)
L'app desktop est un overlay flottant invisible au partage d'écran, conçu pour assister en temps réel pendant les réunions.

OVERLAY PRINCIPAL :
- Fenêtre flottante transparente qui reste au-dessus des autres applications.
- Invisible lors du partage d'écran (les participants de la réunion ne la voient pas).
- Déplaçable par glisser-déposer.

CAPTURE AUDIO :
- Capture le micro de l'utilisateur avec détection automatique de la voix (VAD).
- Transcrit automatiquement la parole en texte (STT via Whisper).
- Le raccourci Ctrl+Shift+. active/désactive le micro.

MODE RÉUNION :
- Active automatiquement le VAD (détection vocale) pour une assistance continue.
- Lamu écoute la conversation, transcrit, et fournit des réponses en temps réel.
- Redémarre automatiquement l'écoute après chaque réponse IA.
- Indicateur "Listening..." avec durée et point vert pulsant.

CAPTURE D'ÉCRAN :
- Au début de chaque prise de parole, une capture d'écran est envoyée à l'IA pour contexte visuel.

MODES SPÉCIALISÉS :
- Interview : optimisé pour les entretiens d'embauche, avec scoring par question.
- Coding : aide en temps réel pendant le code, comprend le contexte écran.
- Sales : assistant de vente, avec playbook et coaching.
- General : usage polyvalent.

SYNTHÈSE VOCALE (TTS) :
- Bouton "Speak" sur chaque réponse pour l'écouter à voix haute.
- Mode auto-speak en mode réunion pour lire automatiquement les réponses.

PLAYBOOK :
- Charger un script ou des notes avant une réunion.
- Le playbook est passé en contexte IA pendant toute la réunion.

COACHING EN TEMPS RÉEL :
- Pendant une réunion, demander un conseil de coaching basé sur la conversation en cours.

RÉSUMÉ DE RÉUNION :
- À la fin d'une réunion, générer un résumé complet avec les points clés, décisions et actions à suivre.
- Le résumé est sauvegardé dans la base de connaissances.

CLIPBOARD :
- Bouton "Paste" pour coller du texte du presse-papiers comme contexte unique pour la prochaine question.

EXPORT :
- Exporter toute la conversation au format Markdown (.md).

RACCOURCIS CLAVIER :
- Ctrl+Shift+. : activer/désactiver le micro
- Ctrl+Shift+C : copier la dernière réponse IA

SIMULATEUR D'ENTRETIEN :
- Page dédiée avec types : behavioral, technical, system-design, coding.
- Questions générées par l'IA, scoring par critère (clarity, relevance, structure, 0-10).

GÉNÉRATEUR CV :
- Créer un CV et une lettre de motivation par prompt IA.
- Export Markdown, bilingue français/anglais.

EMAIL VOCAL :
- Dicter un email par la voix, Lamu le rédige.
- Autocomplete des contacts, envoi par SMTP.

BASE DE CONNAISSANCES (dans l'app) :
- Même système RAG que le WebApp : upload, URL, chunking sémantique, re-ranking hybride.
- Panel de debug avec scores de pertinence.

CONTACTS :
- Synchronisation Outlook via PowerShell.
- Base de contacts SQLite avec recherche floue.

DÉTECTION DE RÉUNION :
- Détecte automatiquement Zoom, Teams, Google Meet, OBS, Discord et propose d'activer le mode réunion.

### Site Web Lamu (vitrine publique)
Le site web est la vitrine publique de Lamu, accessible à tous sans connexion.

PAGE D'ACCUEIL (/) :
- Présentation générale de Lamu : ce que c'est, ce que ça fait, les avantages.
- Démonstration visuelle de l'interface.
- Appels à l'action pour télécharger l'app ou essayer le WebApp.

TÉLÉCHARGEMENTS (/downloads) :
- Liens de téléchargement de l'application desktop Lamu pour Windows, macOS et Linux.
- Instructions d'installation pour chaque plateforme.

TARIFS (/pricing) :
- Présentation des différents plans (gratuit, pro, business, etc.).
- Comparaison des fonctionnalités incluses dans chaque plan.
- Boutons pour s'abonner ou upgrader.

PROGRAMME D'AFFILIATION (/affiliate) :
- Comment devenir affilié Lamu et gagner des commissions en recommandant la plateforme.
- Conditions du programme et inscription.

CHANGELOG (/changelog) :
- Historique de toutes les mises à jour et nouvelles fonctionnalités ajoutées à Lamu.
- Organisé par version et par date.

RELEASES (/releases) :
- Versions téléchargeables de l'application desktop avec notes de version détaillées.

PROMOUVOIR (/promote) :
- Ressources marketing pour les partenaires et affiliés.

STATUT (/status) :
- État en temps réel des services Lamu (backend, API, WebApp).
- Permet de vérifier si un service est en panne ou opérationnel.

RÉCUPÉRATION (/recover) :
- Récupérer sa licence ou son accès si on a perdu ses identifiants.
- Entrer son email pour recevoir sa clé de licence.

CONTACT (/contact) :
- Formulaire de contact pour joindre l'équipe Lamu.
- Support technique, questions commerciales, partenariats.

MENTIONS LÉGALES (/legal) :
- Politique de confidentialité, conditions d'utilisation, mentions légales RGPD.

WEBAPP (/app) :
- Accès direct au WebApp Lamu sans télécharger l'application desktop.
- Connexion par email avec code OTP (pas de mot de passe).
- Toutes les fonctionnalités du WebApp décrites ci-dessus.

CONVERSATIONS PARTAGÉES (/shared/:id) :
- Lien public pour partager une conversation avec quelqu'un d'autre.
- La personne peut voir la conversation sans être connectée.
${userGreeting}`;

  // Auto-detect language from last user message and inject multi-lang prompt
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const detectedLang = lastUserMsg ? detectLanguage(lastUserMsg.content) : 'en';
  const langPrompt = multiLangSystemPrompt(detectedLang);

  // Merge: Lamu identity + user custom system prompt + multi-lang
  let systemContent = system ? `${lamuIdentity}${langPrompt}\n\n## Additional instructions\n${system}` : `${lamuIdentity}${langPrompt}`;

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
      body: JSON.stringify({ model: model || getModelForUseCase(ai, useCase || 'chat'), messages: fullMessages, stream: true, ...parsedExtras }),
    }).catch(() => null);

    if (!aiRes || !aiRes.ok) {
      if (ai.fallbackUrl && ai.fallbackKey) {
        console.warn(`[/api/chat] Primary provider failed, trying fallback (${ai.fallbackUrl})`);
        send({ delta: '*[Using fallback provider]*\n\n' });
        aiRes = await fetch(ai.fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.fallbackKey}` },
          body: JSON.stringify({ model: model || getModelForUseCase(ai, useCase || 'chat'), messages: fullMessages, stream: true, ...parsedExtras }),
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
  // Add whatsapp_phone column if missing (for WhatsApp bot client identification)
  try { await db.query("ALTER TABLE licenses ADD COLUMN whatsapp_phone VARCHAR(30) NULL"); } catch {}
  try { await db.query("CREATE INDEX idx_wa_phone ON licenses (whatsapp_phone)"); } catch {}

  // Ensure plans table has all needed columns (safe ALTERs)
  const planCols = [
    ['description', 'TEXT'],
    ['price', 'DECIMAL(10,2) DEFAULT 0'],
    ['currency', "VARCHAR(10) DEFAULT 'XAF'"],
    ['billing_period', "VARCHAR(20) DEFAULT 'mois'"],
    ['color', 'VARCHAR(20)'],
    ['sort_order', 'INT DEFAULT 0'],
    ['is_active', 'TINYINT(1) DEFAULT 1'],
  ];
  for (const [col, def] of planCols) {
    try { await db.query(`ALTER TABLE plans ADD COLUMN ${col} ${def}`); } catch {}
  }

  // Insert default plans if not present
  await db.query(`
    INSERT IGNORE INTO plans (id, name, features, description, price, currency, billing_period, color, sort_order, is_active, max_requests) VALUES
      ('trial', 'Essai Gratuit', '["chat","knowledge_base"]',                                                                       '20 messages gratuits pour découvrir Lamu', 0,     'XAF', 'mois', '#22c55e', 0, 1, 20),
      ('basic', 'Basic',         '["chat","knowledge_base","meeting_mode"]',                                                          'Pour les particuliers et freelances',      2500,  'XAF', 'mois', '#6366f1', 1, 1, 500),
      ('pro',   'Pro',           '["chat","knowledge_base","meeting_mode","helpdesk","analytics","integrations","team"]',              'Pour les équipes et petites entreprises',  7500,  'XAF', 'mois', '#8b5cf6', 2, 1, 5000),
      ('dev',   'Entreprise',    '["chat","knowledge_base","meeting_mode","helpdesk","analytics","integrations","team","simulation"]', 'Solution complète sur mesure',             25000, 'XAF', 'mois', '#f59e0b', 3, 1, NULL)
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

// ── Helpdesk + SaaS tables ────────────────────────────────────────────────────

async function ensureHelpdeskAgentsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS helpdesk_agents (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      system_prompt TEXT,
      auto_reply TINYINT(1) DEFAULT 1,
      confidence_threshold FLOAT DEFAULT 0.70,
      max_auto_replies INT DEFAULT 3,
      escalation_enabled TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureHelpdeskTicketsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS helpdesk_tickets (
      id VARCHAR(100) PRIMARY KEY,
      agent_id VARCHAR(100),
      channel VARCHAR(50) DEFAULT 'webhook',
      external_id VARCHAR(200),
      customer_name VARCHAR(200),
      customer_email VARCHAR(255),
      subject VARCHAR(500),
      messages JSON,
      auto_replies_count INT DEFAULT 0,
      sentiment VARCHAR(20) DEFAULT 'neutral',
      sentiment_score FLOAT DEFAULT 0.5,
      escalated TINYINT(1) DEFAULT 0,
      escalated_reason VARCHAR(500),
      status VARCHAR(20) DEFAULT 'open',
      resolved TINYINT(1) DEFAULT 0,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_agent (agent_id),
      INDEX idx_status (status)
    )
  `);
}

async function ensureEscalationTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS escalation_rules (
      id VARCHAR(100) PRIMARY KEY,
      agent_id VARCHAR(100),
      name VARCHAR(200) NOT NULL,
      condition_type VARCHAR(50) DEFAULT 'keyword',
      condition_value VARCHAR(500),
      action_type VARCHAR(50) DEFAULT 'escalate',
      action_value VARCHAR(500),
      priority INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      triggers_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureChannelsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_channels (
      id VARCHAR(100) PRIMARY KEY,
      agent_id VARCHAR(100) NOT NULL,
      channel_type VARCHAR(50) NOT NULL,
      config JSON,
      is_active TINYINT(1) DEFAULT 1,
      messages_handled INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_agent (agent_id)
    )
  `);
}

async function ensureAnalyticsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS analytics_conversations (
      id VARCHAR(100) PRIMARY KEY,
      ticket_id VARCHAR(100),
      channel VARCHAR(50),
      sentiment VARCHAR(20) DEFAULT 'neutral',
      sentiment_score FLOAT,
      was_escalated TINYINT(1) DEFAULT 0,
      was_auto_resolved TINYINT(1) DEFAULT 0,
      message_count INT DEFAULT 0,
      topics JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id)
    )
  `);
}

async function ensureTeamTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id VARCHAR(100) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(200),
      role VARCHAR(50) DEFAULT 'member',
      status VARCHAR(50) DEFAULT 'invited',
      last_active_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    )
  `);
}

async function ensureSimulationTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS simulation_tests (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      agent_id VARCHAR(100),
      test_cases JSON,
      results JSON,
      accuracy INT DEFAULT 0,
      avg_similarity INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      run_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureKbGapsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS kb_gaps (
      id VARCHAR(100) PRIMARY KEY,
      query TEXT,
      suggested_title VARCHAR(500),
      suggested_content TEXT,
      created_from VARCHAR(100),
      status VARCHAR(50) DEFAULT 'pending',
      frequency INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureIntegrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS integrations (
      id VARCHAR(100) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      name VARCHAR(200) NOT NULL,
      config JSON,
      status VARCHAR(20) DEFAULT 'active',
      last_sync_at TIMESTAMP NULL,
      docs_synced INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_provider (provider)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id VARCHAR(100) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      user_email VARCHAR(255) DEFAULT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type VARCHAR(50) DEFAULT 'Bearer',
      expires_at TIMESTAMP NULL,
      scope TEXT,
      raw_response JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_provider_user (provider, user_email)
    )
  `);
  // Migrate existing DBs: add user_email column + drop old unique index
  try { await db.query("ALTER TABLE oauth_tokens ADD COLUMN user_email VARCHAR(255) DEFAULT NULL"); } catch {}
  try { await db.query("ALTER TABLE oauth_tokens DROP INDEX idx_provider"); } catch {}
  try { await db.query("ALTER TABLE oauth_tokens ADD UNIQUE INDEX idx_provider_user (provider, user_email)"); } catch {}
}

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
        position VARCHAR(20) DEFAULT 'bottom-right',
        avatar_url VARCHAR(500) DEFAULT '',
        header_text VARCHAR(200) DEFAULT '',
        placeholder_text VARCHAR(200) DEFAULT 'Tapez votre message...',
        bubble_icon VARCHAR(20) DEFAULT 'chat',
        auto_open_delay INT DEFAULT 0,
        show_branding TINYINT(1) DEFAULT 1,
        custom_css TEXT,
        allowed_origins TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (user_email)
      )
    `);
    // Add new columns for existing DBs (idempotent — MySQL ignores if column exists)
    const newCols = [
      "ADD COLUMN position VARCHAR(20) DEFAULT 'bottom-right'",
      "ADD COLUMN avatar_url VARCHAR(500) DEFAULT ''",
      "ADD COLUMN header_text VARCHAR(200) DEFAULT ''",
      "ADD COLUMN placeholder_text VARCHAR(200) DEFAULT 'Tapez votre message...'",
      "ADD COLUMN bubble_icon VARCHAR(20) DEFAULT 'chat'",
      "ADD COLUMN auto_open_delay INT DEFAULT 0",
      "ADD COLUMN show_branding TINYINT(1) DEFAULT 1",
      "ADD COLUMN custom_css TEXT",
    ];
    for (const col of newCols) {
      try { await db.query(`ALTER TABLE widget_agents ${col}`); } catch {}
    }
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

    // ── Trial user — check if they've been upgraded to a license ──
    if (decoded.trial) {
      // Check if user now has an active license (post-upgrade)
      const upgradedLicense = await db.queryOne(
        `SELECT l.license_key, l.customer_name, l.plan, l.max_requests, l.expires_at, p.name as plan_name, p.features as plan_features
         FROM licenses l LEFT JOIN plans p ON p.id = l.plan
         WHERE LOWER(l.customer_email) = LOWER(?) AND l.is_active = 1
         ORDER BY l.created_at DESC LIMIT 1`,
        [decoded.email]
      );
      if (upgradedLicense) {
        return res.json({
          valid: true,
          user: {
            email: decoded.email,
            name: upgradedLicense.customer_name || null,
            plan: upgradedLicense.plan,
            plan_name: upgradedLicense.plan_name || upgradedLicense.plan,
            features: parseFeaturesSafe(upgradedLicense.plan_features),
            max_requests: upgradedLicense.max_requests,
            expires_at: upgradedLicense.expires_at || null,
            trial: false,
          },
        });
      }

      const trial = await db.queryOne('SELECT * FROM webapp_trials WHERE email = ?', [decoded.email]);
      if (!trial) return res.json({ valid: false, error: 'Trial not found' });
      const remaining = Math.max(0, (trial.max_messages || WEBAPP_FREE_MESSAGES) - (trial.messages_used || 0));
      return res.json({
        valid: true,
        user: {
          email: decoded.email,
          name: trial.name || null,
          plan: 'free_trial',
          plan_name: 'Essai Gratuit',
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
       WHERE c.user_email = ? AND c.source = 'webapp' AND (c.archived IS NULL OR c.archived = 0)
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
  const { name, system_prompt, welcome_message, color, position, avatar_url, header_text, placeholder_text, bubble_icon, auto_open_delay, show_branding, custom_css, allowed_origins } = req.body || {};
  const id = 'ag_' + Math.random().toString(36).slice(2, 14);
  try {
    await db.query(
      `INSERT INTO widget_agents (id, user_email, name, system_prompt, welcome_message, color, position, avatar_url, header_text, placeholder_text, bubble_icon, auto_open_delay, show_branding, custom_css, allowed_origins) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.webUser.email, name || 'My Agent', system_prompt || '', welcome_message || '', color || '#6366f1', position || 'bottom-right', avatar_url || '', header_text || '', placeholder_text || 'Tapez votre message...', bubble_icon || 'chat', auto_open_delay || 0, show_branding !== false ? 1 : 0, custom_css || '', allowed_origins || '']
    );
    res.json({ id, ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/webapp/agents/:id — update a widget agent
app.put('/api/webapp/agents/:id', requireAuth, requireWebAuth, async (req, res) => {
  const { name, system_prompt, welcome_message, color, position, avatar_url, header_text, placeholder_text, bubble_icon, auto_open_delay, show_branding, custom_css, allowed_origins } = req.body || {};
  try {
    const agent = await db.queryOne('SELECT id FROM widget_agents WHERE id = ? AND user_email = ?', [req.params.id, req.webUser.email]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    await db.query(
      `UPDATE widget_agents SET name=?, system_prompt=?, welcome_message=?, color=?, position=?, avatar_url=?, header_text=?, placeholder_text=?, bubble_icon=?, auto_open_delay=?, show_branding=?, custom_css=?, allowed_origins=? WHERE id=?`,
      [name, system_prompt || '', welcome_message || '', color || '#6366f1', position || 'bottom-right', avatar_url || '', header_text || '', placeholder_text || 'Tapez votre message...', bubble_icon || 'chat', auto_open_delay || 0, show_branding !== false ? 1 : 0, custom_css || '', allowed_origins || '', req.params.id]
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

// GET /api/widget/config/:id — public endpoint to get widget appearance (for embed script)
app.get('/api/widget/config/:id', async (req, res) => {
  try {
    const agent = await db.queryOne('SELECT name, welcome_message, color, position, avatar_url, header_text, placeholder_text, bubble_icon, auto_open_delay, show_branding, custom_css FROM widget_agents WHERE id = ?', [req.params.id]);
    if (!agent) return res.status(404).json({ error: 'Widget not found' });
    res.json(agent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/widget/defaults — public endpoint for global widget defaults (from admin settings)
app.get('/api/widget/defaults', async (req, res) => {
  try {
    const color       = await getSetting('widget_color', '#6366f1');
    const header      = await getSetting('widget_header', 'Assistant IA');
    const welcome     = await getSetting('widget_welcome', 'Bonjour ! Comment puis-je vous aider ?');
    const placeholder = await getSetting('widget_placeholder', 'Tapez votre message...');
    const avatar      = await getSetting('widget_avatar', '');
    const position    = await getSetting('widget_position', 'bottom-right');
    const autoDelay   = await getSetting('widget_auto_delay', '0');
    const branding    = await getSetting('widget_branding', '1');
    const customCss   = await getSetting('widget_custom_css', '');
    res.json({ color, header_text: header, welcome_message: welcome, placeholder_text: placeholder, avatar_url: avatar, position, auto_open_delay: parseInt(autoDelay) || 0, show_branding: branding === '1', custom_css: customCss });
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

  // Auto-detect language from last user message
  const widgetLastMsg = [...messages].reverse().find(m => m.role === 'user');
  const widgetLang = widgetLastMsg ? detectLanguage(widgetLastMsg.content) : 'en';
  const widgetLangPrompt = multiLangSystemPrompt(widgetLang);

  // Build system prompt with Lamu identity + agent custom prompt + auto-lang
  const lamuBase = `You are Lamu, a helpful AI assistant. Be friendly, concise, and helpful. Always respond in the same language the user writes in.${widgetLangPrompt}`;
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
      body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: fullMessages, stream: true, max_tokens: 2048, ...parsedExtras }),
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

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT SYSTEM — CinetPay (primary) + Flutterwave (fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const CINETPAY_API_KEY  = process.env.CINETPAY_API_KEY  || '';
const CINETPAY_SITE_ID  = process.env.CINETPAY_SITE_ID  || '';
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || '';
const PAYMENT_RETURN_URL = process.env.PAYMENT_RETURN_URL || 'https://app.lamuka-tech.com/payment/callback';
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;

function getPaymentProvider() {
  if (CINETPAY_API_KEY && CINETPAY_SITE_ID) return 'cinetpay';
  if (FLUTTERWAVE_SECRET) return 'flutterwave';
  return 'mock'; // fallback for dev/testing
}

// ─── Shared: finalize a confirmed payment → create license + email ───────────

async function finalizePayment(txId) {
  const payment = await db.queryOne('SELECT * FROM pending_payments WHERE tx_id = ? AND status = ?', [txId, 'pending']);
  if (!payment) return null; // already confirmed or not found

  // 1. Create license
  const licenseKey = 'LMU-' + crypto.randomBytes(12).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days
  const plan = await db.queryOne('SELECT * FROM plans WHERE id = ?', [payment.plan_id]);

  await db.query(
    `INSERT INTO licenses (license_key, customer_name, customer_email, plan, max_requests, is_active, activated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
    [licenseKey, payment.customer_name || '', payment.customer_email, payment.plan_id, plan?.max_requests || 99999, expiresAt]
  );

  // 2. Mark payment confirmed
  await db.query(
    'UPDATE pending_payments SET status = ?, license_key = ?, confirmed_at = NOW() WHERE tx_id = ?',
    ['confirmed', licenseKey, txId]
  );

  // 3. Upgrade webapp trial if exists
  if (payment.customer_email) {
    const newMax = plan?.max_requests || 99999;
    await db.query(
      'UPDATE webapp_trials SET max_messages = ?, messages_used = 0 WHERE email = ?',
      [newMax, payment.customer_email]
    ).catch(() => {}); // trial may not exist (desktop-only user)
  }

  // 4. Send license email
  try {
    await sendLicenseEmail({
      to: payment.customer_email,
      name: payment.customer_name || payment.customer_email.split('@')[0],
      licenseKey,
      planName: plan?.name || payment.plan_id,
      amount: String(payment.amount),
      currency: payment.currency || 'XAF',
      txId,
    });
  } catch (e) { console.error('[payment] Email send failed:', e.message); }

  console.log(`[payment] ✓ ${payment.customer_email} → ${payment.plan_id} (${txId}) — license: ${licenseKey}`);
  return { licenseKey, expiresAt, plan_name: plan?.name, max_requests: plan?.max_requests };
}

// ─── POST /api/payment/initiate — start a real payment ──────────────────────

app.post('/api/payment/initiate', requireDb, async (req, res) => {
  const token = req.headers['x-webapp-token'];
  if (!token) return res.status(401).json({ error: 'Token requis' });

  let decoded;
  try { decoded = jwt.verify(token, WEBAPP_JWT_SECRET); } catch { return res.status(401).json({ error: 'Token invalide' }); }

  const { plan_id, phone } = req.body || {};
  if (!plan_id) return res.status(400).json({ error: 'plan_id requis' });

  try {
    const plan = await db.queryOne('SELECT * FROM plans WHERE id = ? AND is_active = 1', [plan_id]);
    if (!plan) return res.status(404).json({ error: 'Plan introuvable' });
    if (!plan.price || plan.price <= 0) return res.status(400).json({ error: 'Ce plan est gratuit, pas besoin de paiement' });

    const trial = await db.queryOne('SELECT * FROM webapp_trials WHERE email = ?', [decoded.email]);
    const customerName = trial?.name || decoded.email.split('@')[0];

    const txId = 'PAY-' + crypto.randomBytes(10).toString('hex').toUpperCase();

    // Record pending payment
    await db.query(
      `INSERT INTO pending_payments (tx_id, msisdn, plan_id, amount, currency, customer_name, customer_email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [txId, phone || null, plan_id, plan.price, plan.currency || 'XAF', customerName, decoded.email]
    );

    const provider = getPaymentProvider();

    // ── CinetPay ──────────────────────────────────────────────────────────────
    if (provider === 'cinetpay') {
      const cpResp = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: CINETPAY_API_KEY,
          site_id: CINETPAY_SITE_ID,
          transaction_id: txId,
          amount: Math.round(plan.price),
          currency: plan.currency || 'XAF',
          description: `Lamuka ${plan.name} — 1 mois`,
          customer_name: customerName,
          customer_email: decoded.email,
          customer_phone_number: phone || '',
          return_url: `${PAYMENT_RETURN_URL}?tx_id=${txId}`,
          notify_url: `${BACKEND_PUBLIC_URL}/api/payment/webhook/cinetpay`,
          channels: 'ALL',
          metadata: txId,
        }),
      });
      const cpData = await cpResp.json();
      if (cpData.code === '201' && cpData.data?.payment_url) {
        return res.json({ success: true, provider: 'cinetpay', payment_url: cpData.data.payment_url, tx_id: txId });
      }
      console.error('[cinetpay] Init failed:', JSON.stringify(cpData));
      // Fall through to flutterwave if cinetpay fails
      if (!FLUTTERWAVE_SECRET) {
        return res.status(502).json({ error: 'Échec de l\'initialisation du paiement CinetPay', details: cpData.message || '' });
      }
    }

    // ── Flutterwave ───────────────────────────────────────────────────────────
    if (provider === 'flutterwave' || (provider === 'cinetpay' && FLUTTERWAVE_SECRET)) {
      const fwResp = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FLUTTERWAVE_SECRET}` },
        body: JSON.stringify({
          tx_ref: txId,
          amount: Math.round(plan.price),
          currency: plan.currency || 'XAF',
          payment_options: 'card,mobilemoney,ussd',
          redirect_url: `${PAYMENT_RETURN_URL}?tx_id=${txId}`,
          customer: { email: decoded.email, name: customerName, phonenumber: phone || '' },
          customizations: { title: 'Lamuka', description: `Plan ${plan.name} — 1 mois`, logo: '' },
          meta: { tx_id: txId },
        }),
      });
      const fwData = await fwResp.json();
      if (fwData.status === 'success' && fwData.data?.link) {
        return res.json({ success: true, provider: 'flutterwave', payment_url: fwData.data.link, tx_id: txId });
      }
      console.error('[flutterwave] Init failed:', JSON.stringify(fwData));
      return res.status(502).json({ error: 'Échec de l\'initialisation du paiement Flutterwave', details: fwData.message || '' });
    }

    // ── Mock (no provider configured) — instant confirmation for dev ─────────
    if (provider === 'mock') {
      const result = await finalizePayment(txId);
      console.log(`[payment:mock] ${decoded.email} → ${plan_id} (${txId})`);
      return res.json({
        success: true,
        provider: 'mock',
        payment_url: null,
        tx_id: txId,
        mock: true,
        license_key: result?.licenseKey,
        plan_name: result?.plan_name,
        expires_at: result?.expiresAt?.toISOString(),
        max_requests: result?.max_requests,
      });
    }
  } catch (err) {
    console.error('[payment/initiate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/webapp/upgrade — backward compat alias ────────────────────────
//  Redirects to the new payment flow. Keeps old frontend working during transition.

app.post('/api/webapp/upgrade', requireDb, async (req, res) => {
  // Proxy to the new payment/initiate endpoint
  req.url = '/api/payment/initiate';
  app.handle(req, res);
});

// ─── POST /api/payment/webhook/cinetpay — CinetPay IPN (Instant Payment Notification)

app.post('/api/payment/webhook/cinetpay', async (req, res) => {
  try {
    const { cpm_trans_id } = req.body || {};
    if (!cpm_trans_id) return res.status(400).json({ error: 'Missing cpm_trans_id' });

    // Verify transaction status with CinetPay API
    const checkResp = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: CINETPAY_API_KEY, site_id: CINETPAY_SITE_ID, transaction_id: cpm_trans_id }),
    });
    const checkData = await checkResp.json();

    if (checkData.code === '00' && checkData.data?.status === 'ACCEPTED') {
      const result = await finalizePayment(cpm_trans_id);
      if (result) console.log(`[cinetpay:webhook] ✓ Confirmed ${cpm_trans_id}`);
      return res.json({ success: true });
    }

    // Payment failed or pending
    if (checkData.data?.status === 'REFUSED' || checkData.data?.status === 'ERROR') {
      await db.query('UPDATE pending_payments SET status = ? WHERE tx_id = ?', ['failed', cpm_trans_id]);
      console.log(`[cinetpay:webhook] ✗ Failed ${cpm_trans_id}: ${checkData.data?.status}`);
    }

    res.json({ success: true, status: checkData.data?.status || 'unknown' });
  } catch (err) {
    console.error('[cinetpay:webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payment/webhook/flutterwave — Flutterwave webhook ─────────────

app.post('/api/payment/webhook/flutterwave', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['verif-hash'];
    if (PAYMENT_WEBHOOK_SECRET && signature !== PAYMENT_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body || {};
    if (event !== 'charge.completed' || data?.status !== 'successful') {
      return res.json({ success: true, ignored: true });
    }

    const txId = data.tx_ref;
    if (!txId) return res.status(400).json({ error: 'Missing tx_ref' });

    // Double-check with Flutterwave verify endpoint
    const verifyResp = await fetch(`https://api.flutterwave.com/v3/transactions/${data.id}/verify`, {
      headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET}` },
    });
    const verifyData = await verifyResp.json();

    if (verifyData.status === 'success' && verifyData.data?.status === 'successful') {
      // Verify amount matches
      const payment = await db.queryOne('SELECT * FROM pending_payments WHERE tx_id = ?', [txId]);
      if (payment && Math.round(verifyData.data.amount) >= Math.round(payment.amount)) {
        const result = await finalizePayment(txId);
        if (result) console.log(`[flutterwave:webhook] ✓ Confirmed ${txId}`);
      } else {
        console.error(`[flutterwave:webhook] Amount mismatch for ${txId}: expected ${payment?.amount}, got ${verifyData.data?.amount}`);
        await db.query('UPDATE pending_payments SET status = ? WHERE tx_id = ?', ['failed', txId]);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[flutterwave:webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/verify/:tx_id — frontend polls this after redirect ─────

app.get('/api/payment/verify/:tx_id', async (req, res) => {
  try {
    const payment = await db.queryOne(
      `SELECT pp.*, p.name as plan_name FROM pending_payments pp LEFT JOIN plans p ON p.id = pp.plan_id WHERE pp.tx_id = ?`,
      [req.params.tx_id]
    );
    if (!payment) return res.status(404).json({ error: 'Transaction introuvable' });

    // If still pending, try to check with provider one more time
    if (payment.status === 'pending') {
      const provider = getPaymentProvider();
      if (provider === 'cinetpay') {
        try {
          const checkResp = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apikey: CINETPAY_API_KEY, site_id: CINETPAY_SITE_ID, transaction_id: req.params.tx_id }),
          });
          const checkData = await checkResp.json();
          if (checkData.code === '00' && checkData.data?.status === 'ACCEPTED') {
            await finalizePayment(req.params.tx_id);
            const updated = await db.queryOne('SELECT pp.*, p.name as plan_name FROM pending_payments pp LEFT JOIN plans p ON p.id = pp.plan_id WHERE pp.tx_id = ?', [req.params.tx_id]);
            return res.json({ status: 'confirmed', license_key: updated.license_key, plan_name: updated.plan_name, expires_at: updated.confirmed_at });
          }
        } catch {}
      }
      if (provider === 'flutterwave') {
        // Flutterwave doesn't support checking by tx_ref directly, rely on webhook
      }
      // Check if payment is older than 30 minutes → expire it
      const ageMs = Date.now() - new Date(payment.created_at).getTime();
      if (ageMs > 30 * 60 * 1000) {
        await db.query('UPDATE pending_payments SET status = ? WHERE tx_id = ? AND status = ?', ['expired', req.params.tx_id, 'pending']);
        return res.json({ status: 'expired' });
      }
      return res.json({ status: 'pending' });
    }

    res.json({
      status: payment.status,
      license_key: payment.license_key || null,
      plan_name: payment.plan_name || payment.plan_id,
      amount: payment.amount,
      currency: payment.currency,
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// LICENSES CRUD — admin panel endpoints
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/licenses — list all licenses ──────────────────────────────────
app.get('/api/licenses', requireAuth, async (req, res) => {
  try {
    const licenses = await db.query(
      `SELECT l.*, p.name as plan_name, p.color as plan_color
       FROM licenses l LEFT JOIN plans p ON p.id = l.plan
       ORDER BY l.created_at DESC LIMIT 500`
    );
    res.json({ licenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/licenses — create a new license ─────────────────────────────
app.post('/api/licenses', requireAuth, async (req, res) => {
  try {
    const { customer_name, customer_email, plan, max_requests, expires_at, whatsapp_phone } = req.body || {};
    const licenseKey = 'LMU-' + crypto.randomBytes(12).toString('hex').toUpperCase();

    await db.query(
      `INSERT INTO licenses (license_key, plan, customer_name, customer_email, max_requests, expires_at, whatsapp_phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [licenseKey, plan || 'pro', customer_name || null, customer_email || null, max_requests || 9999999, expires_at || null, whatsapp_phone || null]
    );

    res.json({ ok: true, license_key: licenseKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/licenses/:id/toggle — toggle is_active ───────────────────────
app.put('/api/licenses/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE licenses SET is_active = NOT is_active WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/licenses/:id — delete a license ───────────────────────────
app.delete('/api/licenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM licenses WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/licenses/import — import an LMKA- license key ───────────────
app.post('/api/licenses/import', requireAuth, async (req, res) => {
  try {
    const { license_key, customer_name, customer_email, customer_phone, notes } = req.body || {};
    if (!license_key) return res.status(400).json({ error: 'license_key is required' });

    // Check if already exists
    const existing = await db.queryOne('SELECT id FROM licenses WHERE license_key = ?', [license_key]);
    if (existing) return res.status(409).json({ error: 'License key already exists' });

    await db.query(
      `INSERT INTO licenses (license_key, plan, customer_name, customer_email, max_requests, is_active)
       VALUES (?, 'pro', ?, ?, 9999999, 1)`,
      [license_key, customer_name || null, customer_email || null, 9999999]
    );

    res.json({ ok: true, license_key });
  } catch (err) {
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

const _lastAlertTime = {};
async function pingProvider(url, key, model) {
  try {
    // Use a lightweight models endpoint check first, fall back to chat if not OpenRouter
    const isOpenRouter = url.includes('openrouter.ai');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000); // 15s timeout (OpenRouter can be slow)
    const t0 = Date.now();

    let res;
    if (isOpenRouter) {
      // Lightweight: just check if the API key is valid via /auth/key
      const baseUrl = url.replace(/\/chat\/completions.*$/, '');
      res = await fetch(`${baseUrl}/auth/key`, {
        method: 'GET',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}` },
      });
    } else {
      res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      });
    }
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

        // Send alert email if went down (max 1 alert per hour per provider)
        if (result.status === 'down' || result.status === 'degraded') {
          const lastAlert = _lastAlertTime[providerName] || 0;
          if (Date.now() - lastAlert > 60 * 60 * 1000) {
            _lastAlertTime[providerName] = Date.now();
            sendProviderAlert(providerName, providerUrl, result).catch(() => {});
          }
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
    const clientId = await getSetting('github_client_id', process.env.GITHUB_OAUTH_CLIENT_ID || '');
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
    const clientId     = await getSetting('github_client_id', process.env.GITHUB_OAUTH_CLIENT_ID || '');
    const clientSecret = await getSetting('github_client_secret', process.env.GITHUB_OAUTH_CLIENT_SECRET || '');
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
        model: getModelForUseCase(ai, 'chat'),
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
      body: JSON.stringify({ model: model || getModelForUseCase(ai, 'chat'), messages: fullMessages, ...parsedExtras }),
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
      model: model || getModelForUseCase(ai, 'chat'),
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

// ── OAuth config (admin sets these in DB Settings; .env is fallback) ─────────
// Keys in DB match what admin dashboard saves: google_client_id, slack_client_id, etc.

const OAUTH_PROVIDERS = {
  google: {
    dbKeyPrefix: 'google',
    scopes: 'https://www.googleapis.com/auth/drive.readonly',
    authUrl:  'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  },
  slack: {
    dbKeyPrefix: 'slack',
    scopes: 'channels:history,channels:read,groups:read,groups:history',
    authUrl:  'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
  },
  github: {
    dbKeyPrefix: 'github',
    scopes: 'repo,read:user',
    authUrl:  'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
  },
  shopify: {
    dbKeyPrefix: 'shopify',
    scopes: 'read_products,read_orders,read_customers',
    authUrl:  null, // built dynamically: https://{shop}.myshopify.com/admin/oauth/authorize
    tokenUrl: null, // built dynamically: https://{shop}.myshopify.com/admin/oauth/access_token
  },
  teams: {
    dbKeyPrefix: 'sharepoint', // reuse Azure/Microsoft creds from admin
    scopes: 'https://graph.microsoft.com/.default',
    authUrl:  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
};

// Async helper: read OAuth creds from DB settings (admin dashboard), fallback to .env
async function getOAuthCreds(provider) {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) return null;
  const prefix = cfg.dbKeyPrefix;
  const envMap = {
    google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    slack:  ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    github: ['GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET'],
    shopify: ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
    sharepoint: ['SHAREPOINT_CLIENT_ID', 'SHAREPOINT_CLIENT_SECRET'],
  };
  const [envId, envSecret] = envMap[prefix] || ['', ''];
  const clientId     = await getSetting(`${prefix}_client_id`,     process.env[envId]     || '');
  const clientSecret = await getSetting(`${prefix}_client_secret`, process.env[envSecret] || '');
  return { ...cfg, clientId, clientSecret };
}

function getOAuthRedirectUri(provider) {
  return `${BACKEND_PUBLIC_URL}/api/oauth/${provider}/callback`;
}

// Helper: get a valid access token (refresh if expired). userEmail=null for legacy/admin tokens.
async function getValidToken(provider, userEmail = null) {
  const row = userEmail
    ? await db.queryOne('SELECT * FROM oauth_tokens WHERE provider = ? AND user_email = ?', [provider, userEmail])
    : await db.queryOne('SELECT * FROM oauth_tokens WHERE provider = ? AND (user_email IS NULL OR user_email = "")', [provider]);
  if (!row) return null;

  // If token is expired and we have a refresh_token, try to refresh
  if (row.refresh_token && row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAt - 60000) { // 1min buffer
      try {
        const cfg = await getOAuthCreds(provider);
        if (cfg && cfg.tokenUrl && cfg.clientId) {
          const resp = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: cfg.clientId,
              client_secret: cfg.clientSecret,
              refresh_token: row.refresh_token,
              grant_type: 'refresh_token',
            }),
          });
          const data = await resp.json();
          if (data.access_token) {
            const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000);
            await db.query('UPDATE oauth_tokens SET access_token = ?, expires_at = ? WHERE id = ?',
              [data.access_token, newExpires, row.id]);
            return data.access_token;
          }
        }
      } catch (e) { console.error(`[oauth:${provider}] Refresh failed:`, e.message); }
    }
  }
  return row.access_token;
}

// ── GET /api/oauth/:provider/start — redirect user to OAuth consent screen ───

app.get('/api/oauth/:provider/start', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const cfg = await getOAuthCreds(provider);
  if (!cfg) return res.status(400).json({ error: `OAuth not supported for: ${provider}` });
  if (!cfg.clientId) return res.status(503).json({ error: `${provider} OAuth not configured. Set credentials in Admin → Settings → Intégrations` });

  // Encode user_email in state so callback knows who initiated (client vs admin)
  const userEmail = req.query.user_email || '';
  const nonce = crypto.randomBytes(12).toString('hex');
  const statePayload = Buffer.from(JSON.stringify({ nonce, user_email: userEmail })).toString('base64url');

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: getOAuthRedirectUri(provider),
    response_type: 'code',
    scope: cfg.scopes,
    state: statePayload,
    access_type: 'offline',
    prompt: 'consent',
  });

  // Slack uses slightly different param names
  if (provider === 'slack') {
    params.delete('scope');
    params.delete('access_type');
    params.delete('prompt');
    params.set('user_scope', cfg.scopes);
  }

  res.json({ auth_url: `${cfg.authUrl}?${params.toString()}`, state: statePayload });
});

// ── GET /api/oauth/:provider/callback — exchange code for tokens ─────────────

app.get('/api/oauth/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, error: oauthError, state } = req.query;
  const cfg = await getOAuthCreds(provider);

  // Decode user_email from state
  let userEmail = null;
  try {
    const stateData = JSON.parse(Buffer.from(state || '', 'base64url').toString());
    userEmail = stateData.user_email || null;
  } catch {}

  if (oauthError) {
    return res.send(`<html><body><h2>Connexion annulée</h2><p>${oauthError}</p><script>window.close()</script></body></html>`);
  }
  if (!code || !cfg) {
    return res.status(400).send('<html><body><h2>Erreur</h2><p>Code manquant</p></body></html>');
  }

  try {
    const tokenParams = {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: getOAuthRedirectUri(provider),
      grant_type: 'authorization_code',
    };

    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (provider === 'github') tokenHeaders['Accept'] = 'application/json'; // GitHub needs this for JSON response
    const tokenResp = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: tokenHeaders,
      body: new URLSearchParams(tokenParams),
    });
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      return res.send(`<html><body><h2>Erreur OAuth</h2><p>${tokenData.error_description || tokenData.error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    }

    // Slack returns tokens differently
    const accessToken = provider === 'slack'
      ? (tokenData.authed_user?.access_token || tokenData.access_token)
      : tokenData.access_token;

    const refreshToken = tokenData.refresh_token || null;
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Upsert token in DB (per-user if user_email provided, otherwise global/admin)
    await db.query(
      `INSERT INTO oauth_tokens (id, provider, user_email, access_token, refresh_token, token_type, expires_at, scope, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = COALESCE(VALUES(refresh_token), refresh_token), expires_at = VALUES(expires_at), raw_response = VALUES(raw_response), updated_at = NOW()`,
      [crypto.randomUUID(), provider, userEmail || null, accessToken, refreshToken, tokenData.token_type || 'Bearer', expiresAt, cfg.scopes, JSON.stringify(tokenData)]
    );

    console.log(`[oauth:${provider}] ✓ Token saved${userEmail ? ` for ${userEmail}` : ' (admin/global)'}`);

    // Auto-create integration entry if not exists (global registry)
    const providerName = provider === 'google' ? 'google_drive' : provider;
    const existing = await db.queryOne('SELECT id FROM integrations WHERE provider = ?', [providerName]);
    if (!existing) {
      const displayNames = { google: 'Google Drive', slack: 'Slack', github: 'GitHub', shopify: 'Shopify', teams: 'Microsoft Teams' };
      const displayName = displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
      await db.query('INSERT INTO integrations (id, provider, name, config) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), providerName, displayName + ' (OAuth)', JSON.stringify({ oauth: true })]);
    }

    res.send(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#fff">
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="margin:0 0 8px">${provider === 'google' ? 'Google Drive' : provider.charAt(0).toUpperCase() + provider.slice(1)} connecté !</h2>
        <p style="color:#888">Vous pouvez fermer cette fenêtre.</p>
        <script>
          if (window.opener) { window.opener.postMessage({ type: 'oauth_success', provider: '${provider}' }, '*'); }
          setTimeout(() => window.close(), 2000);
        </script>
      </div>
    </body></html>`);
  } catch (err) {
    console.error(`[oauth:${provider}:callback]`, err.message);
    res.status(500).send(`<html><body><h2>Erreur</h2><p>${err.message}</p></body></html>`);
  }
});

// ── GET /api/oauth/status — check which providers are connected ──────────────

app.get('/api/oauth/status', requireAuth, async (req, res) => {
  try {
    const tokens = await db.query('SELECT provider, expires_at, updated_at FROM oauth_tokens');
    const configured = {};
    for (const p of Object.keys(OAUTH_PROVIDERS)) {
      const creds = await getOAuthCreds(p);
      configured[p] = !!(creds && creds.clientId);
    }
    const connected = {};
    for (const t of tokens) {
      connected[t.provider] = { connected: true, expires_at: t.expires_at, updated_at: t.updated_at };
    }
    res.json({ configured, connected });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/oauth/:provider — disconnect a provider ──────────────────────

app.delete('/api/oauth/:provider', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM oauth_tokens WHERE provider = ?', [req.params.provider]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT-FACING INTEGRATION ENDPOINTS (webapp/Tauri users connect their own accounts)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/client/integrations/available — list integrations the admin has enabled
app.get('/api/client/integrations/available', requireAuth, async (req, res) => {
  try {
    const enabledRaw = await getSetting('enabled_integrations', '');
    const enabled = enabledRaw ? JSON.parse(enabledRaw) : ['github','gitlab','jira','slack','google','stripe','notion','database'];
    // Check which OAuth providers the admin has configured (have Client ID)
    const oauthProviders = {};
    for (const p of Object.keys(OAUTH_PROVIDERS)) {
      const creds = await getOAuthCreds(p);
      oauthProviders[p] = !!(creds && creds.clientId);
    }
    // API-key based providers: check if admin configured them
    const apiProviders = {
      notion:     !!(await getSetting('notion_client_id', '')),
      zendesk:    !!(await getSetting('zendesk_api_token', '')),
      hubspot:    !!(await getSetting('hubspot_api_token', '')),
      freshdesk:  !!(await getSetting('freshdesk_api_key', '')),
      intercom:   !!(await getSetting('intercom_api_token', '')),
      confluence: !!(await getSetting('confluence_api_token', '')),
    };
    res.json({ enabled, oauth_configured: oauthProviders, api_configured: apiProviders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/client/integrations/status — check which providers THIS user has connected
app.get('/api/client/integrations/status', requireAuth, async (req, res) => {
  const userEmail = req.query.user_email || req.headers['x-user-email'] || '';
  if (!userEmail) return res.status(400).json({ error: 'user_email required' });
  try {
    const tokens = await db.query('SELECT provider, expires_at, updated_at FROM oauth_tokens WHERE user_email = ?', [userEmail]);
    const connected = {};
    for (const t of tokens) {
      connected[t.provider] = { connected: true, expires_at: t.expires_at, updated_at: t.updated_at };
    }
    res.json({ connected });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/client/integrations/:provider — disconnect a provider for THIS user
app.delete('/api/client/integrations/:provider', requireAuth, async (req, res) => {
  const userEmail = req.query.user_email || req.headers['x-user-email'] || '';
  if (!userEmail) return res.status(400).json({ error: 'user_email required' });
  try {
    await db.query('DELETE FROM oauth_tokens WHERE provider = ? AND user_email = ?', [req.params.provider, userEmail]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Update sync endpoint to use OAuth tokens automatically ───────────────────

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
      // Google Drive: use OAuth token (auto-refresh) or fallback to config
      const accessToken = await getValidToken('google') || config.access_token;
      if (!accessToken) return res.status(400).json({ error: 'Google Drive non connecté. Utilisez le bouton "Connecter" dans Intégrations.' });
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
      const notionKey = config.api_key || config.token;
      if (!notionKey) return res.status(400).json({ error: 'Notion API key non configurée. Ajoutez votre clé dans les paramètres de l\'intégration.' });
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
      // Slack: use OAuth token or fallback to config
      const slackToken = await getValidToken('slack') || config.bot_token;
      if (!slackToken) return res.status(400).json({ error: 'Slack non connecté. Utilisez le bouton "Connecter" dans Intégrations.' });
      // Auto-list channels if none specified in config
      let channels = config.channels || [];
      if (channels.length === 0) {
        try {
          const listResp = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=20', {
            headers: { Authorization: `Bearer ${slackToken}` }
          });
          const listData = await listResp.json();
          if (listData.ok) channels = (listData.channels || []).filter(c => c.is_member).map(c => c.id);
        } catch {}
      }
      for (const ch of channels) {
        try {
          const hResp = await fetch(`https://slack.com/api/conversations.history?channel=${ch}&limit=50`, {
            headers: { Authorization: `Bearer ${slackToken}` }
          });
          if (!hResp.ok) continue;
          const hData = await hResp.json();
          if (!hData.ok) continue;
          const chName = hData.channel_id || ch;
          const content = (hData.messages || []).map(m => `${m.user || 'bot'}: ${m.text}`).reverse().join('\n').slice(0, 12000);
          if (!content.trim()) continue;
          const docId = crypto.randomUUID();
          await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, 'slack', `Slack #${ch}`, `slack://${ch}`, content, content.length]);
          chunkAndEmbedDocument(docId, content).catch(() => {});
          docsAdded++;
        } catch { /* skip */ }
      }

    } else if (integ.provider === 'github') {
      // GitHub: sync READMEs + issues from repos
      const ghToken = await getValidToken('github') || config.token;
      if (!ghToken) return res.status(400).json({ error: 'GitHub non connecté. Utilisez le bouton "Connecter" dans Intégrations.' });
      // Get user's repos (most recently pushed first)
      const reposResp = await fetch('https://api.github.com/user/repos?sort=pushed&per_page=15', {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Lamu-Bot' }
      });
      if (!reposResp.ok) return res.status(400).json({ error: 'GitHub API error: ' + reposResp.status });
      const repos = await reposResp.json();
      for (const repo of repos) {
        try {
          // Sync README
          const readmeResp = await fetch(`https://api.github.com/repos/${repo.full_name}/readme`, {
            headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'Lamu-Bot' }
          });
          if (readmeResp.ok) {
            const content = (await readmeResp.text()).slice(0, 12000);
            if (content.trim()) {
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'github', `${repo.full_name} README`, repo.html_url, content, content.length]);
              chunkAndEmbedDocument(docId, content).catch(() => {});
              docsAdded++;
            }
          }
          // Sync recent open issues (top 10)
          const issuesResp = await fetch(`https://api.github.com/repos/${repo.full_name}/issues?state=open&per_page=10&sort=updated`, {
            headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Lamu-Bot' }
          });
          if (issuesResp.ok) {
            const issues = await issuesResp.json();
            const issueContent = issues.map(i => `## #${i.number}: ${i.title}\n${i.body || ''}`).join('\n\n---\n\n').slice(0, 12000);
            if (issueContent.trim() && issues.length > 0) {
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'github', `${repo.full_name} Issues`, `${repo.html_url}/issues`, issueContent, issueContent.length]);
              chunkAndEmbedDocument(docId, issueContent).catch(() => {});
              docsAdded++;
            }
          }
        } catch { /* skip individual repo errors */ }
      }

    } else if (integ.provider === 'gitlab') {
      // GitLab: sync project READMEs + issues
      const glToken = config.token || config.api_key;
      const glBase = config.baseUrl || config.base_url || 'https://gitlab.com';
      if (!glToken) return res.status(400).json({ error: 'GitLab token non configuré.' });
      const projResp = await fetch(`${glBase}/api/v4/projects?membership=true&order_by=last_activity_at&per_page=15`, {
        headers: { 'PRIVATE-TOKEN': glToken }
      });
      if (!projResp.ok) return res.status(400).json({ error: 'GitLab API error: ' + projResp.status });
      const projects = await projResp.json();
      for (const proj of projects) {
        try {
          // Sync README
          const readmeResp = await fetch(`${glBase}/api/v4/projects/${proj.id}/repository/files/README.md/raw?ref=${proj.default_branch || 'main'}`, {
            headers: { 'PRIVATE-TOKEN': glToken }
          });
          if (readmeResp.ok) {
            const content = (await readmeResp.text()).slice(0, 12000);
            if (content.trim()) {
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'gitlab', `${proj.path_with_namespace} README`, proj.web_url, content, content.length]);
              chunkAndEmbedDocument(docId, content).catch(() => {});
              docsAdded++;
            }
          }
          // Sync recent open issues
          const issuesResp = await fetch(`${glBase}/api/v4/projects/${proj.id}/issues?state=opened&per_page=10&order_by=updated_at`, {
            headers: { 'PRIVATE-TOKEN': glToken }
          });
          if (issuesResp.ok) {
            const issues = await issuesResp.json();
            const issueContent = issues.map(i => `## #${i.iid}: ${i.title}\n${i.description || ''}`).join('\n\n---\n\n').slice(0, 12000);
            if (issueContent.trim() && issues.length > 0) {
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'gitlab', `${proj.path_with_namespace} Issues`, `${proj.web_url}/-/issues`, issueContent, issueContent.length]);
              chunkAndEmbedDocument(docId, issueContent).catch(() => {});
              docsAdded++;
            }
          }
        } catch { /* skip */ }
      }

    } else if (integ.provider === 'zendesk') {
      // Zendesk: sync help center articles + recent tickets (config or admin settings)
      const zdToken = config.token || await getSetting('zendesk_api_token', '');
      const zdSubdomain = config.subdomain || config.name || await getSetting('zendesk_subdomain', '');
      const zdEmail = config.email || await getSetting('zendesk_email', '');
      if (!zdToken || !zdSubdomain) return res.status(400).json({ error: 'Zendesk token et sous-domaine requis.' });
      const zdBase = `https://${zdSubdomain}.zendesk.com`;
      const zdAuth = zdEmail ? 'Basic ' + Buffer.from(`${zdEmail}/token:${zdToken}`).toString('base64') : `Bearer ${zdToken}`;
      // Help Center articles
      try {
        const artResp = await fetch(`${zdBase}/api/v2/help_center/articles.json?per_page=20&sort_by=updated_at&sort_order=desc`, {
          headers: { Authorization: zdAuth }
        });
        if (artResp.ok) {
          const artData = await artResp.json();
          for (const art of (artData.articles || [])) {
            try {
              // Strip HTML tags from body
              const content = (art.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
              if (!content) continue;
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'zendesk', art.title || 'Article', art.html_url || '', content, content.length]);
              chunkAndEmbedDocument(docId, content).catch(() => {});
              docsAdded++;
            } catch {}
          }
        }
      } catch {}
      // Recent tickets
      try {
        const tkResp = await fetch(`${zdBase}/api/v2/tickets.json?per_page=20&sort_by=updated_at&sort_order=desc`, {
          headers: { Authorization: zdAuth }
        });
        if (tkResp.ok) {
          const tkData = await tkResp.json();
          const ticketContent = (tkData.tickets || []).map(t => `## Ticket #${t.id}: ${t.subject}\n${t.description || ''}`).join('\n\n---\n\n').slice(0, 12000);
          if (ticketContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'zendesk', `Zendesk Tickets récents`, `${zdBase}/agent/dashboard`, ticketContent, ticketContent.length]);
            chunkAndEmbedDocument(docId, ticketContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'hubspot') {
      // HubSpot: sync contacts + deals (config or admin settings)
      const hsToken = config.api_key || config.token || await getSetting('hubspot_api_token', '');
      if (!hsToken) return res.status(400).json({ error: 'HubSpot API key non configurée.' });
      const hsHeaders = { Authorization: `Bearer ${hsToken}`, 'Content-Type': 'application/json' };
      // Contacts
      try {
        const cResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=50&properties=firstname,lastname,email,company,phone', {
          headers: hsHeaders
        });
        if (cResp.ok) {
          const cData = await cResp.json();
          const contactContent = (cData.results || []).map(c => {
            const p = c.properties || {};
            return `- ${p.firstname || ''} ${p.lastname || ''} | ${p.email || ''} | ${p.company || ''} | ${p.phone || ''}`;
          }).join('\n').slice(0, 12000);
          if (contactContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'hubspot', 'HubSpot Contacts', 'https://app.hubspot.com/contacts', contactContent, contactContent.length]);
            chunkAndEmbedDocument(docId, contactContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}
      // Deals
      try {
        const dResp = await fetch('https://api.hubapi.com/crm/v3/objects/deals?limit=50&properties=dealname,amount,dealstage,closedate', {
          headers: hsHeaders
        });
        if (dResp.ok) {
          const dData = await dResp.json();
          const dealContent = (dData.results || []).map(d => {
            const p = d.properties || {};
            return `- ${p.dealname || 'Sans nom'} | ${p.amount || '?'} | Stage: ${p.dealstage || '?'} | Close: ${p.closedate || '?'}`;
          }).join('\n').slice(0, 12000);
          if (dealContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'hubspot', 'HubSpot Deals', 'https://app.hubspot.com/deals', dealContent, dealContent.length]);
            chunkAndEmbedDocument(docId, dealContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'shopify') {
      // Shopify: sync products + orders
      const shopUrl = config.shop_url || config.url || '';
      const shopToken = config.access_token || config.token || '';
      if (!shopUrl || !shopToken) return res.status(400).json({ error: 'Shopify shop URL et access token requis.' });
      const shopBase = shopUrl.replace(/\/$/, '');
      const shopHeaders = { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' };
      // Products
      try {
        const pResp = await fetch(`${shopBase}/admin/api/2024-01/products.json?limit=50`, { headers: shopHeaders });
        if (pResp.ok) {
          const pData = await pResp.json();
          for (const prod of (pData.products || [])) {
            const content = `# ${prod.title}\n${prod.body_html ? prod.body_html.replace(/<[^>]+>/g, ' ').trim() : ''}\nVendor: ${prod.vendor || ''}\nType: ${prod.product_type || ''}\nTags: ${prod.tags || ''}`.slice(0, 12000);
            if (!content.trim()) continue;
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'shopify', `Product: ${prod.title}`, `${shopBase}/admin/products/${prod.id}`, content, content.length]);
            chunkAndEmbedDocument(docId, content).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}
      // Recent orders summary
      try {
        const oResp = await fetch(`${shopBase}/admin/api/2024-01/orders.json?limit=30&status=any`, { headers: shopHeaders });
        if (oResp.ok) {
          const oData = await oResp.json();
          const orderContent = (oData.orders || []).map(o =>
            `Order #${o.order_number} | ${o.financial_status} | ${o.total_price} ${o.currency} | ${o.customer?.email || 'guest'} | ${o.created_at?.split('T')[0] || ''}`
          ).join('\n').slice(0, 12000);
          if (orderContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'shopify', 'Shopify Orders', `${shopBase}/admin/orders`, orderContent, orderContent.length]);
            chunkAndEmbedDocument(docId, orderContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'confluence') {
      // Confluence / Atlassian: sync spaces + pages
      const cfEmail = config.email || await getSetting('confluence_email', '');
      const cfToken = config.api_token || config.token || await getSetting('confluence_api_token', '');
      const cfUrl = (config.url || config.base_url || await getSetting('confluence_url', '')).replace(/\/$/, '');
      if (!cfEmail || !cfToken || !cfUrl) return res.status(400).json({ error: 'Confluence email, token et URL requis.' });
      const cfAuth = 'Basic ' + Buffer.from(`${cfEmail}:${cfToken}`).toString('base64');
      try {
        const spResp = await fetch(`${cfUrl}/wiki/api/v2/pages?limit=25&sort=modified-date`, {
          headers: { Authorization: cfAuth, Accept: 'application/json' }
        });
        if (spResp.ok) {
          const spData = await spResp.json();
          for (const page of (spData.results || [])) {
            try {
              // Get page body
              const pgResp = await fetch(`${cfUrl}/wiki/api/v2/pages/${page.id}?body-format=storage`, {
                headers: { Authorization: cfAuth, Accept: 'application/json' }
              });
              if (!pgResp.ok) continue;
              const pgData = await pgResp.json();
              const rawBody = pgData.body?.storage?.value || pgData.body?.view?.value || '';
              const content = rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
              if (!content) continue;
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'confluence', page.title || 'Page', `${cfUrl}/wiki/spaces/${page.spaceId}/pages/${page.id}`, content, content.length]);
              chunkAndEmbedDocument(docId, content).catch(() => {});
              docsAdded++;
            } catch {}
          }
        }
      } catch {}

    } else if (integ.provider === 'freshdesk') {
      // Freshdesk: sync solution articles + recent tickets
      const fdDomain = config.domain || await getSetting('freshdesk_domain', '');
      const fdKey = config.api_key || config.token || await getSetting('freshdesk_api_key', '');
      if (!fdDomain || !fdKey) return res.status(400).json({ error: 'Freshdesk domain et API key requis.' });
      const fdBase = fdDomain.includes('://') ? fdDomain.replace(/\/$/, '') : `https://${fdDomain}`;
      const fdAuth = 'Basic ' + Buffer.from(`${fdKey}:X`).toString('base64');
      // Solution articles
      try {
        const catResp = await fetch(`${fdBase}/api/v2/solutions/categories`, { headers: { Authorization: fdAuth } });
        if (catResp.ok) {
          const cats = await catResp.json();
          for (const cat of cats.slice(0, 5)) {
            try {
              const foldersResp = await fetch(`${fdBase}/api/v2/solutions/categories/${cat.id}/folders`, { headers: { Authorization: fdAuth } });
              if (!foldersResp.ok) continue;
              const folders = await foldersResp.json();
              for (const folder of folders.slice(0, 5)) {
                const artsResp = await fetch(`${fdBase}/api/v2/solutions/folders/${folder.id}/articles`, { headers: { Authorization: fdAuth } });
                if (!artsResp.ok) continue;
                const articles = await artsResp.json();
                for (const art of articles.slice(0, 10)) {
                  const content = `# ${art.title}\n${(art.description || '').replace(/<[^>]+>/g, ' ').trim()}`.slice(0, 12000);
                  if (!content.trim()) continue;
                  const docId = crypto.randomUUID();
                  await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                    [docId, 'freshdesk', art.title, `${fdBase}/a/solutions/articles/${art.id}`, content, content.length]);
                  chunkAndEmbedDocument(docId, content).catch(() => {});
                  docsAdded++;
                }
              }
            } catch {}
          }
        }
      } catch {}

    } else if (integ.provider === 'intercom') {
      // Intercom: sync articles + recent conversations
      const icToken = config.token || config.api_key || await getSetting('intercom_api_token', '');
      if (!icToken) return res.status(400).json({ error: 'Intercom access token requis.' });
      const icHeaders = { Authorization: `Bearer ${icToken}`, Accept: 'application/json', 'Intercom-Version': '2.10' };
      // Articles
      try {
        const artResp = await fetch('https://api.intercom.io/articles?per_page=25', { headers: icHeaders });
        if (artResp.ok) {
          const artData = await artResp.json();
          for (const art of (artData.data || [])) {
            const content = `# ${art.title}\n${(art.body || '').replace(/<[^>]+>/g, ' ').trim()}`.slice(0, 12000);
            if (!content.trim()) continue;
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'intercom', art.title, art.url || '', content, content.length]);
            chunkAndEmbedDocument(docId, content).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'woocommerce') {
      // WooCommerce: sync products + orders
      const wcUrl = (config.url || config.store_url || await getSetting('woocommerce_url', '')).replace(/\/$/, '');
      const wcKey = config.consumer_key || await getSetting('woocommerce_key', '');
      const wcSecret = config.consumer_secret || await getSetting('woocommerce_secret', '');
      if (!wcUrl || !wcKey || !wcSecret) return res.status(400).json({ error: 'WooCommerce URL, Consumer Key et Secret requis.' });
      const wcAuth = 'Basic ' + Buffer.from(`${wcKey}:${wcSecret}`).toString('base64');
      // Products
      try {
        const pResp = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=50`, { headers: { Authorization: wcAuth } });
        if (pResp.ok) {
          const products = await pResp.json();
          for (const prod of products) {
            const content = `# ${prod.name}\n${(prod.description || '').replace(/<[^>]+>/g, ' ').trim()}\nPrice: ${prod.price} ${prod.currency || ''}\nSKU: ${prod.sku || ''}\nCategories: ${(prod.categories || []).map(c => c.name).join(', ')}`.slice(0, 12000);
            if (!content.trim()) continue;
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'woocommerce', `Product: ${prod.name}`, prod.permalink || '', content, content.length]);
            chunkAndEmbedDocument(docId, content).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}
      // Recent orders
      try {
        const oResp = await fetch(`${wcUrl}/wp-json/wc/v3/orders?per_page=30`, { headers: { Authorization: wcAuth } });
        if (oResp.ok) {
          const orders = await oResp.json();
          const orderContent = orders.map(o =>
            `Order #${o.number} | ${o.status} | ${o.total} ${o.currency} | ${o.billing?.email || 'guest'} | ${o.date_created?.split('T')[0] || ''}`
          ).join('\n').slice(0, 12000);
          if (orderContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'woocommerce', 'WooCommerce Orders', wcUrl, orderContent, orderContent.length]);
            chunkAndEmbedDocument(docId, orderContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'sharepoint') {
      // SharePoint: sync via Microsoft Graph API
      const spToken = config.access_token || await getValidToken('microsoft');
      const siteId = config.site_id || '';
      if (!spToken) return res.status(400).json({ error: 'SharePoint access token requis.' });
      const driveEndpoint = siteId
        ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`
        : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
      try {
        const drResp = await fetch(driveEndpoint, { headers: { Authorization: `Bearer ${spToken}` } });
        if (drResp.ok) {
          const drData = await drResp.json();
          for (const item of (drData.value || [])) {
            if (item.folder) continue;
            try {
              const dlUrl = siteId
                ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${item.id}/content`
                : `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`;
              const dlResp = await fetch(dlUrl, { headers: { Authorization: `Bearer ${spToken}` } });
              if (!dlResp.ok) continue;
              let content = '';
              const name = (item.name || '').toLowerCase();
              if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) {
                content = (await dlResp.text()).slice(0, 12000);
              } else if (name.endsWith('.docx')) {
                const buf = Buffer.from(await dlResp.arrayBuffer());
                content = ((await mammoth.extractRawText({ buffer: buf })).value || '').slice(0, 12000);
              } else if (name.endsWith('.pdf')) {
                const buf = Buffer.from(await dlResp.arrayBuffer());
                content = ((await pdfParse(buf)).text || '').slice(0, 12000);
              } else continue;
              if (!content.trim()) continue;
              const docId = crypto.randomUUID();
              await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
                [docId, 'sharepoint', item.name, item.webUrl || '', content, content.length]);
              chunkAndEmbedDocument(docId, content).catch(() => {});
              docsAdded++;
            } catch {}
          }
        }
      } catch {}

    } else if (integ.provider === 'bigcommerce') {
      // BigCommerce: sync products + orders
      const bcHash = config.store_hash || await getSetting('bigcommerce_store_hash', '');
      const bcToken = config.access_token || config.token || await getSetting('bigcommerce_access_token', '');
      if (!bcHash || !bcToken) return res.status(400).json({ error: 'BigCommerce store hash et access token requis.' });
      const bcHeaders = { 'X-Auth-Token': bcToken, Accept: 'application/json', 'Content-Type': 'application/json' };
      // Products
      try {
        const pResp = await fetch(`https://api.bigcommerce.com/stores/${bcHash}/v3/catalog/products?limit=50&include=variants`, { headers: bcHeaders });
        if (pResp.ok) {
          const pData = await pResp.json();
          for (const prod of (pData.data || [])) {
            const content = `# ${prod.name}\n${(prod.description || '').replace(/<[^>]+>/g, ' ').trim()}\nSKU: ${prod.sku || ''}\nPrice: ${prod.price}\nType: ${prod.type || ''}\nCategories: ${(prod.categories || []).join(', ')}`.slice(0, 12000);
            if (!content.trim()) continue;
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'bigcommerce', `Product: ${prod.name}`, prod.custom_url?.url || '', content, content.length]);
            chunkAndEmbedDocument(docId, content).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}
      // Orders
      try {
        const oResp = await fetch(`https://api.bigcommerce.com/stores/${bcHash}/v2/orders?limit=30&sort=date_created:desc`, { headers: bcHeaders });
        if (oResp.ok) {
          const orders = await oResp.json();
          const orderContent = (Array.isArray(orders) ? orders : []).map(o =>
            `Order #${o.id} | ${o.status} | ${o.total_inc_tax} ${o.currency_code || ''} | ${o.billing_address?.email || 'guest'} | ${o.date_created?.split('T')[0] || ''}`
          ).join('\n').slice(0, 12000);
          if (orderContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'bigcommerce', 'BigCommerce Orders', `https://store-${bcHash}.mybigcommerce.com/manage/orders`, orderContent, orderContent.length]);
            chunkAndEmbedDocument(docId, orderContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'magento') {
      // Magento 2: sync products + orders via REST API
      const mgUrl = (config.url || config.base_url || await getSetting('magento_url', '')).replace(/\/$/, '');
      const mgToken = config.access_token || config.token || await getSetting('magento_access_token', '');
      if (!mgUrl || !mgToken) return res.status(400).json({ error: 'Magento URL et access token requis.' });
      const mgHeaders = { Authorization: `Bearer ${mgToken}`, 'Content-Type': 'application/json' };
      // Products
      try {
        const pResp = await fetch(`${mgUrl}/rest/V1/products?searchCriteria[pageSize]=50&searchCriteria[currentPage]=1`, { headers: mgHeaders });
        if (pResp.ok) {
          const pData = await pResp.json();
          for (const prod of (pData.items || [])) {
            const desc = (prod.custom_attributes || []).find(a => a.attribute_code === 'description');
            const content = `# ${prod.name}\n${desc ? desc.value.replace(/<[^>]+>/g, ' ').trim() : ''}\nSKU: ${prod.sku || ''}\nPrice: ${prod.price || '?'}\nType: ${prod.type_id || ''}`.slice(0, 12000);
            if (!content.trim()) continue;
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'magento', `Product: ${prod.name}`, `${mgUrl}/catalog/product/view/id/${prod.id}`, content, content.length]);
            chunkAndEmbedDocument(docId, content).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}
      // Orders
      try {
        const oResp = await fetch(`${mgUrl}/rest/V1/orders?searchCriteria[pageSize]=30&searchCriteria[sortOrders][0][field]=created_at&searchCriteria[sortOrders][0][direction]=DESC`, { headers: mgHeaders });
        if (oResp.ok) {
          const oData = await oResp.json();
          const orderContent = (oData.items || []).map(o =>
            `Order #${o.increment_id} | ${o.status} | ${o.grand_total} ${o.order_currency_code || ''} | ${o.customer_email || 'guest'} | ${(o.created_at || '').split(' ')[0]}`
          ).join('\n').slice(0, 12000);
          if (orderContent.trim()) {
            const docId = crypto.randomUUID();
            await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
              [docId, 'magento', 'Magento Orders', `${mgUrl}/sales/order`, orderContent, orderContent.length]);
            chunkAndEmbedDocument(docId, orderContent).catch(() => {});
            docsAdded++;
          }
        }
      } catch {}

    } else if (integ.provider === 'webcrawl') {
      // Website Crawl: fetch pages and extract text content
      const urls = (config.urls || await getSetting('webcrawl_urls', '')).split('\n').map(u => u.trim()).filter(Boolean);
      if (urls.length === 0) return res.status(400).json({ error: 'Aucune URL configuree pour le crawl.' });
      for (const url of urls.slice(0, 20)) { // limit to 20 URLs
        try {
          const resp = await fetch(url, {
            headers: { 'User-Agent': 'Lamu-Bot/1.0 (Knowledge Base Crawler)' },
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) continue;
          const html = await resp.text();
          // Simple HTML to text extraction
          const content = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 12000);
          if (!content || content.length < 50) continue;
          const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || url;
          const docId = crypto.randomUUID();
          await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, 'webcrawl', title.slice(0, 200), url, content, content.length]);
          chunkAndEmbedDocument(docId, content).catch(() => {});
          docsAdded++;
        } catch {}
      }
    }

    await db.query('UPDATE integrations SET last_sync_at = NOW(), docs_synced = docs_synced + ? WHERE id = ?', [docsAdded, id]);
    emitEvent('integration:synced', { integration_id: id, provider: integ.provider, docs_added: docsAdded });
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

app.get('/api/helpdesk/agents', requireAuth, requireDb, async (req, res) => {
  try {
    const agents = await db.query('SELECT * FROM helpdesk_agents ORDER BY created_at DESC');
    res.json({ agents });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/agents', requireAuth, requireDb, async (req, res) => {
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

app.put('/api/helpdesk/agents/:id', requireAuth, requireDb, async (req, res) => {
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
app.post('/api/helpdesk/incoming', requireDb, async (req, res) => {
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
      // Auto-assign SLA based on default priority
      assignSlaToTicket(tId, 'medium').catch(() => {});
      emitEvent('ticket:new', { ticket_id: tId, subject: message.slice(0, 200), channel: channel || 'webhook', customer_name, customer_email });
      sendOpsEmail('new_ticket', { ticket_id: tId, subject: message.slice(0, 200), channel: channel || 'webhook', customer_email }).catch(() => {});
      auditLog('system', 'ticket_created', 'ticket', tId, { channel: channel || 'webhook', customer_email }, null, 'system');
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
        [escalateReason, 'escalated', JSON.stringify(msgs), tId]);
      // Log analytics
      await db.query('INSERT INTO analytics_conversations (id, ticket_id, channel, sentiment, was_escalated, message_count) VALUES (?,?,?,?,1,?)',
        [crypto.randomUUID(), tId, channel || 'webhook', 'negative', msgs.length]);
      emitEvent('ticket:escalated', { ticket_id: tId, reason: escalateReason, customer_name, customer_email });
      sendOpsEmail('ticket_escalated', { ticket_id: tId, reason: escalateReason, customer_email }).catch(() => {});
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

    // Auto-detect language for multi-lang support
    const ticketLang = detectLanguage(message);
    const ticketLangPrompt = multiLangSystemPrompt(ticketLang);
    const sysPrompt = (agent.system_prompt || 'You are a helpful customer support agent. Be friendly, concise, and helpful.') + ticketLangPrompt + kbContext;
    const aiMsgs = [{ role: 'system', content: sysPrompt }, ...msgs.map(m => ({ role: m.role, content: m.content }))];

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: aiMsgs, max_tokens: 500, temperature: 0.3 })
    });
    if (!aiResp.ok) return res.json({ ticket_id: tId, action: 'logged', error: 'AI call failed' });
    const aiData = await aiResp.json();
    const reply = aiData.choices?.[0]?.message?.content || '';

    msgs.push({ role: 'assistant', content: reply, ts: Date.now() });
    await db.query('UPDATE helpdesk_tickets SET messages = ?, auto_replies_count = auto_replies_count + 1, sentiment = ?, sentiment_score = ? WHERE id = ?',
      [JSON.stringify(msgs), sentiment, sentScore, tId]);

    // AI-powered topic categorization
    const category = await aiCategorize(message);
    const detectedTopics = [category].filter(t => t !== 'general');
    await db.query('UPDATE helpdesk_tickets SET topic = ? WHERE id = ?', [category, tId]);

    // Track first response time
    if (!ticket.first_response_at) {
      await db.query('UPDATE helpdesk_tickets SET first_response_at = NOW() WHERE id = ?', [tId]);
    }

    // Log analytics
    await db.query('INSERT INTO analytics_conversations (id, ticket_id, channel, sentiment, sentiment_score, topics, was_auto_resolved, message_count) VALUES (?,?,?,?,?,?,1,?)',
      [crypto.randomUUID(), tId, channel || 'webhook', sentiment, sentScore, JSON.stringify(detectedTopics), msgs.length]);

    // KB gap detection: if low confidence response, log as gap
    if (reply.toLowerCase().includes("i don't have") || reply.toLowerCase().includes("je n'ai pas") || reply.toLowerCase().includes("i'm not sure") || reply.length < 50) {
      const existingGap = await db.queryOne('SELECT id FROM kb_gaps WHERE query = ?', [message.slice(0, 500)]);
      if (existingGap) {
        await db.query('UPDATE kb_gaps SET frequency = frequency + 1 WHERE id = ?', [existingGap.id]);
      } else {
        await db.query('INSERT INTO kb_gaps (id, query, suggested_title, created_from) VALUES (?,?,?,?)',
          [crypto.randomUUID(), message.slice(0, 500), `FAQ: ${message.slice(0, 100)}`, tId]);
      }
    }

    emitEvent('ticket:replied', { ticket_id: tId, sentiment, reply: reply.slice(0, 200) });
    res.json({ ticket_id: tId, action: 'auto_replied', reply, sentiment, topics: detectedTopics });
  } catch (e) {
    console.error('[helpdesk/incoming]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/helpdesk/tickets', requireAuth, requireDb, async (req, res) => {
  const { status, agent_id, limit: lim } = req.query;
  try {
    let sql = 'SELECT id, agent_id, channel, customer_name, customer_email, subject, status, sentiment, sentiment_score, auto_replies_count, escalated, topic, priority, assigned_to, first_response_at, sla_first_response_breached, sla_resolution_breached, created_at FROM helpdesk_tickets';
    const params = [];
    const where = ['(archived IS NULL OR archived = 0)'];
    if (status) { where.push('status = ?'); params.push(status); }
    if (agent_id) { where.push('agent_id = ?'); params.push(agent_id); }
    sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(lim) || 50);
    const tickets = await db.query(sql, params);
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/helpdesk/tickets/:id', requireAuth, requireDb, async (req, res) => {
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/helpdesk/tickets/:id', requireAuth, requireDb, async (req, res) => {
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

app.get('/api/analytics/overview', requireAuth, requireDb, async (req, res) => {
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

    // Additional useful stats
    const kbDocCount = await db.queryOne('SELECT COUNT(*) as c FROM kb_documents');
    const kbGapsCount = await db.queryOne('SELECT COUNT(*) as c FROM kb_gaps');
    const integrationCount = await db.queryOne('SELECT COUNT(*) as c FROM integrations');
    const activeAgents = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_agents WHERE is_active = 1');
    const avgMsgCount = await db.queryOne('SELECT AVG(message_count) as avg FROM analytics_conversations');
    const resolutionRate = (totalTickets?.c || 0) > 0
      ? parseFloat(((resolvedTickets?.c || 0) / totalTickets.c * 100).toFixed(1))
      : 0;
    const escalationRate = (totalTickets?.c || 0) > 0
      ? parseFloat(((escalatedTickets?.c || 0) / totalTickets.c * 100).toFixed(1))
      : 0;

    res.json({
      total_tickets: totalTickets?.c || 0,
      open_tickets: openTickets?.c || 0,
      resolved_tickets: resolvedTickets?.c || 0,
      escalated_tickets: escalatedTickets?.c || 0,
      auto_resolved: autoResolved?.c || 0,
      resolution_rate: resolutionRate,
      escalation_rate: escalationRate,
      avg_sentiment: avgSentiment?.avg_score ? parseFloat(avgSentiment.avg_score).toFixed(2) : '0.50',
      avg_messages_per_ticket: avgMsgCount?.avg ? parseFloat(avgMsgCount.avg).toFixed(1) : '0',
      sentiment_breakdown: sentimentBreakdown,
      topic_breakdown: Object.entries(topicCounts).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
      channel_breakdown: channelBreakdown,
      daily_volume: dailyVolume,
      kb_documents: kbDocCount?.c || 0,
      kb_gaps: kbGapsCount?.c || 0,
      active_integrations: integrationCount?.c || 0,
      active_agents: activeAgents?.c || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: SIMULATION / TESTING
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/simulation/tests', requireAuth, requireDb, async (req, res) => {
  try {
    const tests = await db.query('SELECT id, name, agent_id, accuracy, avg_similarity, status, run_at, created_at FROM simulation_tests ORDER BY created_at DESC');
    res.json({ tests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/simulation/tests', requireAuth, requireDb, async (req, res) => {
  const { name, agent_id, test_cases } = req.body || {};
  if (!name || !test_cases?.length) return res.status(400).json({ error: 'name and test_cases required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO simulation_tests (id, name, agent_id, test_cases) VALUES (?,?,?,?)',
      [id, name, agent_id || null, JSON.stringify(test_cases)]);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/simulation/tests/:id/run', requireAuth, requireDb, async (req, res) => {
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
            model: getModelForUseCase(ai, 'helpdesk'),
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

app.get('/api/channels', requireAuth, requireDb, async (req, res) => {
  try {
    const channels = await db.query('SELECT ac.*, ha.name as agent_name FROM agent_channels ac LEFT JOIN helpdesk_agents ha ON ha.id = ac.agent_id ORDER BY ac.created_at DESC');
    res.json({ channels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/channels', requireAuth, requireDb, async (req, res) => {
  const { agent_id, channel_type, config } = req.body || {};
  if (!agent_id || !channel_type) return res.status(400).json({ error: 'agent_id and channel_type required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO agent_channels (id, agent_id, channel_type, config) VALUES (?,?,?,?)',
      [id, agent_id, channel_type, JSON.stringify(config || {})]);
    res.json({ id, agent_id, channel_type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/channels/:id', requireAuth, requireDb, async (req, res) => {
  const { is_active, config } = req.body || {};
  try {
    if (is_active != null) await db.query('UPDATE agent_channels SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, req.params.id]);
    if (config) await db.query('UPDATE agent_channels SET config = ? WHERE id = ?', [JSON.stringify(config), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/channels/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM agent_channels WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7: ESCALATION WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/escalation/rules', requireAuth, requireDb, async (req, res) => {
  try {
    const rules = await db.query('SELECT * FROM escalation_rules ORDER BY priority, created_at');
    res.json({ rules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/escalation/rules', requireAuth, requireDb, async (req, res) => {
  const { agent_id, name, condition_type, condition_value, action_type, action_value, priority } = req.body || {};
  if (!name || !condition_type || !condition_value) return res.status(400).json({ error: 'name, condition_type, condition_value required' });
  const id = crypto.randomUUID();
  try {
    await db.query('INSERT INTO escalation_rules (id, agent_id, name, condition_type, condition_value, action_type, action_value, priority) VALUES (?,?,?,?,?,?,?,?)',
      [id, agent_id || null, name, condition_type, condition_value, action_type || 'escalate', action_value || null, priority || 0]);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/escalation/rules/:id', requireAuth, requireDb, async (req, res) => {
  const { name, condition_type, condition_value, action_type, action_value, priority, is_active } = req.body || {};
  try {
    await db.query(
      'UPDATE escalation_rules SET name=COALESCE(?,name), condition_type=COALESCE(?,condition_type), condition_value=COALESCE(?,condition_value), action_type=COALESCE(?,action_type), action_value=COALESCE(?,action_value), priority=COALESCE(?,priority), is_active=COALESCE(?,is_active) WHERE id=?',
      [name, condition_type, condition_value, action_type, action_value, priority, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/escalation/rules/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM escalation_rules WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 8: TEAM COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/team', requireAuth, requireDb, async (req, res) => {
  try {
    const members = await db.query('SELECT id, email, name, role, status, last_active_at, created_at FROM team_members ORDER BY created_at');
    res.json({ members });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team/invite', requireAuth, requireDb, async (req, res) => {
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

app.put('/api/team/:id', requireAuth, requireDb, async (req, res) => {
  const { role, name, status } = req.body || {};
  try {
    await db.query('UPDATE team_members SET role=COALESCE(?,role), name=COALESCE(?,name), status=COALESCE(?,status) WHERE id=?',
      [role, name, status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM team_members WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 9: SLACK BOT NATIF (Events API + Web API)
// ═══════════════════════════════════════════════════════════════════════════════

// Slack sends a verification challenge on initial Events API setup
// Also handles incoming messages from Slack users
app.post('/api/slack/events', requireDb, async (req, res) => {
  // 1) URL verification challenge
  if (req.body?.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }

  // 2) Verify Slack signature if signing secret is configured
  const signingSecret = await getSetting('slack_signing_secret', process.env.SLACK_SIGNING_SECRET || '');
  if (signingSecret) {
    const timestamp = req.headers['x-slack-request-timestamp'];
    const sig = req.headers['x-slack-signature'];
    if (timestamp && sig) {
      const fiveMin = 5 * 60;
      if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > fiveMin) {
        return res.status(403).json({ error: 'Request too old' });
      }
      const rawBody = JSON.stringify(req.body);
      const baseString = `v0:${timestamp}:${rawBody}`;
      const myHash = 'v0=' + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(myHash), Buffer.from(sig))) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }
  }

  // 3) Handle event callbacks
  if (req.body?.type === 'event_callback') {
    const event = req.body.event;
    // Ignore bot messages to avoid infinite loops
    if (event?.bot_id || event?.subtype === 'bot_message') {
      return res.json({ ok: true });
    }

    // Handle message events (DMs and @mentions in channels)
    if (event?.type === 'message' || event?.type === 'app_mention') {
      res.json({ ok: true }); // Respond to Slack quickly (3s timeout)

      try {
        const slackBotToken = await getSetting('slack_bot_token', process.env.SLACK_BOT_TOKEN || '');
        if (!slackBotToken) { console.log('[slack-bot] No bot token configured'); return; }

        const userMessage = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
        if (!userMessage) return;

        const channelId = event.channel;
        const threadTs = event.thread_ts || event.ts; // Reply in thread
        const userId = event.user;

        // Find or create a Slack channel config → linked agent
        let agentChannel = await db.queryOne(
          "SELECT * FROM agent_channels WHERE channel_type = 'slack' AND is_active = 1 ORDER BY created_at LIMIT 1"
        );
        let agent;
        if (agentChannel) {
          agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ? AND is_active = 1', [agentChannel.agent_id]);
        }
        if (!agent) {
          agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
        }
        if (!agent) { console.log('[slack-bot] No active agent'); return; }

        // Use external_id = slack:{channel}:{threadTs} for ticket tracking
        const externalId = `slack:${channelId}:${threadTs}`;
        let ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE external_id = ?', [externalId]);
        let tId;

        if (ticket) {
          tId = ticket.id;
        } else {
          tId = crypto.randomUUID();
          // Lookup Slack user info for name
          let userName = userId;
          try {
            const userResp = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
              headers: { Authorization: `Bearer ${slackBotToken}` }
            });
            const userData = await userResp.json();
            if (userData.ok) userName = userData.user?.real_name || userData.user?.name || userId;
          } catch {}

          await db.query(
            'INSERT INTO helpdesk_tickets (id, agent_id, channel, external_id, customer_name, customer_email, subject, messages) VALUES (?,?,?,?,?,?,?,?)',
            [tId, agent.id, 'slack', externalId, userName, null, userMessage.slice(0, 200), JSON.stringify([])]
          );
          ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [tId]);
          emitEvent('ticket:new', { ticket_id: tId, subject: userMessage.slice(0, 200), channel: 'slack', customer_name: userName });
        }

        // Add user message to ticket
        const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
        msgs.push({ role: 'user', content: userMessage, ts: Date.now(), slack_user: userId });

        // Auto-categorize
        const category = await aiCategorize(userMessage);

        // Check escalation rules
        const rules = await db.query('SELECT * FROM escalation_rules WHERE agent_id = ? AND is_active = 1 ORDER BY priority', [agent.id]);
        let shouldEscalate = false, escalateReason = '';
        for (const rule of rules) {
          if (rule.condition_type === 'keyword' && userMessage.toLowerCase().includes(rule.condition_value.toLowerCase())) {
            shouldEscalate = true; escalateReason = rule.name; break;
          }
          if (rule.condition_type === 'max_replies' && (ticket.auto_replies_count || 0) >= parseInt(rule.condition_value)) {
            shouldEscalate = true; escalateReason = rule.name; break;
          }
        }

        if (shouldEscalate) {
          await db.query('UPDATE helpdesk_tickets SET escalated = 1, escalated_reason = ?, status = ?, messages = ?, topic = ? WHERE id = ?',
            [escalateReason, 'escalated', JSON.stringify(msgs), category, tId]);
          // Notify in Slack thread
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackBotToken}` },
            body: JSON.stringify({ channel: channelId, thread_ts: threadTs, text: `⚠️ Ce ticket a été escaladé à un agent humain. Raison : ${escalateReason}. Un membre de notre équipe vous répondra bientôt.` })
          });
          emitEvent('ticket:escalated', { ticket_id: tId, reason: escalateReason, channel: 'slack' });
          return;
        }

        // Generate AI response
        if (!agent.auto_reply) {
          await db.query('UPDATE helpdesk_tickets SET messages = ?, topic = ? WHERE id = ?', [JSON.stringify(msgs), category, tId]);
          return;
        }

        const ai = await getAiConfig();
        if (!ai.primaryUrl || !ai.primaryKey) return;

        let kbContext = '';
        try {
          const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
          if (kbDocs.length > 0) kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 16000);
        } catch {}

        const sysPrompt = (agent.system_prompt || 'You are a helpful customer support agent. Be friendly, concise, and helpful.') + kbContext;
        const aiMsgs = [{ role: 'system', content: sysPrompt }, ...msgs.map(m => ({ role: m.role, content: m.content }))];

        const aiResp = await fetch(ai.primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
          body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: aiMsgs, max_tokens: 500, temperature: 0.3 })
        });
        if (!aiResp.ok) return;
        const aiData = await aiResp.json();
        const reply = aiData.choices?.[0]?.message?.content || '';
        if (!reply) return;

        msgs.push({ role: 'assistant', content: reply, ts: Date.now() });
        await db.query('UPDATE helpdesk_tickets SET messages = ?, auto_replies_count = auto_replies_count + 1, topic = ? WHERE id = ?',
          [JSON.stringify(msgs), category, tId]);

        // Update SLA first_response_at if first reply
        if (!ticket.first_response_at) {
          await db.query('UPDATE helpdesk_tickets SET first_response_at = NOW() WHERE id = ?', [tId]);
        }

        // Post reply to Slack
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackBotToken}` },
          body: JSON.stringify({ channel: channelId, thread_ts: threadTs, text: reply })
        });

        // Update agent_channels messages_handled
        if (agentChannel) {
          await db.query('UPDATE agent_channels SET messages_handled = messages_handled + 1 WHERE id = ?', [agentChannel.id]);
        }

        emitEvent('ticket:replied', { ticket_id: tId, channel: 'slack', reply: reply.slice(0, 200) });
      } catch (e) {
        console.error('[slack-bot]', e.message);
      }
      return;
    }
  }

  res.json({ ok: true });
});

// Slack bot config endpoint — admin sets bot token + signing secret
app.post('/api/slack/bot/config', requireAuth, requireDb, async (req, res) => {
  const { bot_token, signing_secret, default_agent_id } = req.body || {};
  try {
    if (bot_token) await db.query("INSERT INTO settings (`key`, value) VALUES ('slack_bot_token', ?) ON DUPLICATE KEY UPDATE value = ?", [bot_token, bot_token]);
    if (signing_secret) await db.query("INSERT INTO settings (`key`, value) VALUES ('slack_signing_secret', ?) ON DUPLICATE KEY UPDATE value = ?", [signing_secret, signing_secret]);
    if (default_agent_id) {
      // Create or update the Slack agent channel
      const existing = await db.queryOne("SELECT id FROM agent_channels WHERE channel_type = 'slack'");
      if (existing) {
        await db.query('UPDATE agent_channels SET agent_id = ?, config = ? WHERE id = ?', [default_agent_id, JSON.stringify({ type: 'native_bot' }), existing.id]);
      } else {
        await db.query('INSERT INTO agent_channels (id, agent_id, channel_type, config) VALUES (?,?,?,?)',
          [crypto.randomUUID(), default_agent_id, 'slack', JSON.stringify({ type: 'native_bot' })]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/slack/bot/config', requireAuth, requireDb, async (req, res) => {
  try {
    const botToken = await getSetting('slack_bot_token', '');
    const signingSecret = await getSetting('slack_signing_secret', '');
    const channel = await db.queryOne("SELECT * FROM agent_channels WHERE channel_type = 'slack' ORDER BY created_at LIMIT 1");
    res.json({
      configured: !!(botToken && signingSecret),
      has_bot_token: !!botToken,
      has_signing_secret: !!signingSecret,
      default_agent_id: channel?.agent_id || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 10: MICROSOFT TEAMS BOT (Bot Framework)
// ═══════════════════════════════════════════════════════════════════════════════

// Teams sends messages via Bot Framework webhook
app.post('/api/teams/messages', requireDb, async (req, res) => {
  try {
    const activity = req.body;

    // Verify Bot Framework auth (optional, requires MS App ID)
    const teamsAppId = await getSetting('teams_app_id', process.env.TEAMS_APP_ID || '');
    const teamsAppSecret = await getSetting('teams_app_secret', process.env.TEAMS_APP_SECRET || '');

    if (!teamsAppId || !teamsAppSecret) {
      return res.status(503).json({ error: 'Teams bot not configured' });
    }

    // Handle conversation update (bot added to team)
    if (activity.type === 'conversationUpdate') {
      res.status(200).send();
      return;
    }

    // Handle incoming messages
    if (activity.type === 'message') {
      res.status(200).send(); // Respond quickly

      const userMessage = (activity.text || '').replace(/<at>.*?<\/at>/g, '').trim();
      if (!userMessage) return;

      const conversationId = activity.conversation?.id;
      const userName = activity.from?.name || 'Teams User';
      const userId = activity.from?.id;

      // Find agent for Teams channel
      let agentChannel = await db.queryOne(
        "SELECT * FROM agent_channels WHERE channel_type = 'teams' AND is_active = 1 ORDER BY created_at LIMIT 1"
      );
      let agent;
      if (agentChannel) {
        agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ? AND is_active = 1', [agentChannel.agent_id]);
      }
      if (!agent) {
        agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
      }
      if (!agent) return;

      // Track ticket by conversation
      const externalId = `teams:${conversationId}`;
      let ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE external_id = ?', [externalId]);
      let tId;

      if (ticket) {
        tId = ticket.id;
      } else {
        tId = crypto.randomUUID();
        await db.query(
          'INSERT INTO helpdesk_tickets (id, agent_id, channel, external_id, customer_name, subject, messages) VALUES (?,?,?,?,?,?,?)',
          [tId, agent.id, 'teams', externalId, userName, userMessage.slice(0, 200), JSON.stringify([])]
        );
        ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [tId]);
        emitEvent('ticket:new', { ticket_id: tId, subject: userMessage.slice(0, 200), channel: 'teams', customer_name: userName });
      }

      const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
      msgs.push({ role: 'user', content: userMessage, ts: Date.now(), teams_user: userId });

      // Auto-categorize
      const category = await aiCategorize(userMessage);

      // Generate AI response
      if (!agent.auto_reply) {
        await db.query('UPDATE helpdesk_tickets SET messages = ?, topic = ? WHERE id = ?', [JSON.stringify(msgs), category, tId]);
        return;
      }

      const ai = await getAiConfig();
      if (!ai.primaryUrl || !ai.primaryKey) return;

      let kbContext = '';
      try {
        const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
        if (kbDocs.length > 0) kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 16000);
      } catch {}

      const sysPrompt = (agent.system_prompt || 'You are a helpful customer support agent.') + kbContext;
      const aiMsgs = [{ role: 'system', content: sysPrompt }, ...msgs.map(m => ({ role: m.role, content: m.content }))];

      const aiResp = await fetch(ai.primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
        body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: aiMsgs, max_tokens: 500, temperature: 0.3 })
      });
      if (!aiResp.ok) return;
      const aiData = await aiResp.json();
      const reply = aiData.choices?.[0]?.message?.content || '';
      if (!reply) return;

      msgs.push({ role: 'assistant', content: reply, ts: Date.now() });
      await db.query('UPDATE helpdesk_tickets SET messages = ?, auto_replies_count = auto_replies_count + 1, topic = ? WHERE id = ?',
        [JSON.stringify(msgs), category, tId]);

      if (!ticket.first_response_at) {
        await db.query('UPDATE helpdesk_tickets SET first_response_at = NOW() WHERE id = ?', [tId]);
      }

      // Get Bot Framework access token to reply
      const tokenResp = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(teamsAppId)}&client_secret=${encodeURIComponent(teamsAppSecret)}&scope=https%3A%2F%2Fapi.botframework.com%2F.default`
      });
      const tokenData = await tokenResp.json();
      const botToken = tokenData.access_token;
      if (!botToken) { console.error('[teams-bot] Failed to get Bot Framework token'); return; }

      // Reply via Bot Framework
      const serviceUrl = activity.serviceUrl;
      const replyUrl = `${serviceUrl}v3/conversations/${encodeURIComponent(conversationId)}/activities/${activity.id}`;
      await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({
          type: 'message',
          text: reply,
          from: { id: teamsAppId, name: 'Lamu Bot' },
          conversation: activity.conversation,
          replyToId: activity.id,
        })
      });

      if (agentChannel) {
        await db.query('UPDATE agent_channels SET messages_handled = messages_handled + 1 WHERE id = ?', [agentChannel.id]);
      }
      emitEvent('ticket:replied', { ticket_id: tId, channel: 'teams', reply: reply.slice(0, 200) });
    } else {
      res.status(200).send();
    }
  } catch (e) {
    console.error('[teams-bot]', e.message);
    res.status(200).send(); // Always 200 to Teams
  }
});

// Teams bot config
app.post('/api/teams/bot/config', requireAuth, requireDb, async (req, res) => {
  const { app_id, app_secret, default_agent_id } = req.body || {};
  try {
    if (app_id) await db.query("INSERT INTO settings (`key`, value) VALUES ('teams_app_id', ?) ON DUPLICATE KEY UPDATE value = ?", [app_id, app_id]);
    if (app_secret) await db.query("INSERT INTO settings (`key`, value) VALUES ('teams_app_secret', ?) ON DUPLICATE KEY UPDATE value = ?", [app_secret, app_secret]);
    if (default_agent_id) {
      const existing = await db.queryOne("SELECT id FROM agent_channels WHERE channel_type = 'teams'");
      if (existing) {
        await db.query('UPDATE agent_channels SET agent_id = ?, config = ? WHERE id = ?', [default_agent_id, JSON.stringify({ type: 'native_bot' }), existing.id]);
      } else {
        await db.query('INSERT INTO agent_channels (id, agent_id, channel_type, config) VALUES (?,?,?,?)',
          [crypto.randomUUID(), default_agent_id, 'teams', JSON.stringify({ type: 'native_bot' })]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/teams/bot/config', requireAuth, requireDb, async (req, res) => {
  try {
    const appId = await getSetting('teams_app_id', '');
    const appSecret = await getSetting('teams_app_secret', '');
    const channel = await db.queryOne("SELECT * FROM agent_channels WHERE channel_type = 'teams' ORDER BY created_at LIMIT 1");
    res.json({
      configured: !!(appId && appSecret),
      has_app_id: !!appId,
      has_app_secret: !!appSecret,
      default_agent_id: channel?.agent_id || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP BOT
// ═══════════════════════════════════════════════════════════════════════════════

// WhatsApp Webhook verification (Meta sends GET with challenge)
app.get('/api/whatsapp/webhook', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (!_dbReady) return res.sendStatus(503);
    const verifyToken = await getSetting('whatsapp_verify_token', process.env.WHATSAPP_VERIFY_TOKEN || '');
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[whatsapp] Webhook verified');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  } catch (e) {
    console.error('[whatsapp] Verify error:', e.message);
    res.sendStatus(500);
  }
});

// WhatsApp Webhook — incoming messages
// Helper: send a WhatsApp text message
async function sendWhatsApp(phoneNumberId, accessToken, to, text) {
  return fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
  });
}

app.post('/api/whatsapp/webhook', requireDb, async (req, res) => {
  res.status(200).send('EVENT_RECEIVED'); // Always respond quickly to Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const accessToken = await getSetting('whatsapp_access_token', process.env.WHATSAPP_ACCESS_TOKEN || '');
    const phoneNumberId = await getSetting('whatsapp_phone_number_id', process.env.WHATSAPP_PHONE_NUMBER_ID || '');
    if (!accessToken || !phoneNumberId) { console.log('[whatsapp] Not configured'); return; }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value?.messages?.length) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;
          const userMessage = msg.text?.body?.trim();
          if (!userMessage) continue;

          const senderPhone = msg.from;
          const senderName = value.contacts?.[0]?.profile?.name || senderPhone;

          // ── Step 1: Identify sender — Lamu client or end-customer? ──
          let lamuClient = null;
          try {
            lamuClient = await db.queryOne(
              "SELECT * FROM licenses WHERE whatsapp_phone = ? AND is_active = 1 LIMIT 1",
              [senderPhone]
            );
            // Fallback: try matching by name if phone not linked yet
            if (!lamuClient) {
              lamuClient = await db.queryOne(
                "SELECT * FROM licenses WHERE customer_name = ? AND is_active = 1 LIMIT 1",
                [senderName]
              );
            }
          } catch {}

          const isLamuClient = !!lamuClient;
          const channelTag = isLamuClient ? 'whatsapp_client' : 'whatsapp';

          // ── Step 2: Find the helpdesk agent ──
          let agentChannel = await db.queryOne(
            "SELECT * FROM agent_channels WHERE channel_type = 'whatsapp' AND is_active = 1 ORDER BY created_at LIMIT 1"
          );
          let agent;
          if (agentChannel) {
            agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ? AND is_active = 1', [agentChannel.agent_id]);
          }
          if (!agent) {
            agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
          }
          if (!agent) { console.log('[whatsapp] No active agent'); return; }

          // ── Step 3: Build system prompt based on sender type ──
          const ai = await getAiConfig();
          if (!ai.primaryUrl || !ai.primaryKey) return;

          let kbContext = '';
          try {
            const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
            if (kbDocs.length > 0) kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 16000);
          } catch {}

          let sysPrompt;
          let useCase;

          if (isLamuClient) {
            // ── MODE: Business Assistant (client Lamu) ──
            // The sender is a paying Lamu customer — help them manage their business
            const planInfo = lamuClient.plan ? `Plan: ${lamuClient.plan}` : '';
            const expiresInfo = lamuClient.expires_at ? `Expiration: ${new Date(lamuClient.expires_at).toLocaleDateString('fr-FR')}` : '';
            const reqInfo = lamuClient.max_requests ? `Quota: ${lamuClient.max_requests} requêtes/mois` : '';

            sysPrompt = `Tu es Lamu, l'assistant IA personnel de ${lamuClient.customer_name || senderName}.
Ce client a un compte Lamu actif. Voici ses infos :
- Nom: ${lamuClient.customer_name || senderName}
- Email: ${lamuClient.customer_email || '—'}
- ${planInfo}
- ${expiresInfo}
- ${reqInfo}

## Ton rôle
Tu es un assistant business intelligent. Tu peux :
1. **Répondre à ses questions** sur Lamu, ses fonctionnalités, sa licence, son plan
2. **L'aider à rédiger des réponses** pour ses propres clients — il te donne le message du client et tu proposes une réponse professionnelle
3. **L'aider dans son travail quotidien** — rédaction d'emails, résumés, analyses, traductions
4. **Donner des conseils business** — satisfaction client, gestion de tickets, communication

## Règles
- Réponds toujours en français sauf si le client écrit dans une autre langue
- Sois concis et professionnel — c'est WhatsApp, pas un email
- Si le client te demande de "répondre à un client", rédige une réponse prête à copier-coller
- Ne mentionne jamais les détails techniques internes de Lamu
- Si le client demande quelque chose que tu ne peux pas faire (modifier sa licence, changer son plan), dis-lui de contacter le support à support@lamuka.com` + kbContext;

            useCase = 'chat'; // Use the general chat model (smarter)
            console.log(`[whatsapp] Lamu client identified: ${lamuClient.customer_name} (${senderPhone})`);
          } else {
            // ── MODE: End-customer support ──
            // The sender is a customer of our client — use the helpdesk agent prompt
            sysPrompt = (agent.system_prompt || 'Tu es un agent de support client. Sois amical, concis et utile. Réponds en français.') + kbContext;
            useCase = 'helpdesk';
            console.log(`[whatsapp] End-customer: ${senderName} (${senderPhone})`);
          }

          // ── Step 4: Track conversation as ticket ──
          const externalId = `${channelTag}:${senderPhone}`;
          let ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE external_id = ?', [externalId]);
          let tId;

          if (ticket) {
            tId = ticket.id;
          } else {
            tId = crypto.randomUUID();
            await db.query(
              'INSERT INTO helpdesk_tickets (id, agent_id, channel, external_id, customer_name, subject, messages) VALUES (?,?,?,?,?,?,?)',
              [tId, agent.id, channelTag, externalId, senderName, userMessage.slice(0, 200), JSON.stringify([])]
            );
            ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [tId]);
            emitEvent('ticket:new', { ticket_id: tId, subject: userMessage.slice(0, 200), channel: channelTag, customer_name: senderName });
          }

          const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
          msgs.push({ role: 'user', content: userMessage, ts: Date.now(), whatsapp_phone: senderPhone });

          // Auto-categorize
          const category = await aiCategorize(userMessage);

          // ── Step 5: Escalation check (only for end-customers) ──
          if (!isLamuClient) {
            const rules = await db.query('SELECT * FROM escalation_rules WHERE agent_id = ? AND is_active = 1 ORDER BY priority', [agent.id]);
            let shouldEscalate = false, escalateReason = '';
            for (const rule of rules) {
              if (rule.condition_type === 'keyword' && userMessage.toLowerCase().includes(rule.condition_value.toLowerCase())) {
                shouldEscalate = true; escalateReason = rule.name; break;
              }
              if (rule.condition_type === 'max_replies' && (ticket.auto_replies_count || 0) >= parseInt(rule.condition_value)) {
                shouldEscalate = true; escalateReason = rule.name; break;
              }
            }

            if (shouldEscalate) {
              await db.query('UPDATE helpdesk_tickets SET escalated = 1, escalated_reason = ?, status = ?, messages = ?, topic = ? WHERE id = ?',
                [escalateReason, 'escalated', JSON.stringify(msgs), category, tId]);
              await sendWhatsApp(phoneNumberId, accessToken, senderPhone,
                `Votre demande a été transférée à un agent humain. Raison : ${escalateReason}. Un membre de notre équipe vous répondra bientôt.`);
              emitEvent('ticket:escalated', { ticket_id: tId, reason: escalateReason, channel: channelTag });
              return;
            }

            // If auto_reply disabled for end-customers, just save
            if (!agent.auto_reply) {
              await db.query('UPDATE helpdesk_tickets SET messages = ?, topic = ? WHERE id = ?', [JSON.stringify(msgs), category, tId]);
              return;
            }
          }

          // ── Step 6: Generate AI response ──
          // Keep last 20 messages for context window
          const contextMsgs = msgs.slice(-20);
          const aiMsgs = [{ role: 'system', content: sysPrompt }, ...contextMsgs.map(m => ({ role: m.role, content: m.content }))];

          const aiResp = await fetch(ai.primaryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
            body: JSON.stringify({
              model: getModelForUseCase(ai, useCase),
              messages: aiMsgs,
              max_tokens: isLamuClient ? 1000 : 500,
              temperature: isLamuClient ? 0.5 : 0.3
            })
          });
          if (!aiResp.ok) {
            console.error('[whatsapp] AI error:', aiResp.status);
            return;
          }
          const aiData = await aiResp.json();
          const reply = aiData.choices?.[0]?.message?.content || '';
          if (!reply) return;

          msgs.push({ role: 'assistant', content: reply, ts: Date.now() });
          await db.query('UPDATE helpdesk_tickets SET messages = ?, auto_replies_count = auto_replies_count + 1, topic = ? WHERE id = ?',
            [JSON.stringify(msgs), category, tId]);

          if (!ticket.first_response_at) {
            await db.query('UPDATE helpdesk_tickets SET first_response_at = NOW() WHERE id = ?', [tId]);
          }

          // ── Step 7: Send reply via WhatsApp ──
          await sendWhatsApp(phoneNumberId, accessToken, senderPhone, reply);

          if (agentChannel) {
            await db.query('UPDATE agent_channels SET messages_handled = messages_handled + 1 WHERE id = ?', [agentChannel.id]);
          }
          emitEvent('ticket:replied', { ticket_id: tId, channel: channelTag, reply: reply.slice(0, 200), is_lamu_client: isLamuClient });
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp]', e.message);
  }
});

// WhatsApp bot config — admin sets access token + phone number ID
app.post('/api/whatsapp/bot/config', requireAuth, requireDb, async (req, res) => {
  const { phone_number_id, access_token, verify_token, default_agent_id } = req.body || {};
  try {
    if (phone_number_id) await db.query("INSERT INTO settings (`key`, value) VALUES ('whatsapp_phone_number_id', ?) ON DUPLICATE KEY UPDATE value = ?", [phone_number_id, phone_number_id]);
    if (access_token) await db.query("INSERT INTO settings (`key`, value) VALUES ('whatsapp_access_token', ?) ON DUPLICATE KEY UPDATE value = ?", [access_token, access_token]);
    if (verify_token) await db.query("INSERT INTO settings (`key`, value) VALUES ('whatsapp_verify_token', ?) ON DUPLICATE KEY UPDATE value = ?", [verify_token, verify_token]);
    if (default_agent_id) {
      const existing = await db.queryOne("SELECT id FROM agent_channels WHERE channel_type = 'whatsapp'");
      if (existing) {
        await db.query('UPDATE agent_channels SET agent_id = ?, config = ? WHERE id = ?', [default_agent_id, JSON.stringify({ type: 'native_bot' }), existing.id]);
      } else {
        await db.query('INSERT INTO agent_channels (id, agent_id, channel_type, config) VALUES (?,?,?,?)',
          [crypto.randomUUID(), default_agent_id, 'whatsapp', JSON.stringify({ type: 'native_bot' })]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/whatsapp/bot/config', requireAuth, requireDb, async (req, res) => {
  try {
    const phoneId = await getSetting('whatsapp_phone_number_id', '');
    const token = await getSetting('whatsapp_access_token', '');
    const channel = await db.queryOne("SELECT * FROM agent_channels WHERE channel_type = 'whatsapp' ORDER BY created_at LIMIT 1");
    res.json({
      configured: !!(phoneId && token),
      has_phone_id: !!phoneId,
      has_token: !!token,
      default_agent_id: channel?.agent_id || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 11: AUTO-CATEGORISATION IA DES TICKETS
// ═══════════════════════════════════════════════════════════════════════════════

// AI-powered categorization helper — used by incoming, slack bot, teams bot, whatsapp bot
async function aiCategorize(message) {
  // First try keyword-based (fast, no API call)
  const keywordCategories = {
    billing: /bill|invoice|payment|charge|prix|facture|paiement|abonn|subscri|refund|rembours/i,
    account: /account|login|password|access|compte|connexion|mot de passe|sign.?in|register|inscrip/i,
    technical: /bug|error|crash|broken|slow|not work|ne marche|technique|erreur|plantage|down|outage|panne/i,
    shipping: /ship|deliver|track|order|livraison|commande|suivi|colis|expédi/i,
    feature_request: /feature|request|suggestion|fonctionnalit|améliorer|improve|add|ajouter|wish|souhai/i,
    onboarding: /start|setup|install|configur|begin|commencer|démarr|guide|tutori/i,
    cancellation: /cancel|annul|stop|arrêt|résilier|unsubscri|désabonn/i,
    general: /./,
  };

  for (const [cat, rx] of Object.entries(keywordCategories)) {
    if (cat === 'general') continue;
    if (rx.test(message)) return cat;
  }

  // If no keyword match, use AI for smart classification
  try {
    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return 'general';

    const resp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({
        model: getModelForUseCase(ai, 'chat'),
        messages: [
          { role: 'system', content: 'Classify the following customer support message into exactly ONE category. Categories: billing, account, technical, shipping, feature_request, onboarding, cancellation, sales, security, general. Reply with ONLY the category name, nothing else.' },
          { role: 'user', content: message.slice(0, 500) }
        ],
        max_tokens: 20,
        temperature: 0
      })
    });
    if (!resp.ok) return 'general';
    const data = await resp.json();
    const cat = (data.choices?.[0]?.message?.content || 'general').trim().toLowerCase().replace(/[^a-z_]/g, '');
    const validCats = ['billing','account','technical','shipping','feature_request','onboarding','cancellation','sales','security','general'];
    return validCats.includes(cat) ? cat : 'general';
  } catch {
    return 'general';
  }
}

// Manual re-categorize endpoint
app.post('/api/helpdesk/tickets/:id/categorize', requireAuth, requireDb, async (req, res) => {
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Use the latest message for categorization
    const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
    const userMsgs = msgs.filter(m => m.role === 'user');
    const lastMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : (ticket.subject || '');
    const category = await aiCategorize(lastMsg);

    await db.query('UPDATE helpdesk_tickets SET topic = ? WHERE id = ?', [category, req.params.id]);
    res.json({ ticket_id: req.params.id, topic: category });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk categorize all uncategorized tickets
app.post('/api/helpdesk/tickets/bulk-categorize', requireAuth, requireDb, async (req, res) => {
  try {
    const uncategorized = await db.query("SELECT id, subject, messages FROM helpdesk_tickets WHERE topic IS NULL OR topic = '' LIMIT 100");
    const results = [];
    for (const ticket of uncategorized) {
      const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
      const userMsgs = msgs.filter(m => m.role === 'user');
      const text = userMsgs.length > 0 ? userMsgs[0].content : (ticket.subject || '');
      const category = await aiCategorize(text);
      await db.query('UPDATE helpdesk_tickets SET topic = ? WHERE id = ?', [category, ticket.id]);
      results.push({ id: ticket.id, topic: category });
    }
    res.json({ categorized: results.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Topic stats endpoint
app.get('/api/helpdesk/topics', requireAuth, requireDb, async (req, res) => {
  try {
    const topics = await db.query("SELECT topic, COUNT(*) as count FROM helpdesk_tickets WHERE topic IS NOT NULL AND topic != '' GROUP BY topic ORDER BY count DESC");
    res.json({ topics });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 12: SLA TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureSlaTable() {
  // Add SLA columns to helpdesk_tickets
  const cols = [
    ['topic', "ALTER TABLE helpdesk_tickets ADD COLUMN topic VARCHAR(100) DEFAULT NULL"],
    ['first_response_at', "ALTER TABLE helpdesk_tickets ADD COLUMN first_response_at TIMESTAMP NULL"],
    ['sla_first_response_minutes', "ALTER TABLE helpdesk_tickets ADD COLUMN sla_first_response_minutes INT DEFAULT NULL"],
    ['sla_resolution_minutes', "ALTER TABLE helpdesk_tickets ADD COLUMN sla_resolution_minutes INT DEFAULT NULL"],
    ['sla_first_response_breached', "ALTER TABLE helpdesk_tickets ADD COLUMN sla_first_response_breached TINYINT(1) DEFAULT 0"],
    ['sla_resolution_breached', "ALTER TABLE helpdesk_tickets ADD COLUMN sla_resolution_breached TINYINT(1) DEFAULT 0"],
    ['priority', "ALTER TABLE helpdesk_tickets ADD COLUMN priority VARCHAR(20) DEFAULT 'medium'"],
    ['assigned_to', "ALTER TABLE helpdesk_tickets ADD COLUMN assigned_to VARCHAR(100) DEFAULT NULL"],
  ];
  for (const [col, sql] of cols) {
    try { await db.query(sql); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  }

  // SLA policies table
  await db.query(`
    CREATE TABLE IF NOT EXISTS sla_policies (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium',
      first_response_minutes INT DEFAULT 60,
      resolution_minutes INT DEFAULT 480,
      business_hours_only TINYINT(1) DEFAULT 1,
      applies_to_plan VARCHAR(100) DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// CRUD for SLA policies
app.get('/api/sla/policies', requireAuth, requireDb, async (req, res) => {
  try {
    const policies = await db.query('SELECT * FROM sla_policies ORDER BY priority, created_at');
    res.json({ policies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sla/policies', requireAuth, requireDb, async (req, res) => {
  const { name, priority, first_response_minutes, resolution_minutes, business_hours_only, applies_to_plan } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO sla_policies (id, name, priority, first_response_minutes, resolution_minutes, business_hours_only, applies_to_plan) VALUES (?,?,?,?,?,?,?)',
      [id, name, priority || 'medium', first_response_minutes || 60, resolution_minutes || 480, business_hours_only !== false ? 1 : 0, applies_to_plan || null]
    );
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sla/policies/:id', requireAuth, requireDb, async (req, res) => {
  const { name, priority, first_response_minutes, resolution_minutes, business_hours_only, is_active } = req.body || {};
  try {
    await db.query(
      'UPDATE sla_policies SET name=COALESCE(?,name), priority=COALESCE(?,priority), first_response_minutes=COALESCE(?,first_response_minutes), resolution_minutes=COALESCE(?,resolution_minutes), business_hours_only=COALESCE(?,business_hours_only), is_active=COALESCE(?,is_active) WHERE id=?',
      [name, priority, first_response_minutes, resolution_minutes, business_hours_only != null ? (business_hours_only ? 1 : 0) : null, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sla/policies/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM sla_policies WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Assign SLA to a ticket based on priority
async function assignSlaToTicket(ticketId, priority = 'medium') {
  try {
    const policy = await db.queryOne(
      'SELECT * FROM sla_policies WHERE priority = ? AND is_active = 1 ORDER BY created_at LIMIT 1',
      [priority]
    );
    if (!policy) return;
    await db.query(
      'UPDATE helpdesk_tickets SET sla_first_response_minutes = ?, sla_resolution_minutes = ?, priority = ? WHERE id = ?',
      [policy.first_response_minutes, policy.resolution_minutes, priority, ticketId]
    );
  } catch {}
}

// SLA breach check — call periodically or on-demand
app.get('/api/sla/check', requireAuth, requireDb, async (req, res) => {
  try {
    const now = new Date();
    // Check first response SLA
    const noFirstResponse = await db.query(
      "SELECT id, created_at, sla_first_response_minutes FROM helpdesk_tickets WHERE status = 'open' AND first_response_at IS NULL AND sla_first_response_minutes IS NOT NULL AND sla_first_response_breached = 0"
    );
    let breached = 0;
    for (const t of noFirstResponse) {
      const created = new Date(t.created_at);
      const elapsed = (now - created) / 60000; // minutes
      if (elapsed > t.sla_first_response_minutes) {
        await db.query('UPDATE helpdesk_tickets SET sla_first_response_breached = 1 WHERE id = ?', [t.id]);
        emitEvent('sla:breach', { ticket_id: t.id, type: 'first_response', elapsed_minutes: Math.round(elapsed), target_minutes: t.sla_first_response_minutes });
        breached++;
      }
    }

    // Check resolution SLA
    const unresolved = await db.query(
      "SELECT id, created_at, sla_resolution_minutes FROM helpdesk_tickets WHERE status != 'resolved' AND resolved = 0 AND sla_resolution_minutes IS NOT NULL AND sla_resolution_breached = 0"
    );
    for (const t of unresolved) {
      const created = new Date(t.created_at);
      const elapsed = (now - created) / 60000;
      if (elapsed > t.sla_resolution_minutes) {
        await db.query('UPDATE helpdesk_tickets SET sla_resolution_breached = 1 WHERE id = ?', [t.id]);
        emitEvent('sla:breach', { ticket_id: t.id, type: 'resolution', elapsed_minutes: Math.round(elapsed), target_minutes: t.sla_resolution_minutes });
        breached++;
      }
    }

    res.json({ checked: noFirstResponse.length + unresolved.length, breached });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SLA dashboard stats
app.get('/api/sla/stats', requireAuth, requireDb, async (req, res) => {
  try {
    const total = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_first_response_minutes IS NOT NULL');
    const frBreached = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_first_response_breached = 1');
    const resBreached = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_resolution_breached = 1');

    // Avg first response time (minutes)
    const avgFr = await db.queryOne(
      "SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, first_response_at)) as avg_min FROM helpdesk_tickets WHERE first_response_at IS NOT NULL"
    );
    // Avg resolution time (minutes)
    const avgRes = await db.queryOne(
      "SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) as avg_min FROM helpdesk_tickets WHERE resolved_at IS NOT NULL"
    );

    // SLA compliance rate
    const withSla = total?.c || 0;
    const frComplianceRate = withSla > 0 ? parseFloat(((1 - (frBreached?.c || 0) / withSla) * 100).toFixed(1)) : 100;
    const resComplianceRate = withSla > 0 ? parseFloat(((1 - (resBreached?.c || 0) / withSla) * 100).toFixed(1)) : 100;

    // At-risk tickets (>80% of SLA time elapsed)
    const atRisk = await db.query(
      "SELECT id, subject, priority, created_at, sla_first_response_minutes, sla_resolution_minutes FROM helpdesk_tickets WHERE status = 'open' AND sla_first_response_breached = 0 AND sla_resolution_breached = 0 AND sla_first_response_minutes IS NOT NULL"
    );
    const atRiskTickets = atRisk.filter(t => {
      const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 60000;
      return elapsed > (t.sla_first_response_minutes || 999) * 0.8 || elapsed > (t.sla_resolution_minutes || 999) * 0.8;
    }).map(t => ({ id: t.id, subject: t.subject, priority: t.priority }));

    res.json({
      total_with_sla: withSla,
      first_response_breached: frBreached?.c || 0,
      resolution_breached: resBreached?.c || 0,
      first_response_compliance_rate: frComplianceRate,
      resolution_compliance_rate: resComplianceRate,
      avg_first_response_minutes: avgFr?.avg_min ? parseFloat(avgFr.avg_min).toFixed(1) : null,
      avg_resolution_minutes: avgRes?.avg_min ? parseFloat(avgRes.avg_min).toFixed(1) : null,
      at_risk_tickets: atRiskTickets,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set ticket priority (assigns SLA automatically)
app.patch('/api/helpdesk/tickets/:id/priority', requireAuth, requireDb, async (req, res) => {
  const { priority } = req.body || {};
  if (!priority || !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be low, medium, high, or urgent' });
  }
  try {
    await db.query('UPDATE helpdesk_tickets SET priority = ? WHERE id = ?', [priority, req.params.id]);
    await assignSlaToTicket(req.params.id, priority);
    res.json({ success: true, priority });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Assign ticket to team member
app.patch('/api/helpdesk/tickets/:id/assign', requireAuth, requireDb, async (req, res) => {
  const { assigned_to } = req.body || {};
  try {
    const ticket = await db.queryOne('SELECT subject, customer_email, priority FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    await db.query('UPDATE helpdesk_tickets SET assigned_to = ? WHERE id = ?', [assigned_to || null, req.params.id]);
    emitEvent('ticket:assigned', { ticket_id: req.params.id, assigned_to });
    if (assigned_to) sendOpsEmail('ticket_assigned', { ticket_id: req.params.id, assigned_to, subject: ticket?.subject, customer_email: ticket?.customer_email, priority: ticket?.priority }).catch(() => {});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 13: AGENT SUGGESTIONS (AI-assisted replies for human agents)
// ═══════════════════════════════════════════════════════════════════════════════

// Generate AI suggestion for a ticket — human agent can edit before sending
app.post('/api/helpdesk/tickets/:id/suggest', requireAuth, requireDb, async (req, res) => {
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const agent = ticket.agent_id
      ? await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ?', [ticket.agent_id])
      : await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.status(503).json({ error: 'AI not configured' });

    const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];

    // Build enhanced prompt for agent suggestions
    let kbContext = '';
    try {
      // Search KB for relevant content based on last user message
      const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
        if (kbDocs.length > 0) {
          kbContext = '\n\n## Relevant Knowledge Base Articles\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 12000);
        }
      }
    } catch {}

    // Detect tone from user preference or ticket context
    const tone = req.body?.tone || 'professional'; // professional, friendly, formal, empathetic
    const language = req.body?.language || 'auto'; // auto, fr, en

    const sysPrompt = `You are an AI assistant helping a human support agent draft a reply to a customer.
${agent?.system_prompt ? `\nAgent instructions: ${agent.system_prompt}` : ''}
${kbContext}

Guidelines:
- Write a draft reply the human agent can review and edit before sending
- Tone: ${tone}
- ${language !== 'auto' ? `Language: ${language === 'fr' ? 'French' : 'English'}` : 'Match the language of the customer'}
- Be helpful, accurate, and concise
- If you're not sure about something, say so and suggest the agent verify
- Include specific details from the knowledge base when relevant
- Format with paragraphs, no excessive formatting`;

    const aiMsgs = [{ role: 'system', content: sysPrompt }, ...msgs.map(m => ({ role: m.role, content: m.content }))];

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: aiMsgs, max_tokens: 800, temperature: 0.4 })
    });
    if (!aiResp.ok) return res.status(502).json({ error: 'AI call failed' });
    const aiData = await aiResp.json();
    const suggestion = aiData.choices?.[0]?.message?.content || '';

    // Also generate quick reply options (short 1-2 sentence replies)
    let quickReplies = [];
    try {
      const qrResp = await fetch(ai.primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
        body: JSON.stringify({
          model: getModelForUseCase(ai, 'chat'),
          messages: [
            { role: 'system', content: `Based on this customer conversation, generate 3 short reply options (1-2 sentences each). Reply as JSON array of strings. ${language !== 'auto' ? `Language: ${language === 'fr' ? 'French' : 'English'}` : 'Match customer language.'}` },
            ...msgs.map(m => ({ role: m.role, content: m.content }))
          ],
          max_tokens: 300,
          temperature: 0.5
        })
      });
      if (qrResp.ok) {
        const qrData = await qrResp.json();
        const raw = qrData.choices?.[0]?.message?.content || '[]';
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) quickReplies = JSON.parse(match[0]);
      }
    } catch {}

    res.json({
      suggestion,
      quick_replies: quickReplies.slice(0, 3),
      ticket_id: req.params.id,
      topic: ticket.topic || null,
      sentiment: ticket.sentiment,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Send a human agent reply to a ticket (with optional edit of AI suggestion)
app.post('/api/helpdesk/tickets/:id/reply', requireAuth, requireDb, async (req, res) => {
  const { message, agent_name } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
    msgs.push({ role: 'assistant', content: message, ts: Date.now(), sent_by: agent_name || 'human_agent', is_human: true });

    await db.query('UPDATE helpdesk_tickets SET messages = ?, status = ? WHERE id = ?',
      [JSON.stringify(msgs), ticket.status === 'open' ? 'in_progress' : ticket.status, req.params.id]);

    // Track first response time
    if (!ticket.first_response_at) {
      await db.query('UPDATE helpdesk_tickets SET first_response_at = NOW() WHERE id = ?', [req.params.id]);
    }

    // If ticket came from Slack, send the reply back to Slack
    if (ticket.channel === 'slack' && ticket.external_id?.startsWith('slack:')) {
      try {
        const slackBotToken = await getSetting('slack_bot_token', '');
        if (slackBotToken) {
          const parts = ticket.external_id.split(':');
          const channelId = parts[1];
          const threadTs = parts[2];
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackBotToken}` },
            body: JSON.stringify({ channel: channelId, thread_ts: threadTs, text: message })
          });
        }
      } catch (e) { console.error('[reply→slack]', e.message); }
    }

    // If ticket came from Teams, send reply back
    if (ticket.channel === 'teams' && ticket.external_id?.startsWith('teams:')) {
      try {
        const teamsAppId = await getSetting('teams_app_id', '');
        const teamsAppSecret = await getSetting('teams_app_secret', '');
        if (teamsAppId && teamsAppSecret) {
          const tokenResp = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${encodeURIComponent(teamsAppId)}&client_secret=${encodeURIComponent(teamsAppSecret)}&scope=https%3A%2F%2Fapi.botframework.com%2F.default`
          });
          const tokenData = await tokenResp.json();
          if (tokenData.access_token) {
            const conversationId = ticket.external_id.replace('teams:', '');
            // Note: requires storing serviceUrl from original activity — simplified here
            // In production, store serviceUrl per conversation
          }
        }
      } catch (e) { console.error('[reply→teams]', e.message); }
    }

    // If ticket came from WhatsApp (end-customer or Lamu client), send reply back
    if ((ticket.channel === 'whatsapp' || ticket.channel === 'whatsapp_client') && ticket.external_id) {
      try {
        const waToken = await getSetting('whatsapp_access_token', '');
        const waPhoneId = await getSetting('whatsapp_phone_number_id', '');
        if (waToken && waPhoneId) {
          const recipientPhone = ticket.external_id.replace(/^whatsapp(_client)?:/, '');
          await sendWhatsApp(waPhoneId, waToken, recipientPhone, message);
        }
      } catch (e) { console.error('[reply→whatsapp]', e.message); }
    }

    // Write back to external helpdesks (Zendesk, Freshdesk, Intercom)
    writeBackToExternalHelpdesk(ticket, message).catch(e => console.error('[write-back]', e.message));
    // Write back to Salesforce
    writeBackToSalesforce(ticket, message).catch(e => console.error('[write-back:sf]', e.message));

    emitEvent('ticket:replied', { ticket_id: req.params.id, channel: ticket.channel, is_human: true, agent_name });
    await auditLog(agent_name || 'human_agent', 'ticket_reply', 'ticket', req.params.id, { channel: ticket.channel });
    res.json({ success: true, message_count: msgs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get real-time suggestion while agent types (lightweight — uses conversation context)
app.post('/api/helpdesk/tickets/:id/suggest-inline', requireAuth, requireDb, async (req, res) => {
  const { partial_text } = req.body || {};
  if (!partial_text || partial_text.length < 10) return res.json({ completion: '' });
  try {
    const ticket = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.json({ completion: '' });

    const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
    const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({
        model: getModelForUseCase(ai, 'realtime'),
        messages: [
          { role: 'system', content: 'Complete the support agent\'s reply. Return ONLY the completion text (the rest of the sentence/paragraph), not the full message. Be concise.' },
          { role: 'user', content: `Customer said: "${lastUserMsg?.content || ''}"` },
          { role: 'assistant', content: `Agent is typing: "${partial_text}"` },
          { role: 'user', content: 'Complete the agent\'s reply:' }
        ],
        max_tokens: 150,
        temperature: 0.3
      })
    });
    if (!aiResp.ok) return res.json({ completion: '' });
    const data = await aiResp.json();
    const completion = data.choices?.[0]?.message?.content || '';
    res.json({ completion: completion.trim() });
  } catch { res.json({ completion: '' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 14: CONVERSATION SEARCH (full-text)
// ═══════════════════════════════════════════════════════════════════════════════

// Search across tickets (messages JSON, subject, customer info)
app.get('/api/helpdesk/search', requireAuth, requireDb, async (req, res) => {
  const { q, status, channel, topic, priority, limit: lim } = req.query;
  if (!q || String(q).trim().length < 2) return res.status(400).json({ error: 'q must be at least 2 characters' });
  const searchTerm = `%${String(q).trim()}%`;
  const maxResults = Math.min(parseInt(lim) || 50, 200);
  try {
    let sql = `SELECT id, agent_id, channel, customer_name, customer_email, subject, status, sentiment, topic, priority, assigned_to, escalated, auto_replies_count, sla_first_response_breached, sla_resolution_breached, created_at
      FROM helpdesk_tickets
      WHERE (subject LIKE ? OR customer_email LIKE ? OR customer_name LIKE ? OR CAST(messages AS CHAR) LIKE ?)`;
    const params = [searchTerm, searchTerm, searchTerm, searchTerm];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (channel) { sql += ' AND channel = ?'; params.push(channel); }
    if (topic) { sql += ' AND topic = ?'; params.push(topic); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(maxResults);
    const tickets = await db.query(sql, params);
    res.json({ tickets, total: tickets.length, query: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Search across webapp conversations (messages content, title)
app.get('/api/webapp/conversations/search', requireAuth, requireWebAuth, async (req, res) => {
  const { q, limit: lim } = req.query;
  if (!q || String(q).trim().length < 2) return res.status(400).json({ error: 'q must be at least 2 characters' });
  const searchTerm = `%${String(q).trim()}%`;
  const maxResults = Math.min(parseInt(lim) || 30, 100);
  try {
    const convs = await db.query(
      `SELECT DISTINCT c.id, c.title, c.created_at as createdAt, c.updated_at as updatedAt
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_email = ? AND c.source = 'webapp'
         AND (c.title LIKE ? OR m.content LIKE ?)
       ORDER BY c.updated_at DESC LIMIT ?`,
      [req.webUser.email, searchTerm, searchTerm, maxResults]
    );
    // Load matching message snippets
    const results = [];
    for (const c of convs) {
      const matches = await db.query(
        `SELECT id, role, SUBSTRING(content, 1, 200) as snippet FROM messages
         WHERE conversation_id = ? AND content LIKE ? LIMIT 3`,
        [c.id, searchTerm]
      );
      results.push({ ...c, matching_messages: matches });
    }
    res.json({ conversations: results, total: results.length, query: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 15: CSAT AVANCÉ (NPS, surveys, comments)
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureCsatTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS csat_responses (
      id VARCHAR(100) PRIMARY KEY,
      ticket_id VARCHAR(100),
      conversation_id VARCHAR(100),
      user_email VARCHAR(255),
      customer_email VARCHAR(255),
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      nps_score INT DEFAULT NULL CHECK (nps_score BETWEEN 0 AND 10),
      comment TEXT,
      tags JSON,
      channel VARCHAR(50) DEFAULT 'webapp',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id),
      INDEX idx_conv (conversation_id),
      INDEX idx_email (customer_email),
      INDEX idx_rating (rating)
    )
  `);
}

// Submit CSAT survey
app.post('/api/csat/submit', requireDb, async (req, res) => {
  const { ticket_id, conversation_id, user_email, customer_email, rating, nps_score, comment, tags, channel } = req.body || {};
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating 1-5 required' });
  if (nps_score != null && (nps_score < 0 || nps_score > 10)) return res.status(400).json({ error: 'nps_score must be 0-10' });
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO csat_responses (id, ticket_id, conversation_id, user_email, customer_email, rating, nps_score, comment, tags, channel) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, ticket_id || null, conversation_id || null, user_email || null, customer_email || null, rating, nps_score ?? null, comment || null, tags ? JSON.stringify(tags) : null, channel || 'webapp']
    );
    res.json({ id, success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get CSAT stats
app.get('/api/csat/stats', requireAuth, requireDb, async (req, res) => {
  try {
    const total = await db.queryOne('SELECT COUNT(*) as c FROM csat_responses');
    const avgRating = await db.queryOne('SELECT AVG(rating) as avg FROM csat_responses');
    const avgNps = await db.queryOne('SELECT AVG(nps_score) as avg FROM csat_responses WHERE nps_score IS NOT NULL');
    const ratingDist = await db.query('SELECT rating, COUNT(*) as count FROM csat_responses GROUP BY rating ORDER BY rating');
    const npsDist = await db.query('SELECT nps_score, COUNT(*) as count FROM csat_responses WHERE nps_score IS NOT NULL GROUP BY nps_score ORDER BY nps_score');

    // NPS calculation: (promoters - detractors) / total * 100
    const npsResponses = await db.query('SELECT nps_score FROM csat_responses WHERE nps_score IS NOT NULL');
    let promoters = 0, detractors = 0, passives = 0;
    for (const r of npsResponses) {
      if (r.nps_score >= 9) promoters++;
      else if (r.nps_score <= 6) detractors++;
      else passives++;
    }
    const npsTotal = npsResponses.length;
    const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : null;

    // Recent comments
    const recentComments = await db.query(
      "SELECT id, rating, nps_score, comment, customer_email, channel, created_at FROM csat_responses WHERE comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 20"
    );

    // CSAT by channel
    const byChannel = await db.query('SELECT channel, AVG(rating) as avg_rating, COUNT(*) as count FROM csat_responses GROUP BY channel');

    // Trend (last 30 days)
    const trend = await db.query(
      "SELECT DATE(created_at) as date, AVG(rating) as avg_rating, COUNT(*) as count FROM csat_responses WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY date"
    );

    res.json({
      total_responses: total?.c || 0,
      avg_rating: avgRating?.avg ? parseFloat(avgRating.avg).toFixed(2) : null,
      avg_nps_raw: avgNps?.avg ? parseFloat(avgNps.avg).toFixed(1) : null,
      nps_score: npsScore,
      nps_breakdown: { promoters, passives, detractors, total: npsTotal },
      rating_distribution: ratingDist,
      nps_distribution: npsDist,
      recent_comments: recentComments,
      by_channel: byChannel,
      trend,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List CSAT responses (with filters)
app.get('/api/csat/responses', requireAuth, requireDb, async (req, res) => {
  const { rating, channel, limit: lim } = req.query;
  try {
    let sql = 'SELECT * FROM csat_responses';
    const params = [];
    const where = [];
    if (rating) { where.push('rating = ?'); params.push(parseInt(rating)); }
    if (channel) { where.push('channel = ?'); params.push(channel); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(lim) || 50);
    const responses = await db.query(sql, params);
    res.json({ responses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 16: BULK OPERATIONS ON TICKETS
// ═══════════════════════════════════════════════════════════════════════════════

// Bulk update tickets (close, assign, tag, change priority, change status)
app.post('/api/helpdesk/tickets/bulk', requireAuth, requireDb, async (req, res) => {
  const { ticket_ids, action, value } = req.body || {};
  if (!Array.isArray(ticket_ids) || ticket_ids.length === 0) return res.status(400).json({ error: 'ticket_ids array required' });
  if (!action) return res.status(400).json({ error: 'action required' });

  const validActions = ['close', 'resolve', 'reopen', 'assign', 'priority', 'status', 'tag', 'categorize', 'delete'];
  if (!validActions.includes(action)) return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });

  const placeholders = ticket_ids.map(() => '?').join(',');
  let affected = 0;

  try {
    switch (action) {
      case 'close':
      case 'resolve': {
        const result = await db.query(`UPDATE helpdesk_tickets SET status = 'resolved', resolved = 1, resolved_at = NOW() WHERE id IN (${placeholders})`, ticket_ids);
        affected = result.affectedRows || ticket_ids.length;
        break;
      }
      case 'reopen': {
        const result = await db.query(`UPDATE helpdesk_tickets SET status = 'open', resolved = 0, resolved_at = NULL WHERE id IN (${placeholders})`, ticket_ids);
        affected = result.affectedRows || ticket_ids.length;
        break;
      }
      case 'assign': {
        if (!value) return res.status(400).json({ error: 'value (assigned_to) required for assign action' });
        const result = await db.query(`UPDATE helpdesk_tickets SET assigned_to = ? WHERE id IN (${placeholders})`, [value, ...ticket_ids]);
        affected = result.affectedRows || ticket_ids.length;
        for (const tid of ticket_ids) emitEvent('ticket:assigned', { ticket_id: tid, assigned_to: value });
        break;
      }
      case 'priority': {
        if (!value || !['low', 'medium', 'high', 'urgent'].includes(value)) return res.status(400).json({ error: 'value must be low/medium/high/urgent' });
        const result = await db.query(`UPDATE helpdesk_tickets SET priority = ? WHERE id IN (${placeholders})`, [value, ...ticket_ids]);
        affected = result.affectedRows || ticket_ids.length;
        // Auto-assign SLA for each
        for (const tid of ticket_ids) assignSlaToTicket(tid, value).catch(() => {});
        break;
      }
      case 'status': {
        if (!value) return res.status(400).json({ error: 'value (status) required' });
        const result = await db.query(`UPDATE helpdesk_tickets SET status = ? WHERE id IN (${placeholders})`, [value, ...ticket_ids]);
        affected = result.affectedRows || ticket_ids.length;
        break;
      }
      case 'tag': {
        if (!value) return res.status(400).json({ error: 'value (topic) required for tag action' });
        const result = await db.query(`UPDATE helpdesk_tickets SET topic = ? WHERE id IN (${placeholders})`, [value, ...ticket_ids]);
        affected = result.affectedRows || ticket_ids.length;
        break;
      }
      case 'categorize': {
        // AI categorize each ticket
        for (const tid of ticket_ids) {
          const ticket = await db.queryOne('SELECT subject, messages FROM helpdesk_tickets WHERE id = ?', [tid]);
          if (!ticket) continue;
          const msgs = ticket.messages ? (typeof ticket.messages === 'string' ? JSON.parse(ticket.messages) : ticket.messages) : [];
          const userMsgs = msgs.filter(m => m.role === 'user');
          const text = userMsgs.length > 0 ? userMsgs[0].content : (ticket.subject || '');
          const cat = await aiCategorize(text);
          await db.query('UPDATE helpdesk_tickets SET topic = ? WHERE id = ?', [cat, tid]);
          affected++;
        }
        break;
      }
      case 'delete': {
        const result = await db.query(`DELETE FROM helpdesk_tickets WHERE id IN (${placeholders})`, ticket_ids);
        affected = result.affectedRows || ticket_ids.length;
        break;
      }
    }
    res.json({ success: true, action, affected, ticket_ids });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 17: GRANULAR RBAC (viewer/editor/admin per feature)
// ═══════════════════════════════════════════════════════════════════════════════

const RBAC_FEATURES = ['helpdesk', 'knowledge_base', 'analytics', 'integrations', 'team', 'settings', 'widget', 'escalation', 'simulation', 'channels', 'sla', 'bots'];

async function ensureRbacTable() {
  // Add permissions column to team_members
  try { await db.query("ALTER TABLE team_members ADD COLUMN permissions JSON DEFAULT NULL"); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  // Add role levels: viewer (read-only), editor (read+write), admin (full)
  // permissions JSON format: { "helpdesk": "editor", "knowledge_base": "viewer", ... }
}

// Middleware to check feature permission
function requirePermission(feature, minRole = 'viewer') {
  const roleHierarchy = { viewer: 1, editor: 2, admin: 3 };
  return async (req, res, next) => {
    // Admin users (from admin_users table) always have full access
    if (req.adminUser) return next();
    // WebApp users — check team_members permissions
    if (req.webUser) {
      try {
        const member = await db.queryOne('SELECT role, permissions FROM team_members WHERE email = ?', [req.webUser.email]);
        if (!member) return res.status(403).json({ error: 'Not a team member' });
        // Global admin role = full access
        if (member.role === 'admin') return next();
        // Check feature-specific permission
        const perms = member.permissions ? (typeof member.permissions === 'string' ? JSON.parse(member.permissions) : member.permissions) : {};
        const featurePerm = perms[feature] || member.role || 'viewer';
        if ((roleHierarchy[featurePerm] || 0) >= (roleHierarchy[minRole] || 0)) return next();
        return res.status(403).json({ error: `Insufficient permissions for ${feature} (need ${minRole}, have ${featurePerm})` });
      } catch { return res.status(403).json({ error: 'Permission check failed' }); }
    }
    next(); // Fallback: allow (for API key auth)
  };
}

// Get team member permissions
app.get('/api/team/:id/permissions', requireAuth, requireDb, async (req, res) => {
  try {
    const member = await db.queryOne('SELECT id, email, name, role, permissions FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const perms = member.permissions ? (typeof member.permissions === 'string' ? JSON.parse(member.permissions) : member.permissions) : {};
    res.json({ member: { ...member, permissions: perms }, available_features: RBAC_FEATURES, roles: ['viewer', 'editor', 'admin'] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update team member permissions
app.put('/api/team/:id/permissions', requireAuth, requireDb, async (req, res) => {
  const { role, permissions } = req.body || {};
  try {
    const updates = [];
    const params = [];
    if (role && ['viewer', 'editor', 'admin', 'member'].includes(role)) {
      updates.push('role = ?'); params.push(role);
    }
    if (permissions && typeof permissions === 'object') {
      // Validate permissions
      const validPerms = {};
      for (const [feature, perm] of Object.entries(permissions)) {
        if (RBAC_FEATURES.includes(feature) && ['viewer', 'editor', 'admin', 'none'].includes(perm)) {
          validPerms[feature] = perm;
        }
      }
      updates.push('permissions = ?'); params.push(JSON.stringify(validPerms));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'role or permissions required' });
    params.push(req.params.id);
    await db.query(`UPDATE team_members SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get current user's permissions
app.get('/api/webapp/my-permissions', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const member = await db.queryOne('SELECT role, permissions FROM team_members WHERE email = ?', [req.webUser.email]);
    if (!member) return res.json({ role: 'viewer', permissions: {}, features: RBAC_FEATURES });
    const perms = member.permissions ? (typeof member.permissions === 'string' ? JSON.parse(member.permissions) : member.permissions) : {};
    // Build effective permissions
    const effective = {};
    for (const f of RBAC_FEATURES) {
      effective[f] = member.role === 'admin' ? 'admin' : (perms[f] || member.role || 'viewer');
    }
    res.json({ role: member.role, permissions: perms, effective, features: RBAC_FEATURES });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 18: VISUAL WORKFLOW BUILDER (escalation rule chains)
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureWorkflowTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS escalation_workflows (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      agent_id VARCHAR(100),
      nodes JSON NOT NULL,
      edges JSON NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      triggers_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agent (agent_id)
    )
  `);
}

/*
  Workflow node format:
  { id: string, type: 'trigger'|'condition'|'action'|'delay', position: {x,y}, data: {...} }

  Node types:
  - trigger: { event: 'new_message'|'ticket_created'|'sentiment_change' }
  - condition: { type: 'keyword'|'sentiment'|'message_count'|'topic'|'priority', operator: 'eq'|'contains'|'gt'|'lt', value: string }
  - action: { type: 'escalate'|'assign'|'tag'|'notify'|'auto_reply'|'set_priority', value: string }
  - delay: { minutes: number }

  Edge format:
  { id: string, source: string, target: string, label?: string, condition?: 'true'|'false' }
*/

app.get('/api/workflows', requireAuth, requireDb, async (req, res) => {
  try {
    const workflows = await db.query('SELECT * FROM escalation_workflows ORDER BY updated_at DESC');
    res.json({ workflows: workflows.map(w => ({ ...w, nodes: typeof w.nodes === 'string' ? JSON.parse(w.nodes) : w.nodes, edges: typeof w.edges === 'string' ? JSON.parse(w.edges) : w.edges })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/workflows', requireAuth, requireDb, async (req, res) => {
  const { name, agent_id, nodes, edges } = req.body || {};
  if (!name || !nodes || !edges) return res.status(400).json({ error: 'name, nodes, edges required' });
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO escalation_workflows (id, name, agent_id, nodes, edges) VALUES (?,?,?,?,?)',
      [id, name, agent_id || null, JSON.stringify(nodes), JSON.stringify(edges)]
    );
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/workflows/:id', requireAuth, requireDb, async (req, res) => {
  const { name, agent_id, nodes, edges, is_active } = req.body || {};
  try {
    const sets = [];
    const params = [];
    if (name) { sets.push('name = ?'); params.push(name); }
    if (agent_id !== undefined) { sets.push('agent_id = ?'); params.push(agent_id || null); }
    if (nodes) { sets.push('nodes = ?'); params.push(JSON.stringify(nodes)); }
    if (edges) { sets.push('edges = ?'); params.push(JSON.stringify(edges)); }
    if (is_active != null) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.query(`UPDATE escalation_workflows SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/workflows/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM escalation_workflows WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Execute a workflow against a ticket (called from incoming/slack/teams)
async function executeWorkflow(ticketId, message, channel) {
  try {
    const workflows = await db.query('SELECT * FROM escalation_workflows WHERE is_active = 1 ORDER BY created_at');
    for (const wf of workflows) {
      const nodes = typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : wf.nodes;
      const edges = typeof wf.edges === 'string' ? JSON.parse(wf.edges) : wf.edges;

      // Find trigger nodes
      const triggerNodes = nodes.filter(n => n.type === 'trigger');
      for (const trigger of triggerNodes) {
        if (trigger.data?.event === 'new_message' || trigger.data?.event === 'ticket_created') {
          // Walk the workflow graph from this trigger
          const result = await walkWorkflow(nodes, edges, trigger.id, ticketId, message, channel);
          if (result.action) {
            await db.query('UPDATE escalation_workflows SET triggers_count = triggers_count + 1 WHERE id = ?', [wf.id]);
            return result;
          }
        }
      }
    }
  } catch (e) { console.error('[workflow]', e.message); }
  return { action: null };
}

async function walkWorkflow(nodes, edges, currentId, ticketId, message, channel) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const visited = new Set();
  let currentNodeId = currentId;

  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId);
    const node = nodeMap[currentNodeId];
    if (!node) break;

    if (node.type === 'condition') {
      const passes = evaluateCondition(node.data, message);
      // Find edge with matching condition
      const nextEdge = edges.find(e => e.source === currentNodeId && e.condition === (passes ? 'true' : 'false'))
        || edges.find(e => e.source === currentNodeId);
      currentNodeId = nextEdge?.target;
      continue;
    }

    if (node.type === 'action') {
      // Execute the action
      switch (node.data?.type) {
        case 'escalate':
          await db.query('UPDATE helpdesk_tickets SET escalated = 1, escalated_reason = ?, status = ? WHERE id = ?', [node.data.value || 'Workflow rule', 'escalated', ticketId]);
          emitEvent('ticket:escalated', { ticket_id: ticketId, reason: node.data.value || 'Workflow rule' });
          return { action: 'escalated', reason: node.data.value };
        case 'assign':
          await db.query('UPDATE helpdesk_tickets SET assigned_to = ? WHERE id = ?', [node.data.value, ticketId]);
          emitEvent('ticket:assigned', { ticket_id: ticketId, assigned_to: node.data.value });
          break;
        case 'tag':
          await db.query('UPDATE helpdesk_tickets SET topic = ? WHERE id = ?', [node.data.value, ticketId]);
          break;
        case 'set_priority':
          await db.query('UPDATE helpdesk_tickets SET priority = ? WHERE id = ?', [node.data.value, ticketId]);
          assignSlaToTicket(ticketId, node.data.value).catch(() => {});
          break;
        case 'notify':
          emitEvent('workflow:notify', { ticket_id: ticketId, message: node.data.value, channel });
          break;
      }
    }

    // Move to next node
    const nextEdge = edges.find(e => e.source === currentNodeId);
    currentNodeId = nextEdge?.target;
  }
  return { action: null };
}

function evaluateCondition(data, message) {
  if (!data || !message) return false;
  const msg = message.toLowerCase();
  switch (data.type) {
    case 'keyword':
      return data.operator === 'contains' ? msg.includes((data.value || '').toLowerCase()) : msg === (data.value || '').toLowerCase();
    case 'sentiment': {
      const negWords = /angry|furious|terrible|hate|worst|cancel|refund|en colère|furieux|inacceptable/i;
      const posWords = /thank|great|awesome|love|excellent|merci|génial|super|parfait/i;
      const detected = negWords.test(msg) ? 'negative' : posWords.test(msg) ? 'positive' : 'neutral';
      return detected === (data.value || 'negative');
    }
    case 'topic':
      return msg.includes((data.value || '').toLowerCase());
    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 19: CUSTOM DASHBOARDS
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureCustomDashboardTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS custom_dashboards (
      id VARCHAR(100) PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      name VARCHAR(200) DEFAULT 'Mon Dashboard',
      layout JSON NOT NULL,
      is_default TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (user_email)
    )
  `);
}

/*
  Layout format: array of widget configs
  [
    { id: string, type: 'stat'|'chart'|'list'|'gauge', position: { x, y, w, h }, config: {
      title: string,
      metric: 'total_tickets'|'open_tickets'|'nps_score'|'avg_response_time'|'resolution_rate'|...
      chart_type?: 'line'|'bar'|'pie'|'doughnut',
      time_range?: '7d'|'30d'|'90d',
      filters?: { channel?, topic?, priority? }
    }}
  ]
*/

const AVAILABLE_WIDGETS = [
  { type: 'stat', metric: 'total_tickets', label: 'Total Tickets' },
  { type: 'stat', metric: 'open_tickets', label: 'Tickets Ouverts' },
  { type: 'stat', metric: 'resolved_tickets', label: 'Tickets Résolus' },
  { type: 'stat', metric: 'escalated_tickets', label: 'Tickets Escaladés' },
  { type: 'stat', metric: 'avg_first_response', label: 'Temps moyen 1ère réponse' },
  { type: 'stat', metric: 'avg_resolution_time', label: 'Temps moyen résolution' },
  { type: 'stat', metric: 'resolution_rate', label: 'Taux de résolution' },
  { type: 'stat', metric: 'escalation_rate', label: 'Taux d\'escalade' },
  { type: 'stat', metric: 'nps_score', label: 'NPS Score' },
  { type: 'stat', metric: 'csat_avg', label: 'CSAT Moyen' },
  { type: 'stat', metric: 'sla_compliance', label: 'Conformité SLA' },
  { type: 'stat', metric: 'active_agents', label: 'Agents Actifs' },
  { type: 'stat', metric: 'kb_documents', label: 'Documents KB' },
  { type: 'chart', metric: 'daily_tickets', label: 'Volume quotidien', chart_type: 'line' },
  { type: 'chart', metric: 'topic_breakdown', label: 'Répartition par sujet', chart_type: 'doughnut' },
  { type: 'chart', metric: 'sentiment_breakdown', label: 'Répartition sentiment', chart_type: 'pie' },
  { type: 'chart', metric: 'channel_breakdown', label: 'Répartition par canal', chart_type: 'bar' },
  { type: 'chart', metric: 'csat_trend', label: 'Tendance CSAT', chart_type: 'line' },
  { type: 'list', metric: 'recent_tickets', label: 'Tickets récents' },
  { type: 'list', metric: 'at_risk_sla', label: 'SLA à risque' },
  { type: 'list', metric: 'recent_comments', label: 'Commentaires CSAT récents' },
  { type: 'gauge', metric: 'sla_first_response_rate', label: 'SLA 1ère réponse' },
  { type: 'gauge', metric: 'sla_resolution_rate', label: 'SLA résolution' },
];

app.get('/api/dashboards/available-widgets', requireAuth, async (req, res) => {
  res.json({ widgets: AVAILABLE_WIDGETS });
});

app.get('/api/dashboards', requireAuth, requireDb, async (req, res) => {
  try {
    const email = req.webUser?.email || req.adminUser?.email || 'admin';
    const dashboards = await db.query('SELECT * FROM custom_dashboards WHERE user_email = ? ORDER BY is_default DESC, updated_at DESC', [email]);
    res.json({ dashboards: dashboards.map(d => ({ ...d, layout: typeof d.layout === 'string' ? JSON.parse(d.layout) : d.layout })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dashboards', requireAuth, requireDb, async (req, res) => {
  const { name, layout } = req.body || {};
  if (!layout || !Array.isArray(layout)) return res.status(400).json({ error: 'layout array required' });
  const id = crypto.randomUUID();
  const email = req.webUser?.email || req.adminUser?.email || 'admin';
  try {
    await db.query('INSERT INTO custom_dashboards (id, user_email, name, layout) VALUES (?,?,?,?)',
      [id, email, name || 'Mon Dashboard', JSON.stringify(layout)]);
    res.json({ id, name: name || 'Mon Dashboard' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dashboards/:id', requireAuth, requireDb, async (req, res) => {
  const { name, layout, is_default } = req.body || {};
  const email = req.webUser?.email || req.adminUser?.email || 'admin';
  try {
    if (is_default) {
      await db.query('UPDATE custom_dashboards SET is_default = 0 WHERE user_email = ?', [email]);
    }
    const sets = [];
    const params = [];
    if (name) { sets.push('name = ?'); params.push(name); }
    if (layout) { sets.push('layout = ?'); params.push(JSON.stringify(layout)); }
    if (is_default != null) { sets.push('is_default = ?'); params.push(is_default ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.query(`UPDATE custom_dashboards SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dashboards/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM custom_dashboards WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Resolve a widget's data (used by frontend to render each widget)
app.post('/api/dashboards/widget-data', requireAuth, requireDb, async (req, res) => {
  const { metric, time_range, filters } = req.body || {};
  if (!metric) return res.status(400).json({ error: 'metric required' });
  const days = time_range === '7d' ? 7 : time_range === '90d' ? 90 : 30;
  try {
    let data;
    switch (metric) {
      case 'total_tickets': { const r = await db.queryOne('SELECT COUNT(*) as v FROM helpdesk_tickets'); data = { value: r?.v || 0 }; break; }
      case 'open_tickets': { const r = await db.queryOne("SELECT COUNT(*) as v FROM helpdesk_tickets WHERE status = 'open'"); data = { value: r?.v || 0 }; break; }
      case 'resolved_tickets': { const r = await db.queryOne('SELECT COUNT(*) as v FROM helpdesk_tickets WHERE resolved = 1'); data = { value: r?.v || 0 }; break; }
      case 'escalated_tickets': { const r = await db.queryOne('SELECT COUNT(*) as v FROM helpdesk_tickets WHERE escalated = 1'); data = { value: r?.v || 0 }; break; }
      case 'avg_first_response': { const r = await db.queryOne('SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, first_response_at)) as v FROM helpdesk_tickets WHERE first_response_at IS NOT NULL'); data = { value: r?.v ? parseFloat(r.v).toFixed(1) + ' min' : '—' }; break; }
      case 'avg_resolution_time': { const r = await db.queryOne('SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) as v FROM helpdesk_tickets WHERE resolved_at IS NOT NULL'); data = { value: r?.v ? (parseFloat(r.v) > 60 ? (parseFloat(r.v)/60).toFixed(1) + 'h' : parseFloat(r.v).toFixed(0) + ' min') : '—' }; break; }
      case 'resolution_rate': { const total = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets'); const resolved = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE resolved = 1'); data = { value: total?.c ? ((resolved?.c || 0) / total.c * 100).toFixed(1) + '%' : '—' }; break; }
      case 'escalation_rate': { const total = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets'); const esc = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE escalated = 1'); data = { value: total?.c ? ((esc?.c || 0) / total.c * 100).toFixed(1) + '%' : '—' }; break; }
      case 'nps_score': { const nps = await db.query('SELECT nps_score FROM csat_responses WHERE nps_score IS NOT NULL'); let p = 0, d = 0; for (const r of nps) { if (r.nps_score >= 9) p++; else if (r.nps_score <= 6) d++; } data = { value: nps.length > 0 ? Math.round(((p - d) / nps.length) * 100) : '—' }; break; }
      case 'csat_avg': { const r = await db.queryOne('SELECT AVG(rating) as v FROM csat_responses'); data = { value: r?.v ? parseFloat(r.v).toFixed(1) + '/5' : '—' }; break; }
      case 'sla_compliance': { const total = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_first_response_minutes IS NOT NULL'); const breach = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_first_response_breached = 1'); data = { value: total?.c ? ((1 - (breach?.c || 0) / total.c) * 100).toFixed(1) + '%' : '—' }; break; }
      case 'active_agents': { const r = await db.queryOne('SELECT COUNT(*) as v FROM helpdesk_agents WHERE is_active = 1'); data = { value: r?.v || 0 }; break; }
      case 'kb_documents': { const r = await db.queryOne('SELECT COUNT(*) as v FROM kb_documents'); data = { value: r?.v || 0 }; break; }
      case 'daily_tickets': { const rows = await db.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM helpdesk_tickets WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date`); data = { labels: rows.map(r => r.date), values: rows.map(r => r.count) }; break; }
      case 'topic_breakdown': { const rows = await db.query("SELECT topic, COUNT(*) as count FROM helpdesk_tickets WHERE topic IS NOT NULL AND topic != '' GROUP BY topic ORDER BY count DESC LIMIT 10"); data = { labels: rows.map(r => r.topic), values: rows.map(r => r.count) }; break; }
      case 'sentiment_breakdown': { const rows = await db.query('SELECT sentiment, COUNT(*) as count FROM helpdesk_tickets GROUP BY sentiment'); data = { labels: rows.map(r => r.sentiment), values: rows.map(r => r.count) }; break; }
      case 'channel_breakdown': { const rows = await db.query('SELECT channel, COUNT(*) as count FROM helpdesk_tickets GROUP BY channel'); data = { labels: rows.map(r => r.channel), values: rows.map(r => r.count) }; break; }
      case 'csat_trend': { const rows = await db.query(`SELECT DATE(created_at) as date, AVG(rating) as avg FROM csat_responses WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date`); data = { labels: rows.map(r => r.date), values: rows.map(r => parseFloat(r.avg).toFixed(2)) }; break; }
      case 'recent_tickets': { const rows = await db.query('SELECT id, subject, status, priority, channel, created_at FROM helpdesk_tickets ORDER BY created_at DESC LIMIT 10'); data = { items: rows }; break; }
      case 'at_risk_sla': { const rows = await db.query("SELECT id, subject, priority, created_at, sla_first_response_minutes FROM helpdesk_tickets WHERE status = 'open' AND sla_first_response_breached = 0 AND sla_first_response_minutes IS NOT NULL ORDER BY created_at ASC LIMIT 10"); data = { items: rows.filter(t => { const e = (Date.now() - new Date(t.created_at).getTime()) / 60000; return e > (t.sla_first_response_minutes || 999) * 0.8; }) }; break; }
      case 'recent_comments': { const rows = await db.query("SELECT rating, comment, customer_email, created_at FROM csat_responses WHERE comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 10"); data = { items: rows }; break; }
      case 'sla_first_response_rate': case 'sla_resolution_rate': {
        const col = metric === 'sla_first_response_rate' ? 'sla_first_response_breached' : 'sla_resolution_breached';
        const total = await db.queryOne('SELECT COUNT(*) as c FROM helpdesk_tickets WHERE sla_first_response_minutes IS NOT NULL');
        const breach = await db.queryOne(`SELECT COUNT(*) as c FROM helpdesk_tickets WHERE ${col} = 1`);
        data = { value: total?.c ? parseFloat(((1 - (breach?.c || 0) / total.c) * 100).toFixed(1)) : 100, max: 100 };
        break;
      }
      default: data = { value: '—' };
    }
    res.json({ metric, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 20: A/B TESTING FOR SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureAbTestTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ab_tests (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      agent_id VARCHAR(100),
      prompt_a TEXT NOT NULL,
      prompt_b TEXT NOT NULL,
      prompt_a_name VARCHAR(100) DEFAULT 'Variant A',
      prompt_b_name VARCHAR(100) DEFAULT 'Variant B',
      test_cases JSON,
      results_a JSON,
      results_b JSON,
      winner VARCHAR(1) DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      run_at TIMESTAMP NULL,
      INDEX idx_agent (agent_id)
    )
  `);
}

app.get('/api/ab-tests', requireAuth, requireDb, async (req, res) => {
  try {
    const tests = await db.query('SELECT id, name, agent_id, prompt_a_name, prompt_b_name, winner, status, created_at, run_at FROM ab_tests ORDER BY created_at DESC');
    res.json({ tests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ab-tests', requireAuth, requireDb, async (req, res) => {
  const { name, agent_id, prompt_a, prompt_b, prompt_a_name, prompt_b_name, test_cases } = req.body || {};
  if (!name || !prompt_a || !prompt_b) return res.status(400).json({ error: 'name, prompt_a, prompt_b required' });
  if (!test_cases?.length) return res.status(400).json({ error: 'test_cases array required (at least 1 question)' });
  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO ab_tests (id, name, agent_id, prompt_a, prompt_b, prompt_a_name, prompt_b_name, test_cases) VALUES (?,?,?,?,?,?,?,?)',
      [id, name, agent_id || null, prompt_a, prompt_b, prompt_a_name || 'Variant A', prompt_b_name || 'Variant B', JSON.stringify(test_cases)]
    );
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ab-tests/:id/run', requireAuth, requireDb, async (req, res) => {
  try {
    const test = await db.queryOne('SELECT * FROM ab_tests WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Test not found' });

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return res.status(503).json({ error: 'AI not configured' });

    const cases = typeof test.test_cases === 'string' ? JSON.parse(test.test_cases) : (test.test_cases || []);

    // Load KB context
    let kbContext = '';
    try {
      const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
      if (kbDocs.length > 0) kbContext = '\n\n## Knowledge Base\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 12000);
    } catch {}

    const runPrompt = async (sysPrompt, question) => {
      const resp = await fetch(ai.primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
        body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: [{ role: 'system', content: sysPrompt + kbContext }, { role: 'user', content: question }], max_tokens: 500, temperature: 0.3 })
      });
      if (!resp.ok) return { answer: '', error: 'AI call failed' };
      const data = await resp.json();
      return { answer: data.choices?.[0]?.message?.content || '' };
    };

    const resultsA = [], resultsB = [];
    let scoreA = 0, scoreB = 0;

    for (const tc of cases) {
      const [rA, rB] = await Promise.all([
        runPrompt(test.prompt_a, tc.question),
        runPrompt(test.prompt_b, tc.question)
      ]);

      // Score by comparing with expected answer (if provided)
      let simA = 0, simB = 0;
      if (tc.expected_answer) {
        const expected = new Set(tc.expected_answer.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const wordsA = new Set(rA.answer.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const wordsB = new Set(rB.answer.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        simA = expected.size > 0 ? Math.round([...expected].filter(w => wordsA.has(w)).length / expected.size * 100) : 50;
        simB = expected.size > 0 ? Math.round([...expected].filter(w => wordsB.has(w)).length / expected.size * 100) : 50;
      } else {
        // Score by length and formatting quality
        simA = Math.min(100, Math.round(rA.answer.length / 5));
        simB = Math.min(100, Math.round(rB.answer.length / 5));
      }

      scoreA += simA;
      scoreB += simB;
      resultsA.push({ question: tc.question, answer: rA.answer, score: simA });
      resultsB.push({ question: tc.question, answer: rB.answer, score: simB });
    }

    const avgA = cases.length > 0 ? Math.round(scoreA / cases.length) : 0;
    const avgB = cases.length > 0 ? Math.round(scoreB / cases.length) : 0;
    const winner = avgA > avgB ? 'A' : avgB > avgA ? 'B' : null;

    await db.query(
      'UPDATE ab_tests SET results_a = ?, results_b = ?, winner = ?, status = ?, run_at = NOW() WHERE id = ?',
      [JSON.stringify({ results: resultsA, avg_score: avgA }), JSON.stringify({ results: resultsB, avg_score: avgB }), winner, 'completed', req.params.id]
    );

    res.json({ results_a: { results: resultsA, avg_score: avgA }, results_b: { results: resultsB, avg_score: avgB }, winner });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ab-tests/:id', requireAuth, requireDb, async (req, res) => {
  try {
    const test = await db.queryOne('SELECT * FROM ab_tests WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const parse = (v) => v && typeof v === 'string' ? JSON.parse(v) : v;
    res.json({ test: { ...test, test_cases: parse(test.test_cases), results_a: parse(test.results_a), results_b: parse(test.results_b) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ab-tests/:id', requireAuth, requireDb, async (req, res) => {
  try { await db.query('DELETE FROM ab_tests WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Apply winner: update agent's system prompt with the winning variant
app.post('/api/ab-tests/:id/apply', requireAuth, requireDb, async (req, res) => {
  try {
    const test = await db.queryOne('SELECT * FROM ab_tests WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    if (!test.winner) return res.status(400).json({ error: 'No winner determined yet' });
    if (!test.agent_id) return res.status(400).json({ error: 'No agent linked to this test' });
    const winnerPrompt = test.winner === 'A' ? test.prompt_a : test.prompt_b;
    await db.query('UPDATE helpdesk_agents SET system_prompt = ? WHERE id = ?', [winnerPrompt, test.agent_id]);
    res.json({ success: true, applied_variant: test.winner, agent_id: test.agent_id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 21: SOFT ARCHIVE CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureArchiveColumns() {
  const cols = [
    ['archived', "ALTER TABLE conversations ADD COLUMN archived TINYINT(1) DEFAULT 0"],
    ['archived_at', "ALTER TABLE conversations ADD COLUMN archived_at TIMESTAMP NULL"],
  ];
  for (const [, sql] of cols) {
    try { await db.query(sql); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  }
  // Also add to helpdesk_tickets
  const ticketCols = [
    ['archived', "ALTER TABLE helpdesk_tickets ADD COLUMN archived TINYINT(1) DEFAULT 0"],
    ['archived_at', "ALTER TABLE helpdesk_tickets ADD COLUMN archived_at TIMESTAMP NULL"],
  ];
  for (const [, sql] of ticketCols) {
    try { await db.query(sql); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  }
}

// Archive a conversation (soft delete)
app.post('/api/webapp/conversations/:id/archive', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const conv = await db.queryOne('SELECT id FROM conversations WHERE id = ? AND user_email = ?', [req.params.id, req.webUser.email]);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    await db.query('UPDATE conversations SET archived = 1, archived_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Restore archived conversation
app.post('/api/webapp/conversations/:id/restore', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query('UPDATE conversations SET archived = 0, archived_at = NULL WHERE id = ? AND user_email = ?', [req.params.id, req.webUser.email]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List archived conversations
app.get('/api/webapp/conversations/archived', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const convs = await db.query(
      `SELECT id, title, created_at as createdAt, updated_at as updatedAt, archived_at
       FROM conversations WHERE user_email = ? AND source = 'webapp' AND archived = 1
       ORDER BY archived_at DESC LIMIT 50`,
      [req.webUser.email]
    );
    res.json({ conversations: convs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Archive a ticket (soft delete)
app.post('/api/helpdesk/tickets/:id/archive', requireAuth, requireDb, async (req, res) => {
  try {
    await db.query('UPDATE helpdesk_tickets SET archived = 1, archived_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Restore archived ticket
app.post('/api/helpdesk/tickets/:id/restore', requireAuth, requireDb, async (req, res) => {
  try {
    await db.query('UPDATE helpdesk_tickets SET archived = 0, archived_at = NULL WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List archived tickets
app.get('/api/helpdesk/tickets/archived', requireAuth, requireDb, async (req, res) => {
  try {
    const tickets = await db.query(
      'SELECT id, subject, customer_email, channel, status, topic, priority, archived_at, created_at FROM helpdesk_tickets WHERE archived = 1 ORDER BY archived_at DESC LIMIT 50'
    );
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk archive
app.post('/api/helpdesk/tickets/bulk-archive', requireAuth, requireDb, async (req, res) => {
  const { ticket_ids } = req.body || {};
  if (!Array.isArray(ticket_ids) || !ticket_ids.length) return res.status(400).json({ error: 'ticket_ids array required' });
  const placeholders = ticket_ids.map(() => '?').join(',');
  try {
    await db.query(`UPDATE helpdesk_tickets SET archived = 1, archived_at = NOW() WHERE id IN (${placeholders})`, ticket_ids);
    res.json({ success: true, archived: ticket_ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update existing conversations list to exclude archived
// (modify the existing GET endpoint filter by adding archived = 0)

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 22 — Audit Logs
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureAuditLogsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor VARCHAR(255),
      actor_type ENUM('admin','user','system') DEFAULT 'admin',
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50),
      resource_id VARCHAR(255),
      details JSON,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_actor (actor),
      INDEX idx_action (action),
      INDEX idx_resource (resource_type, resource_id),
      INDEX idx_created (created_at)
    )
  `);
}

async function auditLog(actor, action, resourceType, resourceId, details = null, ip = null, actorType = 'admin') {
  try {
    await db.query(
      'INSERT INTO audit_logs (actor, actor_type, action, resource_type, resource_id, details, ip_address) VALUES (?,?,?,?,?,?,?)',
      [actor, actorType, action, resourceType, resourceId ? String(resourceId) : null, details ? JSON.stringify(details) : null, ip]
    );
  } catch (e) { console.error('[audit]', e.message); }
}

// GET /api/audit/logs — list audit logs with filters
app.get('/api/audit/logs', requireAuth, async (req, res) => {
  try {
    const { actor, action, resource_type, from, to, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM audit_logs';
    const where = [], params = [];
    if (actor) { where.push('actor = ?'); params.push(actor); }
    if (action) { where.push('action = ?'); params.push(action); }
    if (resource_type) { where.push('resource_type = ?'); params.push(resource_type); }
    if (from) { where.push('created_at >= ?'); params.push(from); }
    if (to) { where.push('created_at <= ?'); params.push(to); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(lim) || 100, parseInt(off) || 0);
    const logs = await db.query(sql, params);
    const countResult = await db.queryOne('SELECT COUNT(*) as total FROM audit_logs');
    res.json({ logs, total: countResult?.total || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/actions — list distinct actions for filter dropdown
app.get('/api/audit/actions', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
    res.json({ actions: rows.map(r => r.action) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 23 — SSO / Enterprise Auth (SAML & OIDC)
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureSsoTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sso_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider ENUM('saml','oidc') NOT NULL,
      name VARCHAR(100) NOT NULL,
      enabled TINYINT DEFAULT 0,
      issuer VARCHAR(512),
      sso_url VARCHAR(512),
      certificate TEXT,
      client_id VARCHAR(255),
      client_secret VARCHAR(255),
      discovery_url VARCHAR(512),
      redirect_uri VARCHAR(512),
      allowed_domains TEXT,
      auto_provision TINYINT DEFAULT 1,
      default_role VARCHAR(20) DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

// CRUD SSO configs (admin)
app.get('/api/sso/configs', requireAuth, async (req, res) => {
  try {
    const configs = await db.query('SELECT id, provider, name, enabled, issuer, sso_url, client_id, discovery_url, redirect_uri, allowed_domains, auto_provision, default_role, created_at FROM sso_configs ORDER BY created_at DESC');
    res.json({ configs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sso/configs', requireAuth, async (req, res) => {
  const { provider, name, issuer, sso_url, certificate, client_id, client_secret, discovery_url, redirect_uri, allowed_domains, auto_provision, default_role } = req.body || {};
  if (!provider || !name) return res.status(400).json({ error: 'provider and name required' });
  try {
    const result = await db.query(
      'INSERT INTO sso_configs (provider, name, issuer, sso_url, certificate, client_id, client_secret, discovery_url, redirect_uri, allowed_domains, auto_provision, default_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [provider, name, issuer, sso_url, certificate, client_id, client_secret, discovery_url, redirect_uri, allowed_domains, auto_provision ?? 1, default_role || 'viewer']
    );
    await auditLog('admin', 'sso_config_created', 'sso_config', result.insertId, { provider, name });
    res.json({ id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sso/configs/:id', requireAuth, async (req, res) => {
  const fields = ['name', 'enabled', 'issuer', 'sso_url', 'certificate', 'client_id', 'client_secret', 'discovery_url', 'redirect_uri', 'allowed_domains', 'auto_provision', 'default_role'];
  const sets = [], params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  try {
    await db.query(`UPDATE sso_configs SET ${sets.join(', ')} WHERE id = ?`, params);
    await auditLog('admin', 'sso_config_updated', 'sso_config', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sso/configs/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM sso_configs WHERE id = ?', [req.params.id]);
    await auditLog('admin', 'sso_config_deleted', 'sso_config', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSO login initiation — OIDC flow
app.get('/api/sso/login/:id', async (req, res) => {
  try {
    const config = await db.queryOne('SELECT * FROM sso_configs WHERE id = ? AND enabled = 1', [req.params.id]);
    if (!config) return res.status(404).json({ error: 'SSO config not found or disabled' });
    if (config.provider === 'oidc') {
      const state = require('crypto').randomBytes(16).toString('hex');
      const params = new URLSearchParams({
        response_type: 'code', client_id: config.client_id, redirect_uri: config.redirect_uri,
        scope: 'openid email profile', state,
      });
      // Store state for validation
      await db.query("INSERT INTO settings_store (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = ?", [`sso_state_${state}`, config.id, config.id]);
      const authUrl = config.discovery_url ? config.discovery_url.replace('/.well-known/openid-configuration', '/authorize') : config.sso_url;
      res.redirect(`${authUrl}?${params.toString()}`);
    } else if (config.provider === 'saml') {
      // SAML redirect — simplified: redirect to IdP SSO URL with SAMLRequest
      const samlRequest = Buffer.from(`<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${Date.now()}" Version="2.0" IssueInstant="${new Date().toISOString()}" AssertionConsumerServiceURL="${config.redirect_uri}"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${config.issuer}</saml:Issuer></samlp:AuthnRequest>`).toString('base64');
      res.redirect(`${config.sso_url}?SAMLRequest=${encodeURIComponent(samlRequest)}`);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSO callback — OIDC code exchange
app.get('/api/sso/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });
  try {
    const stateRow = await db.queryOne("SELECT v FROM settings_store WHERE k = ?", [`sso_state_${state}`]);
    if (!stateRow) return res.status(400).json({ error: 'Invalid state' });
    const configId = stateRow.v;
    await db.query("DELETE FROM settings_store WHERE k = ?", [`sso_state_${state}`]);
    const config = await db.queryOne('SELECT * FROM sso_configs WHERE id = ?', [configId]);
    if (!config) return res.status(400).json({ error: 'SSO config not found' });

    // Exchange code for tokens
    const tokenUrl = config.discovery_url ? config.discovery_url.replace('/.well-known/openid-configuration', '/token') : config.sso_url.replace('/authorize', '/token');
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: config.redirect_uri,
        client_id: config.client_id, client_secret: config.client_secret,
      }).toString()
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.id_token && !tokenData.access_token) return res.status(400).json({ error: 'Token exchange failed' });

    // Decode JWT (simplified — just decode payload without verification for MVP)
    let userInfo = {};
    if (tokenData.id_token) {
      const payload = tokenData.id_token.split('.')[1];
      userInfo = JSON.parse(Buffer.from(payload, 'base64').toString());
    } else if (tokenData.access_token) {
      const uiResp = await fetch(config.discovery_url ? config.discovery_url.replace('/.well-known/openid-configuration', '/userinfo') : config.sso_url.replace('/authorize', '/userinfo'), {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      userInfo = await uiResp.json();
    }

    const email = userInfo.email;
    if (!email) return res.status(400).json({ error: 'No email in SSO response' });

    // Check allowed domains
    if (config.allowed_domains) {
      const domains = config.allowed_domains.split(',').map(d => d.trim().toLowerCase());
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (!domains.includes(emailDomain)) return res.status(403).json({ error: 'Domain not allowed' });
    }

    // Auto-provision user if enabled
    let user = await db.queryOne('SELECT * FROM web_users WHERE email = ?', [email]);
    if (!user && config.auto_provision) {
      const name = userInfo.name || userInfo.preferred_username || email.split('@')[0];
      await db.query('INSERT INTO web_users (email, name, plan, sso_provider) VALUES (?,?,?,?)', [email, name, 'free', config.name]);
      user = await db.queryOne('SELECT * FROM web_users WHERE email = ?', [email]);
    }
    if (!user) return res.status(403).json({ error: 'User not provisioned. Contact your admin.' });

    // Generate session token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ email: user.email, name: user.name, plan: user.plan, sso: true }, process.env.JWT_SECRET || 'lamu-secret', { expiresIn: '7d' });
    await auditLog(email, 'sso_login', 'user', user.id, { provider: config.name }, req.ip, 'user');

    // Redirect to webapp with token
    res.redirect(`/webapp?sso_token=${token}`);
  } catch (e) { console.error('[sso:callback]', e.message); res.status(500).json({ error: e.message }); }
});

// SAML ACS (Assertion Consumer Service) — POST callback
app.post('/api/sso/saml/acs', async (req, res) => {
  const { SAMLResponse } = req.body || {};
  if (!SAMLResponse) return res.status(400).json({ error: 'Missing SAMLResponse' });
  try {
    // Decode SAML response (simplified — production should validate signature)
    const xml = Buffer.from(SAMLResponse, 'base64').toString();
    const emailMatch = xml.match(/<(?:saml:)?NameID[^>]*>([^<]+)/);
    const nameMatch = xml.match(/<(?:saml:)?Attribute Name="(?:name|displayName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/name)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([^<]+)/);
    const email = emailMatch?.[1];
    if (!email) return res.status(400).json({ error: 'No email in SAML assertion' });

    // Find matching SSO config by issuer in the response
    const configs = await db.query("SELECT * FROM sso_configs WHERE provider = 'saml' AND enabled = 1");
    const config = configs[0]; // use first enabled SAML config
    if (!config) return res.status(400).json({ error: 'No SAML config found' });

    let user = await db.queryOne('SELECT * FROM web_users WHERE email = ?', [email]);
    if (!user && config.auto_provision) {
      const name = nameMatch?.[1] || email.split('@')[0];
      await db.query('INSERT INTO web_users (email, name, plan, sso_provider) VALUES (?,?,?,?)', [email, name, 'free', config.name]);
      user = await db.queryOne('SELECT * FROM web_users WHERE email = ?', [email]);
    }
    if (!user) return res.status(403).json({ error: 'User not provisioned' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ email: user.email, name: user.name, plan: user.plan, sso: true }, process.env.JWT_SECRET || 'lamu-secret', { expiresIn: '7d' });
    await auditLog(email, 'sso_login_saml', 'user', user.id, { provider: config.name }, req.ip, 'user');
    res.redirect(`/webapp?sso_token=${token}`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List available SSO providers (public — for login page)
app.get('/api/sso/providers', async (req, res) => {
  try {
    const providers = await db.query("SELECT id, provider, name FROM sso_configs WHERE enabled = 1");
    res.json({ providers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 24 — Email Notifications for Ops Events
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureNotifPrefsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_prefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      enabled TINYINT DEFAULT 1,
      UNIQUE KEY uniq_email_event (email, event_type)
    )
  `);
}

const NOTIF_EVENTS = ['ticket_assigned', 'sla_breach', 'ticket_escalated', 'new_ticket', 'ticket_resolved', 'csat_received'];

async function sendOpsEmail(event, data) {
  try {
    const mailer = await createMailer();
    if (!mailer) return;
    const smtp = await getSmtpSettings();

    // Find recipients who have this event enabled (or haven't set prefs = default on)
    const teamMembers = await db.query('SELECT DISTINCT email FROM team_members');
    const emails = [];
    for (const m of teamMembers) {
      const pref = await db.queryOne('SELECT enabled FROM notification_prefs WHERE email = ? AND event_type = ?', [m.email, event]);
      if (!pref || pref.enabled) emails.push(m.email);
    }
    if (!emails.length) return;

    const subjects = {
      ticket_assigned: `[Lamu] Ticket #${data.ticket_id} vous a été assigné`,
      sla_breach: `[Lamu] ⚠️ SLA dépassé — Ticket #${data.ticket_id} (${data.breach_type})`,
      ticket_escalated: `[Lamu] 🔴 Ticket #${data.ticket_id} escaladé`,
      new_ticket: `[Lamu] Nouveau ticket #${data.ticket_id}: ${data.subject || ''}`,
      ticket_resolved: `[Lamu] ✅ Ticket #${data.ticket_id} résolu`,
      csat_received: `[Lamu] Nouvelle évaluation CSAT — ${data.rating}★`,
    };

    const bodies = {
      ticket_assigned: `Le ticket #${data.ticket_id} "${data.subject || ''}" vous a été assigné.\n\nClient: ${data.customer_email || '—'}\nPriorité: ${data.priority || '—'}`,
      sla_breach: `Le SLA a été dépassé pour le ticket #${data.ticket_id}.\n\nType: ${data.breach_type}\nTemps écoulé: ${data.elapsed_minutes} minutes\nLimite SLA: ${data.sla_limit} minutes`,
      ticket_escalated: `Le ticket #${data.ticket_id} a été escaladé.\n\nRaison: ${data.reason || 'Confidence insuffisante'}\nClient: ${data.customer_email || '—'}`,
      new_ticket: `Nouveau ticket reçu:\n\nSujet: ${data.subject || '—'}\nClient: ${data.customer_email || '—'}\nCanal: ${data.channel || '—'}`,
      ticket_resolved: `Le ticket #${data.ticket_id} a été marqué comme résolu.\n\nSujet: ${data.subject || '—'}`,
      csat_received: `Nouvelle évaluation CSAT:\n\nNote: ${data.rating}/5\nNPS: ${data.nps_score ?? '—'}\nCommentaire: ${data.comment || '—'}\nClient: ${data.customer_email || '—'}`,
    };

    for (const to of emails) {
      mailer.sendMail({
        from: smtp.from,
        to,
        subject: subjects[event] || `[Lamu] ${event}`,
        text: bodies[event] || JSON.stringify(data),
      }).catch(e => console.error(`[notif-email] ${to}:`, e.message));
    }
  } catch (e) { console.error('[notif-email]', e.message); }
}

// GET/PUT notification preferences
app.get('/api/notifications/prefs', requireAuth, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const prefs = await db.query('SELECT event_type, enabled FROM notification_prefs WHERE email = ?', [email]);
    const result = {};
    for (const e of NOTIF_EVENTS) {
      const p = prefs.find(p => p.event_type === e);
      result[e] = p ? !!p.enabled : true; // default on
    }
    res.json({ prefs: result, events: NOTIF_EVENTS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/prefs', requireAuth, async (req, res) => {
  const { email, prefs } = req.body || {};
  if (!email || !prefs) return res.status(400).json({ error: 'email and prefs required' });
  try {
    for (const [event, enabled] of Object.entries(prefs)) {
      await db.query(
        'INSERT INTO notification_prefs (email, event_type, enabled) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled = ?',
        [email, event, enabled ? 1 : 0, enabled ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 25 — CSV / Data Export
// ═══════════════════════════════════════════════════════════════════════════════

function toCsv(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => {
    let val = r[c] ?? '';
    val = String(val).replace(/"/g, '""');
    if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
    return val;
  }).join(','));
  return header + '\n' + lines.join('\n');
}

app.get('/api/export/tickets', requireAuth, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    let sql = 'SELECT id, agent_id, channel, customer_name, customer_email, subject, status, sentiment, sentiment_score, topic, priority, assigned_to, auto_replies_count, escalated, sla_first_response_breached, sla_resolution_breached, created_at, resolved_at FROM helpdesk_tickets';
    const where = [], params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (from) { where.push('created_at >= ?'); params.push(from); }
    if (to) { where.push('created_at <= ?'); params.push(to); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const tickets = await db.query(sql, params);
    const csv = toCsv(tickets, ['id', 'agent_id', 'channel', 'customer_name', 'customer_email', 'subject', 'status', 'sentiment', 'sentiment_score', 'topic', 'priority', 'assigned_to', 'auto_replies_count', 'escalated', 'sla_first_response_breached', 'sla_resolution_breached', 'created_at', 'resolved_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tickets_${new Date().toISOString().slice(0,10)}.csv"`);
    await auditLog('admin', 'export_tickets', 'export', null, { count: tickets.length });
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/conversations', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = "SELECT c.id, c.user_email, c.title, c.source, c.created_at, c.updated_at, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count FROM conversations c";
    const where = [], params = [];
    if (from) { where.push('c.created_at >= ?'); params.push(from); }
    if (to) { where.push('c.created_at <= ?'); params.push(to); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY c.created_at DESC';
    const convs = await db.query(sql, params);
    const csv = toCsv(convs, ['id', 'user_email', 'title', 'source', 'message_count', 'created_at', 'updated_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="conversations_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/analytics', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT date, requests, tokens_used FROM activity ORDER BY date DESC');
    const csv = toCsv(rows, ['date', 'requests', 'tokens_used']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/csat', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM csat_responses ORDER BY created_at DESC');
    const csv = toCsv(rows, ['id', 'ticket_id', 'conversation_id', 'customer_email', 'rating', 'nps_score', 'comment', 'tags', 'channel', 'created_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="csat_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 26 — Multi-language / i18n System
// ═══════════════════════════════════════════════════════════════════════════════

const I18N = {
  fr: {
    greeting: 'Bonjour ! Comment puis-je vous aider ?',
    no_answer: 'Je n\'ai pas trouvé de réponse. Un agent humain va vous répondre.',
    ticket_created: 'Votre demande a été enregistrée. Référence: #{id}',
    resolved: 'Ce ticket a été résolu. Merci !',
    csat_prompt: 'Comment évaluez-vous notre support ? (1-5)',
    escalated: 'Votre demande a été transférée à un agent spécialisé.',
    sla_breach: 'Attention : le SLA a été dépassé pour le ticket #{id}.',
  },
  en: {
    greeting: 'Hello! How can I help you?',
    no_answer: 'I couldn\'t find an answer. A human agent will get back to you.',
    ticket_created: 'Your request has been recorded. Reference: #{id}',
    resolved: 'This ticket has been resolved. Thank you!',
    csat_prompt: 'How would you rate our support? (1-5)',
    escalated: 'Your request has been transferred to a specialized agent.',
    sla_breach: 'Warning: SLA has been breached for ticket #{id}.',
  },
  es: {
    greeting: '¡Hola! ¿Cómo puedo ayudarle?',
    no_answer: 'No encontré una respuesta. Un agente humano le responderá.',
    ticket_created: 'Su solicitud ha sido registrada. Referencia: #{id}',
    resolved: 'Este ticket ha sido resuelto. ¡Gracias!',
    csat_prompt: '¿Cómo calificaría nuestro soporte? (1-5)',
    escalated: 'Su solicitud ha sido transferida a un agente especializado.',
    sla_breach: 'Atención: el SLA ha sido superado para el ticket #{id}.',
  },
  pt: {
    greeting: 'Olá! Como posso ajudar?',
    no_answer: 'Não encontrei uma resposta. Um agente humano entrará em contato.',
    ticket_created: 'Sua solicitação foi registrada. Referência: #{id}',
    resolved: 'Este ticket foi resolvido. Obrigado!',
    csat_prompt: 'Como você avaliaria nosso suporte? (1-5)',
    escalated: 'Sua solicitação foi transferida para um agente especializado.',
    sla_breach: 'Atenção: o SLA foi ultrapassado para o ticket #{id}.',
  },
  de: {
    greeting: 'Hallo! Wie kann ich Ihnen helfen?',
    no_answer: 'Ich konnte keine Antwort finden. Ein menschlicher Agent wird sich bei Ihnen melden.',
    ticket_created: 'Ihre Anfrage wurde registriert. Referenz: #{id}',
    resolved: 'Dieses Ticket wurde gelöst. Danke!',
    csat_prompt: 'Wie bewerten Sie unseren Support? (1-5)',
    escalated: 'Ihre Anfrage wurde an einen spezialisierten Agenten weitergeleitet.',
    sla_breach: 'Achtung: SLA wurde für Ticket #{id} überschritten.',
  },
};

function t(key, lang = 'fr', vars = {}) {
  let str = I18N[lang]?.[key] || I18N.fr[key] || key;
  for (const [k, v] of Object.entries(vars)) str = str.replace(`#{${k}}`, v);
  return str;
}

// GET/PUT language settings
app.get('/api/i18n/languages', async (req, res) => {
  res.json({ available: Object.keys(I18N), default: 'fr' });
});

app.get('/api/i18n/translations/:lang', async (req, res) => {
  const lang = req.params.lang;
  res.json({ lang, translations: I18N[lang] || I18N.fr });
});

// Set default language (admin)
app.put('/api/i18n/default', requireAuth, async (req, res) => {
  const { lang } = req.body || {};
  if (!I18N[lang]) return res.status(400).json({ error: `Unsupported language: ${lang}` });
  try {
    await db.query("INSERT INTO settings_store (k, v) VALUES ('default_language', ?) ON DUPLICATE KEY UPDATE v = ?", [lang, lang]);
    res.json({ ok: true, lang });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set language per agent
app.put('/api/helpdesk/agents/:id/language', requireAuth, async (req, res) => {
  const { lang } = req.body || {};
  if (!I18N[lang]) return res.status(400).json({ error: `Unsupported language: ${lang}` });
  try {
    await db.query('ALTER TABLE helpdesk_agents ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT "fr"');
    await db.query('UPDATE helpdesk_agents SET language = ? WHERE id = ?', [lang, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Widget language support — pass ?lang=en to widget endpoint
// (integrated into existing widget chat endpoint via query param)

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 27 — Custom Fields on Tickets
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureCustomFieldsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ticket_custom_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_key VARCHAR(50) NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL,
      field_type ENUM('text','number','select','boolean','date') DEFAULT 'text',
      options JSON,
      required TINYINT DEFAULT 0,
      display_order INT DEFAULT 0,
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Add custom_fields JSON column to helpdesk_tickets if not present
  try { await db.query('ALTER TABLE helpdesk_tickets ADD COLUMN custom_fields JSON'); } catch {}
}

// CRUD custom field definitions
app.get('/api/helpdesk/fields', requireAuth, async (req, res) => {
  try {
    const fields = await db.query('SELECT * FROM ticket_custom_fields WHERE active = 1 ORDER BY display_order');
    res.json({ fields });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/fields', requireAuth, async (req, res) => {
  const { field_key, label, field_type, options, required, display_order } = req.body || {};
  if (!field_key || !label) return res.status(400).json({ error: 'field_key and label required' });
  try {
    const result = await db.query(
      'INSERT INTO ticket_custom_fields (field_key, label, field_type, options, required, display_order) VALUES (?,?,?,?,?,?)',
      [field_key, label, field_type || 'text', options ? JSON.stringify(options) : null, required ? 1 : 0, display_order || 0]
    );
    await auditLog('admin', 'custom_field_created', 'custom_field', result.insertId, { field_key, label });
    res.json({ id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/helpdesk/fields/:id', requireAuth, async (req, res) => {
  const fields = ['label', 'field_type', 'options', 'required', 'display_order', 'active'];
  const sets = [], params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(f === 'options' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  try {
    await db.query(`UPDATE ticket_custom_fields SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/helpdesk/fields/:id', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE ticket_custom_fields SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set custom field values on a ticket
app.patch('/api/helpdesk/tickets/:id/custom-fields', requireAuth, async (req, res) => {
  const { fields } = req.body || {};
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields object required' });
  try {
    const ticket = await db.queryOne('SELECT custom_fields FROM helpdesk_tickets WHERE id = ?', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const existing = ticket.custom_fields ? (typeof ticket.custom_fields === 'string' ? JSON.parse(ticket.custom_fields) : ticket.custom_fields) : {};
    const merged = { ...existing, ...fields };
    await db.query('UPDATE helpdesk_tickets SET custom_fields = ? WHERE id = ?', [JSON.stringify(merged), req.params.id]);
    res.json({ ok: true, custom_fields: merged });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 28 — SLA Breach Notifications (email + webhook)
// ═══════════════════════════════════════════════════════════════════════════════
// (Integrated into the periodic SLA check below — sendOpsEmail + fireWebhooks)

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 29 — Conversation / Ticket Tagging System
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureTagsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS resource_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tag_id INT NOT NULL,
      resource_type ENUM('ticket','conversation') NOT NULL,
      resource_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_tag_resource (tag_id, resource_type, resource_id),
      INDEX idx_resource (resource_type, resource_id)
    )
  `);
}

// CRUD tags
app.get('/api/tags', requireAuth, async (req, res) => {
  try {
    const tags = await db.query('SELECT t.*, (SELECT COUNT(*) FROM resource_tags rt WHERE rt.tag_id = t.id) as usage_count FROM tags t ORDER BY t.name');
    res.json({ tags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tags', requireAuth, async (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await db.query('INSERT INTO tags (name, color) VALUES (?,?)', [name.toLowerCase().trim(), color || '#6366f1']);
    res.json({ id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tag already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tags/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM resource_tags WHERE tag_id = ?', [req.params.id]);
    await db.query('DELETE FROM tags WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add/remove tags on tickets
app.post('/api/helpdesk/tickets/:id/tags', requireAuth, async (req, res) => {
  const { tag_id, tag_name } = req.body || {};
  try {
    let tid = tag_id;
    if (!tid && tag_name) {
      // Auto-create tag if it doesn't exist
      let tag = await db.queryOne('SELECT id FROM tags WHERE name = ?', [tag_name.toLowerCase().trim()]);
      if (!tag) {
        const r = await db.query('INSERT INTO tags (name) VALUES (?)', [tag_name.toLowerCase().trim()]);
        tid = r.insertId;
      } else tid = tag.id;
    }
    if (!tid) return res.status(400).json({ error: 'tag_id or tag_name required' });
    await db.query('INSERT IGNORE INTO resource_tags (tag_id, resource_type, resource_id) VALUES (?,"ticket",?)', [tid, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/helpdesk/tickets/:id/tags/:tagId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM resource_tags WHERE tag_id = ? AND resource_type = "ticket" AND resource_id = ?', [req.params.tagId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/helpdesk/tickets/:id/tags', requireAuth, async (req, res) => {
  try {
    const tags = await db.query('SELECT t.* FROM tags t JOIN resource_tags rt ON t.id = rt.tag_id WHERE rt.resource_type = "ticket" AND rt.resource_id = ?', [req.params.id]);
    res.json({ tags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add/remove tags on conversations
app.post('/api/webapp/conversations/:id/tags', requireAuth, requireWebAuth, async (req, res) => {
  const { tag_id, tag_name } = req.body || {};
  try {
    let tid = tag_id;
    if (!tid && tag_name) {
      let tag = await db.queryOne('SELECT id FROM tags WHERE name = ?', [tag_name.toLowerCase().trim()]);
      if (!tag) {
        const r = await db.query('INSERT INTO tags (name) VALUES (?)', [tag_name.toLowerCase().trim()]);
        tid = r.insertId;
      } else tid = tag.id;
    }
    if (!tid) return res.status(400).json({ error: 'tag_id or tag_name required' });
    await db.query('INSERT IGNORE INTO resource_tags (tag_id, resource_type, resource_id) VALUES (?,"conversation",?)', [tid, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/webapp/conversations/:id/tags/:tagId', requireAuth, requireWebAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM resource_tags WHERE tag_id = ? AND resource_type = "conversation" AND resource_id = ?', [req.params.tagId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/webapp/conversations/:id/tags', requireAuth, requireWebAuth, async (req, res) => {
  try {
    const tags = await db.query('SELECT t.* FROM tags t JOIN resource_tags rt ON t.id = rt.tag_id WHERE rt.resource_type = "conversation" AND rt.resource_id = ?', [req.params.id]);
    res.json({ tags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Filter tickets by tag
app.get('/api/helpdesk/tickets/by-tag/:tagId', requireAuth, async (req, res) => {
  try {
    const tickets = await db.query(
      'SELECT t.* FROM helpdesk_tickets t JOIN resource_tags rt ON rt.resource_id = t.id WHERE rt.tag_id = ? AND rt.resource_type = "ticket" AND (t.archived IS NULL OR t.archived = 0) ORDER BY t.created_at DESC',
      [req.params.tagId]
    );
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 30 — Helpdesk Write-back (Zendesk, Freshdesk, Intercom)
// ═══════════════════════════════════════════════════════════════════════════════

async function writeBackToExternalHelpdesk(ticket, replyMessage) {
  if (!ticket.external_id) return;
  try {
    const [platform, ...rest] = ticket.external_id.split(':');

    if (platform === 'zendesk') {
      // external_id format: zendesk:{ticketId}
      const zendeskTicketId = rest[0];
      const config = await db.queryOne("SELECT * FROM integrations WHERE provider = 'zendesk' AND active = 1 LIMIT 1");
      if (!config) return;
      const creds = typeof config.config === 'string' ? JSON.parse(config.config) : config.config;
      const auth = Buffer.from(`${creds.email}/token:${creds.token}`).toString('base64');
      await fetch(`https://${creds.subdomain}.zendesk.com/api/v2/tickets/${zendeskTicketId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ ticket: { comment: { body: replyMessage, public: true } } }),
      });
      console.log(`[write-back:zendesk] Replied to ticket ${zendeskTicketId}`);
    }

    else if (platform === 'freshdesk') {
      // external_id format: freshdesk:{ticketId}
      const fdTicketId = rest[0];
      const config = await db.queryOne("SELECT * FROM integrations WHERE provider = 'freshdesk' AND active = 1 LIMIT 1");
      if (!config) return;
      const creds = typeof config.config === 'string' ? JSON.parse(config.config) : config.config;
      const auth = Buffer.from(`${creds.apiKey}:X`).toString('base64');
      await fetch(`https://${creds.domain}.freshdesk.com/api/v2/tickets/${fdTicketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ body: replyMessage }),
      });
      console.log(`[write-back:freshdesk] Replied to ticket ${fdTicketId}`);
    }

    else if (platform === 'intercom') {
      // external_id format: intercom:{conversationId}
      const convoId = rest[0];
      const config = await db.queryOne("SELECT * FROM integrations WHERE provider = 'intercom' AND active = 1 LIMIT 1");
      if (!config) return;
      const creds = typeof config.config === 'string' ? JSON.parse(config.config) : config.config;
      await fetch(`https://api.intercom.io/conversations/${convoId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}`, 'Intercom-Version': '2.10' },
        body: JSON.stringify({ message_type: 'comment', type: 'admin', body: replyMessage, admin_id: creds.adminId || '' }),
      });
      console.log(`[write-back:intercom] Replied to conversation ${convoId}`);
    }

  } catch (e) { console.error('[write-back]', e.message); }
}

// Incoming webhook endpoints to ingest tickets from external helpdesks

// Zendesk webhook — receive new tickets
app.post('/api/helpdesk/incoming/zendesk', async (req, res) => {
  try {
    const { ticket_id, subject, description, requester_email, requester_name } = req.body || {};
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
    // Check if already exists
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`zendesk:${ticket_id}`]);
    if (existing) return res.json({ ok: true, existing: true });
    // Find default agent
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const agentId = agent?.id || null;
    const msgs = [{ role: 'user', content: description || subject || '', ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agentId, 'zendesk', requester_email, requester_name, subject, JSON.stringify(msgs), `zendesk:${ticket_id}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Freshdesk webhook — receive new tickets
app.post('/api/helpdesk/incoming/freshdesk', async (req, res) => {
  try {
    const { ticket_id, subject, description, email, name } = req.body || {};
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`freshdesk:${ticket_id}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: description || subject || '', ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'freshdesk', email, name, subject, JSON.stringify(msgs), `freshdesk:${ticket_id}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Intercom webhook — receive new conversations
app.post('/api/helpdesk/incoming/intercom', async (req, res) => {
  try {
    const data = req.body?.data?.item || req.body || {};
    const convoId = data.id || data.conversation_id;
    if (!convoId) return res.status(400).json({ error: 'conversation id required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`intercom:${convoId}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const body = data.conversation_message?.body || data.body || data.source?.body || '';
    const email = data.user?.email || data.source?.author?.email || '';
    const name = data.user?.name || data.source?.author?.name || '';
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: body.replace(/<[^>]+>/g, ''), ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'intercom', email, name, body.slice(0, 100), JSON.stringify(msgs), `intercom:${convoId}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 31 — Salesforce as Ticket Channel
// ═══════════════════════════════════════════════════════════════════════════════

// Salesforce OAuth token acquisition
async function getSalesforceToken() {
  const config = await db.queryOne("SELECT * FROM integrations WHERE provider = 'salesforce' AND active = 1 LIMIT 1");
  if (!config) return null;
  const creds = typeof config.config === 'string' ? JSON.parse(config.config) : config.config;
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken || !creds.instanceUrl) return null;
  try {
    const resp = await fetch(`${creds.instanceUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: creds.clientId,
        client_secret: creds.clientSecret, refresh_token: creds.refreshToken,
      }).toString()
    });
    const data = await resp.json();
    return { accessToken: data.access_token, instanceUrl: data.instance_url || creds.instanceUrl };
  } catch (e) { console.error('[salesforce:token]', e.message); return null; }
}

// Incoming Salesforce webhook — receive new cases
app.post('/api/helpdesk/incoming/salesforce', async (req, res) => {
  try {
    const { CaseId, CaseNumber, Subject, Description, ContactEmail, ContactName, Priority } = req.body || {};
    if (!CaseId) return res.status(400).json({ error: 'CaseId required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`salesforce:${CaseId}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: Description || Subject || '', ts: new Date().toISOString() }];
    const priorityMap = { High: 'high', Medium: 'medium', Low: 'low', Critical: 'urgent' };
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status, priority) VALUES (?,?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'salesforce', ContactEmail, ContactName, Subject || `Case ${CaseNumber}`, JSON.stringify(msgs), `salesforce:${CaseId}`, 'open', priorityMap[Priority] || 'medium']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Write back reply to Salesforce case
async function writeBackToSalesforce(ticket, replyMessage) {
  if (!ticket.external_id?.startsWith('salesforce:')) return;
  const caseId = ticket.external_id.split(':')[1];
  try {
    const sf = await getSalesforceToken();
    if (!sf) return;
    // Add CaseComment
    await fetch(`${sf.instanceUrl}/services/data/v58.0/sobjects/CaseComment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sf.accessToken}` },
      body: JSON.stringify({ ParentId: caseId, CommentBody: replyMessage, IsPublished: true }),
    });
    console.log(`[write-back:salesforce] Commented on case ${caseId}`);
  } catch (e) { console.error('[write-back:salesforce]', e.message); }
}

// Sync Salesforce cases on demand
app.post('/api/helpdesk/sync/salesforce', requireAuth, async (req, res) => {
  try {
    const sf = await getSalesforceToken();
    if (!sf) return res.status(400).json({ error: 'Salesforce not configured or token failed' });
    const resp = await fetch(`${sf.instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent("SELECT Id, CaseNumber, Subject, Description, Contact.Email, Contact.Name, Priority, Status FROM Case WHERE Status != 'Closed' ORDER BY CreatedDate DESC LIMIT 50")}`, {
      headers: { Authorization: `Bearer ${sf.accessToken}` }
    });
    const data = await resp.json();
    const cases = data.records || [];
    let imported = 0;
    for (const c of cases) {
      const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`salesforce:${c.Id}`]);
      if (existing) continue;
      const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
      const msgs = [{ role: 'user', content: c.Description || c.Subject || '', ts: new Date().toISOString() }];
      const priorityMap = { High: 'high', Medium: 'medium', Low: 'low', Critical: 'urgent' };
      await db.query(
        'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status, priority) VALUES (?,?,?,?,?,?,?,?,?)',
        [agent?.id || null, 'salesforce', c.Contact?.Email, c.Contact?.Name, c.Subject || `Case ${c.CaseNumber}`, JSON.stringify(msgs), `salesforce:${c.Id}`, 'open', priorityMap[c.Priority] || 'medium']
      );
      imported++;
    }
    await auditLog('admin', 'salesforce_sync', 'integration', null, { imported, total_cases: cases.length });
    res.json({ ok: true, imported, total: cases.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gorgias — incoming webhook + push reply + KB sync
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/helpdesk/incoming/gorgias', async (req, res) => {
  try {
    const data = req.body || {};
    const ticketId = data.ticket_id || data.id;
    if (!ticketId) return res.status(400).json({ error: 'ticket_id required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`gorgias:${ticketId}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const msg = data.message?.body_text || data.message?.body_html?.replace(/<[^>]+>/g, '') || data.subject || '';
    const email = data.customer?.email || data.message?.from_agent?.email || '';
    const name = data.customer?.name || '';
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: msg, ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'gorgias', email, name, (data.subject || msg).slice(0, 200), JSON.stringify(msgs), `gorgias:${ticketId}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/sync/gorgias', requireAuth, async (req, res) => {
  try {
    const domain = await getSetting('gorgias_domain', '');
    const token = await getSetting('gorgias_api_token', '');
    const email = await getSetting('gorgias_email', '');
    if (!domain || !token) return res.status(400).json({ error: 'Gorgias not configured (domain + api_token required)' });
    const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
    const base = domain.includes('://') ? domain.replace(/\/$/, '') : `https://${domain}.gorgias.com`;

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'gorgias:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const gId = t.external_id.replace('gorgias:', '');
        const gResp = await fetch(`${base}/api/tickets/${gId}`, { headers: { Authorization: auth } });
        if (!gResp.ok) continue;
        const gData = await gResp.json();
        if (gData.status === 'closed') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync messages
        const msgResp = await fetch(`${base}/api/tickets/${gId}/messages?limit=20&order_by=created_datetime:asc`, { headers: { Authorization: auth } });
        if (msgResp.ok) {
          const msgData = await msgResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const m of (msgData.data || [])) {
            if (new Date(m.created_datetime) > new Date(lastTs)) {
              msgs.push({ role: m.source?.type === 'customer' ? 'user' : 'assistant', content: (m.body_text || m.body_html || '').replace(/<[^>]+>/g, '').slice(0, 5000), ts: m.created_datetime });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Help Scout — incoming webhook + push reply + sync
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/helpdesk/incoming/helpscout', async (req, res) => {
  try {
    const data = req.body || {};
    const convoId = data.id || data.conversationId;
    if (!convoId) return res.status(400).json({ error: 'conversation id required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`helpscout:${convoId}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const subject = data.subject || '';
    const preview = data.preview || data.body || '';
    const email = data.customer?.email || data.primaryCustomer?.email || '';
    const name = data.customer?.firstName ? `${data.customer.firstName} ${data.customer.lastName || ''}`.trim() : '';
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: preview.replace(/<[^>]+>/g, ''), ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'helpscout', email, name, subject.slice(0, 200), JSON.stringify(msgs), `helpscout:${convoId}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/sync/helpscout', requireAuth, async (req, res) => {
  try {
    const apiKey = await getSetting('helpscout_api_key', '');
    if (!apiKey) return res.status(400).json({ error: 'Help Scout API key not configured' });
    const auth = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64');

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'helpscout:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const hsId = t.external_id.replace('helpscout:', '');
        const hsResp = await fetch(`https://api.helpscout.net/v2/conversations/${hsId}`, { headers: { Authorization: auth } });
        if (!hsResp.ok) continue;
        const hsData = await hsResp.json();
        if (hsData.status === 'closed') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync threads
        const thResp = await fetch(`https://api.helpscout.net/v2/conversations/${hsId}/threads`, { headers: { Authorization: auth } });
        if (thResp.ok) {
          const thData = await thResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const th of (thData._embedded?.threads || [])) {
            if (new Date(th.createdAt) > new Date(lastTs) && th.body) {
              msgs.push({ role: th.type === 'customer' ? 'user' : 'assistant', content: (th.body || '').replace(/<[^>]+>/g, '').slice(0, 5000), ts: th.createdAt });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zoho Desk — incoming webhook + push reply + sync
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/helpdesk/incoming/zoho', async (req, res) => {
  try {
    const data = req.body || {};
    const ticketId = data.ticketId || data.id;
    if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`zoho:${ticketId}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const subject = data.subject || '';
    const description = data.description || data.comment || '';
    const email = data.email || data.contact?.email || '';
    const name = data.contactName || data.contact?.lastName || '';
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: description.replace(/<[^>]+>/g, ''), ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'zoho', email, name, subject.slice(0, 200), JSON.stringify(msgs), `zoho:${ticketId}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/sync/zoho', requireAuth, async (req, res) => {
  try {
    const orgId = await getSetting('zoho_org_id', '');
    const token = await getSetting('zoho_api_token', '');
    if (!token) return res.status(400).json({ error: 'Zoho Desk API token not configured' });
    const zdHeaders = { Authorization: `Zoho-oauthtoken ${token}`, orgId };

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'zoho:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const zId = t.external_id.replace('zoho:', '');
        const zResp = await fetch(`https://desk.zoho.com/api/v1/tickets/${zId}`, { headers: zdHeaders });
        if (!zResp.ok) continue;
        const zData = await zResp.json();
        if (zData.status === 'Closed') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync comments/threads
        const commResp = await fetch(`https://desk.zoho.com/api/v1/tickets/${zId}/comments?sortBy=commentedTime`, { headers: zdHeaders });
        if (commResp.ok) {
          const commData = await commResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const c of (commData.data || [])) {
            if (new Date(c.commentedTime) > new Date(lastTs) && c.content) {
              msgs.push({ role: c.isPublic ? 'user' : 'assistant', content: (c.content || '').replace(/<[^>]+>/g, '').slice(0, 5000), ts: c.commentedTime });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Re:amaze — incoming webhook + push reply + sync
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/helpdesk/incoming/reamaze', async (req, res) => {
  try {
    const data = req.body || {};
    const convoSlug = data.slug || data.conversation?.slug || data.id;
    if (!convoSlug) return res.status(400).json({ error: 'conversation slug required' });
    const existing = await db.queryOne('SELECT id FROM helpdesk_tickets WHERE external_id = ?', [`reamaze:${convoSlug}`]);
    if (existing) return res.json({ ok: true, existing: true });
    const subject = data.subject || data.conversation?.subject || '';
    const body = data.body || data.message?.body || '';
    const email = data.customer?.email || data.user?.email || '';
    const name = data.customer?.name || data.user?.name || '';
    const agent = await db.queryOne("SELECT id FROM helpdesk_agents WHERE is_active = 1 ORDER BY id LIMIT 1");
    const msgs = [{ role: 'user', content: body.replace(/<[^>]+>/g, ''), ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (agent_id, channel, customer_email, customer_name, subject, messages, external_id, status) VALUES (?,?,?,?,?,?,?,?)',
      [agent?.id || null, 'reamaze', email, name, subject.slice(0, 200), JSON.stringify(msgs), `reamaze:${convoSlug}`, 'open']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/helpdesk/sync/reamaze', requireAuth, async (req, res) => {
  try {
    const brand = await getSetting('reamaze_brand', '');
    const token = await getSetting('reamaze_api_token', '');
    const email = await getSetting('reamaze_email', '');
    if (!brand || !token) return res.status(400).json({ error: 'Re:amaze not configured (brand + api_token required)' });
    const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'reamaze:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const slug = t.external_id.replace('reamaze:', '');
        const rResp = await fetch(`https://${brand}.reamaze.com/api/v1/conversations/${slug}`, {
          headers: { Authorization: auth, Accept: 'application/json' }
        });
        if (!rResp.ok) continue;
        const rData = await rResp.json();
        if (rData.status === 'resolved' || rData.status === 'archived') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync messages
        const msgResp = await fetch(`https://${brand}.reamaze.com/api/v1/conversations/${slug}/messages`, {
          headers: { Authorization: auth, Accept: 'application/json' }
        });
        if (msgResp.ok) {
          const msgData = await msgResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const m of (msgData || [])) {
            if (new Date(m.created_at) > new Date(lastTs) && m.body) {
              msgs.push({ role: m.user?.is_staff ? 'assistant' : 'user', content: (m.body || '').replace(/<[^>]+>/g, '').slice(0, 5000), ts: m.created_at });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Push reply back to Gorgias / Help Scout / Zoho / Re:amaze
// (extend existing push-reply endpoint — handled via external_id prefix detection)

// ═══════════════════════════════════════════════════════════════════════════════
// Discord Bot — receive messages via webhook + respond with AI
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/discord/interactions', async (req, res) => {
  // Discord interaction verification
  if (req.body?.type === 1) return res.json({ type: 1 }); // PING → PONG

  const data = req.body || {};
  if (data.type !== 2 && data.type !== undefined) return res.json({ type: 4, data: { content: 'Unknown interaction type' } });

  // Handle slash commands or message interactions
  res.json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE

  try {
    const discordToken = await getSetting('discord_bot_token', process.env.DISCORD_BOT_TOKEN || '');
    if (!discordToken) return;

    const userMessage = data.data?.options?.[0]?.value || data.data?.name || '';
    if (!userMessage) return;

    // Find active agent
    let agentChannel = await db.queryOne("SELECT * FROM agent_channels WHERE channel_type = 'discord' AND is_active = 1 ORDER BY created_at LIMIT 1");
    let agent;
    if (agentChannel) agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE id = ? AND is_active = 1', [agentChannel.agent_id]);
    if (!agent) agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
    if (!agent) return;

    // Build AI response
    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return;

    // KB context
    let kbContext = '';
    try {
      const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
      if (kbDocs.length > 0) kbContext = '\n\nKnowledge Base:\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 12000);
    } catch {}

    const ticketLang = detectLanguage(userMessage);
    const langPrompt = multiLangSystemPrompt(ticketLang);
    const sysPrompt = (agent.system_prompt || 'You are a helpful AI assistant.') + langPrompt + kbContext;

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userMessage }], max_tokens: 1000, temperature: 0.3 }),
    });
    if (!aiResp.ok) return;
    const aiData = await aiResp.json();
    const reply = (aiData.choices?.[0]?.message?.content || 'No response.').slice(0, 2000);

    // Edit the deferred response
    const appId = data.application_id;
    const interToken = data.token;
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: reply }),
    });

    // Update channel stats
    if (agentChannel) {
      await db.query('UPDATE agent_channels SET messages_handled = messages_handled + 1 WHERE id = ?', [agentChannel.id]).catch(() => {});
    }

    // Log ticket
    const tId = crypto.randomUUID();
    const msgs = [{ role: 'user', content: userMessage, ts: new Date().toISOString() }, { role: 'assistant', content: reply, ts: new Date().toISOString() }];
    await db.query(
      'INSERT INTO helpdesk_tickets (id, agent_id, channel, customer_name, subject, messages, status, resolved, auto_replies_count) VALUES (?,?,?,?,?,?,?,1,1)',
      [tId, agent.id, 'discord', data.member?.user?.username || 'Discord User', userMessage.slice(0, 200), JSON.stringify(msgs), 'resolved']
    ).catch(() => {});
  } catch (e) { console.error('[discord-bot]', e.message); }
});

// Discord webhook messages (for channel-based bots without interactions)
app.post('/api/discord/messages', requireDb, async (req, res) => {
  const { content, author, channel_id, guild_id } = req.body || {};
  if (!content || !author) return res.status(400).json({ error: 'content and author required' });
  // Ignore bot messages
  if (author.bot) return res.json({ ok: true });

  res.json({ ok: true }); // respond fast

  try {
    const discordToken = await getSetting('discord_bot_token', process.env.DISCORD_BOT_TOKEN || '');
    if (!discordToken) return;

    let agent = await db.queryOne('SELECT * FROM helpdesk_agents WHERE is_active = 1 ORDER BY created_at LIMIT 1');
    if (!agent) return;

    const ai = await getAiConfig();
    if (!ai.primaryUrl || !ai.primaryKey) return;

    let kbContext = '';
    try {
      const kbDocs = await db.query('SELECT name, content FROM kb_documents ORDER BY created_at DESC');
      if (kbDocs.length > 0) kbContext = '\n\nKnowledge Base:\n' + kbDocs.map(d => `### ${d.name}\n${d.content}`).join('\n---\n').slice(0, 12000);
    } catch {}

    const ticketLang = detectLanguage(content);
    const langPrompt = multiLangSystemPrompt(ticketLang);
    const sysPrompt = (agent.system_prompt || 'You are a helpful AI assistant.') + langPrompt + kbContext;

    const aiResp = await fetch(ai.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.primaryKey}` },
      body: JSON.stringify({ model: getModelForUseCase(ai, 'helpdesk'), messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content }], max_tokens: 1000, temperature: 0.3 }),
    });
    if (!aiResp.ok) return;
    const aiData = await aiResp.json();
    const reply = (aiData.choices?.[0]?.message?.content || '').slice(0, 2000);
    if (!reply) return;

    // Send reply to Discord channel
    await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${discordToken}` },
      body: JSON.stringify({ content: reply }),
    });
  } catch (e) { console.error('[discord-msg]', e.message); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BigCommerce — KB sync (products + orders)
// ═══════════════════════════════════════════════════════════════════════════════

// (integrated into the main /api/integrations/:id/sync endpoint)

// ═══════════════════════════════════════════════════════════════════════════════
// Magento — KB sync (products + orders)
// ═══════════════════════════════════════════════════════════════════════════════

// (integrated into the main /api/integrations/:id/sync endpoint)

// Periodic SLA check — runs every 5 minutes (with email + webhook notifications)
setInterval(async () => {
  if (!_dbReady) return;
  try {
    const now = new Date();
    const noFirstResponse = await db.query(
      "SELECT id, subject, customer_email, created_at, sla_first_response_minutes FROM helpdesk_tickets WHERE status = 'open' AND first_response_at IS NULL AND sla_first_response_minutes IS NOT NULL AND sla_first_response_breached = 0"
    );
    for (const t of noFirstResponse) {
      const elapsed = (now - new Date(t.created_at)) / 60000;
      if (elapsed > t.sla_first_response_minutes) {
        await db.query('UPDATE helpdesk_tickets SET sla_first_response_breached = 1 WHERE id = ?', [t.id]);
        emitEvent('sla:breach', { ticket_id: t.id, type: 'first_response', elapsed_minutes: Math.round(elapsed) });
        // Feature 28 — SLA breach email + webhook notifications
        sendOpsEmail('sla_breach', { ticket_id: t.id, breach_type: 'first_response', elapsed_minutes: Math.round(elapsed), sla_limit: t.sla_first_response_minutes, subject: t.subject, customer_email: t.customer_email }).catch(() => {});
        fireWebhooks('sla_breach', { ticket_id: t.id, type: 'first_response', elapsed_minutes: Math.round(elapsed) }).catch(() => {});
      }
    }
    const unresolved = await db.query(
      "SELECT id, subject, customer_email, created_at, sla_resolution_minutes FROM helpdesk_tickets WHERE status != 'resolved' AND resolved = 0 AND sla_resolution_minutes IS NOT NULL AND sla_resolution_breached = 0"
    );
    for (const t of unresolved) {
      const elapsed = (now - new Date(t.created_at)) / 60000;
      if (elapsed > t.sla_resolution_minutes) {
        await db.query('UPDATE helpdesk_tickets SET sla_resolution_breached = 1 WHERE id = ?', [t.id]);
        emitEvent('sla:breach', { ticket_id: t.id, type: 'resolution', elapsed_minutes: Math.round(elapsed) });
        sendOpsEmail('sla_breach', { ticket_id: t.id, breach_type: 'resolution', elapsed_minutes: Math.round(elapsed), sla_limit: t.sla_resolution_minutes, subject: t.subject, customer_email: t.customer_email }).catch(() => {});
        fireWebhooks('sla_breach', { ticket_id: t.id, type: 'resolution', elapsed_minutes: Math.round(elapsed) }).catch(() => {});
      }
    }
  } catch (e) { console.error('[sla-check]', e.message); }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE: Auto-Sync KB Connectors (cron-based automatic sync)
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureAutoSyncTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS integration_auto_sync (
      id INT AUTO_INCREMENT PRIMARY KEY,
      integration_id VARCHAR(64) NOT NULL,
      interval_minutes INT DEFAULT 60,
      is_active TINYINT DEFAULT 1,
      last_run_at TIMESTAMP NULL,
      next_run_at TIMESTAMP NULL,
      last_status VARCHAR(20) DEFAULT 'pending',
      last_docs_synced INT DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_integ (integration_id)
    )
  `);
}

// Enable auto-sync for an integration
app.post('/api/integrations/:id/auto-sync', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { interval_minutes = 60, enabled = true } = req.body || {};
  try {
    const integ = await db.queryOne('SELECT id, provider, name FROM integrations WHERE id = ?', [id]);
    if (!integ) return res.status(404).json({ error: 'Integration not found' });
    const nextRun = new Date(Date.now() + interval_minutes * 60000);
    await db.query(
      `INSERT INTO integration_auto_sync (integration_id, interval_minutes, is_active, next_run_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE interval_minutes = VALUES(interval_minutes), is_active = VALUES(is_active), next_run_at = VALUES(next_run_at)`,
      [id, interval_minutes, enabled ? 1 : 0, nextRun]
    );
    res.json({ ok: true, interval_minutes, enabled, next_run_at: nextRun.toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get auto-sync status
app.get('/api/integrations/auto-sync/status', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT s.*, i.provider, i.name as integration_name
      FROM integration_auto_sync s
      JOIN integrations i ON i.id = s.integration_id
      ORDER BY s.next_run_at
    `);
    res.json({ syncs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete auto-sync
app.delete('/api/integrations/:id/auto-sync', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM integration_auto_sync WHERE integration_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Auto-sync cron — runs every 2 minutes, checks what needs syncing
setInterval(async () => {
  try {
    if (!_dbReady) return;
    const due = await db.query(
      'SELECT * FROM integration_auto_sync WHERE is_active = 1 AND (next_run_at IS NULL OR next_run_at <= NOW())'
    );
    for (const sync of due) {
      try {
        // Trigger the existing sync endpoint internally
        const integ = await db.queryOne('SELECT * FROM integrations WHERE id = ?', [sync.integration_id]);
        if (!integ) continue;
        const config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {});

        // Remove old docs from this integration before re-syncing (incremental)
        // Only remove docs older than 24h to avoid churning fresh content
        await db.query(
          "DELETE FROM kb_documents WHERE type = ? AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)",
          [integ.provider]
        );

        // Call sync internally via HTTP to localhost
        const resp = await fetch(`http://localhost:${PORT}/api/integrations/${sync.integration_id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_ACCESS_KEY || ''}` },
        });
        const result = await resp.json();

        const nextRun = new Date(Date.now() + sync.interval_minutes * 60000);
        await db.query(
          'UPDATE integration_auto_sync SET last_run_at = NOW(), next_run_at = ?, last_status = ?, last_docs_synced = ?, last_error = NULL WHERE id = ?',
          [nextRun, 'success', result.docs_added || 0, sync.id]
        );
        emitEvent('autosync:completed', { integration_id: sync.integration_id, provider: integ.provider, docs_added: result.docs_added || 0 });
      } catch (e) {
        const nextRun = new Date(Date.now() + sync.interval_minutes * 60000);
        await db.query(
          'UPDATE integration_auto_sync SET last_run_at = NOW(), next_run_at = ?, last_status = ?, last_error = ? WHERE id = ?',
          [nextRun, 'error', e.message, sync.id]
        ).catch(() => {});
      }
    }
  } catch {}
}, 2 * 60 * 1000);

// SharePoint connector (sync into KB)
app.post('/api/integrations/:id/sync-sharepoint', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const integ = await db.queryOne('SELECT * FROM integrations WHERE id = ?', [id]);
    if (!integ) return res.status(404).json({ error: 'Integration not found' });
    const config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {});
    const spToken = config.access_token || await getValidToken('microsoft');
    const spSiteUrl = config.site_url || config.url || '';
    if (!spToken) return res.status(400).json({ error: 'SharePoint access token requis. Connectez Microsoft dans Intégrations.' });

    let docsAdded = 0;
    // List drive items from the default document library
    const siteId = config.site_id || '';
    const driveEndpoint = siteId
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`
      : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

    const drResp = await fetch(driveEndpoint, {
      headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json' }
    });
    if (!drResp.ok) return res.status(400).json({ error: 'SharePoint API error: ' + drResp.status });
    const drData = await drResp.json();

    for (const item of (drData.value || [])) {
      if (item.folder) continue; // skip folders
      try {
        // Download file content
        const dlUrl = siteId
          ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${item.id}/content`
          : `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`;
        const dlResp = await fetch(dlUrl, { headers: { Authorization: `Bearer ${spToken}` } });
        if (!dlResp.ok) continue;

        let content = '';
        const name = (item.name || '').toLowerCase();
        if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.json')) {
          content = (await dlResp.text()).slice(0, 12000);
        } else if (name.endsWith('.docx')) {
          const buf = Buffer.from(await dlResp.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer: buf });
          content = (result.value || '').slice(0, 12000);
        } else if (name.endsWith('.pdf')) {
          const buf = Buffer.from(await dlResp.arrayBuffer());
          const pdfData = await pdfParse(buf);
          content = (pdfData.text || '').slice(0, 12000);
        } else {
          continue; // skip unsupported formats
        }

        if (!content.trim()) continue;
        const docId = crypto.randomUUID();
        await db.query('INSERT INTO kb_documents (id, type, name, url, content, chars) VALUES (?, ?, ?, ?, ?, ?)',
          [docId, 'sharepoint', item.name, item.webUrl || '', content, content.length]);
        chunkAndEmbedDocument(docId, content).catch(() => {});
        docsAdded++;
      } catch {}
    }

    await db.query('UPDATE integrations SET last_sync_at = NOW(), docs_synced = docs_synced + ? WHERE id = ?', [docsAdded, id]);
    res.json({ success: true, docs_added: docsAdded });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE: Native Helpdesk Integrations (bidirectional sync)
// ═══════════════════════════════════════════════════════════════════════════════

// Zendesk: push reply back to Zendesk ticket
app.post('/api/helpdesk/tickets/:id/push-reply', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const ticket = await db.queryOne('SELECT * FROM helpdesk_tickets WHERE id = ?', [id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const extId = ticket.external_id || '';

    if (extId.startsWith('zendesk:')) {
      const zdTicketId = extId.replace('zendesk:', '');
      const zdToken = await getSetting('zendesk_api_token', '');
      const zdSubdomain = await getSetting('zendesk_subdomain', '');
      const zdEmail = await getSetting('zendesk_email', '');
      if (!zdToken || !zdSubdomain) return res.status(400).json({ error: 'Zendesk not configured' });
      const zdAuth = zdEmail ? 'Basic ' + Buffer.from(`${zdEmail}/token:${zdToken}`).toString('base64') : `Bearer ${zdToken}`;
      const zdResp = await fetch(`https://${zdSubdomain}.zendesk.com/api/v2/tickets/${zdTicketId}.json`, {
        method: 'PUT',
        headers: { Authorization: zdAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: { comment: { body: message, public: true } } }),
      });
      if (!zdResp.ok) return res.status(400).json({ error: 'Zendesk API error: ' + zdResp.status });
      res.json({ ok: true, platform: 'zendesk' });

    } else if (extId.startsWith('freshdesk:')) {
      const fdTicketId = extId.replace('freshdesk:', '');
      const fdDomain = await getSetting('freshdesk_domain', '');
      const fdKey = await getSetting('freshdesk_api_key', '');
      if (!fdDomain || !fdKey) return res.status(400).json({ error: 'Freshdesk not configured' });
      const fdBase = fdDomain.includes('://') ? fdDomain.replace(/\/$/, '') : `https://${fdDomain}`;
      const fdAuth = 'Basic ' + Buffer.from(`${fdKey}:X`).toString('base64');
      const fdResp = await fetch(`${fdBase}/api/v2/tickets/${fdTicketId}/reply`, {
        method: 'POST',
        headers: { Authorization: fdAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: message }),
      });
      if (!fdResp.ok) return res.status(400).json({ error: 'Freshdesk API error: ' + fdResp.status });
      res.json({ ok: true, platform: 'freshdesk' });

    } else if (extId.startsWith('intercom:')) {
      const icConvoId = extId.replace('intercom:', '');
      const icToken = await getSetting('intercom_api_token', '');
      if (!icToken) return res.status(400).json({ error: 'Intercom not configured' });
      const icResp = await fetch(`https://api.intercom.io/conversations/${icConvoId}/reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${icToken}`, 'Content-Type': 'application/json', 'Intercom-Version': '2.10' },
        body: JSON.stringify({ message_type: 'comment', type: 'admin', body: message }),
      });
      if (!icResp.ok) return res.status(400).json({ error: 'Intercom API error: ' + icResp.status });
      res.json({ ok: true, platform: 'intercom' });

    } else if (extId.startsWith('salesforce:')) {
      const sfCaseId = extId.replace('salesforce:', '');
      const sfToken = await getSetting('salesforce_access_token', '') || await getValidToken('salesforce');
      const sfUrl = await getSetting('salesforce_instance_url', '');
      if (!sfToken || !sfUrl) return res.status(400).json({ error: 'Salesforce not configured' });
      // Add a CaseComment
      const sfResp = await fetch(`${sfUrl}/services/data/v58.0/sobjects/CaseComment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ParentId: sfCaseId, CommentBody: message, IsPublished: true }),
      });
      if (!sfResp.ok) return res.status(400).json({ error: 'Salesforce API error: ' + sfResp.status });
      res.json({ ok: true, platform: 'salesforce' });

    } else if (extId.startsWith('gorgias:')) {
      const gTicketId = extId.replace('gorgias:', '');
      const domain = await getSetting('gorgias_domain', '');
      const token = await getSetting('gorgias_api_token', '');
      const gEmail = await getSetting('gorgias_email', '');
      if (!domain || !token) return res.status(400).json({ error: 'Gorgias not configured' });
      const auth = 'Basic ' + Buffer.from(`${gEmail}:${token}`).toString('base64');
      const base = domain.includes('://') ? domain.replace(/\/$/, '') : `https://${domain}.gorgias.com`;
      const gResp = await fetch(`${base}/api/tickets/${gTicketId}/messages`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'internal', via: 'api', body_text: message, sender: { type: 'agent' } }),
      });
      if (!gResp.ok) return res.status(400).json({ error: 'Gorgias API error: ' + gResp.status });
      res.json({ ok: true, platform: 'gorgias' });

    } else if (extId.startsWith('helpscout:')) {
      const hsConvoId = extId.replace('helpscout:', '');
      const apiKey = await getSetting('helpscout_api_key', '');
      if (!apiKey) return res.status(400).json({ error: 'Help Scout not configured' });
      const auth = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64');
      const hsResp = await fetch(`https://api.helpscout.net/v2/conversations/${hsConvoId}/reply`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: {}, text: message, status: 'active' }),
      });
      if (!hsResp.ok) return res.status(400).json({ error: 'Help Scout API error: ' + hsResp.status });
      res.json({ ok: true, platform: 'helpscout' });

    } else if (extId.startsWith('zoho:')) {
      const zTicketId = extId.replace('zoho:', '');
      const orgId = await getSetting('zoho_org_id', '');
      const token = await getSetting('zoho_api_token', '');
      if (!token) return res.status(400).json({ error: 'Zoho Desk not configured' });
      const zResp = await fetch(`https://desk.zoho.com/api/v1/tickets/${zTicketId}/comments`, {
        method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}`, orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, isPublic: true }),
      });
      if (!zResp.ok) return res.status(400).json({ error: 'Zoho Desk API error: ' + zResp.status });
      res.json({ ok: true, platform: 'zoho' });

    } else if (extId.startsWith('reamaze:')) {
      const slug = extId.replace('reamaze:', '');
      const brand = await getSetting('reamaze_brand', '');
      const token = await getSetting('reamaze_api_token', '');
      const rEmail = await getSetting('reamaze_email', '');
      if (!brand || !token) return res.status(400).json({ error: 'Re:amaze not configured' });
      const auth = 'Basic ' + Buffer.from(`${rEmail}:${token}`).toString('base64');
      const rResp = await fetch(`https://${brand}.reamaze.com/api/v1/conversations/${slug}/messages`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { body: message } }),
      });
      if (!rResp.ok) return res.status(400).json({ error: 'Re:amaze API error: ' + rResp.status });
      res.json({ ok: true, platform: 'reamaze' });

    } else {
      return res.status(400).json({ error: 'Ticket has no external platform link' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Zendesk: sync ticket status back
app.post('/api/helpdesk/sync/zendesk', requireAuth, async (req, res) => {
  try {
    const zdToken = await getSetting('zendesk_api_token', '');
    const zdSubdomain = await getSetting('zendesk_subdomain', '');
    const zdEmail = await getSetting('zendesk_email', '');
    if (!zdToken || !zdSubdomain) return res.status(400).json({ error: 'Zendesk not configured' });
    const zdAuth = zdEmail ? 'Basic ' + Buffer.from(`${zdEmail}/token:${zdToken}`).toString('base64') : `Bearer ${zdToken}`;

    // Get open tickets from Lamu that are linked to Zendesk
    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'zendesk:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const zdId = t.external_id.replace('zendesk:', '');
        const zdResp = await fetch(`https://${zdSubdomain}.zendesk.com/api/v2/tickets/${zdId}.json`, {
          headers: { Authorization: zdAuth }
        });
        if (!zdResp.ok) continue;
        const zdData = await zdResp.json();
        const zdStatus = zdData.ticket?.status;
        if (zdStatus === 'solved' || zdStatus === 'closed') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync new comments
        const commResp = await fetch(`https://${zdSubdomain}.zendesk.com/api/v2/tickets/${zdId}/comments.json`, {
          headers: { Authorization: zdAuth }
        });
        if (commResp.ok) {
          const commData = await commResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const c of (commData.comments || [])) {
            if (new Date(c.created_at) > new Date(lastTs) && !c.public === false) {
              msgs.push({ role: c.author_id ? 'user' : 'assistant', content: c.plain_body || c.body || '', ts: c.created_at });
              added = true;
            }
          }
          if (added) {
            await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
          }
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Freshdesk: sync ticket status back
app.post('/api/helpdesk/sync/freshdesk', requireAuth, async (req, res) => {
  try {
    const fdDomain = await getSetting('freshdesk_domain', '');
    const fdKey = await getSetting('freshdesk_api_key', '');
    if (!fdDomain || !fdKey) return res.status(400).json({ error: 'Freshdesk not configured' });
    const fdBase = fdDomain.includes('://') ? fdDomain.replace(/\/$/, '') : `https://${fdDomain}`;
    const fdAuth = 'Basic ' + Buffer.from(`${fdKey}:X`).toString('base64');

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'freshdesk:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const fdId = t.external_id.replace('freshdesk:', '');
        const fdResp = await fetch(`${fdBase}/api/v2/tickets/${fdId}`, { headers: { Authorization: fdAuth } });
        if (!fdResp.ok) continue;
        const fdData = await fdResp.json();
        // Freshdesk status: 2=open, 3=pending, 4=resolved, 5=closed
        if (fdData.status >= 4) {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync conversations
        const convResp = await fetch(`${fdBase}/api/v2/tickets/${fdId}/conversations`, { headers: { Authorization: fdAuth } });
        if (convResp.ok) {
          const convs = await convResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const c of convs) {
            if (new Date(c.created_at) > new Date(lastTs)) {
              msgs.push({ role: c.incoming ? 'user' : 'assistant', content: (c.body_text || c.body || '').replace(/<[^>]+>/g, ''), ts: c.created_at });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Intercom: sync conversation status back
app.post('/api/helpdesk/sync/intercom', requireAuth, async (req, res) => {
  try {
    const icToken = await getSetting('intercom_api_token', '');
    if (!icToken) return res.status(400).json({ error: 'Intercom not configured' });

    const localTickets = await db.query("SELECT id, external_id FROM helpdesk_tickets WHERE external_id LIKE 'intercom:%' AND status = 'open'");
    let synced = 0;
    for (const t of localTickets) {
      try {
        const icId = t.external_id.replace('intercom:', '');
        const icResp = await fetch(`https://api.intercom.io/conversations/${icId}`, {
          headers: { Authorization: `Bearer ${icToken}`, 'Intercom-Version': '2.10' }
        });
        if (!icResp.ok) continue;
        const icData = await icResp.json();
        if (icData.state === 'closed') {
          await db.query('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', ['resolved', t.id]);
          synced++;
        }
        // Sync conversation parts
        const partsResp = await fetch(`https://api.intercom.io/conversations/${icId}`, {
          headers: { Authorization: `Bearer ${icToken}`, 'Intercom-Version': '2.10' }
        });
        if (partsResp.ok) {
          const partsData = await partsResp.json();
          const existing = await db.queryOne('SELECT messages FROM helpdesk_tickets WHERE id = ?', [t.id]);
          const msgs = existing?.messages ? (typeof existing.messages === 'string' ? JSON.parse(existing.messages) : existing.messages) : [];
          const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].ts : '1970-01-01';
          let added = false;
          for (const part of (partsData.conversation_parts?.conversation_parts || [])) {
            if (new Date(part.created_at * 1000) > new Date(lastTs) && part.body) {
              msgs.push({ role: part.part_type === 'note' ? 'system' : (part.author?.type === 'user' ? 'user' : 'assistant'), content: part.body.replace(/<[^>]+>/g, ''), ts: new Date(part.created_at * 1000).toISOString() });
              added = true;
            }
          }
          if (added) await db.query('UPDATE helpdesk_tickets SET messages = ? WHERE id = ?', [JSON.stringify(msgs), t.id]);
        }
      } catch {}
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helpdesk auto-sync cron — every 5 minutes, sync all platforms
setInterval(async () => {
  try {
    if (!_dbReady) return;
    const helpdeskAutoSync = await getSetting('helpdesk_auto_sync', '0');
    if (helpdeskAutoSync !== '1') return;

    // Internal calls to sync endpoints
    const platforms = ['zendesk', 'freshdesk', 'intercom', 'gorgias', 'helpscout', 'zoho', 'reamaze'];
    for (const p of platforms) {
      try {
        await fetch(`http://localhost:${PORT}/api/helpdesk/sync/${p}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_ACCESS_KEY || ''}` },
        });
      } catch {}
    }
  } catch {}
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE: Autonomous AI Actions (function calling)
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureActionsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_actions_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id INT,
      conversation_id VARCHAR(64),
      action_type VARCHAR(50) NOT NULL,
      action_payload JSON,
      result JSON,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

const AI_ACTIONS = {
  create_jira_ticket: {
    description: 'Create a Jira ticket for the customer issue',
    parameters: { summary: 'string', description: 'string', priority: 'string', project_key: 'string' },
    execute: async (params) => {
      const jiraUrl = await getSetting('jira_url', '');
      const jiraEmail = await getSetting('jira_email', '');
      const jiraToken = await getSetting('jira_api_token', '');
      if (!jiraUrl || !jiraToken) throw new Error('Jira not configured');
      const resp = await fetch(`${jiraUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { project: { key: params.project_key || 'SUP' }, summary: params.summary, description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description }] }] }, issuetype: { name: 'Task' }, priority: { name: params.priority || 'Medium' } } }),
      });
      if (!resp.ok) throw new Error('Jira API error: ' + resp.status);
      return await resp.json();
    },
  },
  send_email: {
    description: 'Send an email to the customer',
    parameters: { to: 'string', subject: 'string', body: 'string' },
    execute: async (params) => {
      const smtp = await getSmtpSettings();
      if (!smtp.host) throw new Error('SMTP not configured');
      const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
      await transporter.sendMail({ from: smtp.from, to: params.to, subject: params.subject, text: params.body });
      return { sent: true, to: params.to };
    },
  },
  update_shopify_order: {
    description: 'Add a note or tag to a Shopify order',
    parameters: { order_id: 'string', note: 'string', tags: 'string' },
    execute: async (params) => {
      const shopUrl = await getSetting('shopify_shop_url', '');
      const shopToken = await getSetting('shopify_access_token', '');
      if (!shopUrl || !shopToken) throw new Error('Shopify not configured');
      const update = {};
      if (params.note) update.note = params.note;
      if (params.tags) update.tags = params.tags;
      const resp = await fetch(`${shopUrl.replace(/\/$/, '')}/admin/api/2024-01/orders/${params.order_id}.json`, {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: update }),
      });
      if (!resp.ok) throw new Error('Shopify API error: ' + resp.status);
      return await resp.json();
    },
  },
  lookup_order: {
    description: 'Look up order details by order number or customer email',
    parameters: { query: 'string' },
    execute: async (params) => {
      const shopUrl = await getSetting('shopify_shop_url', '');
      const shopToken = await getSetting('shopify_access_token', '');
      if (!shopUrl || !shopToken) throw new Error('Shopify not configured');
      const resp = await fetch(`${shopUrl.replace(/\/$/, '')}/admin/api/2024-01/orders.json?status=any&name=${encodeURIComponent(params.query)}&limit=5`, {
        headers: { 'X-Shopify-Access-Token': shopToken }
      });
      if (!resp.ok) throw new Error('Shopify API error: ' + resp.status);
      const data = await resp.json();
      return (data.orders || []).map(o => ({ id: o.id, number: o.order_number, status: o.financial_status, total: o.total_price, email: o.customer?.email }));
    },
  },
  update_hubspot_contact: {
    description: 'Update a HubSpot contact property',
    parameters: { email: 'string', properties: 'object' },
    execute: async (params) => {
      const hsToken = await getSetting('hubspot_api_token', '');
      if (!hsToken) throw new Error('HubSpot not configured');
      // Search by email
      const searchResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: params.email }] }] }),
      });
      if (!searchResp.ok) throw new Error('HubSpot search error');
      const searchData = await searchResp.json();
      const contactId = searchData.results?.[0]?.id;
      if (!contactId) throw new Error('Contact not found');
      const updateResp = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: params.properties }),
      });
      if (!updateResp.ok) throw new Error('HubSpot update error');
      return await updateResp.json();
    },
  },
  search_kb: {
    description: 'Search the knowledge base for relevant information',
    parameters: { query: 'string' },
    execute: async (params) => {
      // Use internal KB search
      const results = await hybridSearch(params.query, 3);
      return results.map(r => ({ title: r.doc_title, content: r.chunk_text?.slice(0, 500), score: r.score }));
    },
  },
  escalate_to_human: {
    description: 'Escalate the ticket to a human agent',
    parameters: { reason: 'string', ticket_id: 'number' },
    execute: async (params) => {
      if (params.ticket_id) {
        await db.query('UPDATE helpdesk_tickets SET status = ?, escalated = 1 WHERE id = ?', ['escalated', params.ticket_id]);
        emitEvent('ticket:escalated', { ticket_id: params.ticket_id, reason: params.reason });
      }
      return { escalated: true, reason: params.reason };
    },
  },
};

// Execute an AI action
app.post('/api/ai-actions/execute', requireAuth, async (req, res) => {
  const { action_type, params, ticket_id, conversation_id } = req.body || {};
  if (!action_type || !AI_ACTIONS[action_type]) return res.status(400).json({ error: `Unknown action: ${action_type}`, available: Object.keys(AI_ACTIONS) });
  try {
    const result = await AI_ACTIONS[action_type].execute(params || {});
    try {
      await db.query('INSERT INTO ai_actions_log (ticket_id, conversation_id, action_type, action_payload, result, status) VALUES (?,?,?,?,?,?)',
        [ticket_id || null, conversation_id || null, action_type, JSON.stringify(params), JSON.stringify(result), 'success']);
    } catch {}
    emitEvent('ai:action', { action_type, ticket_id, result });
    res.json({ ok: true, result });
  } catch (e) {
    try {
      await db.query('INSERT INTO ai_actions_log (ticket_id, conversation_id, action_type, action_payload, result, status) VALUES (?,?,?,?,?,?)',
        [ticket_id || null, conversation_id || null, action_type, JSON.stringify(params), JSON.stringify({ error: e.message }), 'error']);
    } catch {}
    res.status(500).json({ error: e.message });
  }
});

// List available actions
app.get('/api/ai-actions/available', requireAuth, async (req, res) => {
  const actions = Object.entries(AI_ACTIONS).map(([key, val]) => ({
    name: key,
    description: val.description,
    parameters: val.parameters,
  }));
  res.json({ actions });
});

// Get action log
app.get('/api/ai-actions/log', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM ai_actions_log ORDER BY created_at DESC LIMIT 100');
    res.json({ actions: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get OpenAI-compatible function definitions for the AI to use
app.get('/api/ai-actions/functions', requireAuth, async (req, res) => {
  const functions = Object.entries(AI_ACTIONS).map(([name, def]) => ({
    type: 'function',
    function: {
      name,
      description: def.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(def.parameters).map(([k, v]) => [k, { type: v === 'object' ? 'object' : 'string' }])),
        required: Object.keys(def.parameters),
      },
    },
  }));
  res.json({ tools: functions });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE: Multi-language Auto-detection (80+ languages)
// ═══════════════════════════════════════════════════════════════════════════════

const LANG_NAMES = {
  af:'Afrikaans', sq:'Albanian', am:'Amharic', ar:'Arabic', hy:'Armenian', az:'Azerbaijani',
  eu:'Basque', be:'Belarusian', bn:'Bengali', bs:'Bosnian', bg:'Bulgarian', ca:'Catalan',
  ceb:'Cebuano', zh:'Chinese', co:'Corsican', hr:'Croatian', cs:'Czech', da:'Danish',
  nl:'Dutch', en:'English', eo:'Esperanto', et:'Estonian', fi:'Finnish', fr:'French',
  fy:'Frisian', gl:'Galician', ka:'Georgian', de:'German', el:'Greek', gu:'Gujarati',
  ht:'Haitian Creole', ha:'Hausa', haw:'Hawaiian', he:'Hebrew', hi:'Hindi', hmn:'Hmong',
  hu:'Hungarian', is:'Icelandic', ig:'Igbo', id:'Indonesian', ga:'Irish', it:'Italian',
  ja:'Japanese', jv:'Javanese', kn:'Kannada', kk:'Kazakh', km:'Khmer', rw:'Kinyarwanda',
  ko:'Korean', ku:'Kurdish', ky:'Kyrgyz', lo:'Lao', la:'Latin', lv:'Latvian',
  lt:'Lithuanian', lb:'Luxembourgish', mk:'Macedonian', mg:'Malagasy', ms:'Malay',
  ml:'Malayalam', mt:'Maltese', mi:'Maori', mr:'Marathi', mn:'Mongolian', my:'Myanmar',
  ne:'Nepali', no:'Norwegian', ny:'Nyanja', or:'Odia', ps:'Pashto', fa:'Persian',
  pl:'Polish', pt:'Portuguese', pa:'Punjabi', ro:'Romanian', ru:'Russian', sm:'Samoan',
  gd:'Scots Gaelic', sr:'Serbian', st:'Sesotho', sn:'Shona', sd:'Sindhi', si:'Sinhala',
  sk:'Slovak', sl:'Slovenian', so:'Somali', es:'Spanish', su:'Sundanese', sw:'Swahili',
  sv:'Swedish', tl:'Tagalog', tg:'Tajik', ta:'Tamil', tt:'Tatar', te:'Telugu',
  th:'Thai', tr:'Turkish', tk:'Turkmen', uk:'Ukrainian', ur:'Urdu', ug:'Uyghur',
  uz:'Uzbek', vi:'Vietnamese', cy:'Welsh', xh:'Xhosa', yi:'Yiddish', yo:'Yoruba',
  zu:'Zulu',
};

// Lightweight language detection via Unicode ranges + common word patterns
function detectLanguage(text) {
  if (!text || text.length < 3) return 'en';
  const sample = text.slice(0, 500).toLowerCase();

  // CJK
  if (/[\u4e00-\u9fff]/.test(sample)) return 'zh';
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return 'ja';
  if (/[\uac00-\ud7af]/.test(sample)) return 'ko';
  // Arabic
  if (/[\u0600-\u06ff]/.test(sample)) return 'ar';
  // Hebrew
  if (/[\u0590-\u05ff]/.test(sample)) return 'he';
  // Thai
  if (/[\u0e00-\u0e7f]/.test(sample)) return 'th';
  // Devanagari (Hindi)
  if (/[\u0900-\u097f]/.test(sample)) return 'hi';
  // Bengali
  if (/[\u0980-\u09ff]/.test(sample)) return 'bn';
  // Tamil
  if (/[\u0b80-\u0bff]/.test(sample)) return 'ta';
  // Cyrillic
  if (/[\u0400-\u04ff]/.test(sample)) {
    if (/\b(і|є|ї|ґ)\b/.test(sample)) return 'uk';
    return 'ru';
  }
  // Greek
  if (/[\u0370-\u03ff]/.test(sample)) return 'el';
  // Georgian
  if (/[\u10a0-\u10ff]/.test(sample)) return 'ka';
  // Armenian
  if (/[\u0530-\u058f]/.test(sample)) return 'hy';
  // Myanmar
  if (/[\u1000-\u109f]/.test(sample)) return 'my';

  // Latin-script languages — word-frequency heuristics
  const words = sample.split(/\s+/);
  const freq = {};
  const patterns = {
    fr: /\b(le|la|les|de|du|des|un|une|est|et|en|que|qui|pour|dans|sur|avec|pas|je|tu|il|nous|vous|ils|ce|cette|mais|ou|ne|se|son|au|aux|par)\b/,
    es: /\b(el|la|los|las|de|del|en|es|un|una|que|no|se|por|con|para|su|al|como|pero|más|este|esta|todo|ya|muy|hay)\b/,
    pt: /\b(o|a|os|as|de|do|da|dos|das|em|um|uma|que|não|se|por|com|para|seu|sua|ao|como|mas|mais|este|esta|muito)\b/,
    de: /\b(der|die|das|ein|eine|und|ist|in|von|zu|den|für|mit|auf|nicht|sich|des|dem|es|ich|wir|sie|er|auch|an)\b/,
    it: /\b(il|lo|la|le|di|del|in|un|una|che|non|è|per|con|si|da|al|come|ma|più|suo|sua|questo|questa|anche)\b/,
    nl: /\b(de|het|een|van|en|in|is|dat|die|op|voor|met|zijn|niet|aan|er|ook|om|maar|te|bij|wordt|deze|uit|naar)\b/,
    sv: /\b(den|det|en|ett|och|i|att|av|för|med|på|är|som|har|till|kan|inte|var|om|men|från|dessa)\b/,
    da: /\b(den|det|en|et|og|i|at|af|for|med|på|er|som|har|til|kan|ikke|var|om|men|fra|disse)\b/,
    no: /\b(den|det|en|et|og|i|at|av|for|med|på|er|som|har|til|kan|ikke|var|om|men|fra)\b/,
    pl: /\b(się|jest|nie|na|to|że|do|jak|co|ale|za|od|tak|czy|już|tego|też|może|tylko|jeszcze|bardzo|tutaj)\b/,
    tr: /\b(bir|ve|bu|için|ile|de|da|değil|var|olan|ne|çok|gibi|daha|en|kadar|ama|ancak|her|hem)\b/,
    id: /\b(dan|yang|di|ini|itu|dengan|untuk|dari|adalah|pada|ke|tidak|akan|juga|sudah|bisa|ada|mereka|saya)\b/,
    vi: /\b(và|của|là|có|được|trong|cho|này|một|với|không|từ|đã|để|các|như|theo|cũng|người)\b/,
    ro: /\b(și|în|de|la|un|o|este|care|cu|pe|din|nu|mai|pentru|se|a|cel|cea|sau|dar|tot|fost)\b/,
    cs: /\b(je|v|na|se|že|to|s|a|z|do|od|pro|jako|ale|byl|jsou|být|tento|který|také|nebo|tak|jeho)\b/,
    hu: /\b(a|az|és|egy|van|nem|hogy|ez|meg|is|de|már|csak|volt|mint|még|le|ki|fel|el|be|után)\b/,
    fi: /\b(ja|on|ei|se|että|oli|hän|niin|kuin|tai|mutta|myös|kun|jo|vain|olla|tämä|ne|nyt|sitten)\b/,
    sw: /\b(na|ya|ni|kwa|wa|au|katika|hii|kama|yake|lakini|sana|pia|bila|mtu|watu|sasa|bado|hapa)\b/,
  };

  for (const [lang, regex] of Object.entries(patterns)) {
    const matches = sample.match(new RegExp(regex, 'g'));
    freq[lang] = matches ? matches.length : 0;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted[0] && sorted[0][1] >= 3) return sorted[0][0];

  return 'en'; // default
}

// API endpoint for language detection
app.post('/api/i18n/detect', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const lang = detectLanguage(text);
  res.json({ lang, name: LANG_NAMES[lang] || lang });
});

// Get all supported languages
app.get('/api/i18n/supported', async (req, res) => {
  res.json({ languages: Object.entries(LANG_NAMES).map(([code, name]) => ({ code, name })) });
});

// System prompt modifier for auto-language response
function multiLangSystemPrompt(detectedLang) {
  const langName = LANG_NAMES[detectedLang] || detectedLang;
  if (detectedLang === 'en') return '';
  return `\n\nIMPORTANT: The user is writing in ${langName}. You MUST respond in ${langName} (${detectedLang}). Match the user's language exactly.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE: Onboarding Wizard
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureOnboardingTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      email VARCHAR(255),
      current_step INT DEFAULT 1,
      completed_steps JSON,
      config_data JSON,
      completed TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email (email)
    )
  `);
}

// Get onboarding status
app.get('/api/onboarding/status', requireAuth, async (req, res) => {
  try {
    const email = req.webUser?.email || req.query.email || '';
    if (!email) return res.json({ completed: false, current_step: 1, steps: getOnboardingSteps() });
    const row = await db.queryOne('SELECT * FROM onboarding_progress WHERE email = ?', [email]);
    if (!row) return res.json({ completed: false, current_step: 1, steps: getOnboardingSteps() });
    res.json({
      completed: !!row.completed,
      current_step: row.current_step,
      completed_steps: typeof row.completed_steps === 'string' ? JSON.parse(row.completed_steps) : row.completed_steps,
      config_data: typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data,
      steps: getOnboardingSteps(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update onboarding step
app.post('/api/onboarding/step', requireAuth, async (req, res) => {
  const { email, step, data } = req.body || {};
  if (!email || !step) return res.status(400).json({ error: 'email and step required' });
  try {
    const existing = await db.queryOne('SELECT * FROM onboarding_progress WHERE email = ?', [email]);
    if (!existing) {
      await db.query('INSERT INTO onboarding_progress (email, current_step, completed_steps, config_data) VALUES (?, ?, ?, ?)',
        [email, step + 1, JSON.stringify([step]), JSON.stringify(data || {})]);
    } else {
      const completedSteps = typeof existing.completed_steps === 'string' ? JSON.parse(existing.completed_steps) : (existing.completed_steps || []);
      if (!completedSteps.includes(step)) completedSteps.push(step);
      const configData = typeof existing.config_data === 'string' ? JSON.parse(existing.config_data) : (existing.config_data || {});
      Object.assign(configData, data || {});
      const isComplete = completedSteps.length >= 5;
      await db.query('UPDATE onboarding_progress SET current_step = ?, completed_steps = ?, config_data = ?, completed = ? WHERE email = ?',
        [step + 1, JSON.stringify(completedSteps), JSON.stringify(configData), isComplete ? 1 : 0, email]);
    }
    res.json({ ok: true, next_step: step + 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Skip onboarding
app.post('/api/onboarding/skip', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await db.query(
      'INSERT INTO onboarding_progress (email, completed) VALUES (?, 1) ON DUPLICATE KEY UPDATE completed = 1',
      [email]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Apply onboarding config (create agent, enable integrations, etc.)
app.post('/api/onboarding/apply', requireAuth, async (req, res) => {
  const { email, config } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const results = { agent: null, integrations: [], channel: null };

    // Step 1: Create a helpdesk agent if configured
    if (config?.agent_name) {
      const agentId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
      await db.query(
        'INSERT INTO helpdesk_agents (id, name, description, system_prompt, auto_reply, confidence_threshold, is_active) VALUES (?,?,?,?,?,?,1)',
        [agentId, config.agent_name, config.agent_description || '', config.system_prompt || '', config.auto_reply !== false ? 1 : 0, config.confidence_threshold || 0.7]
      );
      results.agent = agentId;
    }

    // Step 2: Create integrations
    if (config?.integrations && Array.isArray(config.integrations)) {
      for (const integ of config.integrations) {
        if (!integ.provider) continue;
        const integId = crypto.randomUUID();
        await db.query('INSERT INTO integrations (id, provider, name, config) VALUES (?,?,?,?)',
          [integId, integ.provider, integ.name || integ.provider, JSON.stringify(integ.config || {})]);
        results.integrations.push(integId);

        // Enable auto-sync if requested
        if (integ.auto_sync) {
          await db.query(
            'INSERT INTO integration_auto_sync (integration_id, interval_minutes, is_active, next_run_at) VALUES (?,?,1,NOW())',
            [integId, integ.sync_interval || 60]
          );
        }
      }
    }

    // Step 3: Deploy channel
    if (config?.channel && results.agent) {
      await db.query(
        'INSERT INTO agent_channels (agent_id, channel_type, config, is_active) VALUES (?,?,?,1)',
        [results.agent, config.channel.type || 'website', JSON.stringify(config.channel.config || {})]
      );
      results.channel = config.channel.type;
    }

    // Mark onboarding complete
    await db.query('UPDATE onboarding_progress SET completed = 1 WHERE email = ?', [email]);

    res.json({ ok: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function getOnboardingSteps() {
  return [
    { step: 1, title: 'Welcome', description: 'Set up your Lamu AI workspace', icon: 'sparkles' },
    { step: 2, title: 'Connect your data', description: 'Import your knowledge base from Google Docs, Notion, Confluence, or upload files', icon: 'database' },
    { step: 3, title: 'Create your AI agent', description: 'Configure your first AI assistant with a name, personality, and system prompt', icon: 'bot' },
    { step: 4, title: 'Connect integrations', description: 'Link your helpdesk (Zendesk, Freshdesk, Intercom), CRM, or communication tools', icon: 'plug' },
    { step: 5, title: 'Deploy', description: 'Choose where to deploy your AI agent: website widget, Slack, email, or API', icon: 'rocket' },
  ];
}

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, async () => {
  const aiOk = !!(process.env.AI_CHAT_URL && process.env.AI_CHAT_API_KEY);
  const sttOk = !!(process.env.STT_URL && process.env.STT_API_KEY);
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; _dbReady = true; } catch (e) { console.error('[db] Connection failed:', e.message); }
  if (dbOk) {
    try { await ensureSettingsTable(); } catch (e) { console.error('[settings table]', e.message); }
    try { await ensureActivityTables(); } catch (e) { console.error('[activity tables]', e.message); }
    try { await ensureLicenseTables(); } catch (e) { console.error('[license tables]', e.message); }
    try { await ensurePaymentTable(); } catch (e) { console.error('[payment table]', e.message); }
    try { await importActivityJson(); } catch (e) { console.error('[activity import]', e.message); }
    try { await ensureMonitoringTables(); } catch (e) { console.error('[monitoring tables]', e.message); }
    const saasTableInits = [
      ['helpdesk_agents',         ensureHelpdeskAgentsTable],
      ['helpdesk_tickets',        ensureHelpdeskTicketsTable],
      ['escalation_rules',        ensureEscalationTable],
      ['agent_channels',          ensureChannelsTable],
      ['analytics_conversations', ensureAnalyticsTable],
      ['team_members',            ensureTeamTable],
      ['simulation_tests',        ensureSimulationTable],
      ['kb_gaps',                 ensureKbGapsTable],
      ['integrations+oauth',      ensureIntegrationsTable],
      ['sla_policies+cols',       ensureSlaTable],
      ['csat_responses',          ensureCsatTable],
      ['rbac_permissions',        ensureRbacTable],
      ['escalation_workflows',    ensureWorkflowTable],
      ['custom_dashboards',       ensureCustomDashboardTable],
      ['ab_tests',                ensureAbTestTable],
      ['archive_columns',         ensureArchiveColumns],
      ['audit_logs',              ensureAuditLogsTable],
      ['sso_configs',             ensureSsoTable],
      ['notification_prefs',      ensureNotifPrefsTable],
      ['custom_fields',           ensureCustomFieldsTable],
      ['tags',                    ensureTagsTable],
      ['auto_sync',               ensureAutoSyncTable],
      ['ai_actions_log',          ensureActionsTable],
      ['onboarding_progress',     ensureOnboardingTable],
    ];
    const saasResults = [];
    for (const [name, fn] of saasTableInits) {
      try { await fn(); saasResults.push([name, true, null]); }
      catch (e) { saasResults.push([name, false, e.message]); console.error(`[table:${name}] FAILED:`, e.message); }
    }
    const okCount = saasResults.filter(([,ok]) => ok).length;
    const failCount = saasResults.filter(([,ok]) => !ok).length;
    console.log(`  SaaS tables: ${okCount}/${saasResults.length} created OK` + (failCount > 0 ? ` — ${failCount} FAILED:` : ''));
    for (const [name, ok, err] of saasResults) {
      if (!ok) console.log(`    ✗ ${name}: ${err}`);
    }
  }

  console.log(`\nLamu backend running at http://localhost:${PORT}`);
  console.log(`  AI chat   : ${aiOk ? '✓ configured' : '✗ NOT configured (set AI_CHAT_URL + AI_CHAT_API_KEY)'}`);
  console.log(`  STT       : ${sttOk ? '✓ configured' : '✗ not configured (optional)'}`);
  console.log(`  Auth key  : ${API_ACCESS_KEY ? '✓ set' : '⚠ not set (open access)'}`);
  console.log(`  Database  : ${dbOk ? '✓ connected (MySQL)' : '✗ NOT connected — check DB_HOST/DB_USER/DB_PASSWORD in .env'}`);
  console.log(`  WebSocket : ✓ enabled (path: /ws)`);
  console.log('');
});
