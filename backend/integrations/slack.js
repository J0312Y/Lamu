'use strict';

async function slack(token, method, body = {}) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'slack_list_channels',
      description: 'List Slack channels available to the bot.',
      parameters: { type: 'object', properties: {
        limit: { type: 'integer', description: 'Max channels (default 20)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'slack_get_messages',
      description: 'Get recent messages from a Slack channel.',
      parameters: { type: 'object', properties: {
        channel: { type: 'string', description: 'Channel name (e.g. #general) or ID. Uses default if omitted.' },
        limit:   { type: 'integer', description: 'Number of messages (default 20)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'slack_send_message',
      description: 'Send a message to a Slack channel. ⚠️ Requires human approval.',
      parameters: { type: 'object', properties: {
        channel: { type: 'string', description: 'Channel name or ID. Uses default if omitted.' },
        text:    { type: 'string', description: 'Message text (Markdown supported)' },
      }, required: ['text'] }
    }
  },
  {
    type: 'function', function: {
      name: 'slack_search_messages',
      description: 'Search messages across Slack for a keyword.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer' },
      }, required: ['query'] }
    }
  },
];

// Resolve channel name → ID
async function resolveChannel(token, nameOrId) {
  if (!nameOrId) return null;
  const clean = nameOrId.replace(/^#/, '');
  if (clean.startsWith('C') && clean.length > 8) return clean; // already an ID
  try {
    let cursor = '';
    do {
      const data = await slack(token, 'conversations.list', { limit: 200, cursor, exclude_archived: true });
      const ch = data.channels?.find(c => c.name === clean || c.id === clean);
      if (ch) return ch.id;
      cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);
  } catch {}
  return clean; // fallback — try as-is
}

async function execute(name, args, { token, defaultChannel }) {
  if (!token) return { error: 'Slack bot token not configured. Add it in admin settings → Intégrations.' };

  switch (name) {
    case 'slack_list_channels': {
      const data = await slack(token, 'conversations.list', { limit: Math.min(args.limit || 20, 100), exclude_archived: true });
      return { channels: (data.channels || []).map(c => ({ id: c.id, name: c.name, is_private: c.is_private, members: c.num_members })) };
    }
    case 'slack_get_messages': {
      const channelId = await resolveChannel(token, args.channel || defaultChannel);
      if (!channelId) return { error: 'No channel specified and no default channel configured.' };
      const data = await slack(token, 'conversations.history', { channel: channelId, limit: Math.min(args.limit || 20, 50) });
      // Resolve user IDs to names
      const userIds = [...new Set((data.messages || []).map(m => m.user).filter(Boolean))];
      const userMap = {};
      for (const uid of userIds) {
        try { const u = await slack(token, 'users.info', { user: uid }); userMap[uid] = u.user?.real_name || u.user?.name || uid; } catch {}
      }
      return {
        channel: args.channel || defaultChannel,
        messages: (data.messages || []).map(m => ({
          user: userMap[m.user] || m.user || 'Bot',
          text: m.text,
          ts: new Date(parseFloat(m.ts) * 1000).toISOString(),
        }))
      };
    }
    case 'slack_send_message': {
      const channelId = await resolveChannel(token, args.channel || defaultChannel);
      if (!channelId) return { error: 'No channel specified.' };
      const data = await slack(token, 'chat.postMessage', { channel: channelId, text: args.text, mrkdwn: true });
      return { success: true, channel: channelId, ts: data.ts };
    }
    case 'slack_search_messages': {
      const data = await slack(token, 'search.messages', { query: args.query, count: Math.min(args.limit || 10, 20) });
      const matches = data.messages?.matches || [];
      return { query: args.query, total: data.messages?.total, results: matches.map(m => ({ channel: m.channel?.name, user: m.username, text: m.text, permalink: m.permalink, ts: m.ts })) };
    }
    default: return { error: `Unknown Slack tool: ${name}` };
  }
}

async function testConnection(token) {
  try {
    const data = await slack(token, 'auth.test');
    return { ok: true, team: data.team, user: data.user, bot_id: data.bot_id };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
