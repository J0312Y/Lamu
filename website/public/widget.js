/**
 * Lamu AI Chat Widget
 * Usage: <script src="https://your-domain.com/widget.js" data-agent="AGENT_TOKEN"></script>
 *
 * Optional attributes:
 *   data-position="bottom-right" (bottom-left, bottom-right)
 *   data-color="#6366f1"
 *   data-title="Lamu AI"
 *   data-placeholder="Posez votre question..."
 *   data-welcome="Bonjour ! Comment puis-je vous aider ?"
 */
;(function () {
  if (window.__lamuWidgetLoaded) return
  window.__lamuWidgetLoaded = true

  const script = document.currentScript
  const AGENT = script?.getAttribute('data-agent') || ''
  const POSITION = script?.getAttribute('data-position') || 'bottom-right'
  const COLOR = script?.getAttribute('data-color') || '#6366f1'
  const TITLE = script?.getAttribute('data-title') || 'Lamu AI'
  const PLACEHOLDER = script?.getAttribute('data-placeholder') || 'Posez votre question...'
  const WELCOME = script?.getAttribute('data-welcome') || ''
  const API = script?.getAttribute('data-api') || (script?.src ? new URL(script.src).origin + '/lamu-api' : '/lamu-api')

  // ── Styles ──
  const css = document.createElement('style')
  css.textContent = `
    #lamu-widget-bubble{position:fixed;${POSITION === 'bottom-left' ? 'left' : 'right'}:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:${COLOR};cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,0.3);z-index:99999;transition:transform .2s,box-shadow .2s;border:none}
    #lamu-widget-bubble:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(0,0,0,0.4)}
    #lamu-widget-bubble svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #lamu-widget-panel{position:fixed;${POSITION === 'bottom-left' ? 'left' : 'right'}:20px;bottom:88px;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);border-radius:16px;background:#111;border:1px solid rgba(255,255,255,0.1);box-shadow:0 24px 64px rgba(0,0,0,0.6);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    #lamu-widget-panel.open{display:flex}
    #lamu-widget-header{padding:14px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)}
    #lamu-widget-header .lw-logo{width:32px;height:32px;border-radius:10px;background:${COLOR};display:flex;align-items:center;justify-content:center;flex-shrink:0}
    #lamu-widget-header .lw-logo svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #lamu-widget-header .lw-title{flex:1;font-size:14px;font-weight:700;color:#fff;letter-spacing:-0.3px}
    #lamu-widget-header .lw-sub{font-size:11px;color:rgba(255,255,255,0.4);margin-top:1px}
    #lamu-widget-header .lw-close{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.4);padding:4px}
    #lamu-widget-header .lw-close:hover{color:#fff}
    #lamu-widget-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
    .lw-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.6;word-break:break-word;white-space:pre-wrap}
    .lw-msg.user{align-self:flex-end;background:${COLOR};color:#fff;border-bottom-right-radius:4px}
    .lw-msg.assistant{align-self:flex-start;background:rgba(255,255,255,0.07);color:#eee;border:1px solid rgba(255,255,255,0.08);border-bottom-left-radius:4px}
    .lw-msg.welcome{align-self:flex-start;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px;font-style:italic}
    .lw-typing{display:flex;gap:4px;padding:10px 14px;align-self:flex-start}
    .lw-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.3);animation:lw-bounce .6s infinite alternate}
    .lw-typing span:nth-child(2){animation-delay:.15s}
    .lw-typing span:nth-child(3){animation-delay:.3s}
    @keyframes lw-bounce{to{opacity:.3;transform:translateY(-4px)}}
    #lamu-widget-input-area{padding:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;background:rgba(8,8,8,0.9)}
    #lamu-widget-input{flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;resize:none;font-family:inherit;max-height:80px}
    #lamu-widget-input::placeholder{color:rgba(255,255,255,0.3)}
    #lamu-widget-input:focus{border-color:${COLOR}}
    #lamu-widget-send{width:36px;height:36px;border-radius:10px;background:${COLOR};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end;transition:opacity .15s}
    #lamu-widget-send:disabled{opacity:0.4;cursor:not-allowed}
    #lamu-widget-send svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #lamu-widget-footer{padding:6px;text-align:center;font-size:10px;color:rgba(255,255,255,0.2)}
    #lamu-widget-footer a{color:rgba(255,255,255,0.3);text-decoration:none}
    #lamu-widget-footer a:hover{color:rgba(255,255,255,0.5)}
  `
  document.head.appendChild(css)

  // ── SVG icons ──
  const botSvg = '<svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect x="5" y="8" width="14" height="12" rx="2"/><path d="M2 14h2M20 14h2M9 13v2M15 13v2"/></svg>'
  const sendSvg = '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  const closeSvg = '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  const chatSvg = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'

  // ── DOM ──
  const bubble = document.createElement('button')
  bubble.id = 'lamu-widget-bubble'
  bubble.innerHTML = chatSvg
  bubble.setAttribute('aria-label', 'Open chat')

  const panel = document.createElement('div')
  panel.id = 'lamu-widget-panel'
  panel.innerHTML = `
    <div id="lamu-widget-header">
      <div class="lw-logo">${botSvg}</div>
      <div><div class="lw-title">${TITLE}</div><div class="lw-sub">AI Assistant</div></div>
      <button class="lw-close" aria-label="Close">${closeSvg}</button>
    </div>
    <div id="lamu-widget-messages"></div>
    <div id="lamu-widget-input-area">
      <textarea id="lamu-widget-input" rows="1" placeholder="${PLACEHOLDER}"></textarea>
      <button id="lamu-widget-send" aria-label="Send">${sendSvg}</button>
    </div>
    <div id="lamu-widget-footer">Powered by <a href="https://lamuka-tech.com" target="_blank">Lamu AI</a></div>
  `

  document.body.appendChild(bubble)
  document.body.appendChild(panel)

  const messagesEl = panel.querySelector('#lamu-widget-messages')
  const inputEl = panel.querySelector('#lamu-widget-input')
  const sendBtn = panel.querySelector('#lamu-widget-send')
  const closeBtn = panel.querySelector('.lw-close')

  let isOpen = false
  let messages = []
  let streaming = false

  // Welcome message
  if (WELCOME) {
    messages.push({ role: 'assistant', content: WELCOME })
    appendMsg('welcome', WELCOME)
  }

  function appendMsg(cls, text) {
    const d = document.createElement('div')
    d.className = 'lw-msg ' + cls
    d.textContent = text
    messagesEl.appendChild(d)
    messagesEl.scrollTop = messagesEl.scrollHeight
    return d
  }

  function showTyping() {
    const d = document.createElement('div')
    d.className = 'lw-typing'
    d.id = 'lw-typing-indicator'
    d.innerHTML = '<span></span><span></span><span></span>'
    messagesEl.appendChild(d)
    messagesEl.scrollTop = messagesEl.scrollHeight
    return d
  }

  function removeTyping() {
    const t = document.getElementById('lw-typing-indicator')
    if (t) t.remove()
  }

  // Toggle
  bubble.addEventListener('click', () => {
    isOpen = !isOpen
    panel.classList.toggle('open', isOpen)
    if (isOpen) inputEl.focus()
  })
  closeBtn.addEventListener('click', () => {
    isOpen = false
    panel.classList.remove('open')
  })

  // Send
  async function send() {
    const text = inputEl.value.trim()
    if (!text || streaming) return
    inputEl.value = ''
    inputEl.style.height = 'auto'
    messages.push({ role: 'user', content: text })
    appendMsg('user', text)

    streaming = true
    sendBtn.disabled = true
    const typingEl = showTyping()

    try {
      const body = {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        widget: true,
        agent: AGENT,
      }
      const resp = await fetch(API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Agent': AGENT },
        body: JSON.stringify(body),
      })
      removeTyping()

      if (!resp.ok || !resp.body) {
        const e = await resp.json().catch(() => ({ error: 'Request failed' }))
        appendMsg('assistant', e.error || 'Something went wrong.')
        return
      }

      const msgEl = appendMsg('assistant', '')
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      let buf = '', fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 1)
          if (!line.startsWith('data: ')) continue
          try {
            const j = JSON.parse(line.slice(6))
            if (j.delta) {
              fullContent += j.delta
              msgEl.textContent = fullContent
              messagesEl.scrollTop = messagesEl.scrollHeight
            }
          } catch {}
        }
      }
      messages.push({ role: 'assistant', content: fullContent })
    } catch {
      removeTyping()
      appendMsg('assistant', 'Connection error. Please try again.')
    } finally {
      streaming = false
      sendBtn.disabled = false
    }
  }

  sendBtn.addEventListener('click', send)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })
  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto'
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px'
  })
})()
