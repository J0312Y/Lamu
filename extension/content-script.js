// ─── Lamu AI Extension — Content Script ─────────────────────────────────────

(() => {
  let floatingPanel = null;
  let kbSearchPanel = null;
  let helpdeskPanel = null;
  let helpdeskObserver = null;

  // ── Message handler ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'LAMU_GET_PAGE_TEXT') {
      const text = extractPageText();
      sendResponse(text);
      return;
    }
    if (msg.type === 'LAMU_SHOW_RESULT') {
      showFloatingResult(msg.text);
    }
    if (msg.type === 'LAMU_INSERT_DRAFT') {
      insertDraft(msg.text);
    }
    if (msg.type === 'LAMU_OPEN_KB_SEARCH') {
      toggleKBSearch();
    }
    if (msg.type === 'LAMU_HELPDESK_SUGGESTION') {
      if (helpdeskPanel) renderHelpdeskSuggestion(msg.reply, msg.sources);
    }
  });

  // ── Extract page text ─────────────────────────────────────────────────────

  function extractPageText() {
    const selection = window.getSelection()?.toString()?.trim();
    if (selection && selection.length > 20) return selection;

    // On helpdesk, use specialized extractor
    const ctx = detectContext();
    if (ctx.type === 'helpdesk' || ctx.type === 'gmail') {
      const ticket = extractTicketContext(ctx.platform);
      if (ticket && ticket.conversation) return ticket.conversation.slice(0, 10000);
    }

    const selectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post-content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.innerText.trim().slice(0, 10000);
    }

    return document.body.innerText.trim().slice(0, 10000);
  }

  // ── Detect context (Gmail, Zendesk, etc.) ─────────────────────────────────

  function detectContext() {
    const host = window.location.hostname;

    if (host.includes('mail.google.com')) return { type: 'gmail', platform: 'Gmail' };
    if (host.includes('zendesk.com')) return { type: 'helpdesk', platform: 'Zendesk' };
    if (host.includes('freshdesk.com')) return { type: 'helpdesk', platform: 'Freshdesk' };
    if (host.includes('intercom.io') || host.includes('intercom.com')) return { type: 'helpdesk', platform: 'Intercom' };
    if (host.includes('gorgias.com')) return { type: 'helpdesk', platform: 'Gorgias' };
    if (host.includes('helpscout.net') || host.includes('helpscout.com')) return { type: 'helpdesk', platform: 'HelpScout' };
    if (host.includes('zoho.com') && host.includes('desk')) return { type: 'helpdesk', platform: 'Zoho' };
    if (host.includes('reamaze.com')) return { type: 'helpdesk', platform: 'Reamaze' };
    if (host.includes('hubspot.com')) return { type: 'helpdesk', platform: 'HubSpot' };
    if (host.includes('salesforce.com') || host.includes('force.com')) return { type: 'helpdesk', platform: 'Salesforce' };
    if (host.includes('slack.com')) return { type: 'chat', platform: 'Slack' };
    if (host.includes('teams.microsoft.com')) return { type: 'chat', platform: 'Teams' };
    if (host.includes('notion.so')) return { type: 'docs', platform: 'Notion' };
    if (host.includes('confluence.atlassian.com') || host.includes('atlassian.net')) return { type: 'docs', platform: 'Confluence' };
    if (host.includes('github.com')) return { type: 'code', platform: 'GitHub' };
    if (host.includes('linkedin.com')) return { type: 'social', platform: 'LinkedIn' };

    return { type: 'generic', platform: host };
  }

  // ── Platform-specific ticket extractors ───────────────────────────────────

  function extractTicketContext(platform) {
    const result = { subject: '', customer: '', conversation: '', status: '', priority: '' };

    try {
      switch (platform) {
        case 'Zendesk':
          result.subject = q('[data-test-id="ticket-pane-subject"] input, .ticket-title input, [data-garden-id="forms.input"][name="subject"]')?.value
            || q('.workspace .ember-view header h1, [data-test-id="header-tab-title"]')?.textContent?.trim() || '';
          result.customer = q('[data-test-id="customer-context-name"], .requester-name, [data-test-id="requester-field"] a')?.textContent?.trim() || '';
          result.status = q('[data-test-id="ticket-status-label"], [data-garden-id="tags.tag"]')?.textContent?.trim() || '';
          result.conversation = extractAll('[data-test-id="omni-log-comment-body"], .comment .zd-comment, .event .content .body, [role="article"]')
            || q('[data-test-id="omni-log-container"], .conversation-container, #ticket-conversation')?.innerText?.trim() || '';
          break;

        case 'Freshdesk':
          result.subject = q('.ticket-subject h2, .ticket-details__subject, #ticket-subject')?.textContent?.trim()
            || q('input[name="helpdesk_ticket[subject]"]')?.value || '';
          result.customer = q('.contact-name, .requestor-info .name, .ticket-requester a')?.textContent?.trim() || '';
          result.status = q('.ticket-status .badge, .status-label, select[name="helpdesk_ticket[status]"] option:checked')?.textContent?.trim() || '';
          result.conversation = extractAll('.ticket-conversation .conversation-content, .note-body, .reply-body, .conversation .content')
            || q('.ticket-conversation, #ticket-conversation')?.innerText?.trim() || '';
          break;

        case 'Intercom':
          result.subject = q('[data-testid="conversation-title"], .conversation__title, .conversation-header__title')?.textContent?.trim() || '';
          result.customer = q('[data-testid="user-name"], .user-card__name, .conversation-header__user-name')?.textContent?.trim() || '';
          result.conversation = extractAll('[data-testid="comment-body"], .conversation-part__bubble, .post__body, .intercom-comment-body')
            || q('[data-testid="conversation-stream"], .conversation__stream, .conversation-stream')?.innerText?.trim() || '';
          break;

        case 'Gorgias':
          result.subject = q('.ticket-subject, .ticket-header__subject, [data-cy="ticket-subject"]')?.textContent?.trim() || '';
          result.customer = q('.customer-name, .ticket-header__customer, [data-cy="customer-name"]')?.textContent?.trim() || '';
          result.conversation = extractAll('.message-body, .ticket-message__body, [data-cy="message-body"]')
            || q('.messages-container, .ticket-messages')?.innerText?.trim() || '';
          break;

        case 'HelpScout':
          result.subject = q('.convo-subject, .subject h1, [data-testid="conversation-subject"]')?.textContent?.trim() || '';
          result.customer = q('.customer-name, .c-name, [data-testid="customer-name"]')?.textContent?.trim() || '';
          result.conversation = extractAll('.thread-body, .c-thread__body, [data-testid="thread-body"]')
            || q('.convo-body, .thread-list')?.innerText?.trim() || '';
          break;

        case 'Zoho':
          result.subject = q('.ticket-subject, #subject, .deskTicketSubject')?.textContent?.trim() || '';
          result.customer = q('.contact-name, .requester-name, .deskRequesterName')?.textContent?.trim() || '';
          result.conversation = extractAll('.thread-content, .comment-body, .deskThreadContent')
            || q('.ticket-thread, .thread-list')?.innerText?.trim() || '';
          break;

        case 'Reamaze':
          result.subject = q('.conversation-subject, .convo-subject, h1.subject')?.textContent?.trim() || '';
          result.customer = q('.customer-name, .contact-name')?.textContent?.trim() || '';
          result.conversation = extractAll('.message-content, .message-body')
            || q('.conversation-messages, .messages-list')?.innerText?.trim() || '';
          break;

        case 'HubSpot':
          result.subject = q('[data-test-id="ticket-subject"], .ticket-subject, [data-selenium="ticket-subject"]')?.textContent?.trim() || '';
          result.customer = q('[data-test-id="contact-name"], .contact-name')?.textContent?.trim() || '';
          result.conversation = extractAll('[data-test-id="thread-comment"], .thread-comment, .email-body')
            || q('.communication-thread, .thread-container')?.innerText?.trim() || '';
          break;

        case 'Salesforce':
          result.subject = q('.caseSubject, .slds-page-header__title, [data-target-selection-name="sfdc:RecordField.Case.Subject"]')?.textContent?.trim() || '';
          result.customer = q('.contactName, [data-target-selection-name="sfdc:RecordField.Case.ContactId"] a')?.textContent?.trim() || '';
          result.conversation = extractAll('.caseCommentBody, .feeditemcontent, .caseCommentText')
            || q('.caseFeeds, .feed-list, .forceChatterFeed')?.innerText?.trim() || '';
          break;

        case 'Gmail':
          result.subject = q('h2[data-thread-perm-id], .ha h2, [data-legacy-thread-id] h2')?.textContent?.trim() || '';
          result.customer = q('.gD, .go, [email]')?.getAttribute('email') || q('.gD')?.textContent?.trim() || '';
          result.conversation = extractAll('.a3s.aiL, .gmail_quote, [data-message-id] .a3s')
            || q('[role="list"]')?.innerText?.trim() || '';
          break;
      }
    } catch (e) { /* DOM may vary — fail gracefully */ }

    result.conversation = (result.conversation || '').slice(0, 8000);
    return result;
  }

  // DOM query helpers
  function q(selectors) {
    return document.querySelector(selectors);
  }

  function extractAll(selectors) {
    const els = document.querySelectorAll(selectors);
    if (!els.length) return '';
    return Array.from(els).map(el => el.innerText?.trim()).filter(Boolean).join('\n\n---\n\n');
  }

  // ── Helpdesk AI Copilot Panel ─────────────────────────────────────────────

  function createHelpdeskPanel(ctx) {
    if (helpdeskPanel) return;

    helpdeskPanel = document.createElement('div');
    helpdeskPanel.id = 'lamu-helpdesk-panel';
    helpdeskPanel.innerHTML = `
      <div class="lamu-hd-header">
        <span class="lamu-panel-logo">L</span>
        <span class="lamu-hd-title">Lamu AI Copilot</span>
        <span class="lamu-hd-platform">${escapeHtml(ctx.platform)}</span>
        <button class="lamu-hd-minimize" id="lamu-hd-toggle" title="Minimize">−</button>
        <button class="lamu-panel-close" id="lamu-hd-close" title="Close">&times;</button>
      </div>
      <div class="lamu-hd-body" id="lamu-hd-body">
        <div class="lamu-hd-section">
          <div class="lamu-hd-label">Tone</div>
          <div class="lamu-hd-tones" id="lamu-hd-tones">
            <button class="lamu-hd-tone active" data-tone="professional">Professional</button>
            <button class="lamu-hd-tone" data-tone="friendly">Friendly</button>
            <button class="lamu-hd-tone" data-tone="concise">Concise</button>
            <button class="lamu-hd-tone" data-tone="empathetic">Empathetic</button>
          </div>
        </div>
        <div class="lamu-hd-actions">
          <button class="lamu-btn lamu-hd-suggest" id="lamu-hd-suggest">
            <span class="lamu-hd-suggest-icon">✨</span> Suggest Reply
          </button>
          <button class="lamu-btn lamu-btn-secondary lamu-hd-refresh" id="lamu-hd-refresh" title="Re-read ticket">↻</button>
        </div>
        <div class="lamu-hd-ticket-preview" id="lamu-hd-ticket-preview">
          <div class="lamu-hd-label">Ticket Context</div>
          <div class="lamu-hd-ticket-info" id="lamu-hd-ticket-info">Click "Suggest Reply" to analyze the ticket.</div>
        </div>
        <div class="lamu-hd-result" id="lamu-hd-result" style="display:none;">
          <div class="lamu-hd-label">Suggested Reply</div>
          <div class="lamu-hd-reply-text" id="lamu-hd-reply-text"></div>
          <div class="lamu-hd-result-actions">
            <button class="lamu-btn" id="lamu-hd-insert">Insert</button>
            <button class="lamu-btn lamu-btn-secondary" id="lamu-hd-copy">Copy</button>
            <button class="lamu-btn lamu-btn-secondary" id="lamu-hd-regenerate">Regenerate</button>
          </div>
          <div class="lamu-hd-sources" id="lamu-hd-sources" style="display:none;">
            <div class="lamu-hd-label">KB Sources</div>
            <div id="lamu-hd-sources-list"></div>
          </div>
        </div>
        <div class="lamu-hd-custom">
          <textarea class="lamu-input lamu-hd-input" id="lamu-hd-custom-input" placeholder="Add instructions... (e.g. 'mention our refund policy')" rows="2"></textarea>
          <button class="lamu-btn lamu-btn-secondary lamu-hd-custom-send" id="lamu-hd-custom-send">Ask</button>
        </div>
      </div>
    `;
    document.body.appendChild(helpdeskPanel);

    // ── Event listeners
    const toneButtons = helpdeskPanel.querySelectorAll('.lamu-hd-tone');
    toneButtons.forEach(btn => {
      btn.onclick = () => {
        toneButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    document.getElementById('lamu-hd-close').onclick = () => {
      helpdeskPanel.remove();
      helpdeskPanel = null;
    };

    document.getElementById('lamu-hd-toggle').onclick = () => {
      const body = document.getElementById('lamu-hd-body');
      const btn = document.getElementById('lamu-hd-toggle');
      if (body.style.display === 'none') {
        body.style.display = '';
        btn.textContent = '−';
      } else {
        body.style.display = 'none';
        btn.textContent = '+';
      }
    };

    document.getElementById('lamu-hd-suggest').onclick = () => requestSuggestion(ctx);
    document.getElementById('lamu-hd-refresh').onclick = () => refreshTicketPreview(ctx);
    document.getElementById('lamu-hd-regenerate').onclick = () => requestSuggestion(ctx);

    document.getElementById('lamu-hd-copy').onclick = () => {
      const text = document.getElementById('lamu-hd-reply-text')?.innerText || '';
      navigator.clipboard.writeText(text);
      const btn = document.getElementById('lamu-hd-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 1500);
    };

    document.getElementById('lamu-hd-insert').onclick = () => {
      const text = document.getElementById('lamu-hd-reply-text')?.innerText || '';
      insertIntoHelpdeskReply(text, ctx.platform);
    };

    document.getElementById('lamu-hd-custom-send').onclick = () => {
      const input = document.getElementById('lamu-hd-custom-input');
      const instructions = input.value.trim();
      if (!instructions) return;
      requestSuggestion(ctx, instructions);
      input.value = '';
    };

    document.getElementById('lamu-hd-custom-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('lamu-hd-custom-send').click();
      }
    });

    // Auto-read ticket on open
    refreshTicketPreview(ctx);
  }

  function refreshTicketPreview(ctx) {
    const ticket = extractTicketContext(ctx.platform);
    const info = document.getElementById('lamu-hd-ticket-info');
    if (!info) return;

    if (ticket.subject || ticket.customer || ticket.conversation) {
      let preview = '';
      if (ticket.subject) preview += `<strong>Subject:</strong> ${escapeHtml(ticket.subject)}\n`;
      if (ticket.customer) preview += `<strong>From:</strong> ${escapeHtml(ticket.customer)}\n`;
      if (ticket.status) preview += `<strong>Status:</strong> ${escapeHtml(ticket.status)}\n`;
      if (ticket.conversation) preview += `\n${escapeHtml(ticket.conversation.slice(0, 500))}${ticket.conversation.length > 500 ? '...' : ''}`;
      info.innerHTML = `<pre class="lamu-hd-ticket-text">${preview}</pre>`;
    } else {
      info.innerHTML = '<span class="lamu-hd-no-ticket">No ticket detected on this page. Navigate to a ticket to get suggestions.</span>';
    }
  }

  function requestSuggestion(ctx, extraInstructions = '') {
    const ticket = extractTicketContext(ctx.platform);
    const tone = document.querySelector('.lamu-hd-tone.active')?.dataset.tone || 'professional';
    const resultEl = document.getElementById('lamu-hd-result');
    const replyEl = document.getElementById('lamu-hd-reply-text');
    const suggestBtn = document.getElementById('lamu-hd-suggest');

    if (!ticket.conversation && !ticket.subject) {
      replyEl.innerHTML = '<span class="lamu-hd-error">No ticket content found. Make sure you are on a ticket page.</span>';
      resultEl.style.display = '';
      return;
    }

    // Loading state
    suggestBtn.disabled = true;
    suggestBtn.innerHTML = '<span class="lamu-hd-spinner"></span> Analyzing...';
    replyEl.innerHTML = '<span class="lamu-hd-loading">Reading ticket and searching knowledge base...</span>';
    resultEl.style.display = '';

    chrome.runtime.sendMessage({
      type: 'LAMU_HELPDESK_SUGGEST',
      platform: ctx.platform,
      ticket: {
        subject: ticket.subject,
        customer: ticket.customer,
        conversation: ticket.conversation.slice(0, 6000),
        status: ticket.status,
        priority: ticket.priority,
      },
      tone,
      extraInstructions,
    }, (resp) => {
      suggestBtn.disabled = false;
      suggestBtn.innerHTML = '<span class="lamu-hd-suggest-icon">✨</span> Suggest Reply';

      if (resp && resp.reply) {
        replyEl.innerHTML = `<div class="lamu-hd-reply-content">${escapeHtml(resp.reply)}</div>`;
        // Show KB sources if available
        if (resp.sources && resp.sources.length > 0) {
          const sourcesEl = document.getElementById('lamu-hd-sources');
          const listEl = document.getElementById('lamu-hd-sources-list');
          sourcesEl.style.display = '';
          listEl.innerHTML = resp.sources.map(s => `
            <div class="lamu-hd-source-item">
              <div class="lamu-hd-source-title">${escapeHtml(s.title || 'Untitled')}</div>
              <div class="lamu-hd-source-snippet">${escapeHtml((s.content || '').slice(0, 150))}</div>
              ${s.score ? `<span class="lamu-hd-source-score">${(s.score * 100).toFixed(0)}%</span>` : ''}
            </div>
          `).join('');
        }
      } else {
        replyEl.innerHTML = `<span class="lamu-hd-error">${escapeHtml(resp?.error || 'Failed to generate suggestion.')}</span>`;
      }
    });
  }

  // Insert into the helpdesk's reply editor
  function insertIntoHelpdeskReply(text, platform) {
    // Platform-specific reply field selectors
    const replySelectors = {
      Zendesk: '[data-test-id="omni-log-rich-text-container"] [contenteditable], .fr-element[contenteditable], .ck-editor__editable, [role="textbox"][contenteditable]',
      Freshdesk: '.reply-editor [contenteditable], .fr-element[contenteditable], .redactor-editor[contenteditable], [role="textbox"]',
      Intercom: '[data-testid="composer-body"] [contenteditable], .intercom-composer-body [contenteditable], .composer__body [contenteditable]',
      Gorgias: '.reply-editor [contenteditable], .ProseMirror[contenteditable], [data-cy="reply-editor"]',
      HelpScout: '.note-editor [contenteditable], .redactor-editor[contenteditable], .fr-element[contenteditable]',
      Zoho: '.reply-editor [contenteditable], .ze-editor [contenteditable], [contenteditable="true"]',
      Reamaze: '.message-editor [contenteditable], [contenteditable="true"]',
      HubSpot: '.editor [contenteditable], .ck-editor__editable[contenteditable], [data-test-id="reply-editor"]',
      Salesforce: '.ql-editor[contenteditable], .cke_editable[contenteditable], [contenteditable="true"]',
      Gmail: '.Am.Al.editable[contenteditable], [role="textbox"][contenteditable], .editable[contenteditable]',
    };

    const selectors = replySelectors[platform] || '[contenteditable="true"], textarea';
    const field = document.querySelector(selectors);

    if (field) {
      if (field.isContentEditable) {
        field.focus();
        // Clear existing content if empty-ish, otherwise append
        const existing = field.innerText.trim();
        if (!existing || existing === 'Type a reply...' || existing === 'Write a reply...' || existing.length < 5) {
          field.innerHTML = '';
        }
        document.execCommand('insertText', false, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
        field.focus();
        field.value = text;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Show success feedback
      showInsertFeedback();
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text);
      showInsertFeedback('Copied to clipboard — paste into reply field');
    }
  }

  function showInsertFeedback(msg) {
    const existing = document.getElementById('lamu-hd-feedback');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'lamu-hd-feedback';
    el.className = 'lamu-hd-feedback';
    el.textContent = msg || 'Inserted into reply field';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // ── Auto-inject helpdesk panel ────────────────────────────────────────────

  function tryInjectHelpdeskPanel() {
    const ctx = detectContext();
    if (ctx.type !== 'helpdesk' && ctx.type !== 'gmail') return;
    if (helpdeskPanel) return;

    // Check if we're on a ticket/conversation page (not list view)
    const isTicketPage = detectTicketPage(ctx.platform);
    if (isTicketPage) {
      createHelpdeskPanel(ctx);
    }
  }

  function detectTicketPage(platform) {
    const url = window.location.href;
    const path = window.location.pathname;
    switch (platform) {
      case 'Zendesk': return /\/agent\/tickets\/\d+/.test(path) || !!q('[data-test-id="ticket-pane-subject"], .workspace .ticket');
      case 'Freshdesk': return /\/a\/tickets\/\d+/.test(path) || /\/helpdesk\/tickets\/\d+/.test(path) || !!q('.ticket-details, .ticket-conversation');
      case 'Intercom': return /\/conversation\/\d+/.test(path) || /\/inbox\//.test(path) || !!q('[data-testid="conversation-stream"]');
      case 'Gorgias': return /\/ticket\/\d+/.test(path) || !!q('.ticket-messages');
      case 'HelpScout': return /\/conversation\/\d+/.test(path) || !!q('.convo-body, .thread-list');
      case 'Zoho': return /\/ShowHomePage.*ticketId/.test(url) || !!q('.ticket-thread');
      case 'Reamaze': return /\/conversations\//.test(path) || !!q('.conversation-messages');
      case 'HubSpot': return /\/contacts\/\d+\/ticket\/\d+/.test(path) || !!q('.communication-thread');
      case 'Salesforce': return /\/Case\//.test(path) || /\/500/.test(path) || !!q('.caseFeeds, .forceChatterFeed');
      case 'Gmail': return /\/mail\/.*#.*/.test(url) && !!q('.a3s.aiL, [data-message-id]');
      default: return false;
    }
  }

  // Observe SPA navigation (helpdesks are often SPAs)
  function observeNavigation() {
    const ctx = detectContext();
    if (ctx.type !== 'helpdesk' && ctx.type !== 'gmail') return;

    // Initial check
    setTimeout(tryInjectHelpdeskPanel, 1500);

    // Watch for URL changes (SPA navigation)
    let lastUrl = window.location.href;
    helpdeskObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // Remove old panel on navigation
        if (helpdeskPanel) { helpdeskPanel.remove(); helpdeskPanel = null; }
        // Re-check after DOM settles
        setTimeout(tryInjectHelpdeskPanel, 1500);
      }
    });
    helpdeskObserver.observe(document.body, { childList: true, subtree: true });

    // Also listen for popstate (back/forward)
    window.addEventListener('popstate', () => {
      if (helpdeskPanel) { helpdeskPanel.remove(); helpdeskPanel = null; }
      setTimeout(tryInjectHelpdeskPanel, 1500);
    });
  }

  // Boot
  observeNavigation();

  // ── Floating result panel ─────────────────────────────────────────────────

  function showFloatingResult(text) {
    removeFloating();

    floatingPanel = document.createElement('div');
    floatingPanel.id = 'lamu-floating-panel';
    floatingPanel.innerHTML = `
      <div class="lamu-panel-header">
        <span class="lamu-panel-logo">L</span>
        <span class="lamu-panel-title">Lamu AI</span>
        <button class="lamu-panel-close" id="lamu-close">&times;</button>
      </div>
      <div class="lamu-panel-body">
        <div class="lamu-panel-text">${escapeHtml(text)}</div>
        <div class="lamu-panel-actions">
          <button class="lamu-btn" id="lamu-copy">Copy</button>
          <button class="lamu-btn lamu-btn-secondary" id="lamu-insert">Insert</button>
        </div>
      </div>
    `;
    document.body.appendChild(floatingPanel);

    document.getElementById('lamu-close').onclick = removeFloating;
    document.getElementById('lamu-copy').onclick = () => {
      navigator.clipboard.writeText(text);
      document.getElementById('lamu-copy').textContent = 'Copied!';
      setTimeout(() => { if (document.getElementById('lamu-copy')) document.getElementById('lamu-copy').textContent = 'Copy'; }, 1500);
    };
    document.getElementById('lamu-insert').onclick = () => insertDraft(text);

    // Auto-dismiss after 30s
    setTimeout(removeFloating, 30000);
  }

  function removeFloating() {
    if (floatingPanel) { floatingPanel.remove(); floatingPanel = null; }
  }

  // ── KB Search panel ───────────────────────────────────────────────────────

  function toggleKBSearch() {
    if (kbSearchPanel) { kbSearchPanel.remove(); kbSearchPanel = null; return; }

    kbSearchPanel = document.createElement('div');
    kbSearchPanel.id = 'lamu-kb-search';
    kbSearchPanel.innerHTML = `
      <div class="lamu-panel-header">
        <span class="lamu-panel-logo">L</span>
        <span class="lamu-panel-title">Knowledge Base Search</span>
        <button class="lamu-panel-close" id="lamu-kb-close">&times;</button>
      </div>
      <div class="lamu-panel-body">
        <input type="text" id="lamu-kb-input" class="lamu-input" placeholder="Search your knowledge base..." autofocus />
        <div id="lamu-kb-results" class="lamu-kb-results"></div>
      </div>
    `;
    document.body.appendChild(kbSearchPanel);

    document.getElementById('lamu-kb-close').onclick = () => { kbSearchPanel.remove(); kbSearchPanel = null; };

    let debounceTimer = null;
    document.getElementById('lamu-kb-input').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = e.target.value.trim();
        if (query.length < 2) { document.getElementById('lamu-kb-results').innerHTML = ''; return; }
        chrome.runtime.sendMessage({ type: 'LAMU_KB_SEARCH', query }, (resp) => {
          const container = document.getElementById('lamu-kb-results');
          if (!container) return;
          const results = resp?.results || resp?.chunks || [];
          if (results.length === 0) {
            container.innerHTML = '<div class="lamu-kb-empty">No results found</div>';
            return;
          }
          container.innerHTML = results.map(r => `
            <div class="lamu-kb-item">
              <div class="lamu-kb-item-title">${escapeHtml(r.title || r.doc_title || 'Untitled')}</div>
              <div class="lamu-kb-item-text">${escapeHtml((r.content || r.chunk_text || '').slice(0, 200))}...</div>
              ${r.score ? `<div class="lamu-kb-item-score">Score: ${(r.score * 100).toFixed(0)}%</div>` : ''}
            </div>
          `).join('');
        });
      }, 300);
    });

    document.getElementById('lamu-kb-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { kbSearchPanel.remove(); kbSearchPanel = null; }
    });
  }

  // ── Insert draft into active editable element ─────────────────────────────

  function insertDraft(text) {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      if (active.isContentEditable) {
        document.execCommand('insertText', false, text);
      } else {
        const start = active.selectionStart || 0;
        const end = active.selectionEnd || 0;
        active.value = active.value.slice(0, start) + text + active.value.slice(end);
        active.selectionStart = active.selectionEnd = start + text.length;
        active.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text);
      showFloatingResult('Copied to clipboard (no editable field focused)\n\n' + text);
    }
    removeFloating();
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function renderHelpdeskSuggestion(reply, sources) {
    const replyEl = document.getElementById('lamu-hd-reply-text');
    const resultEl = document.getElementById('lamu-hd-result');
    const suggestBtn = document.getElementById('lamu-hd-suggest');
    if (!replyEl || !resultEl) return;

    suggestBtn.disabled = false;
    suggestBtn.innerHTML = '<span class="lamu-hd-suggest-icon">✨</span> Suggest Reply';
    replyEl.innerHTML = `<div class="lamu-hd-reply-content">${escapeHtml(reply)}</div>`;
    resultEl.style.display = '';

    if (sources && sources.length > 0) {
      const sourcesEl = document.getElementById('lamu-hd-sources');
      const listEl = document.getElementById('lamu-hd-sources-list');
      if (sourcesEl && listEl) {
        sourcesEl.style.display = '';
        listEl.innerHTML = sources.map(s => `
          <div class="lamu-hd-source-item">
            <div class="lamu-hd-source-title">${escapeHtml(s.title || 'Untitled')}</div>
            <div class="lamu-hd-source-snippet">${escapeHtml((s.content || '').slice(0, 150))}</div>
            ${s.score ? `<span class="lamu-hd-source-score">${(s.score * 100).toFixed(0)}%</span>` : ''}
          </div>
        `).join('');
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
