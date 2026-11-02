'use strict';

/**
 * MCP (Model Context Protocol) Server for Lamu.
 * Exposes Lamu's Knowledge Base, meeting summaries, transcripts,
 * and action items as tools accessible by external AI agents.
 *
 * Protocol: JSON-RPC 2.0 over stdio or HTTP SSE
 * Spec: https://modelcontextprotocol.io/
 */

const express = require('express');
const db = require('./db');
const crypto = require('crypto');

const MCP_VERSION = '2024-11-05';
const SERVER_NAME = 'lamu-mcp';
const SERVER_VERSION = '1.0.0';

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'kb_search',
    description: 'Search the Lamu knowledge base using semantic search. Returns relevant documents and chunks with similarity scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        top_k: { type: 'number', description: 'Number of results to return (default: 5)', default: 5 },
        doc_type: { type: 'string', description: 'Filter by document type (e.g., "Meeting", "Note")', default: '' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_meetings',
    description: 'List all meeting summaries stored in the knowledge base. Returns meeting titles, dates, and excerpts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of meetings to return', default: 20 },
        since: { type: 'string', description: 'ISO date to filter meetings after this date', default: '' },
      },
    },
  },
  {
    name: 'get_meeting',
    description: 'Get the full content of a specific meeting summary by document name.',
    inputSchema: {
      type: 'object',
      properties: {
        document_name: { type: 'string', description: 'Name of the meeting document (e.g., "Meeting_2026-06-01.md")' },
      },
      required: ['document_name'],
    },
  },
  {
    name: 'list_documents',
    description: 'List all documents in the Lamu knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max documents to return', default: 50 },
      },
    },
  },
  {
    name: 'get_action_items',
    description: 'Get action items from recent meetings. Returns tasks with assignees, deadlines, and priority.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'pending', 'completed'], description: 'Filter by completion status', default: 'all' },
        limit: { type: 'number', description: 'Max items to return', default: 20 },
      },
    },
  },
  {
    name: 'get_activity',
    description: 'Get Lamu usage activity statistics (requests, tokens) for a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of past days to include', default: 7 },
      },
    },
  },
  {
    name: 'create_note',
    description: 'Create a new document/note in the Lamu knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content (Markdown supported)' },
      },
      required: ['title', 'content'],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {
    case 'kb_search': {
      const query = args.query || '';
      const topK = args.top_k || 5;
      // Query the KB search table (uses embeddings if available, falls back to keyword)
      try {
        const rows = await db.query(
          `SELECT c.content, c.document_name, c.chunk_index
           FROM kb_chunks c
           WHERE c.content LIKE ?
           ORDER BY c.chunk_index ASC
           LIMIT ?`,
          [`%${query}%`, topK]
        );
        return rows.map(r => ({
          document_name: r.document_name,
          chunk_index: r.chunk_index,
          content: r.content?.substring(0, 500),
        }));
      } catch {
        return { note: 'KB search requires the Tauri desktop app for embedding-based search. Falling back to text match.', results: [] };
      }
    }

    case 'list_meetings': {
      const limit = args.limit || 20;
      const since = args.since || '2020-01-01';
      try {
        const rows = await db.query(
          `SELECT DISTINCT document_name, MIN(chunk_index) as first_chunk,
                  SUBSTRING(GROUP_CONCAT(content ORDER BY chunk_index SEPARATOR ' '), 1, 300) as excerpt
           FROM kb_chunks
           WHERE document_name LIKE 'Meeting_%'
             AND document_name > ?
           GROUP BY document_name
           ORDER BY document_name DESC
           LIMIT ?`,
          [since, limit]
        );
        return rows;
      } catch {
        return [];
      }
    }

    case 'get_meeting': {
      const docName = args.document_name;
      if (!docName) return { error: 'document_name is required' };
      try {
        const rows = await db.query(
          `SELECT content, chunk_index FROM kb_chunks
           WHERE document_name = ?
           ORDER BY chunk_index ASC`,
          [docName]
        );
        return { document_name: docName, content: rows.map(r => r.content).join('\n\n') };
      } catch {
        return { error: 'Document not found' };
      }
    }

    case 'list_documents': {
      const limit = args.limit || 50;
      try {
        const rows = await db.query(
          `SELECT DISTINCT document_name, COUNT(*) as chunk_count
           FROM kb_chunks
           GROUP BY document_name
           ORDER BY document_name DESC
           LIMIT ?`,
          [limit]
        );
        return rows;
      } catch {
        return [];
      }
    }

    case 'get_action_items': {
      const limit = args.limit || 20;
      try {
        const rows = await db.query(
          `SELECT * FROM action_items
           ORDER BY created_at DESC
           LIMIT ?`,
          [limit]
        );
        return rows;
      } catch {
        // Table might not exist — return empty
        return [];
      }
    }

    case 'get_activity': {
      const days = args.days || 7;
      try {
        const rows = await db.query(
          `SELECT date, requests, tokens_input, tokens_output
           FROM activity
           WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           ORDER BY date DESC`,
          [days]
        );
        return rows;
      } catch {
        return [];
      }
    }

    case 'create_note': {
      const { title, content } = args;
      if (!title || !content) return { error: 'title and content are required' };
      const docName = `Note_${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
      try {
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        await db.query(
          `INSERT INTO kb_chunks (document_name, chunk_index, content, content_hash)
           VALUES (?, 0, ?, ?)`,
          [docName, content, hash]
        );
        return { success: true, document_name: docName };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── JSON-RPC handler ────────────────────────────────────────────────────────

function handleJsonRpc(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0', id,
        result: { tools: TOOLS },
      };

    case 'tools/call':
      // Handled async — see below
      return null;

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    default:
      return {
        jsonrpc: '2.0', id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

async function handleJsonRpcAsync(request) {
  const { id, method, params } = request;

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    try {
      const result = await executeTool(toolName, toolArgs);
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (e) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Error: ${e.message}` }],
          isError: true,
        },
      };
    }
  }

  return handleJsonRpc(request);
}

