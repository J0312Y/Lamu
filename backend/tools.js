'use strict';

const db = require('./db');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Integration modules ───────────────────────────────────────────────────────
const github     = require('./integrations/github');
const gitlab     = require('./integrations/gitlab');
const jira       = require('./integrations/jira');
const slack      = require('./integrations/slack');
const google     = require('./integrations/google');
const stripe     = require('./integrations/stripe');
const notion     = require('./integrations/notion');
const linear     = require('./integrations/linear');
const todoist    = require('./integrations/todoist');
const gcalendar  = require('./integrations/gcalendar');
const salesforce = require('./integrations/salesforce');
const documents  = require('./integrations/documents');

const INTEGRATIONS = { github, gitlab, jira, slack, google, stripe, notion, linear, todoist, gcalendar, salesforce, documents };


// ── Tool Schemas (OpenAI/Groq tool_choice format) ─────────────────────────────

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: "Search the live web for up-to-date information (news, prices, weather, facts, docs). Use this whenever the user asks about current events or anything not in the knowledge base. Returns a synthesized answer plus source links.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'integer', description: 'Number of results to return (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and read the text content of a specific web page URL. Use when you have a URL and need its actual content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to fetch (https://...)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description:
        "Generate an image, or EDIT an image the user just sent. Use whenever the user asks to create, draw, generate, design, illustrate, modify, retouch, or change an image. If the user is asking to modify an image present in the conversation, you MUST set edit_source_image to true — the original is then sent to the image model so faces, people and composition are preserved. Without it a brand-new image is created from scratch and will NOT look like the original. After it returns, you MUST embed the result in your reply using markdown image syntax exactly: ![short description](image_url).",
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the image to generate. Write it in English for best quality.',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions. Use 1024x1024 (square) by default, 1792x1024 for wide, 1024x1792 for tall.',
          },
          edit_source_image: {
            type: 'boolean',
            description:
              'Set to true when modifying an image the user sent. The backend attaches the most recent image of the conversation, so the result keeps the original faces and composition. When true, the prompt must describe ONLY the change to apply, not the whole scene.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_stats',
      description: 'Query business statistics from the database: activity, licenses, trials, revenue, top AI models used.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['activity_daily', 'licenses_summary', 'trials_summary', 'top_models', 'revenue_summary'],
            description: 'Which metric to query'
          },
          period_days: { type: 'integer', description: 'Number of days to look back (default 30)' }
        },
        required: ['metric']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the internal knowledge base for documents, policies, or stored information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', description: 'Max results (default 5)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compile_report',
      description: 'Compile and format a structured Markdown report from gathered data. Returns the report as a deliverable.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Report title' },
          sections: {
            type: 'array',
            description: 'Report sections in order',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                content: { type: 'string', description: 'Content in Markdown' }
              },
              required: ['heading', 'content']
            }
          }
        },
        required: ['title', 'sections']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to one or more recipients via SMTP. ⚠️ Requires human approval before sending.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient(s), comma-separated' },
          subject: { type: 'string' },
          body_markdown: { type: 'string', description: 'Email body in Markdown — will be converted to HTML' },
          cc: { type: 'string', description: 'CC recipients (optional)' }
        },
        required: ['to', 'subject', 'body_markdown']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create an action item or task. Stored locally and auto-synced to configured providers (Jira, Linear, Todoist, Notion).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assignee: { type: 'string', description: 'Name or email of the person responsible' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          source: { type: 'string', description: 'Origin context (e.g. meeting title)' },
          sync_to: { type: 'string', enum: ['jira', 'linear', 'todoist', 'notion'], description: 'Sync to a specific provider only. If omitted, syncs to all configured providers.' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_action_items',
      description: 'Extract structured action items, decisions, and assignments from raw meeting notes or any unstructured text.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Raw text to analyse (meeting notes, transcript, email, etc.)' },
          context: { type: 'string', description: 'Optional context about the content' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Signal that the goal is fully accomplished. Always call this last.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'One-paragraph summary of what was done' },
          deliverable: { type: 'string', description: 'Main output/deliverable in Markdown (report, task list, etc.)' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_email',
      description: 'Schedule an email to be sent at a future date/time. The email will be queued and sent automatically when the time comes.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient(s), comma-separated' },
          subject: { type: 'string' },
          body_markdown: { type: 'string', description: 'Email body in Markdown' },
          send_at: { type: 'string', description: 'ISO 8601 datetime when to send (e.g. 2026-06-10T09:00:00)' },
          cc: { type: 'string', description: 'CC recipients (optional)' }
        },
        required: ['to', 'subject', 'body_markdown', 'send_at']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_schema',
      description: 'Get the schema of the client\'s connected database (tables, columns, types). Call this before writing any SQL query.',
      parameters: {
        type: 'object',
        properties: {
          database: { type: 'string', description: 'Database name to get schema for (optional — uses current DB if omitted)' },
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_query',
      description: 'Execute a SQL query on the client\'s connected database. Always call db_schema first. For write operations (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/TRUNCATE), set allow_write to true — the user will be shown the SQL and must confirm before execution.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query to execute' },
          description: { type: 'string', description: 'Plain-language explanation of what this query does (shown to user for confirmation)' },
          allow_write: { type: 'boolean', description: 'Set to true for INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/TRUNCATE. The user will be asked to confirm before execution.' },
          database: { type: 'string', description: 'Target database name (optional — uses current DB if omitted)' },
        },
        required: ['sql']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_list_databases',
      description: 'List all databases on the connected server. Use this to discover available databases before switching.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_switch_database',
      description: 'Switch to a different database on the same server. After switching, all subsequent queries will target the new database.',
      parameters: {
        type: 'object',
        properties: {
          database: { type: 'string', description: 'Name of the database to switch to' },
        },
        required: ['database']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_list_tables',
      description: 'List all tables in the current database with row counts.',
      parameters: {
        type: 'object',
        properties: {
          database: { type: 'string', description: 'Database name (optional — uses current DB)' },
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_describe_table',
      description: 'Get detailed info about a specific table: columns, types, indexes, constraints, row count.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to describe' },
          database: { type: 'string', description: 'Database name (optional)' },
        },
        required: ['table']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_create_table',
      description: 'Create a new table in the database. ⚠️ Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          columns: {
            type: 'array',
            description: 'Column definitions',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', description: 'SQL type (e.g. VARCHAR(255), INT, TEXT, TIMESTAMP)' },
                nullable: { type: 'boolean', description: 'Allow NULL (default true)' },
                default: { type: 'string', description: 'Default value' },
                primary_key: { type: 'boolean' },
                auto_increment: { type: 'boolean' },
              },
              required: ['name', 'type']
            }
          },
          database: { type: 'string' },
        },
        required: ['table', 'columns']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_insert',
      description: 'Insert one or more rows into a table. ⚠️ Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          rows: {
            type: 'array',
            description: 'Array of objects where keys are column names and values are the data to insert',
            items: { type: 'object' }
          },
          database: { type: 'string' },
        },
        required: ['table', 'rows']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_update',
      description: 'Update rows in a table matching a WHERE condition. ⚠️ Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          set: { type: 'object', description: 'Column-value pairs to update (e.g. { "status": "active", "name": "John" })' },
          where: { type: 'string', description: 'WHERE clause WITHOUT the keyword WHERE (e.g. "id = 42" or "email = \'john@example.com\'"). REQUIRED for safety.' },
          database: { type: 'string' },
        },
        required: ['table', 'set', 'where']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_delete',
      description: 'Delete rows from a table matching a WHERE condition. ⚠️ Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          where: { type: 'string', description: 'WHERE clause WITHOUT the keyword WHERE. REQUIRED for safety — no mass deletes without explicit WHERE.' },
          database: { type: 'string' },
        },
        required: ['table', 'where']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_alter_table',
      description: 'Alter a table structure: add/drop/modify columns. ⚠️ Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          operations: {
            type: 'array',
            description: 'List of ALTER operations',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add_column', 'drop_column', 'modify_column', 'rename_column', 'add_index', 'drop_index'], description: 'ALTER operation type' },
                column: { type: 'string', description: 'Column name' },
                type: { type: 'string', description: 'New column type (for add/modify)' },
                new_name: { type: 'string', description: 'New column name (for rename)' },
                nullable: { type: 'boolean' },
                default: { type: 'string' },
              },
              required: ['action']
            }
          },
          database: { type: 'string' },
        },
        required: ['table', 'operations']
      }
    }
  }
];

