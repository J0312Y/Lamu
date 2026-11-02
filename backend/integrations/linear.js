'use strict';

async function linear(token, query, variables = {}) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await r.json();
  if (data.errors?.length) throw new Error(`Linear: ${data.errors[0].message}`);
  return data.data;
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'linear_list_issues',
      description: 'List Linear issues, optionally filtered by team, status, or assignee.',
      parameters: { type: 'object', properties: {
        team:   { type: 'string', description: 'Team key (e.g. ENG)' },
        status: { type: 'string', description: 'Filter by status name (e.g. In Progress, Todo, Done)' },
        limit:  { type: 'integer', description: 'Max results (default 20)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'linear_create_issue',
      description: 'Create a new Linear issue.',
      parameters: { type: 'object', properties: {
        title:       { type: 'string' },
        description: { type: 'string', description: 'Issue description (Markdown supported)' },
        team:        { type: 'string', description: 'Team key (e.g. ENG). Uses default if omitted.' },
        priority:    { type: 'integer', description: '0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low' },
        assignee:    { type: 'string', description: 'Assignee display name or email' },
        label:       { type: 'string', description: 'Label name to apply' },
      }, required: ['title'] }
    }
  },
  {
    type: 'function', function: {
      name: 'linear_update_issue',
      description: 'Update a Linear issue status, priority, or assignee.',
      parameters: { type: 'object', properties: {
        issue_id: { type: 'string', description: 'Issue identifier (e.g. ENG-123)' },
        status:   { type: 'string', description: 'New status name' },
        priority: { type: 'integer' },
        assignee: { type: 'string' },
      }, required: ['issue_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'linear_get_issue',
      description: 'Get details of a Linear issue by identifier.',
      parameters: { type: 'object', properties: {
        issue_id: { type: 'string', description: 'Issue identifier (e.g. ENG-123)' },
      }, required: ['issue_id'] }
    }
  },
];

async function resolveTeamId(token, teamKey) {
  if (!teamKey) {
    const data = await linear(token, '{ teams(first: 1) { nodes { id key name } } }');
    return data.teams?.nodes?.[0];
  }
  const data = await linear(token, '{ teams { nodes { id key name } } }');
  return data.teams?.nodes?.find(t => t.key.toLowerCase() === teamKey.toLowerCase());
}

async function resolveUserId(token, nameOrEmail) {
  if (!nameOrEmail) return null;
  const data = await linear(token, '{ users { nodes { id name email displayName } } }');
  const u = data.users?.nodes?.find(u =>
    u.name?.toLowerCase() === nameOrEmail.toLowerCase() ||
    u.email?.toLowerCase() === nameOrEmail.toLowerCase() ||
    u.displayName?.toLowerCase() === nameOrEmail.toLowerCase()
  );
  return u?.id || null;
}

async function resolveStateId(token, teamId, statusName) {
  if (!statusName) return null;
  const data = await linear(token, `{ workflowStates(filter: { team: { id: { eq: "${teamId}" } } }) { nodes { id name } } }`);
  const s = data.workflowStates?.nodes?.find(s => s.name.toLowerCase() === statusName.toLowerCase());
  return s?.id || null;
}

async function execute(name, args, { token, defaultTeam }) {
  if (!token) return { error: 'Linear not configured. Add API key in admin settings → Intégrations.' };

  switch (name) {
    case 'linear_list_issues': {
      const team = await resolveTeamId(token, args.team || defaultTeam);
      if (!team) return { error: 'No team found.' };
      const limit = Math.min(args.limit || 20, 50);
      let filter = `team: { key: { eq: "${team.key}" } }`;
      if (args.status) filter += `, state: { name: { eqCaseInsensitive: "${args.status}" } }`;
      const data = await linear(token, `{ issues(first: ${limit}, filter: { ${filter} }, orderBy: createdAt) { nodes { identifier title state { name } priority assignee { name } createdAt url } } }`);
      return {
        team: team.key,
        issues: (data.issues?.nodes || []).map(i => ({
          id: i.identifier, title: i.title, status: i.state?.name,
          priority: i.priority, assignee: i.assignee?.name, created: i.createdAt, url: i.url,
        }))
      };
    }
    case 'linear_create_issue': {
      const team = await resolveTeamId(token, args.team || defaultTeam);
      if (!team) return { error: 'No team found.' };
      const input = { teamId: team.id, title: args.title };
      if (args.description) input.description = args.description;
      if (args.priority !== undefined) input.priority = args.priority;
      if (args.assignee) {
        const uid = await resolveUserId(token, args.assignee);
        if (uid) input.assigneeId = uid;
      }
      if (args.label) {
        const labels = await linear(token, `{ issueLabels(filter: { team: { id: { eq: "${team.id}" } } }) { nodes { id name } } }`);
        const lbl = labels.issueLabels?.nodes?.find(l => l.name.toLowerCase() === args.label.toLowerCase());
        if (lbl) input.labelIds = [lbl.id];
      }
      const data = await linear(token, `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier title url state { name } } } }`, { input });
      const issue = data.issueCreate?.issue;
      return { success: true, id: issue?.identifier, title: issue?.title, url: issue?.url };
    }
    case 'linear_update_issue': {
      // Resolve issue UUID from identifier
      const idData = await linear(token, `{ issue(id: "${args.issue_id}") { id team { id } } }`).catch(() => null);
      if (!idData?.issue) return { error: `Issue ${args.issue_id} not found.` };
      const update = {};
      if (args.status) {
        const stateId = await resolveStateId(token, idData.issue.team.id, args.status);
        if (stateId) update.stateId = stateId;
      }
      if (args.priority !== undefined) update.priority = args.priority;
      if (args.assignee) {
        const uid = await resolveUserId(token, args.assignee);
        if (uid) update.assigneeId = uid;
      }
      const data = await linear(token, `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier title state { name } url } } }`, { id: idData.issue.id, input: update });
      const issue = data.issueUpdate?.issue;
      return { success: true, id: issue?.identifier, status: issue?.state?.name, url: issue?.url };
    }
    case 'linear_get_issue': {
      const data = await linear(token, `{ issue(id: "${args.issue_id}") { identifier title description state { name } priority assignee { name } createdAt updatedAt url labels { nodes { name } } } }`);
      const i = data.issue;
      if (!i) return { error: `Issue ${args.issue_id} not found.` };
      return {
        id: i.identifier, title: i.title, description: i.description?.slice(0, 2000),
        status: i.state?.name, priority: i.priority, assignee: i.assignee?.name,
        labels: i.labels?.nodes?.map(l => l.name), created: i.createdAt, updated: i.updatedAt, url: i.url,
      };
    }
    default: return { error: `Unknown Linear tool: ${name}` };
  }
}

async function testConnection(token) {
  try {
    const data = await linear(token, '{ viewer { id name email } }');
    return { ok: true, name: data.viewer?.name, email: data.viewer?.email };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
