'use strict';

async function notion(key, path, opts = {}) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.json(); throw new Error(`Notion ${r.status}: ${e.message || JSON.stringify(e)}`); }
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'notion_search',
      description: 'Search Notion pages and databases by title or content.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Search query' },
        filter: { type: 'string', enum: ['page', 'database', 'all'], description: 'Filter by type (default: all)' },
        limit: { type: 'integer' },
      }, required: ['query'] }
    }
  },
  {
    type: 'function', function: {
      name: 'notion_create_page',
      description: 'Create a new page in a Notion database or as a standalone page.',
      parameters: { type: 'object', properties: {
        database_id:{ type: 'string', description: 'Target database ID. Uses default if omitted.' },
        title:       { type: 'string' },
        content:     { type: 'string', description: 'Page content in Markdown' },
        properties:  { type: 'object', description: 'Additional database properties (key-value pairs)' },
      }, required: ['title'] }
    }
  },
  {
    type: 'function', function: {
      name: 'notion_get_page',
      description: 'Read the content of a Notion page.',
      parameters: { type: 'object', properties: {
        page_id: { type: 'string', description: 'Notion page ID' },
      }, required: ['page_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'notion_query_database',
      description: 'Query a Notion database with optional filters.',
      parameters: { type: 'object', properties: {
        database_id: { type: 'string', description: 'Database ID. Uses default if omitted.' },
        filter:      { type: 'object', description: 'Notion filter object (optional)' },
        limit:       { type: 'integer', description: 'Max results (default 20)' },
      }, required: [] }
    }
  },
];

function textBlock(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }] } };
}

function markdownToBlocks(markdown = '') {
  const lines = markdown.split('\n');
  return lines.slice(0, 100).map(line => {
    if (line.startsWith('# '))  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } };
    if (line.startsWith('## ')) return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] } };
    if (line.startsWith('- '))  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } };
    return textBlock(line || ' ');
  }).filter(b => b);
}

function extractTitle(page) {
  const props = page.properties || {};
  for (const key of ['Name', 'Title', 'title', 'name']) {
    const p = props[key];
    if (p?.title?.[0]?.plain_text) return p.title[0].plain_text;
  }
  return page.id;
}

async function execute(name, args, { apiKey, defaultDbId }) {
  if (!apiKey) return { error: 'Notion API key not configured. Add it in admin settings → Intégrations.' };

  switch (name) {
    case 'notion_search': {
      const body = { query: args.query, page_size: Math.min(args.limit || 10, 20) };
      if (args.filter && args.filter !== 'all') body.filter = { value: args.filter, property: 'object' };
      const data = await notion(apiKey, '/search', { method: 'POST', body: JSON.stringify(body) });
      return {
        query: args.query,
        results: (data.results || []).map(r => ({
          id: r.id, type: r.object,
          title: extractTitle(r),
          url: r.url,
          last_edited: r.last_edited_time,
        }))
      };
    }
    case 'notion_create_page': {
      const dbId = args.database_id || defaultDbId;
      if (!dbId) return { error: 'No database_id specified and no default configured.' };
      const body = {
        parent: { database_id: dbId },
        properties: {
          ...(args.properties || {}),
          Name: { title: [{ text: { content: args.title } }] },
        },
        children: args.content ? markdownToBlocks(args.content) : [],
      };
      const page = await notion(apiKey, '/pages', { method: 'POST', body: JSON.stringify(body) });
      return { success: true, page_id: page.id, url: page.url, title: args.title };
    }
    case 'notion_get_page': {
      const [page, blocks] = await Promise.all([
        notion(apiKey, `/pages/${args.page_id}`),
        notion(apiKey, `/blocks/${args.page_id}/children?page_size=50`),
      ]);
      const text = (blocks.results || []).map(b => {
        const type = b.type;
        const rich = b[type]?.rich_text;
        return rich?.map(r => r.plain_text).join('') || '';
      }).filter(Boolean).join('\n');
      return { page_id: args.page_id, title: extractTitle(page), url: page.url, content: text.slice(0, 6000) };
    }
    case 'notion_query_database': {
      const dbId = args.database_id || defaultDbId;
      if (!dbId) return { error: 'No database_id specified.' };
      const body = { page_size: Math.min(args.limit || 20, 50) };
      if (args.filter) body.filter = args.filter;
      const data = await notion(apiKey, `/databases/${dbId}/query`, { method: 'POST', body: JSON.stringify(body) });
      return {
        total: data.results?.length,
        rows: (data.results || []).map(r => ({ id: r.id, title: extractTitle(r), url: r.url, properties: Object.fromEntries(Object.entries(r.properties || {}).map(([k, v]) => [k, v.title?.[0]?.plain_text || v.rich_text?.[0]?.plain_text || v.select?.name || v.number || v.date?.start || ''])) }))
      };
    }
    default: return { error: `Unknown Notion tool: ${name}` };
  }
}

async function testConnection(apiKey) {
  try {
    const data = await notion(apiKey, '/users/me');
    return { ok: true, name: data.name, type: data.type };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