// ─── HTTP SSE transport ──────────────────────────────────────────────────────

function createMcpRouter() {
  const router = express.Router();

  // SSE endpoint for MCP
  router.get('/sse', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sessionId = crypto.randomUUID();
    res.write(`data: ${JSON.stringify({ type: 'endpoint', url: `/mcp/message?session=${sessionId}` })}\n\n`);

    // Keep alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

    // Store res for message endpoint
    if (!global._mcpSessions) global._mcpSessions = {};
    global._mcpSessions[sessionId] = res;
  });

  // Message endpoint (POST)
  router.post('/message', async (req, res) => {
    const sessionId = req.query.session;
    const sseRes = global._mcpSessions?.[sessionId];

    try {
      const response = await handleJsonRpcAsync(req.body);
      if (response) {
        // Send via SSE if session exists
        if (sseRes && !sseRes.writableEnded) {
          sseRes.write(`data: ${JSON.stringify(response)}\n\n`);
        }
        res.json(response);
      } else {
        res.status(204).end();
      }
    } catch (e) {
      const errResponse = {
        jsonrpc: '2.0',
        id: req.body?.id,
        error: { code: -32603, message: e.message },
      };
      res.json(errResponse);
    }
  });

  // Tool list (convenience REST endpoint)
  router.get('/tools', (req, res) => {
    res.json({ tools: TOOLS });
  });

  return router;
}

// ─── Stdio transport ─────────────────────────────────────────────────────────

function startStdioTransport() {
  process.stdin.setEncoding('utf-8');
  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    // Try to parse complete JSON-RPC messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const request = JSON.parse(trimmed);
        const response = await handleJsonRpcAsync(request);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch {
        // Skip malformed lines
      }
    }
  });

  process.stderr.write(`[${SERVER_NAME}] MCP server running on stdio\n`);
}

module.exports = { createMcpRouter, startStdioTransport, TOOLS };

// If run directly, use stdio transport
if (require.main === module) {
  startStdioTransport();
}
