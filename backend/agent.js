'use strict';

// ── Tiny UUID v4 without external dependency ───────────────────────────────────
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const db = require('./db');
const { getAllToolSchemas, APPROVAL_REQUIRED, CLIENT_TOOLS, executeTool } = require('./tools');

const MAX_ITERATIONS = 12;

const AGENT_SYSTEM_PROMPT = `You are Lamu Agent, an autonomous AI assistant for Lamuka Tech.
You accomplish complex administrative and productivity goals step by step using your tools.

Available capabilities:
- query_stats: fetch business data (licenses, trials, activity, revenue, top models)
- search_knowledge_base: search internal documents
- compile_report: assemble gathered data into a formatted Markdown report
- send_email: send email (⚠️ pauses for human approval before sending)
- create_task: create action items (syncs to Notion if configured)
- extract_action_items: parse meeting notes into structured tasks
- db_schema: get the schema of the client's connected database (tables & columns) — call first before any SQL
- db_query: execute a SQL query on the client's database. Use allow_write=true for INSERT/UPDATE/DELETE/CREATE/DROP/ALTER — the user will confirm before execution.
- finish: signal completion with summary + deliverable

Workflow guidelines:
1. GATHER data first (query_stats, search_knowledge_base, db_schema → db_query)
2. PROCESS / structure it (compile_report, extract_action_items)
3. ACT (create_task, send_email) — always prepare the full draft before requesting approval for send_email
4. Call finish() with the summary and deliverable when done

For database questions: always call db_schema first, then write precise SQL using the actual column names.
For write operations: set allow_write=true and give a clear description — the user will see it before confirming.
Be concise in tool arguments. Never invent data — query it.`;

// ── DB setup ──────────────────────────────────────────────────────────────────

async function ensureAgentTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id               VARCHAR(36) PRIMARY KEY,
      goal             TEXT NOT NULL,
      status           ENUM('running','waiting_approval','completed','failed','cancelled') DEFAULT 'running',
      result_summary   TEXT,
      result_deliverable LONGTEXT,
      pending_tool     JSON,
      messages         LONGTEXT,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_steps (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      run_id       VARCHAR(36) NOT NULL,
      step_index   INT NOT NULL,
      tool_name    VARCHAR(100),
      tool_args    JSON,
      tool_result  JSON,
      status       ENUM('running','success','failed','approved','rejected') DEFAULT 'success',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_run (run_id)
    )
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function updateRun(id, fields) {
  const cols = Object.keys(fields).map(k => `\`${k}\` = ?`).join(', ');
  await db.query(`UPDATE agent_runs SET ${cols}, updated_at = NOW() WHERE id = ?`, [...Object.values(fields), id]);
}

async function addStep(runId, idx, toolName, toolArgs, toolResult, status = 'success') {
  await db.query(
    'INSERT INTO agent_steps (run_id, step_index, tool_name, tool_args, tool_result, status) VALUES (?,?,?,?,?,?)',
    [runId, idx, toolName, JSON.stringify(toolArgs), JSON.stringify(toolResult), status]
  );
}

// ── AI call ───────────────────────────────────────────────────────────────────

async function callAiWithTools(messages, aiConfig) {
  let extras = {};
  try { extras = JSON.parse(aiConfig.bodyExtras || '{}'); } catch {}

  const res = await fetch(aiConfig.primaryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.primaryKey}` },
    body: JSON.stringify({
      model: aiConfig.primaryModel,
      messages,
      tools: getAllToolSchemas(),
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 4096,
      ...extras,
    }),
  });

  if (!res.ok) throw new Error(`AI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('Empty response from AI');
  return msg;
}

