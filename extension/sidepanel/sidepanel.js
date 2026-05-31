// ─── Lamu AI Extension — Side Panel ─────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const chatMessages = [];
let pageContext = '';

// ── Tabs ────────────────────────────────────────────────────────────────────

$$('.tab').forEach((tab) => {
  tab.onclick = () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    $(`#tab-${tab.dataset.tab}`).classList.add('active');
  };
});

// ── Chat ────────────────────────────────────────────────────────────────────

function addMsg(role, content) {
  chatMessages.push({ role, content });
  const div = document.createElement('div');
  div.className = `msg msg-${role === 'user' ? 'user' : 'ai'}`;
  div.textContent = content;
  $('#messages').appendChild(div);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return div;
}

async function send() {
  const text = $('#chat-input').value.trim();
  if (!text) return;
  addMsg('user', text);
  $('#chat-input').value = '';

  const loading = document.createElement('div');
  loading.className = 'msg msg-ai';
  loading.textContent = 'Thinking...';
  loading.style.fontStyle = 'italic';
  loading.style.color = 'rgba(255,255,255,0.4)';
  $('#messages').appendChild(loading);

  const useCtx = $('#use-context').checked;
  let ctx = '';
  if (useCtx && !pageContext) await refreshContext();
  if (useCtx) ctx = pageContext;

  chrome.runtime.sendMessage(
    { type: 'LAMU_CHAT', text, context: ctx, history: chatMessages.slice(0, -1) },
    (resp) => {
      loading.remove();
      addMsg('assistant', resp || 'No response');
    }
  );
}

$('#btn-send').onclick = send;
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

// ── KB Search ───────────────────────────────────────────────────────────────

let kbDebounce = null;
$('#kb-search').addEventListener('input', (e) => {
  clearTimeout(kbDebounce);
  kbDebounce = setTimeout(() => {
    const q = e.target.value.trim();
    if (q.length < 2) { $('#kb-results').innerHTML = ''; return; }
    chrome.runtime.sendMessage({ type: 'LAMU_KB_SEARCH', query: q }, (resp) => {
      const results = resp?.results || resp?.chunks || [];
      if (results.length === 0) {
        $('#kb-results').innerHTML = '<div style="color:#64748b;text-align:center;padding:20px;">No results</div>';
        return;
      }
      $('#kb-results').innerHTML = results
        .map(
          (r) => `
        <div class="result-item" onclick="this.querySelector('.result-text').style.webkitLineClamp='none'">
          <div class="result-title">${esc(r.title || r.doc_title || 'Untitled')}</div>
          <div class="result-text">${esc((r.content || r.chunk_text || '').slice(0, 300))}</div>
          ${r.score ? `<div class="result-score">Score: ${(r.score * 100).toFixed(0)}%</div>` : ''}
        </div>`
        )
        .join('');
    });
  }, 300);
});

// ── Context ─────────────────────────────────────────────────────────────────

async function refreshContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, (text) => {
        pageContext = text || '';
        $('#context-info').textContent = pageContext.slice(0, 2000) || 'No content extracted.';
        // Detect platform
        try {
          const url = new URL(tab.url);
          const host = url.hostname;
          let platform = host;
          if (host.includes('mail.google')) platform = 'Gmail';
          else if (host.includes('zendesk')) platform = 'Zendesk';
          else if (host.includes('freshdesk')) platform = 'Freshdesk';
          else if (host.includes('intercom')) platform = 'Intercom';
          else if (host.includes('slack')) platform = 'Slack';
          else if (host.includes('teams.microsoft')) platform = 'Teams';
          else if (host.includes('notion')) platform = 'Notion';
          else if (host.includes('confluence') || host.includes('atlassian')) platform = 'Confluence';
          else if (host.includes('github')) platform = 'GitHub';
          else if (host.includes('linkedin')) platform = 'LinkedIn';
          $('#platform-info').textContent = platform;
        } catch {}
        resolve();
      });
    });
  } catch {
    $('#context-info').textContent = 'Cannot access this page.';
  }
}

$('#btn-refresh-ctx').onclick = refreshContext;

// Auto-refresh on load
refreshContext();

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
