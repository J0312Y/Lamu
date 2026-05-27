'use strict';

async function gl(baseUrl, token, path, opts = {}) {
  const url = `${baseUrl}/api/v4${path}`;
  const r = await fetch(url, { headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.text(); throw new Error(`GitLab ${r.status}: ${e}`); }
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'gitlab_list_issues',
      description: 'List GitLab issues in a project.',
      parameters: { type: 'object', properties: {
        project: { type: 'string', description: 'Project path (e.g. group/project). Uses default if omitted.' },
        state:   { type: 'string', enum: ['opened', 'closed', 'all'] },
        limit:   { type: 'integer' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'gitlab_create_issue',
      description: 'Create a new GitLab issue.',
      parameters: { type: 'object', properties: {
        project:     { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
        labels:      { type: 'string', description: 'Comma-separated label names' },
        assignee_id: { type: 'integer' },
      }, required: ['title'] }
    }
  },
  {
    type: 'function', function: {
      name: 'gitlab_list_mrs',
      description: 'List GitLab merge requests.',
      parameters: { type: 'object', properties: {
        project: { type: 'string' },
        state:   { type: 'string', enum: ['opened', 'closed', 'merged', 'all'] },
        limit:   { type: 'integer' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'gitlab_add_comment',
      description: 'Add a comment to a GitLab issue.',
      parameters: { type: 'object', properties: {
        project:  { type: 'string' },
        issue_id: { type: 'integer', description: 'Issue IID' },
        body:     { type: 'string' },
      }, required: ['issue_id', 'body'] }
    }
  },
];

async function execute(name, args, { token, baseUrl = 'https://gitlab.com', defaultProject }) {
  if (!token) return { error: 'GitLab token not configured. Add it in admin settings → Intégrations.' };
  const project = encodeURIComponent(args.project || defaultProject || '');

  switch (name) {
    case 'gitlab_list_issues': {
      if (!project) return { error: 'No project specified.' };
      const items = await gl(baseUrl, token, `/projects/${project}/issues?state=${args.state || 'opened'}&per_page=${Math.min(args.limit || 20, 50)}`);
      return { total: items.length, issues: items.map(i => ({ iid: i.iid, title: i.title, state: i.state, labels: i.labels, created_at: i.created_at, url: i.web_url })) };
    }
    case 'gitlab_create_issue': {
      if (!project) return { error: 'No project specified.' };
      const issue = await gl(baseUrl, token, `/projects/${project}/issues`, { method: 'POST', body: JSON.stringify({ title: args.title, description: args.description, labels: args.labels }) });
      return { success: true, iid: issue.iid, url: issue.web_url, title: issue.title };
    }
    case 'gitlab_list_mrs': {
      if (!project) return { error: 'No project specified.' };
      const mrs = await gl(baseUrl, token, `/projects/${project}/merge_requests?state=${args.state || 'opened'}&per_page=${Math.min(args.limit || 20, 50)}`);
      return { total: mrs.length, mrs: mrs.map(m => ({ iid: m.iid, title: m.title, state: m.state, author: m.author?.name, created_at: m.created_at, url: m.web_url })) };
    }
    case 'gitlab_add_comment': {
      if (!project) return { error: 'No project specified.' };
      const note = await gl(baseUrl, token, `/projects/${project}/issues/${args.issue_id}/notes`, { method: 'POST', body: JSON.stringify({ body: args.body }) });
      return { success: true, note_id: note.id };
    }
    default: return { error: `Unknown GitLab tool: ${name}` };
  }
}

async function testConnection(token, baseUrl = 'https://gitlab.com') {
  try {
    const user = await gl(baseUrl, token, '/user');
    return { ok: true, username: user.username, name: user.name };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
