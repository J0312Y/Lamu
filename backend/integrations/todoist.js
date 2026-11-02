'use strict';

async function todoist(token, path, opts = {}) {
  const r = await fetch(`https://api.todoist.com/rest/v2${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Todoist ${r.status}: ${e}`); }
  if (r.status === 204) return {};
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'todoist_list_tasks',
      description: 'List tasks from Todoist, optionally filtered by project or label.',
      parameters: { type: 'object', properties: {
        project: { type: 'string', description: 'Project name to filter by' },
        label:   { type: 'string', description: 'Label name to filter by' },
        filter:  { type: 'string', description: 'Todoist filter string (e.g. "today", "overdue", "priority 1")' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'todoist_create_task',
      description: 'Create a new task in Todoist.',
      parameters: { type: 'object', properties: {
        content:     { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description (Markdown)' },
        project:     { type: 'string', description: 'Project name. Uses Inbox if omitted.' },
        due_string:  { type: 'string', description: 'Natural language due date (e.g. "tomorrow", "next Monday", "2026-06-15")' },
        priority:    { type: 'integer', description: '1=normal, 2=medium, 3=high, 4=urgent' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
        assignee:    { type: 'string', description: 'Assignee email (for shared projects)' },
      }, required: ['content'] }
    }
  },
  {
    type: 'function', function: {
      name: 'todoist_complete_task',
      description: 'Mark a Todoist task as completed.',
      parameters: { type: 'object', properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
      }, required: ['task_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'todoist_list_projects',
      description: 'List all Todoist projects.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
];

async function resolveProjectId(token, projectName) {
  if (!projectName) return null;
  const projects = await todoist(token, '/projects');
  const p = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
  return p?.id || null;
}

async function execute(name, args, { token, defaultProject }) {
  if (!token) return { error: 'Todoist not configured. Add API token in admin settings → Intégrations.' };

  switch (name) {
    case 'todoist_list_tasks': {
      let query = '';
      if (args.filter) query = `?filter=${encodeURIComponent(args.filter)}`;
      else if (args.project) {
        const pid = await resolveProjectId(token, args.project);
        if (pid) query = `?project_id=${pid}`;
      } else if (args.label) {
        query = `?label=${encodeURIComponent(args.label)}`;
      }
      const tasks = await todoist(token, `/tasks${query}`);
      return {
        count: tasks.length,
        tasks: tasks.slice(0, 50).map(t => ({
          id: t.id, content: t.content, description: t.description?.slice(0, 200),
          project_id: t.project_id, priority: t.priority,
          due: t.due?.string || null, labels: t.labels, url: t.url,
        }))
      };
    }
    case 'todoist_create_task': {
      const body = { content: args.content };
      if (args.description) body.description = args.description;
      if (args.due_string) body.due_string = args.due_string;
      if (args.priority) body.priority = args.priority;
      if (args.labels) body.labels = args.labels;
      if (args.project || defaultProject) {
        const pid = await resolveProjectId(token, args.project || defaultProject);
        if (pid) body.project_id = pid;
      }
      if (args.assignee) body.assignee_email = args.assignee;
      const task = await todoist(token, '/tasks', { method: 'POST', body: JSON.stringify(body) });
      return { success: true, id: task.id, content: task.content, url: task.url, due: task.due?.string || null };
    }
    case 'todoist_complete_task': {
      await todoist(token, `/tasks/${args.task_id}/close`, { method: 'POST' });
      return { success: true, task_id: args.task_id };
    }
    case 'todoist_list_projects': {
      const projects = await todoist(token, '/projects');
      return { projects: projects.map(p => ({ id: p.id, name: p.name, color: p.color, is_shared: p.is_shared, url: p.url })) };
    }
    default: return { error: `Unknown Todoist tool: ${name}` };
  }
}

async function testConnection(token) {
  try {
    const projects = await todoist(token, '/projects');
    return { ok: true, project_count: projects.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
