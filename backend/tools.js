'use strict';

const db = require('./db');
const nodemailer = require('nodemailer');

// ── Integration modules ───────────────────────────────────────────────────────
const github  = require('./integrations/github');
const gitlab  = require('./integrations/gitlab');
const jira    = require('./integrations/jira');
const slack   = require('./integrations/slack');
const google  = require('./integrations/google');
const stripe  = require('./integrations/stripe');
const notion  = require('./integrations/notion');

const INTEGRATIONS = { github, gitlab, jira, slack, google, stripe, notion };


// ── Tool Schemas (OpenAI/Groq tool_choice format) ─────────────────────────────

const TOOL_SCHEMAS = [
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
      description: 'Create an action item or task. Stored locally. Syncs to Notion if the integration is configured.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assignee: { type: 'string', description: 'Name or email of the person responsible' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          source: { type: 'string', description: 'Origin context (e.g. meeting title)' }
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
      name: 'db_schema',
      description: 'Get the schema of the client\'s connected database (tables, columns, types). Call this before writing any SQL query.',
      parameters: {
        type: 'object',
        properties: {},
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
          allow_write: { type: 'boolean', description: 'Set to true for INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/TRUNCATE. The user will be asked to confirm before execution.' }
        },
        required: ['sql']
      }
    }
  }
];

// Tools that pause the agent and wait for human approval
const APPROVAL_REQUIRED = new Set(['send_email']);

// Tools that must be executed client-side via Tauri (not server-side)
const CLIENT_TOOLS = new Set(['db_schema', 'db_query']);

// ── Tool Executors ────────────────────────────────────────────────────────────

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

async function execCreateTask({ title, description, assignee, due_date, priority = 'medium', source }) {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT, assignee VARCHAR(200),
        due_date DATE, priority ENUM('low','medium','high') DEFAULT 'medium',
        status ENUM('todo','in_progress','done') DEFAULT 'todo',
        source VARCHAR(200), synced_to VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const r = await db.query(
      'INSERT INTO agent_tasks (title, description, assignee, due_date, priority, source) VALUES (?,?,?,?,?,?)',
      [title, description || null, assignee || null, due_date || null, priority, source || null]
    );
    // Notion sync if configured
    let notion_url = null;
    try {
      const notionKey = await db.queryOne("SELECT value FROM settings WHERE `key`='notion_api_key'");
      const notionDb  = await db.queryOne("SELECT value FROM settings WHERE `key`='notion_db_id'");
      if (notionKey?.value && notionDb?.value) {
        const nr = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${notionKey.value}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent: { database_id: notionDb.value },
            properties: {
              Name: { title: [{ text: { content: title } }] },
              ...(assignee ? { Assignee: { rich_text: [{ text: { content: assignee } }] } } : {}),
              ...(due_date  ? { 'Due Date': { date: { start: due_date } } } : {}),
              Priority: { select: { name: priority.charAt(0).toUpperCase() + priority.slice(1) } },
            }
          })
        }).then(r => r.json());
        if (nr.url) { notion_url = nr.url; await db.query('UPDATE agent_tasks SET synced_to=? WHERE id=?', ['notion', r.insertId]); }
      }
    } catch { /* Notion not configured — skip */ }
    return { success: true, task_id: r.insertId, title, assignee, due_date, priority, notion_url };
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

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function executeTool(name, args, context = {}) {
  try {
    switch (name) {
      case 'query_stats':           return await execQueryStats(args);
      case 'search_knowledge_base': return await execSearchKb(args);
      case 'compile_report':        return execCompileReport(args);
      case 'send_email':            return await execSendEmail(args, context);
      case 'create_task':           return await execCreateTask(args);
      case 'extract_action_items':  return await execExtractActionItems(args, context);
      case 'finish':                return { success: true, finished: true, ...args };
      // Client-side tools — signal that execution must happen via Tauri
      case 'db_schema':             return { needs_client_execution: true, tool: 'db_schema' };
      case 'db_query':              return { needs_client_execution: true, tool: 'db_query', sql: args.sql, description: args.description || '', allow_write: !!args.allow_write };
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
  return { error: `Unknown tool: ${name}` };
}

module.exports = {
  TOOL_SCHEMAS, getAllToolSchemas,
  APPROVAL_REQUIRED: ALL_APPROVAL_REQUIRED,
  CLIENT_TOOLS: ALL_CLIENT_TOOLS,
  executeTool: executeToolWithIntegrations,
  getIntegrationTestFn: (service) => {
    const fns = { github: github.testConnection, gitlab: gitlab.testConnection, jira: jira.testConnection, slack: slack.testConnection, google: google.testConnection, stripe: stripe.testConnection, notion: notion.testConnection };
    return fns[service] || null;
  },
};