// Tools that pause the agent and wait for human approval
const APPROVAL_REQUIRED = new Set(['send_email', 'db_create_table', 'db_insert', 'db_update', 'db_delete', 'db_alter_table']);

// Tools that must be executed client-side via Tauri (not server-side)
const CLIENT_TOOLS = new Set([
  'db_schema', 'db_query', 'db_list_databases', 'db_switch_database',
  'db_list_tables', 'db_describe_table', 'db_create_table',
  'db_insert', 'db_update', 'db_delete', 'db_alter_table',
  'computer_screenshot', 'computer_click', 'computer_type',
  'computer_key', 'computer_scroll', 'computer_move',
]);

// ── Tool Executors ────────────────────────────────────────────────────────────

// Recherche web live via Tavily (https://tavily.com). Clé : TAVILY_API_KEY.
async function execWebSearch({ query, max_results = 5 }) {
  const key = process.env.TAVILY_API_KEY || '';
  if (!key) return { error: 'Recherche web non configurée (TAVILY_API_KEY manquant côté serveur).' };
  if (!query || !query.trim()) return { error: 'query requis' };
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: Math.min(Math.max(parseInt(max_results) || 5, 1), 10),
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return { error: `Recherche web échouée (${resp.status}) ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    return {
      answer: data.answer || null,
      results: (data.results || []).slice(0, max_results).map((r) => ({
        title: r.title,
        url: r.url,
        content: (r.content || '').slice(0, 600),
      })),
    };
  } catch (e) {
    return { error: e.message || 'Recherche web indisponible.' };
  }
}

// Lit le contenu texte d'une URL.
async function execFetchUrl({ url }) {
  if (!url || !/^https?:\/\//i.test(url)) return { error: 'URL http(s) valide requise.' };
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!resp.ok) return { error: `Fetch échoué: ${resp.status}` };
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return { error: 'Aucun contenu lisible.' };
    return { url, content: text.slice(0, 6000) };
  } catch (e) {
    return { error: e.message || 'Lecture de la page impossible.' };
  }
}

// Enregistre une image base64 sur le disque et renvoie une URL courte publique
// (le modèle ne peut pas ré-écrire un data URI de 100 Ko dans sa réponse).
function saveGeneratedImage(base64, mime, baseUrl) {
  const dir = path.join(__dirname, 'generated-images');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const ext = mime && mime.includes('jpeg') ? 'jpg' : 'png';
  const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(base64, 'base64'));
  const base = (baseUrl || process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/generated-images/${name}`;
}

// Extrait { base64, mime } d'un data URI, sinon null.
function parseDataUri(uri) {
  const m = typeof uri === 'string' && uri.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mime: m[1], base64: m[2] } : null;
}