// Simple AI caller for sub-tasks (extract_action_items)
function makeAiCaller(aiConfig) {
  return async (prompt) => {
    const res = await fetch(aiConfig.primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.primaryKey}` },
      body: JSON.stringify({ model: aiConfig.primaryModel, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2048 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runAgentLoop(runId, messages, startIdx, aiConfig, context) {
  let iter = startIdx;

  while (iter < MAX_ITERATIONS) {
    // Persist messages
    await updateRun(runId, { messages: JSON.stringify(messages) });

    // Call AI
    let aiMsg;
    try {
      aiMsg = await callAiWithTools(messages, aiConfig);
    } catch (err) {
      await updateRun(runId, { status: 'failed', result_summary: `AI error: ${err.message}` });
      return;
    }

    messages.push(aiMsg);

    // No tool calls → AI gave final text answer
    if (!aiMsg.tool_calls?.length) {
      await updateRun(runId, { status: 'completed', result_summary: aiMsg.content || 'Done', messages: JSON.stringify(messages) });
      return;
    }

    // Process each tool call
    for (const toolCall of aiMsg.tool_calls) {
      const name = toolCall.function?.name;
      let args = {};
      try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch {}

      // Needs human approval → pause
      if (APPROVAL_REQUIRED.has(name)) {
        await addStep(runId, iter, name, args, { pending_approval: true }, 'running');
        await updateRun(runId, {
          status: 'waiting_approval',
          pending_tool: JSON.stringify({ toolCall, args, step_index: iter }),
          messages: JSON.stringify(messages),
        });
        return; // Loop paused — resume via approveToolCall()
      }

      // Client-side tool (DB queries via Tauri) → pause for frontend execution
      if (CLIENT_TOOLS.has(name)) {
        await addStep(runId, iter, name, args, { needs_client_execution: true }, 'running');
        await updateRun(runId, {
          status: 'waiting_approval', // reuse existing status — frontend distinguishes via needs_client_execution
          pending_tool: JSON.stringify({ toolCall, args, step_index: iter, needs_client_execution: true }),
          messages: JSON.stringify(messages),
        });
        return; // Loop paused — resume via resumeToolCall()
      }

      // Execute tool
      const result = await executeTool(name, args, context);
      await addStep(runId, iter, name, args, result);

      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });

      // finish() called → done
      if (name === 'finish') {
        await updateRun(runId, {
          status: 'completed',
          result_summary: args.summary || 'Completed',
          result_deliverable: args.deliverable || result.report_markdown || null,
          messages: JSON.stringify(messages),
        });
        return;
      }

      iter++;
    }
  }

  await updateRun(runId, { status: 'failed', result_summary: 'Max iterations reached without finishing.' });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function startAgentRun(goal, aiConfig, { getSmtp, integrations } = {}) {
  await ensureAgentTables();
  const id = uuidv4();
  const context = { getSmtp, callAi: makeAiCaller(aiConfig), integrations: integrations || null };
  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: goal },
  ];
  // Persist integrations alongside the run so approval can restore them
  // (column is added lazily if missing via ALTER TABLE below)
  let integrationsJson = null;
  try { integrationsJson = context.integrations ? JSON.stringify(context.integrations) : null; } catch { /* ignore */ }
  try {
    await db.query(
      'INSERT INTO agent_runs (id, goal, status, messages, integrations) VALUES (?,?,?,?,?)',
      [id, goal, 'running', JSON.stringify(messages), integrationsJson]
    );
  } catch {
    // Column may not exist yet — try without it and add it
    await db.query(
      'INSERT INTO agent_runs (id, goal, status, messages) VALUES (?,?,?,?)',
      [id, goal, 'running', JSON.stringify(messages)]
    );
    try { await db.query('ALTER TABLE agent_runs ADD COLUMN integrations LONGTEXT NULL'); } catch { /* already exists */ }
    if (integrationsJson) {
      await db.query('UPDATE agent_runs SET integrations = ? WHERE id = ?', [integrationsJson, id]);
    }
  }
  // Fire-and-forget — runs in background
  setImmediate(() => {
    runAgentLoop(id, messages, 0, aiConfig, context).catch(err => {
      console.error(`[agent:${id}] Fatal:`, err.message);
      updateRun(id, { status: 'failed', result_summary: err.message }).catch(() => {});
    });
  });
  return id;
}

async function approveToolCall(runId, approved, aiConfig, { getSmtp, integrations } = {}) {
  const run = await db.queryOne('SELECT * FROM agent_runs WHERE id = ?', [runId]);
  if (!run || run.status !== 'waiting_approval') return { error: 'Run not waiting for approval' };

  const { toolCall, args, step_index } = JSON.parse(run.pending_tool || '{}');
  const messages = JSON.parse(run.messages || '[]');
  // Re-hydrate integrations from the persisted run if not provided
  let resolvedIntegrations = integrations || null;
  try {
    if (!resolvedIntegrations && run.integrations) {
      resolvedIntegrations = JSON.parse(run.integrations);
    }
  } catch { /* ignore */ }
  const context = { getSmtp, callAi: makeAiCaller(aiConfig), integrations: resolvedIntegrations };

  let toolResult;
  if (approved) {
    toolResult = await executeTool(toolCall.function.name, args, context);
    await addStep(runId, step_index, toolCall.function.name, args, toolResult, 'approved');
  } else {
    toolResult = { cancelled: true, reason: 'Rejected by user' };
    await addStep(runId, step_index, toolCall.function.name, args, toolResult, 'rejected');
  }

  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
  await updateRun(runId, { status: 'running', pending_tool: null, messages: JSON.stringify(messages) });

  // Resume loop
  setImmediate(() => {
    runAgentLoop(runId, messages, step_index + 1, aiConfig, context).catch(err => {
      console.error(`[agent:${runId}] Resume error:`, err.message);
      updateRun(runId, { status: 'failed', result_summary: err.message }).catch(() => {});
    });
  });

  return { ok: true };
}

/** Resume a client-side tool (db_schema / db_query) with the result computed by the frontend. */
async function resumeToolCall(runId, toolResult, aiConfig, { getSmtp, integrations } = {}) {
  const run = await db.queryOne('SELECT * FROM agent_runs WHERE id = ?', [runId]);
  if (!run || run.status !== 'waiting_approval') return { error: 'Run not waiting for client execution' };

  const pendingTool = JSON.parse(run.pending_tool || '{}');
  if (!pendingTool.needs_client_execution) return { error: 'Pending tool is not a client-side tool' };

  const { toolCall, step_index } = pendingTool;
  const messages = JSON.parse(run.messages || '[]');
  let resolvedIntegrations = integrations || null;
  try {
    if (!resolvedIntegrations && run.integrations) resolvedIntegrations = JSON.parse(run.integrations);
  } catch { /* ignore */ }
  const context = { getSmtp, callAi: makeAiCaller(aiConfig), integrations: resolvedIntegrations };

  await addStep(runId, step_index, toolCall.function.name, JSON.parse(toolCall.function?.arguments || '{}'), toolResult, 'approved');
  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
  await updateRun(runId, { status: 'running', pending_tool: null, messages: JSON.stringify(messages) });

  setImmediate(() => {
    runAgentLoop(runId, messages, step_index + 1, aiConfig, context).catch(err => {
      console.error(`[agent:${runId}] Resume error:`, err.message);
      updateRun(runId, { status: 'failed', result_summary: err.message }).catch(() => {});
    });
  });

  return { ok: true };
}

async function getAgentRun(id) {
  const run = await db.queryOne('SELECT id,goal,status,result_summary,result_deliverable,pending_tool,created_at,updated_at FROM agent_runs WHERE id = ?', [id]);
  if (!run) return null;
  const steps = await db.query('SELECT id,step_index,tool_name,tool_args,tool_result,status,created_at FROM agent_steps WHERE run_id = ? ORDER BY step_index,id', [id]);
  return {
    ...run,
    pending_tool: run.pending_tool ? JSON.parse(run.pending_tool) : null,
    steps: steps.map(s => ({
      ...s,
      tool_args:   s.tool_args   ? (typeof s.tool_args   === 'string' ? JSON.parse(s.tool_args)   : s.tool_args)   : null,
      tool_result: s.tool_result ? (typeof s.tool_result === 'string' ? JSON.parse(s.tool_result) : s.tool_result) : null,
    })),
  };
}

async function listAgentRuns(limit = 50) {
  return db.query('SELECT id,goal,status,result_summary,created_at,updated_at FROM agent_runs ORDER BY created_at DESC LIMIT ?', [limit]);
}

module.exports = { startAgentRun, approveToolCall, resumeToolCall, getAgentRun, listAgentRuns, ensureAgentTables };
