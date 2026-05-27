'use strict';

// Google Drive + Docs integration via Service Account or OAuth2 access token
// Supports: list files, read Google Docs, search Drive, read Sheets

async function googleReq(accessToken, url, opts = {}) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Google API ${r.status}: ${e}`); }
  return r.json();
}

// Get access token from service account JSON (JWT flow)
async function getServiceAccountToken(serviceAccountJson) {
  let sa;
  try { sa = JSON.parse(serviceAccountJson); } catch { throw new Error('Invalid service account JSON'); }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };

  // Encode JWT — requires crypto (Node.js built-in)
  const crypto = require('crypto');
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sigInput = `${enc(header)}.${enc(payload)}`;
  const key = crypto.createPrivateKey(sa.private_key);
  const sig = crypto.sign('SHA256', Buffer.from(sigInput), key).toString('base64url');
  const jwt = `${sigInput}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(data.error_description || 'Failed to get Google access token');
  return data.access_token;
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'gdrive_list_files',
      description: 'List files in Google Drive. Can filter by folder, type, or search query.',
      parameters: { type: 'object', properties: {
        query:  { type: 'string', description: 'Search query (e.g. "name contains \'rapport\'"' },
        limit:  { type: 'integer', description: 'Max files (default 20)' },
        folder: { type: 'string', description: 'Folder ID to list files in' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'gdrive_read_file',
      description: 'Read the text content of a Google Doc or text file from Drive.',
      parameters: { type: 'object', properties: {
        file_id: { type: 'string', description: 'Google Drive file ID' },
        name:    { type: 'string', description: 'File name (will search Drive if ID not provided)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'gdrive_search',
      description: 'Search Google Drive files by name or content.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Search term (searches file names and content)' },
        limit: { type: 'integer' },
      }, required: ['query'] }
    }
  },
  {
    type: 'function', function: {
      name: 'gsheets_read',
      description: 'Read data from a Google Sheets spreadsheet.',
      parameters: { type: 'object', properties: {
        file_id: { type: 'string', description: 'Spreadsheet ID' },
        range:   { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10"). Defaults to first sheet.' },
      }, required: ['file_id'] }
    }
  },
];

async function execute(name, args, { serviceAccountJson, accessToken: directToken }) {
  if (!serviceAccountJson && !directToken) {
    return { error: 'Google not configured. Add service account JSON or access token in admin settings → Intégrations.' };
  }

  let token;
  try {
    token = directToken || await getServiceAccountToken(serviceAccountJson);
  } catch (e) {
    return { error: `Google auth failed: ${e.message}` };
  }

  switch (name) {
    case 'gdrive_list_files': {
      let q = args.folder ? `'${args.folder}' in parents` : '';
      if (args.query) q += (q ? ' and ' : '') + args.query;
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=${Math.min(args.limit || 20, 50)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const data = await googleReq(token, url);
      return { files: (data.files || []).map(f => ({ id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime, url: f.webViewLink })) };
    }
    case 'gdrive_search': {
      const q = `(name contains '${args.query.replace(/'/g, "\\'")}' or fullText contains '${args.query.replace(/'/g, "\\'")}')`;
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=${Math.min(args.limit || 10, 20)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=${encodeURIComponent(q)}`;
      const data = await googleReq(token, url);
      return { query: args.query, results: (data.files || []).map(f => ({ id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime, url: f.webViewLink })) };
    }
    case 'gdrive_read_file': {
      let fileId = args.file_id;
      // If no ID, search by name
      if (!fileId && args.name) {
        const q = `name = '${args.name.replace(/'/g, "\\'")}'`;
        const searchData = await googleReq(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1&fields=files(id,name,mimeType)`);
        const file = searchData.files?.[0];
        if (!file) return { error: `File "${args.name}" not found in Drive.` };
        fileId = file.id;
      }
      if (!fileId) return { error: 'Provide file_id or name to read a file.' };

      // Get file metadata first
      const meta = await googleReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`);

      // Export Google Docs as plain text
      let content = '';
      if (meta.mimeType === 'application/vnd.google-apps.document') {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
        content = await r.text();
      } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`, { headers: { Authorization: `Bearer ${token}` } });
        content = await r.text();
      } else {
        // Plain download for text files
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
        content = await r.text();
      }

      return { file_id: fileId, name: meta.name, type: meta.mimeType, content: content.slice(0, 8000), truncated: content.length > 8000 };
    }
    case 'gsheets_read': {
      const range = args.range || '';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${args.file_id}/values/${encodeURIComponent(range || 'A1:Z1000')}`;
      const data = await googleReq(token, url);
      return { range: data.range, rows: data.values?.length || 0, values: data.values || [] };
    }
    default: return { error: `Unknown Google tool: ${name}` };
  }
}

async function testConnection(serviceAccountJson) {
  try {
    const token = await getServiceAccountToken(serviceAccountJson);
    const data = await googleReq(token, 'https://www.googleapis.com/drive/v3/about?fields=user');
    return { ok: true, email: data.user?.emailAddress, name: data.user?.displayName };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