// Génère une image à partir d'un texte (text-to-image).
// Mode 1 (clé dédiée IMAGE_API_KEY) : API OpenAI /v1/images/generations (DALL·E…).
// Mode 2 (défaut) : réutilise le provider chat (OpenRouter) avec un modèle image
//   — renvoie souvent un data URI qu'on héberge en fichier → URL courte.
async function execGenerateImage({ prompt, size = '1024x1024', edit_source_image = false }, context = {}) {
  if (!prompt || !prompt.trim()) return { error: 'prompt requis' };
  const baseUrl = context.baseUrl;

  // Image de la conversation à retoucher. Fournie par l'appelant (voir /api/chat) :
  // le modèle ne peut pas la transmettre lui-même, une data URI base64 pèse
  // des centaines de kilo-octets et ne se recopie pas dans un argument d'outil.
  const sourceImage = edit_source_image ? context.sourceImage || null : null;

  // ── Mode 1 : clé image dédiée (format OpenAI images) ──
  const dedicatedKey = process.env.IMAGE_API_KEY || '';
  // L'endpoint /images/generations est purement text-to-image. L'utiliser pour une
  // retouche produirait une image sans rapport avec l'originale — mieux vaut
  // basculer sur le provider chat, qui accepte une image en entrée.
  if (dedicatedKey && !sourceImage) {
    const url = process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
    const model = process.env.IMAGE_MODEL || 'dall-e-3';
    const allowed = ['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'];
    const imgSize = allowed.includes(size) ? size : '1024x1024';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dedicatedKey}` },
        body: JSON.stringify({ model, prompt: prompt.slice(0, 4000), n: 1, size: imgSize }),
        signal: AbortSignal.timeout(90000),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        return { error: `Génération d'image échouée (${resp.status}) ${t.slice(0, 200)}` };
      }
      const data = await resp.json();
      const item = (data && data.data && data.data[0]) || {};
      let imageUrl = item.url || null;
      if (!imageUrl && item.b64_json) imageUrl = saveGeneratedImage(item.b64_json, 'image/png', baseUrl);
      if (!imageUrl) return { error: 'Réponse image invalide (ni url ni b64_json).' };
      return { image_url: imageUrl, prompt, instructions: 'Embed with markdown: ![description](image_url).' };
    } catch (e) {
      return { error: e.message || "Génération d'image indisponible." };
    }
  }

  // ── Mode 2 : provider chat (OpenRouter) avec un modèle à sortie image ──
  const ai = context.aiConfig || {};
  const url = process.env.AI_CHAT_URL || ai.primaryUrl || 'https://openrouter.ai/api/v1/chat/completions';
  const key = ai.primaryKey || process.env.AI_CHAT_API_KEY || '';
  const model = process.env.IMAGE_MODEL || 'google/gemini-2.5-flash-image';
  if (!key) return { error: "Génération d'images non configurée (aucune clé provider)." };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            // Avec une image source, on envoie l'originale ET la consigne : c'est
            // ce qui fait la différence entre retoucher et régénérer de zéro.
            content: sourceImage
              ? [
                  { type: 'image_url', image_url: { url: sourceImage } },
                  {
                    type: 'text',
                    text:
                      'Edit this exact image. Keep the same people, faces, identity, pose and composition. ' +
                      `Apply only this change: ${prompt.slice(0, 4000)}`,
                  },
                ]
              : `Generate an image: ${prompt.slice(0, 4000)}`,
          },
        ],
        modalities: ['image', 'text'],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return { error: `Génération d'image échouée (${resp.status}) ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
    // OpenRouter renvoie les images dans message.images: [{ image_url: { url } }]
    const imgs = msg.images || [];
    let raw = null;
    if (imgs.length) raw = imgs[0]?.image_url?.url || imgs[0]?.url || null;
    if (!raw) return { error: 'Aucune image renvoyée par le modèle (essaie un autre IMAGE_MODEL).' };
    // Si data URI → on héberge en fichier pour une URL courte citable.
    const parsed = parseDataUri(raw);
    const imageUrl = parsed ? saveGeneratedImage(parsed.base64, parsed.mime, baseUrl) : raw;
    return { image_url: imageUrl, prompt, instructions: 'Embed with markdown: ![description](image_url).' };
  } catch (e) {
    return { error: e.message || "Génération d'image indisponible." };
  }
}

async function execQueryStats({ metric, period_days = 30 }) {
  const days = Math.min(Math.max(Number(period_days) || 30, 1), 365);
  try {
    switch (metric) {
      case 'activity_daily': {
        const rows = await db.query('SELECT date, requests, tokens FROM activity ORDER BY date DESC LIMIT ?', [days]).catch(() => []);
        return {
          metric, period_days: days,
          daily: rows,
          total_requests: rows.reduce((s, r) => s + Number(r.requests || 0), 0),
          total_tokens:   rows.reduce((s, r) => s + Number(r.tokens || 0), 0),
        };
      }
      case 'licenses_summary': {
        const [totals]   = await db.query('SELECT COUNT(*) as total, SUM(is_active) as active FROM licenses').catch(() => [{}]);
        const byPlan     = await db.query('SELECT plan, COUNT(*) as count, SUM(is_active) as active FROM licenses GROUP BY plan').catch(() => []);
        const [expiring] = await db.query('SELECT COUNT(*) as c FROM licenses WHERE expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)').catch(() => [{}]);
        return { metric, total: Number(totals?.total || 0), active: Number(totals?.active || 0), by_plan: byPlan, expiring_30d: Number(expiring?.c || 0) };
      }
      case 'trials_summary': {
        const [total]     = await db.query('SELECT COUNT(*) as c FROM trials').catch(() => [{}]);
        const [active]    = await db.query('SELECT COUNT(*) as c FROM trials WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)').catch(() => [{}]);
        const [converted] = await db.query('SELECT COUNT(*) as c FROM trials WHERE converted_at IS NOT NULL').catch(() => [{}]);
        const [new7]      = await db.query('SELECT COUNT(*) as c FROM trials WHERE first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)').catch(() => [{}]);
        return { metric, total: Number(total?.c || 0), active_3d: Number(active?.c || 0), converted: Number(converted?.c || 0), new_7d: Number(new7?.c || 0) };
      }
      case 'top_models': {
        const rows = await db.query(
          'SELECT ai_model, COUNT(*) as uses, SUM(total_tokens) as tokens FROM activity_log GROUP BY ai_model ORDER BY uses DESC LIMIT 10'
        ).catch(() => []);
        return { metric, models: rows };
      }
      case 'revenue_summary': {
        const rows = await db.query(
          'SELECT status, SUM(amount) as total, COUNT(*) as count, currency FROM pending_payments GROUP BY status, currency'
        ).catch(() => []);
        return { metric, by_status: rows };
      }
      default:
        return { error: 'Unknown metric: ' + metric };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function execSearchKb({ query, limit = 5 }) {
  const lim = Math.min(Number(limit) || 5, 20);
  try {
    const chunks = await db.query(
      `SELECT kc.content, kd.name as doc_name, kd.type as doc_type
       FROM kb_chunks kc JOIN kb_documents kd ON kd.id = kc.document_id
       WHERE kc.content LIKE ? LIMIT ?`,
      [`%${query}%`, lim]
    ).catch(() => []);
    return { query, results: chunks.map(c => ({ doc: c.doc_name, type: c.doc_type, excerpt: (c.content || '').slice(0, 600) })) };
  } catch (err) {
    return { error: err.message };
  }
}

function execCompileReport({ title, sections }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  let md = `# ${title}\n\n*Généré le ${now} par Lamu Agent*\n\n---\n\n`;
  for (const s of (sections || [])) {
    md += `## ${s.heading}\n\n${s.content}\n\n`;
  }
  return { success: true, report_markdown: md, title, sections_count: (sections || []).length };
}

