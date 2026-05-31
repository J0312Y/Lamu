// ─── Lamu AI Extension — Popup ──────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const messages = [];

// ── Settings ────────────────────────────────────────────────────────────────

$('#btn-settings').onclick = () => {
  const sv = $('#settings-view');
  const cv = $('#chat-view');
  if (sv.classList.contains('hidden')) {
    sv.classList.remove('hidden');
    cv.classList.add('hidden');
    chrome.runtime.sendMessage({ type: 'LAMU_GET_CONFIG' }, (cfg) => {
      $('#cfg-url').value = cfg.apiUrl || '';
      $('#cfg-key').value = cfg.apiKey || '';
      $('#cfg-token').value = cfg.webToken || '';
    });
  } else {
    sv.classList.add('hidden');
    cv.classList.remove('hidden');
  }
};

$('#btn-save-cfg').onclick = () => {
  const config = {
    lamu_api_url: $('#cfg-url').value.trim(),
    lamu_api_key: $('#cfg-key').value.trim(),
    lamu_web_token: $('#cfg-token').value.trim(),
  };
  chrome.runtime.sendMessage({ type: 'LAMU_SAVE_CONFIG', config }, () => {
    $('#cfg-status').textContent = 'Saved!';
    setTimeout(() => {
      $('#settings-view').classList.add('hidden');
      $('#chat-view').classList.remove('hidden');
      $('#cfg-status').textContent = '';
    }, 800);
  });
};

$('#btn-cancel-cfg').onclick = () => {
  $('#settings-view').classList.add('hidden');
  $('#chat-view').classList.remove('hidden');
};

// ── Chat ────────────────────────────────────────────────────────────────────

function addMessage(role, content) {
  messages.push({ role, content });
  const div = document.createElement('div');
  div.className = `msg msg-${role === 'user' ? 'user' : 'ai'}`;
  div.textContent = content;
  $('#messages').appendChild(div);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return div;
}

async function sendChat(text) {
  if (!text.trim()) return;
  addMessage('user', text);
  $('#chat-input').value = '';

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'msg msg-ai msg-loading';
  loadingDiv.textContent = 'Thinking...';
  $('#messages').appendChild(loadingDiv);

  chrome.runtime.sendMessage(
    { type: 'LAMU_CHAT', text, history: messages.slice(0, -1) },
    (response) => {
      loadingDiv.remove();
      addMessage('assistant', response || 'No response');
    }
  );
}

$('#btn-send').onclick = () => sendChat($('#chat-input').value);
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat($('#chat-input').value);
  }
});

// ── Shortcuts ───────────────────────────────────────────────────────────────

$('#btn-summarize').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, (pageText) => {
    if (pageText) sendChat(`Summarize this page content:\n\n${pageText.slice(0, 6000)}`);
  });
};

$('#btn-draft').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: 'LAMU_GET_PAGE_TEXT' }, (pageText) => {
    if (pageText) sendChat(`Draft a professional reply based on this context:\n\n${pageText.slice(0, 6000)}`);
  });
};

$('#btn-kb').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'LAMU_OPEN_KB_SEARCH' });
};
