// ─── Lamu AI Extension — Background Service Worker ──────────────────────────

const DEFAULT_API = 'http://localhost:3456';

async function getConfig() {
  const { lamu_api_url, lamu_api_key, lamu_web_token } = await chrome.storage.sync.get([
    'lamu_api_url', 'lamu_api_key', 'lamu_web_token',
  ]);
  return {
    apiUrl: lamu_api_url || DEFAULT_API,
    apiKey: lamu_api_key || '',
    webToken: lamu_web_token || '',
  };
}

function headers(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h['Authorization'] = `Bearer ${cfg.apiKey}`;
  if (cfg.webToken) h['X-Webapp-Token'] = cfg.webToken;
  return h;
}

// ── Context menu ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lamu-ask',
    title: 'Ask Lamu AI about "%s"',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'lamu-summarize',
    title: 'Summarize this page with Lamu',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'lamu-draft',
    title: 'Draft reply with Lamu AI',
    contexts: ['editable'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'lamu-ask' && info.selectionText) {
    const response = await chatWithAI(`Explain or answer this: "${info.selectionText}"`);
    chrome.tabs.sendMessage(tab.id, { type: 'LAMU_SHOW_RESULT', text: response });
  }
  if (info.menuItemId === 'lamu-summarize') {
    chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, async (pageText) => {
      if (!pageText) return;
      const summary = await chatWithAI(`Summarize this page content concisely:\n\n${pageText.slice(0, 8000)}`);
      chrome.tabs.sendMessage(tab.id, { type: 'LAMU_SHOW_RESULT', text: summary });
    });
  }
  if (info.menuItemId === 'lamu-draft') {
    chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, async (pageText) => {
      if (!pageText) return;
      const draft = await chatWithAI(`Based on this context, draft a professional reply:\n\n${pageText.slice(0, 6000)}`);
      chrome.tabs.sendMessage(tab.id, { type: 'LAMU_INSERT_DRAFT', text: draft });
    });
  }
});

// ── Keyboard commands ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-panel') {
    const tab = await getActiveTab();
    if (tab) chrome.sidePanel.open({ tabId: tab.id });
  }
  if (command === 'search-kb') {
    const tab = await getActiveTab();
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'LAMU_OPEN_KB_SEARCH' });
  }
  if (command === 'draft-reply') {
    const tab = await getActiveTab();
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, async (pageText) => {
        if (!pageText) return;
        const draft = await chatWithAI(`Based on this context, draft a professional reply:\n\n${pageText.slice(0, 6000)}`);
        chrome.tabs.sendMessage(tab.id, { type: 'LAMU_INSERT_DRAFT', text: draft });
      });
    }
  }
});

// ── Message handler (from popup, sidepanel, content script) ─────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAMU_CHAT') {
    chatWithAI(msg.text, msg.context, msg.history).then(sendResponse);
    return true;
  }
  if (msg.type === 'LAMU_KB_SEARCH') {
    searchKB(msg.query).then(sendResponse);
    return true;
  }
  if (msg.type === 'LAMU_GET_CONFIG') {
    getConfig().then(sendResponse);
    return true;
  }
  if (msg.type === 'LAMU_SAVE_CONFIG') {
    chrome.storage.sync.set(msg.config, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'LAMU_HELPDESK_SUGGEST') {
    generateHelpdeskSuggestion(msg).then(sendResponse);
    return true;
  }
});

// ── API calls ───────────────────────────────────────────────────────────────

async function chatWithAI(text, context = '', history = []) {
  try {
    const cfg = await getConfig();
    const messages = [...history];
    const userContent = context ? `Context from current page:\n${context}\n\n${text}` : text;
    messages.push({ role: 'user', content: userContent });

    const resp = await fetch(`${cfg.apiUrl}/api/chat`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ messages, stream: false }),
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || data.response || data.text || 'No response';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

async function searchKB(query) {
  try {
    const cfg = await getConfig();
    const resp = await fetch(`${cfg.apiUrl}/api/kb/search?q=${encodeURIComponent(query)}&limit=5`, {
      headers: headers(cfg),
    });
    if (!resp.ok) throw new Error(`KB search error: ${resp.status}`);
    return await resp.json();
  } catch (e) {
    return { results: [], error: e.message };
  }
}

// ── Helpdesk AI suggestion (KB search + contextual reply) ──────────────────

async function generateHelpdeskSuggestion({ platform, ticket, tone, extraInstructions }) {
  try {
    const cfg = await getConfig();

    // Step 1: Search KB for relevant context
    const searchQuery = [ticket.subject, ticket.conversation?.slice(0, 200)].filter(Boolean).join(' ');
    let kbContext = '';
    let sources = [];
    try {
      const kbResp = await fetch(`${cfg.apiUrl}/api/kb/search?q=${encodeURIComponent(searchQuery.slice(0, 300))}&limit=5`, {
        headers: headers(cfg),
      });
      if (kbResp.ok) {
        const kbData = await kbResp.json();
        sources = (kbData.results || kbData.chunks || []).map(r => ({
          title: r.title || r.doc_title || 'Untitled',
          content: r.content || r.chunk_text || '',
          score: r.score || 0,
        }));
        if (sources.length > 0) {
          kbContext = '\n\n--- KNOWLEDGE BASE CONTEXT ---\n' +
            sources.map((s, i) => `[Source ${i + 1}: ${s.title}]\n${s.content.slice(0, 600)}`).join('\n\n');
        }
      }
    } catch (e) { /* KB search is optional */ }

    // Step 2: Build prompt
    const toneInstructions = {
      professional: 'Use a professional, clear, and polished tone.',
      friendly: 'Use a warm, friendly, and approachable tone. Be personable.',
      concise: 'Be very concise and direct. Short sentences, no fluff.',
      empathetic: 'Be empathetic and understanding. Acknowledge the customer\'s frustration or concern.',
    };

    const systemPrompt = `You are a customer support agent assistant on ${platform}. Your job is to draft a helpful reply to the customer based on the ticket conversation and any knowledge base context provided.

Rules:
- ${toneInstructions[tone] || toneInstructions.professional}
- Write the reply ONLY — no preamble, no "Here's a draft", no signature block.
- If knowledge base context is provided, use it to give accurate, specific answers.
- If you don't have enough information to answer, say so honestly and suggest next steps.
- Match the language of the customer (if they write in French, reply in French, etc).
- Keep the reply focused and actionable.
${extraInstructions ? `\nAdditional instructions from the agent: ${extraInstructions}` : ''}`;

    const userContent = `TICKET ON ${platform.toUpperCase()}:
${ticket.subject ? `Subject: ${ticket.subject}` : ''}
${ticket.customer ? `Customer: ${ticket.customer}` : ''}
${ticket.status ? `Status: ${ticket.status}` : ''}

CONVERSATION:
${ticket.conversation || '(no conversation content extracted)'}
${kbContext}

Draft a reply to the customer:`;

    const resp = await fetch(`${cfg.apiUrl}/api/chat`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        stream: false,
      }),
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || data.response || data.text || '';

    return { reply, sources };
  } catch (e) {
    return { error: e.message, reply: '', sources: [] };
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