async function execSendEmail({ to, subject, body_markdown, cc }, { getSmtp } = {}) {
  if (!getSmtp) return { success: false, error: 'SMTP context not available' };
  const smtp = await getSmtp();
  if (!smtp.host || !smtp.user) return { success: false, error: 'SMTP not configured. Set up SMTP in admin settings.' };

  // Simple Markdown → HTML
  const html = body_markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');

  const fullHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e;line-height:1.6"><p>${html}</p><hr style="border:none;border-top:1px solid #eee;margin:32px 0"><p style="font-size:11px;color:#999">Envoyé automatiquement par Lamu Agent — Lamuka Tech</p></div>`;

  const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
  await transporter.sendMail({ from: smtp.from, to, cc: cc || undefined, subject, html: fullHtml, text: body_markdown });
  return { success: true, sent_to: to, subject };
}

async function execCreateTask({ title, description, assignee, due_date, priority = 'medium', source, sync_to }, context = {}) {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT, assignee VARCHAR(200),
        due_date DATE, priority ENUM('low','medium','high') DEFAULT 'medium',
        status ENUM('todo','in_progress','done') DEFAULT 'todo',
        source VARCHAR(200), synced_to VARCHAR(200),
        external_url VARCHAR(500), external_id VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const r = await db.query(
      'INSERT INTO agent_tasks (title, description, assignee, due_date, priority, source) VALUES (?,?,?,?,?,?)',
      [title, description || null, assignee || null, due_date || null, priority, source || null]
    );

    const synced = [];
    const c = context.integrations || {};

    // Auto-sync to all configured task providers (or specific one if sync_to set)
    const targets = sync_to ? [sync_to] : ['jira', 'linear', 'todoist', 'notion'];

    for (const target of targets) {
      try {
        if (target === 'jira' && c.jira?.token && c.jira?.email && c.jira?.baseUrl) {
          const result = await jira.execute('jira_create_issue', {
            summary: title, description: description || '',
            priority: priority === 'high' ? 'High' : priority === 'low' ? 'Low' : 'Medium',
            project: c.jira.defaultProject,
          }, { token: c.jira.token, email: c.jira.email, baseUrl: c.jira.baseUrl, defaultProject: c.jira.defaultProject });
          if (result.success) synced.push({ provider: 'jira', url: result.url, key: result.key });
        }
        if (target === 'linear' && c.linear?.token) {
          const result = await linear.execute('linear_create_issue', {
            title, description: description || '',
            priority: priority === 'high' ? 2 : priority === 'low' ? 4 : 3,
            team: c.linear.defaultTeam,
          }, { token: c.linear.token, defaultTeam: c.linear.defaultTeam });
          if (result.success) synced.push({ provider: 'linear', url: result.url, id: result.id });
        }
        if (target === 'todoist' && c.todoist?.token) {
          const result = await todoist.execute('todoist_create_task', {
            content: title, description: description || '',
            due_string: due_date || undefined,
            priority: priority === 'high' ? 3 : priority === 'low' ? 1 : 2,
            project: c.todoist.defaultProject,
          }, { token: c.todoist.token, defaultProject: c.todoist.defaultProject });
          if (result.success) synced.push({ provider: 'todoist', url: result.url, id: result.id });
        }
        if (target === 'notion' && c.notion?.apiKey && c.notion?.dbId) {
          const result = await notion.execute('notion_create_page', {
            title, content: description || '',
            properties: {
              ...(assignee ? { Assignee: { rich_text: [{ text: { content: assignee } }] } } : {}),
              ...(due_date ? { 'Due Date': { date: { start: due_date } } } : {}),
              Priority: { select: { name: priority.charAt(0).toUpperCase() + priority.slice(1) } },
            },
          }, { apiKey: c.notion.apiKey, defaultDbId: c.notion.dbId });
          if (result.success) synced.push({ provider: 'notion', url: result.url });
        }
      } catch { /* sync failed for this provider — continue */ }
    }

    if (synced.length > 0) {
      await db.query('UPDATE agent_tasks SET synced_to=?, external_url=?, external_id=? WHERE id=?', [
        synced.map(s => s.provider).join(','),
        synced[0].url || null,
        synced[0].key || synced[0].id || null,
        r.insertId,
      ]);
    }

    return { success: true, task_id: r.insertId, title, assignee, due_date, priority, synced };
  } catch (err) {
    return { error: err.message };
  }
}

