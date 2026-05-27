'use strict';

const BASE = 'https://api.github.com';

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

async function gh(token, path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: headers(token), ...opts });
  if (!r.ok) { const e = await r.text(); throw new Error(`GitHub ${r.status}: ${e}`); }
  return r.json();
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'github_list_issues',
      description: 'List GitHub issues in a repository. Use to check open bugs, tasks, or feature requests.',
      parameters: { type: 'object', properties: {
        repo:  { type: 'string', description: 'owner/repo format (e.g. lamuka/lamu). Uses default if omitted.' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state (default: open)' },
        limit: { type: 'integer', description: 'Max results (default 20)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'github_create_issue',
      description: 'Create a new GitHub issue in a repository.',
      parameters: { type: 'object', properties: {
        repo:      { type: 'string', description: 'owner/repo. Uses default if omitted.' },
        title:     { type: 'string' },
        body:      { type: 'string', description: 'Issue description in Markdown' },
        labels:    { type: 'array', items: { type: 'string' }, description: 'Label names' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'GitHub usernames' },
      }, required: ['title'] }
    }
  },
  {
    type: 'function', function: {
      name: 'github_list_prs',
      description: 'List pull requests in a GitHub repository.',
      parameters: { type: 'object', properties: {
        repo:  { type: 'string', description: 'owner/repo. Uses default if omitted.' },
        state: { type: 'string', enum: ['open', 'closed', 'all'] },
        limit: { type: 'integer' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'github_get_repo',
      description: 'Get repository info: stars, forks, open issues count, last push, description.',
      parameters: { type: 'object', properties: {
        repo: { type: 'string', description: 'owner/repo. Uses default if omitted.' },
      }, required: [] }
    }
  },
];

// ── Executors ─────────────────────────────────────────────────────────────────

async function execute(name, args, { token, defaultRepo }) {
  if (!token) return { error: 'GitHub token not configured. Add it in admin settings → Intégrations.' };
  const repo = args.repo || defaultRepo;

  switch (name) {
    case 'github_list_issues': {
      if (!repo) return { error: 'No repo specified and no default repo configured.' };
      const issues = await gh(token, `/repos/${repo}/issues?state=${args.state || 'open'}&per_page=${Math.min(args.limit || 20, 50)}`);
      return { repo, total: issues.length, issues: issues.map(i => ({ number: i.number, title: i.title, state: i.state, labels: i.labels.map(l => l.name), assignees: i.assignees.map(a => a.login), created_at: i.created_at, url: i.html_url })) };
    }
    case 'github_create_issue': {
      if (!repo) return { error: 'No repo specified.' };
      const issue = await gh(token, `/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: args.title, body: args.body, labels: args.labels, assignees: args.assignees }) });
      return { success: true, number: issue.number, url: issue.html_url, title: issue.title };
    }
    case 'github_list_prs': {
      if (!repo) return { error: 'No repo specified.' };
      const prs = await gh(token, `/repos/${repo}/pulls?state=${args.state || 'open'}&per_page=${Math.min(args.limit || 20, 50)}`);
      return { repo, total: prs.length, prs: prs.map(p => ({ number: p.number, title: p.title, state: p.state, author: p.user.login, created_at: p.created_at, url: p.html_url })) };
    }
    case 'github_get_repo': {
      if (!repo) return { error: 'No repo specified.' };
      const r = await gh(token, `/repos/${repo}`);
      return { repo, description: r.description, stars: r.stargazers_count, forks: r.forks_count, open_issues: r.open_issues_count, language: r.language, last_push: r.pushed_at, url: r.html_url };
    }
    default: return { error: `Unknown GitHub tool: ${name}` };
  }
}

async function testConnection(token) {
  try {
    const user = await gh(token, '/user');
    return { ok: true, login: user.login, name: user.name };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
