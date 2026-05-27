'use strict';

async function jira(baseUrl, email, token, path, opts = {}) {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const r = await fetch(`${baseUrl}/rest/api/3${path}`, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Jira ${r.status}: ${e}`); }
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'jira_list_issues',
      description: 'Search Jira issues using JQL. Examples: "project=PROJ AND status=Open", "assignee=currentUser()"',
      parameters: { type: 'object', properties: {
        jql:   { type: 'string', description: 'JQL query string. Uses default project if omitted.' },
        limit: { type: 'integer', description: 'Max results (default 20)' },
        fields:{ type: 'string', description: 'Comma-separated fields to return (default: summary,status,assignee,priority,created)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'jira_get_issue',
      description: 'Get details of a specific Jira issue by key (e.g. PROJ-123).',
      parameters: { type: 'object', properties: {
        key: { type: 'string', description: 'Issue key like PROJ-123' },
      }, required: ['key'] }
    }
  },
  {
    type: 'function', function: {
      name: 'jira_create_issue',
      description: 'Create a new Jira issue.',
      parameters: { type: 'object', properties: {
        project:     { type: 'string', description: 'Project key (e.g. PROJ). Uses default if omitted.' },
        summary:     { type: 'string' },
        description: { type: 'string' },
        issue_type:  { type: 'string', description: 'Issue type: Task, Bug, Story, Epic (default: Task)' },
        priority:    { type: 'string', description: 'Priority: Highest, High, Medium, Low, Lowest' },
        assignee:    { type: 'string', description: 'Assignee account ID or email' },
      }, required: ['summary'] }
    }
  },
  {
    type: 'function', function: {
      name: 'jira_add_comment',
      description: 'Add a comment to a Jira issue.',
      parameters: { type: 'object', properties: {
        key:  { type: 'string', description: 'Issue key like PROJ-123' },
        body: { type: 'string', description: 'Comment text' },
      }, required: ['key', 'body'] }
    }
  },
  {
    type: 'function', function: {
      name: 'jira_transition_issue',
      description: 'Change the status of a Jira issue (e.g. move to In Progress, Done).',
      parameters: { type: 'object', properties: {
        key:         { type: 'string' },
        transition:  { type: 'string', description: 'Status name to transition to: "In Progress", "Done", "To Do", etc.' },
      }, required: ['key', 'transition'] }
    }
  },
];

async function execute(name, args, { token, email, baseUrl, defaultProject }) {
  if (!token || !email || !baseUrl) return { error: 'Jira not configured. Set base URL, email and API token in admin settings → Intégrations.' };

  switch (name) {
    case 'jira_list_issues': {
      const jql = args.jql || (defaultProject ? `project = ${defaultProject} ORDER BY created DESC` : 'ORDER BY created DESC');
      const fields = (args.fields || 'summary,status,assignee,priority,created,issuetype').split(',');
      const data = await jira(baseUrl, email, token, `/search?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(args.limit || 20, 50)}&fields=${fields.join(',')}`);
      return {
        total: data.total, returned: data.issues?.length,
        issues: (data.issues || []).map(i => ({
          key: i.key, summary: i.fields.summary,
          status: i.fields.status?.name, priority: i.fields.priority?.name,
          assignee: i.fields.assignee?.displayName || null,
          type: i.fields.issuetype?.name, created: i.fields.created,
          url: `${baseUrl}/browse/${i.key}`,
        }))
      };
    }
    case 'jira_get_issue': {
      const i = await jira(baseUrl, email, token, `/issue/${args.key}`);
      return {
        key: i.key, summary: i.fields.summary, description: i.fields.description,
        status: i.fields.status?.name, priority: i.fields.priority?.name,
        assignee: i.fields.assignee?.displayName, reporter: i.fields.reporter?.displayName,
        created: i.fields.created, updated: i.fields.updated,
        url: `${baseUrl}/browse/${i.key}`,
      };
    }
    case 'jira_create_issue': {
      const proj = args.project || defaultProject;
      if (!proj) return { error: 'No project key specified.' };
      const body = {
        fields: {
          project: { key: proj },
          summary: args.summary,
          issuetype: { name: args.issue_type || 'Task' },
          ...(args.description ? { description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }] } } : {}),
          ...(args.priority ? { priority: { name: args.priority } } : {}),
        }
      };
      const issue = await jira(baseUrl, email, token, '/issue', { method: 'POST', body: JSON.stringify(body) });
      return { success: true, key: issue.key, url: `${baseUrl}/browse/${issue.key}` };
    }
    case 'jira_add_comment': {
      const body = { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.body }] }] } };
      await jira(baseUrl, email, token, `/issue/${args.key}/comment`, { method: 'POST', body: JSON.stringify(body) });
      return { success: true, key: args.key };
    }
    case 'jira_transition_issue': {
      const transitions = await jira(baseUrl, email, token, `/issue/${args.key}/transitions`);
      const target = transitions.transitions?.find(t => t.name.toLowerCase() === args.transition.toLowerCase());
      if (!target) return { error: `Transition "${args.transition}" not found. Available: ${transitions.transitions?.map(t => t.name).join(', ')}` };
      await jira(baseUrl, email, token, `/issue/${args.key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: target.id } }) });
      return { success: true, key: args.key, new_status: target.name };
    }
    default: return { error: `Unknown Jira tool: ${name}` };
  }
}

async function testConnection(token, email, baseUrl) {
  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const r = await fetch(`${baseUrl}/rest/api/3/myself`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const user = await r.json();
    return { ok: true, displayName: user.displayName, email: user.emailAddress };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