async function execExtractActionItems({ text, context: ctx }, { callAi } = {}) {
  if (!callAi) return { error: 'AI caller not available' };
  const prompt = `Extract structured information from this text. Return ONLY valid JSON with this exact structure:
{
  "action_items": [{"title": string, "assignee": string|null, "due_date": string|null, "priority": "low"|"medium"|"high"}],
  "decisions": [string],
  "key_points": [string]
}

${ctx ? `Context: ${ctx}\n\n` : ''}Text:
${text}`;
  try {
    const result = await callAi(prompt);
    let parsed;
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    try { parsed = JSON.parse(jsonMatch?.[0] || result); } catch { parsed = { action_items: [], decisions: [], key_points: [], raw: result }; }
    return { success: true, ...parsed };
  } catch (err) {
    return { error: err.message };
  }
}

async function execScheduleEmail({ to, subject, body_markdown, send_at, cc }) {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS scheduled_emails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        to_email VARCHAR(500) NOT NULL, cc VARCHAR(500), subject VARCHAR(500) NOT NULL,
        body_markdown TEXT NOT NULL, send_at TIMESTAMP NOT NULL,
        status ENUM('pending','sent','failed','cancelled') DEFAULT 'pending',
        error_message TEXT, source VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, sent_at TIMESTAMP NULL,
        INDEX idx_send_at (send_at, status)
      )
    `);
    const r = await db.query(
      'INSERT INTO scheduled_emails (to_email, cc, subject, body_markdown, send_at, source) VALUES (?,?,?,?,?,?)',
      [to, cc || null, subject, body_markdown, send_at, 'ai_agent']
    );
    return { success: true, email_id: r.insertId, to, subject, send_at };
  } catch (err) { return { error: err.message }; }
}

async function execDispatchAgents({ tasks = [], parent_context, wait = true }, context = {}) {
  try {
    // Call the dispatch endpoint internally
    const baseUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Dispatch all sub-agents
    const dispatchRes = await fetch(`${baseUrl}/api/agents/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.API_ACCESS_KEY || ''}` },
      body: JSON.stringify({ tasks, parent_context }),
    });
    const dispatchData = await dispatchRes.json();
    if (!dispatchData.success) return { error: dispatchData.error || 'Dispatch failed' };

    if (!wait) {
      return { success: true, dispatched: true, agent_ids: dispatchData.agent_ids, message: `${tasks.length} sub-agents dispatched. Use their IDs to check results later.` };
    }

    // Wait for all to complete
    const collectRes = await fetch(`${baseUrl}/api/agents/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.API_ACCESS_KEY || ''}` },
      body: JSON.stringify({ agent_ids: dispatchData.agent_ids, timeout_ms: 90000 }),
    });
    const collectData = await collectRes.json();

    return {
      success: collectData.all_completed,
      agent_count: tasks.length,
      results: (collectData.results || []).map(r => ({
        task: r.task,
        status: r.status,
        result: r.result,
        error: r.error,
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ── SQL Builders (generate SQL from structured args for client-side execution) ─

function buildCreateTableSql({ table, columns = [] }) {
  const cols = columns.map(c => {
    let def = `${c.name} ${c.type}`;
    if (c.primary_key) def += ' PRIMARY KEY';
    if (c.auto_increment) def += ' AUTO_INCREMENT';
    if (c.nullable === false) def += ' NOT NULL';
    if (c.default !== undefined) def += ` DEFAULT ${c.default}`;
    return def;
  });
  return `CREATE TABLE ${table} (\n  ${cols.join(',\n  ')}\n)`;
}

function buildInsertSql({ table, rows = [] }) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map(r =>
    `(${cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(', ')})`
  );
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values.join(',\n')}`;
}

