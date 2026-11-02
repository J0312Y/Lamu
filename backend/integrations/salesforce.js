'use strict';

async function sf(token, instanceUrl, path, opts = {}) {
  const r = await fetch(`${instanceUrl}/services/data/v58.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Salesforce ${r.status}: ${e}`); }
  if (r.status === 204) return {};
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'sf_query',
      description: 'Execute a SOQL query on Salesforce. Example: SELECT Id, Name FROM Account LIMIT 10',
      parameters: { type: 'object', properties: {
        soql: { type: 'string', description: 'SOQL query string' },
      }, required: ['soql'] }
    }
  },
  {
    type: 'function', function: {
      name: 'sf_create_record',
      description: 'Create a new Salesforce record (Account, Contact, Opportunity, Task, Lead, Case, etc.)',
      parameters: { type: 'object', properties: {
        object_type: { type: 'string', description: 'Salesforce object type: Account, Contact, Opportunity, Task, Lead, Case, etc.' },
        fields:      { type: 'object', description: 'Record fields as key-value pairs. Example: { "Name": "Acme Corp", "Industry": "Technology" }' },
      }, required: ['object_type', 'fields'] }
    }
  },
  {
    type: 'function', function: {
      name: 'sf_update_record',
      description: 'Update an existing Salesforce record.',
      parameters: { type: 'object', properties: {
        object_type: { type: 'string', description: 'Object type (Account, Contact, etc.)' },
        record_id:   { type: 'string', description: 'Salesforce record ID (18-char)' },
        fields:      { type: 'object', description: 'Fields to update as key-value pairs' },
      }, required: ['object_type', 'record_id', 'fields'] }
    }
  },
  {
    type: 'function', function: {
      name: 'sf_get_record',
      description: 'Get a Salesforce record by ID.',
      parameters: { type: 'object', properties: {
        object_type: { type: 'string' },
        record_id:   { type: 'string' },
        fields:      { type: 'string', description: 'Comma-separated field names (default: all standard fields)' },
      }, required: ['object_type', 'record_id'] }
    }
  },
  {
    type: 'function', function: {
      name: 'sf_create_task',
      description: 'Create a Salesforce Task (to-do, follow-up, call log). Linked to a record via WhatId or WhoId.',
      parameters: { type: 'object', properties: {
        subject:       { type: 'string', description: 'Task subject' },
        description:   { type: 'string' },
        status:        { type: 'string', description: 'Not Started, In Progress, Completed, Waiting, Deferred' },
        priority:      { type: 'string', description: 'High, Normal, Low' },
        due_date:      { type: 'string', description: 'YYYY-MM-DD' },
        what_id:       { type: 'string', description: 'Related record ID (Account, Opportunity, etc.)' },
        who_id:        { type: 'string', description: 'Related Contact or Lead ID' },
        assigned_to:   { type: 'string', description: 'User ID to assign to' },
      }, required: ['subject'] }
    }
  },
  {
    type: 'function', function: {
      name: 'sf_log_activity',
      description: 'Log a completed call or meeting in Salesforce as a completed Task.',
      parameters: { type: 'object', properties: {
        subject:     { type: 'string', description: 'Activity subject (e.g. "Call with John", "Meeting - Q3 Review")' },
        description: { type: 'string', description: 'Notes/details about the activity' },
        type:        { type: 'string', description: 'Call, Meeting, Email, Other' },
        what_id:     { type: 'string', description: 'Related record ID' },
        who_id:      { type: 'string', description: 'Related Contact/Lead ID' },
        duration:    { type: 'integer', description: 'Duration in minutes' },
      }, required: ['subject'] }
    }
  },
];

async function execute(name, args, { token, instanceUrl }) {
  if (!token || !instanceUrl) return { error: 'Salesforce not configured. Connect your Salesforce account in admin settings → Intégrations.' };

  switch (name) {
    case 'sf_query': {
      const data = await sf(token, instanceUrl, `/query?q=${encodeURIComponent(args.soql)}`);
      return { totalSize: data.totalSize, records: (data.records || []).slice(0, 50).map(r => { const { attributes, ...rest } = r; return rest; }) };
    }
    case 'sf_create_record': {
      const data = await sf(token, instanceUrl, `/sobjects/${args.object_type}/`, { method: 'POST', body: JSON.stringify(args.fields) });
      return { success: true, id: data.id, object_type: args.object_type };
    }
    case 'sf_update_record': {
      await sf(token, instanceUrl, `/sobjects/${args.object_type}/${args.record_id}`, { method: 'PATCH', body: JSON.stringify(args.fields) });
      return { success: true, id: args.record_id, object_type: args.object_type };
    }
    case 'sf_get_record': {
      const fields = args.fields || 'Id,Name';
      const data = await sf(token, instanceUrl, `/sobjects/${args.object_type}/${args.record_id}?fields=${fields}`);
      const { attributes, ...rest } = data;
      return rest;
    }
    case 'sf_create_task': {
      const fields = {
        Subject: args.subject,
        Status: args.status || 'Not Started',
        Priority: args.priority || 'Normal',
      };
      if (args.description) fields.Description = args.description;
      if (args.due_date) fields.ActivityDate = args.due_date;
      if (args.what_id) fields.WhatId = args.what_id;
      if (args.who_id) fields.WhoId = args.who_id;
      if (args.assigned_to) fields.OwnerId = args.assigned_to;
      const data = await sf(token, instanceUrl, '/sobjects/Task/', { method: 'POST', body: JSON.stringify(fields) });
      return { success: true, id: data.id, subject: args.subject };
    }
    case 'sf_log_activity': {
      const fields = {
        Subject: args.subject,
        Status: 'Completed',
        Priority: 'Normal',
        TaskSubtype: args.type === 'Call' ? 'Call' : 'Task',
      };
      if (args.description) fields.Description = args.description;
      if (args.what_id) fields.WhatId = args.what_id;
      if (args.who_id) fields.WhoId = args.who_id;
      if (args.duration) fields.CallDurationInSeconds = args.duration * 60;
      fields.ActivityDate = new Date().toISOString().split('T')[0];
      const data = await sf(token, instanceUrl, '/sobjects/Task/', { method: 'POST', body: JSON.stringify(fields) });
      return { success: true, id: data.id, logged: args.subject };
    }
    default: return { error: `Unknown Salesforce tool: ${name}` };
  }
}

async function testConnection(token, instanceUrl) {
  try {
    const data = await sf(token, instanceUrl, '/sobjects');
    return { ok: true, sobject_count: data.sobjects?.length || 0 };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
