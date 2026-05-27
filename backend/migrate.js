'use strict';

/**
 * Migration script: seeds the database with default data from the old hardcoded arrays.
 * Run once after creating the database with schema.sql:
 *   node migrate.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

// ─── Default models ────────────────────────────────────────────────────────────

const DEFAULT_MODELS = [
  { provider: 'groq', name: 'Llama 3.3 70B', id: 'llama-3.3-70b-versatile', model: 'llama-3.3-70b-versatile', description: "Meta's most capable Llama 3.3 model — fast and versatile", modality: 'text', sort_order: 1 },
  { provider: 'groq', name: 'Llama 3.1 8B', id: 'llama-3.1-8b-instant', model: 'llama-3.1-8b-instant', description: 'Ultra-fast lightweight Llama model for simple tasks', modality: 'text', sort_order: 2 },
  { provider: 'groq', name: 'Llama 4 Scout', id: 'meta-llama/llama-4-scout-17b-16e-instruct', model: 'meta-llama/llama-4-scout-17b-16e-instruct', description: "Meta's Llama 4 Scout with vision support", modality: 'text+vision', sort_order: 3 },
  { provider: 'groq', name: 'Llama 4 Maverick', id: 'meta-llama/llama-4-maverick-17b-128e-instruct', model: 'meta-llama/llama-4-maverick-17b-128e-instruct', description: "Meta's Llama 4 Maverick with vision support", modality: 'text+vision', sort_order: 4 },
  { provider: 'groq', name: 'DeepSeek R1 (Reasoning)', id: 'deepseek-r1-distill-llama-70b', model: 'deepseek-r1-distill-llama-70b', description: 'DeepSeek R1 reasoning model distilled on Llama 70B', modality: 'text', sort_order: 5 },
  { provider: 'groq', name: 'Gemma 2 9B', id: 'gemma2-9b-it', model: 'gemma2-9b-it', description: "Google's Gemma 2 9B instruction-tuned model", modality: 'text', sort_order: 6 },
  { provider: 'gemini', name: 'Gemini 2.0 Flash', id: 'gemini-2.0-flash', model: 'gemini-2.0-flash', description: "Google's fastest Gemini 2.0 model with vision", modality: 'text+vision', sort_order: 7 },
  { provider: 'gemini', name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro-preview-03-25', model: 'gemini-2.5-pro-preview-03-25', description: "Google's most capable Gemini model with advanced reasoning", modality: 'text+vision', sort_order: 8 },
  { provider: 'gemini', name: 'Gemini 1.5 Flash', id: 'gemini-1.5-flash', model: 'gemini-1.5-flash', description: 'Fast and versatile Gemini 1.5 model', modality: 'text+vision', sort_order: 9 },
  { provider: 'openai', name: 'GPT-4o', id: 'gpt-4o', model: 'gpt-4o', description: 'Most capable GPT-4 model with vision support', modality: 'text+vision', sort_order: 10 },
  { provider: 'openai', name: 'GPT-4o Mini', id: 'gpt-4o-mini', model: 'gpt-4o-mini', description: 'Fast and affordable GPT-4 model with vision support', modality: 'text+vision', sort_order: 11 },
  { provider: 'openai', name: 'o3 Mini', id: 'o3-mini', model: 'o3-mini', description: 'OpenAI o3 Mini reasoning model', modality: 'text', sort_order: 12 },
  { provider: 'anthropic', name: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5', model: 'claude-sonnet-4-5', description: "Anthropic's balanced Claude model — fast and intelligent", modality: 'text+vision', sort_order: 13 },
  { provider: 'anthropic', name: 'Claude Opus 4.6', id: 'claude-opus-4-6', model: 'claude-opus-4-6', description: "Anthropic's most powerful Claude model", modality: 'text+vision', sort_order: 14 },
  { provider: 'anthropic', name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5-20251001', model: 'claude-haiku-4-5-20251001', description: "Anthropic's fastest and most compact Claude model", modality: 'text+vision', sort_order: 15 },
  { provider: 'mistral', name: 'Mistral Large', id: 'mistral-large-latest', model: 'mistral-large-latest', description: "Mistral's most capable model for complex tasks", modality: 'text', sort_order: 16 },
  { provider: 'mistral', name: 'Mistral Small', id: 'mistral-small-latest', model: 'mistral-small-latest', description: 'Fast and efficient Mistral model', modality: 'text', sort_order: 17 },
];

const DEFAULT_PROMPTS = [
  { title: 'Professional Assistant', prompt: 'You are a professional assistant. Provide clear, concise, and accurate responses. Be formal yet approachable, and always aim to be genuinely helpful.', sort_order: 1 },
  { title: 'Code Expert', prompt: 'You are an expert software engineer with deep knowledge across many languages and frameworks. Help with coding questions, debugging, code reviews, and technical explanations. Always provide well-commented, clean code examples.', sort_order: 2 },
  { title: 'Creative Writer', prompt: 'You are a creative writer with a flair for storytelling. Help with creative writing, brainstorming ideas, crafting narratives, and generating imaginative content. Be expressive, inventive, and engaging.', sort_order: 3 },
  { title: 'Research Assistant', prompt: 'You are a thorough research assistant. Help analyze information, summarize documents, identify key insights, and provide well-structured, evidence-based research summaries. Always cite your reasoning.', sort_order: 4 },
  { title: 'Language Tutor', prompt: "You are a patient and encouraging language tutor. Help users learn new languages through conversation practice, grammar explanations, vocabulary building, and cultural context. Gently correct mistakes and explain the rules behind them.", sort_order: 5 },
  { title: 'Data Analyst', prompt: 'You are a skilled data analyst. Help interpret data, explain statistical concepts, suggest analysis approaches, and provide insights from numbers. When given data, always look for patterns, anomalies, and actionable conclusions.', sort_order: 6 },
];

async function run() {
  console.log('Starting migration...\n');

  // ── Models ──────────────────────────────────────────────────────────────────
  console.log('Seeding models...');
  for (const m of DEFAULT_MODELS) {
    await query(
      `INSERT INTO models (id, provider, name, model, description, modality, is_available, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         provider=VALUES(provider), name=VALUES(name), model=VALUES(model),
         description=VALUES(description), modality=VALUES(modality), sort_order=VALUES(sort_order)`,
      [m.id, m.provider, m.name, m.model, m.description, m.modality, m.sort_order]
    );
  }
  console.log(`  ✓ ${DEFAULT_MODELS.length} models`);

  // ── Prompts ─────────────────────────────────────────────────────────────────
  console.log('Seeding prompts...');
  for (const p of DEFAULT_PROMPTS) {
    await query(
      `INSERT INTO prompts (title, prompt, model_id, model_name, is_active, sort_order)
       VALUES (?, ?, NULL, 'Default Model', 1, ?)
       ON DUPLICATE KEY UPDATE prompt=VALUES(prompt), sort_order=VALUES(sort_order)`,
      [p.title, p.prompt, p.sort_order]
    );
  }
  console.log(`  ✓ ${DEFAULT_PROMPTS.length} prompts`);

  // ── Activity from activity.json ─────────────────────────────────────────────
  const activityFile = path.join(__dirname, 'activity.json');
  if (fs.existsSync(activityFile)) {
    console.log('Migrating activity.json...');
    const data = JSON.parse(fs.readFileSync(activityFile, 'utf8'));
    let count = 0;
    for (const [date, day] of Object.entries(data.daily || {})) {
      await query(
        `INSERT INTO activity (date, requests, tokens)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE requests=VALUES(requests), tokens=VALUES(tokens)`,
        [date, day.requests || 0, day.tokens || 0]
      );
      count++;
    }
    console.log(`  ✓ ${count} activity days`);
  }

  // ── KB docs from kb.json ────────────────────────────────────────────────────
  const kbFile = path.join(__dirname, 'kb.json');
  if (fs.existsSync(kbFile)) {
    console.log('Migrating kb.json...');
    const docs = JSON.parse(fs.readFileSync(kbFile, 'utf8'));
    for (const doc of docs) {
      await query(
        `INSERT INTO kb_documents (id, type, name, url, content, chars, created_at)
         VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?/1000))
         ON DUPLICATE KEY UPDATE name=VALUES(name), content=VALUES(content)`,
        [doc.id, doc.type || 'file', doc.name, doc.url || null, doc.content, doc.content.length, doc.createdAt || Date.now()]
      );
    }
    console.log(`  ✓ ${docs.length} KB documents`);
  }

  // ── Default admin user ──────────────────────────────────────────────────────
  console.log('Creating default admin user...');
  const existing = await query('SELECT id FROM admin_users WHERE username = ?', ['admin']);
  if (existing.length === 0) {
    const hash = await bcrypt.hash('admin123', 12);
    await query(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin@lamuka-tech.com', hash, 'superadmin']
    );
    console.log('  ✓ Admin user created (username: admin / password: admin123)');
    console.log('  !! CHANGE THE PASSWORD IMMEDIATELY after first login !!');
  } else {
    console.log('  ✓ Admin user already exists, skipped');
  }

  console.log('\nMigration complete!');
  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