function buildUpdateSql({ table, set = {}, where: whereClause }) {
  const setCols = Object.entries(set).map(([k, v]) => {
    if (v === null) return `${k} = NULL`;
    if (typeof v === 'number') return `${k} = ${v}`;
    return `${k} = '${String(v).replace(/'/g, "''")}'`;
  });
  return `UPDATE ${table} SET ${setCols.join(', ')} WHERE ${whereClause}`;
}

function buildDeleteSql({ table, where: whereClause }) {
  return `DELETE FROM ${table} WHERE ${whereClause}`;
}

function buildAlterSql({ table, operations = [] }) {
  const stmts = operations.map(op => {
    switch (op.action) {
      case 'add_column': {
        let def = `ADD COLUMN ${op.column} ${op.type || 'VARCHAR(255)'}`;
        if (op.nullable === false) def += ' NOT NULL';
        if (op.default) def += ` DEFAULT ${op.default}`;
        return def;
      }
      case 'drop_column': return `DROP COLUMN ${op.column}`;
      case 'modify_column': return `MODIFY COLUMN ${op.column} ${op.type || 'VARCHAR(255)'}`;
      case 'rename_column': return `RENAME COLUMN ${op.column} TO ${op.new_name}`;
      case 'add_index': return `ADD INDEX idx_${op.column} (${op.column})`;
      case 'drop_index': return `DROP INDEX idx_${op.column}`;
      default: return '';
    }
  }).filter(Boolean);
  return `ALTER TABLE ${table}\n  ${stmts.join(',\n  ')}`;
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function executeTool(name, args, context = {}) {
  try {
    switch (name) {
      case 'web_search':            return await execWebSearch(args);
      case 'fetch_url':             return await execFetchUrl(args);
      case 'generate_image':        return await execGenerateImage(args, context);
      case 'query_stats':           return await execQueryStats(args);
      case 'search_knowledge_base': return await execSearchKb(args);
      case 'compile_report':        return execCompileReport(args);
      case 'send_email':            return await execSendEmail(args, context);
      case 'create_task':           return await execCreateTask(args, context);
      case 'extract_action_items':  return await execExtractActionItems(args, context);
      case 'schedule_email':        return await execScheduleEmail(args);
      case 'dispatch_agents':       return await execDispatchAgents(args, context);
      case 'finish':                return { success: true, finished: true, ...args };
      // Client-side tools — signal that execution must happen via Tauri
      case 'db_schema':             return { needs_client_execution: true, tool: 'db_schema', database: args.database };
      case 'db_query':              return { needs_client_execution: true, tool: 'db_query', sql: args.sql, description: args.description || '', allow_write: !!args.allow_write, database: args.database };
      case 'db_list_databases':     return { needs_client_execution: true, tool: 'db_list_databases' };
      case 'db_switch_database':    return { needs_client_execution: true, tool: 'db_switch_database', database: args.database };
      case 'db_list_tables':        return { needs_client_execution: true, tool: 'db_list_tables', database: args.database };
      case 'db_describe_table':     return { needs_client_execution: true, tool: 'db_describe_table', table: args.table, database: args.database };
      case 'db_create_table':       return { needs_client_execution: true, tool: 'db_create_table', table: args.table, columns: args.columns, database: args.database, sql: buildCreateTableSql(args) };
      case 'db_insert':             return { needs_client_execution: true, tool: 'db_insert', table: args.table, rows: args.rows, database: args.database, sql: buildInsertSql(args) };
      case 'db_update':             return { needs_client_execution: true, tool: 'db_update', table: args.table, set: args.set, where: args.where, database: args.database, sql: buildUpdateSql(args) };
      case 'db_delete':             return { needs_client_execution: true, tool: 'db_delete', table: args.table, where: args.where, database: args.database, sql: buildDeleteSql(args) };
      case 'db_alter_table':        return { needs_client_execution: true, tool: 'db_alter_table', table: args.table, operations: args.operations, database: args.database, sql: buildAlterSql(args) };
      default:                      return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── Integration tool schemas (appended dynamically) ───────────────────────────

function getAllToolSchemas() {
  return [
    ...TOOL_SCHEMAS,
    ...github.SCHEMAS,
    ...gitlab.SCHEMAS,
    ...jira.SCHEMAS,
    ...slack.SCHEMAS,
    ...google.SCHEMAS,
    ...stripe.SCHEMAS,
    ...notion.SCHEMAS,
    ...linear.SCHEMAS,
    ...todoist.SCHEMAS,
    ...gcalendar.SCHEMAS,
    ...salesforce.SCHEMAS,
    ...documents.SCHEMAS,
    // Sub-agents (parallel AI tasks)
    {
      type: 'function', function: {
        name: 'dispatch_agents',
        description: 'Dispatch multiple AI sub-agents to work on tasks in parallel. Each agent runs independently and returns its result. Use this for complex tasks that can be broken into independent subtasks (e.g. research multiple topics, analyze multiple documents, generate multiple outputs simultaneously).',
        parameters: { type: 'object', properties: {
          tasks: {
            type: 'array', description: 'Tasks to dispatch to sub-agents',
            items: { type: 'object', properties: {
              description: { type: 'string', description: 'Short description of the task (for tracking)' },
              prompt: { type: 'string', description: 'Detailed prompt for the sub-agent' },
              context: { type: 'string', description: 'Additional context specific to this task' },
              model: { type: 'string', description: 'Override AI model for this agent (optional)' },
              max_tokens: { type: 'integer', description: 'Max response length (default 4096)' },
            }, required: ['prompt'] }
          },
          parent_context: { type: 'string', description: 'Shared context passed to all sub-agents (e.g. project info, user preferences)' },
          wait: { type: 'boolean', description: 'Wait for all agents to complete before returning (default true). Set false to dispatch and check later.' },
        }, required: ['tasks'] }
      }
    },
    // Computer Use tools (client-side execution via Tauri)
    {
      type: 'function', function: {
        name: 'computer_screenshot',
        description: 'Take a screenshot of the desktop screen. Returns the image as base64 PNG. Use this to see what is on screen before interacting.',
        parameters: { type: 'object', properties: {
          region: { type: 'object', description: 'Optional: capture a specific region instead of full screen', properties: {
            x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' },
          } },
        }, required: [] }
      }
    },
    {
      type: 'function', function: {
        name: 'computer_click',
        description: 'Click at specific screen coordinates. Always take a screenshot first to identify the right coordinates.',
        parameters: { type: 'object', properties: {
          x: { type: 'integer', description: 'X coordinate (pixels from left)' },
          y: { type: 'integer', description: 'Y coordinate (pixels from top)' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
          double_click: { type: 'boolean', description: 'Double-click instead of single' },
        }, required: ['x', 'y'] }
      }
    },
    {
      type: 'function', function: {
        name: 'computer_type',
        description: 'Type text using the keyboard at the current cursor position.',
        parameters: { type: 'object', properties: {
          text: { type: 'string', description: 'Text to type' },
        }, required: ['text'] }
      }
    },
    {
      type: 'function', function: {
        name: 'computer_key',
        description: 'Press a key or key combination (e.g. "enter", "ctrl+c", "alt+tab", "ctrl+shift+s").',
        parameters: { type: 'object', properties: {
          keys: { type: 'string', description: 'Key combo separated by + (e.g. "ctrl+a", "enter", "alt+f4")' },
        }, required: ['keys'] }
      }
    },
    {
      type: 'function', function: {
        name: 'computer_scroll',
        description: 'Scroll the mouse wheel at a specific position.',
        parameters: { type: 'object', properties: {
          x: { type: 'integer' }, y: { type: 'integer' },
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'integer', description: 'Scroll clicks (default 3)' },
        }, required: ['x', 'y', 'direction'] }
      }
    },
    {
      type: 'function', function: {
        name: 'computer_move',
        description: 'Move the mouse cursor to specific coordinates without clicking.',
        parameters: { type: 'object', properties: {
          x: { type: 'integer' }, y: { type: 'integer' },
        }, required: ['x', 'y'] }
      }
    },
  ];
}

// Tools requiring human approval (send_email + slack_send_message)
const ALL_APPROVAL_REQUIRED = new Set([...APPROVAL_REQUIRED, 'slack_send_message']);

// All client-side tools (passed through to agent.js)
const ALL_CLIENT_TOOLS = CLIENT_TOOLS;

// ── Unified tool dispatcher ───────────────────────────────────────────────────

async function executeToolWithIntegrations(name, args, context = {}) {
  // Core tools (query_stats, compile_report, etc.)
  if (TOOL_SCHEMAS.map(t => t.function.name).includes(name)) {
    return executeTool(name, args, context);
  }

  // Integration tools — use ONLY the client's own credentials (sent with the request).
  // There is no server-side fallback: these are the client's personal accounts.
  const c = context.integrations || {};

  if (github.SCHEMAS.map(t => t.function.name).includes(name)) {
    return github.execute(name, args, { token: c.github?.token, defaultRepo: c.github?.defaultRepo });
  }
  if (gitlab.SCHEMAS.map(t => t.function.name).includes(name)) {
    return gitlab.execute(name, args, { token: c.gitlab?.token, baseUrl: c.gitlab?.baseUrl || 'https://gitlab.com', defaultProject: c.gitlab?.defaultProject });
  }
  if (jira.SCHEMAS.map(t => t.function.name).includes(name)) {
    return jira.execute(name, args, { token: c.jira?.token, email: c.jira?.email, baseUrl: c.jira?.baseUrl, defaultProject: c.jira?.defaultProject });
  }
  if (slack.SCHEMAS.map(t => t.function.name).includes(name)) {
    return slack.execute(name, args, { token: c.slack?.token, defaultChannel: c.slack?.defaultChannel });
  }
  if (google.SCHEMAS.map(t => t.function.name).includes(name)) {
    return google.execute(name, args, { serviceAccountJson: c.google?.serviceAccountJson, accessToken: c.google?.accessToken });
  }
  if (stripe.SCHEMAS.map(t => t.function.name).includes(name)) {
    return stripe.execute(name, args, { apiKey: c.stripe?.apiKey });
  }
  if (notion.SCHEMAS.map(t => t.function.name).includes(name)) {
    return notion.execute(name, args, { apiKey: c.notion?.apiKey, defaultDbId: c.notion?.dbId });
  }
  if (linear.SCHEMAS.map(t => t.function.name).includes(name)) {
    return linear.execute(name, args, { token: c.linear?.token, defaultTeam: c.linear?.defaultTeam });
  }
  if (todoist.SCHEMAS.map(t => t.function.name).includes(name)) {
    return todoist.execute(name, args, { token: c.todoist?.token, defaultProject: c.todoist?.defaultProject });
  }
  if (gcalendar.SCHEMAS.map(t => t.function.name).includes(name)) {
    return gcalendar.execute(name, args, { accessToken: c.google?.accessToken });
  }
  if (salesforce.SCHEMAS.map(t => t.function.name).includes(name)) {
    return salesforce.execute(name, args, { token: c.salesforce?.token, instanceUrl: c.salesforce?.instanceUrl });
  }
  if (documents.SCHEMAS.map(t => t.function.name).includes(name)) {
    return documents.execute(name, args);
  }
  // Computer Use tools — client-side execution via Tauri
  if (['computer_screenshot', 'computer_click', 'computer_type', 'computer_key', 'computer_scroll', 'computer_move'].includes(name)) {
    return { needs_client_execution: true, tool: name, ...args };
  }
  return { error: `Unknown tool: ${name}` };
}

module.exports = {
  TOOL_SCHEMAS, getAllToolSchemas,
  APPROVAL_REQUIRED: ALL_APPROVAL_REQUIRED,
  CLIENT_TOOLS: ALL_CLIENT_TOOLS,
  executeTool: executeToolWithIntegrations,
  getIntegrationTestFn: (service) => {
    const fns = { github: github.testConnection, gitlab: gitlab.testConnection, jira: jira.testConnection, slack: slack.testConnection, google: google.testConnection, stripe: stripe.testConnection, notion: notion.testConnection, linear: linear.testConnection, todoist: todoist.testConnection, gcalendar: gcalendar.testConnection, salesforce: salesforce.testConnection };
    return fns[service] || null;
  },
};
