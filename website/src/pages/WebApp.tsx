import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, Plus, MessageSquare, Trash2,
  Settings, X, BookOpen, Home,
  Globe, Upload, GitBranch, ChevronRight, CheckCircle,
  Menu, Database, FileText, Zap, Mic, Link,
  ChevronDown, Sparkles, Brain, Search, BarChart2,
  ShoppingBag, Building2, RefreshCw, Shield, Library,
} from 'lucide-react'

// All backend calls go through the Vite proxy at /lamu-api — the proxy injects
// the Authorization header server-side so no secret is exposed to the browser.
const API_BASE = '/lamu-api'
const hdrs = () => ({ 'Content-Type': 'application/json' })

type View = 'home' | 'chat' | 'knowledge' | 'dashboard' | 'settings'
interface Message      { id: string; role: 'user' | 'assistant'; content: string }
interface Conversation { id: string; title: string; messages: Message[]; createdAt: number }
interface Prompt       { title: string; prompt: string }
interface Model        { model: string; name: string; isAvailable: boolean }

function uid() { return Math.random().toString(36).slice(2) }
const STORE = 'lamu_web_conversations'
const loadConvs = (): Conversation[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
const saveConvs = (c: Conversation[]) => localStorage.setItem(STORE, JSON.stringify(c))
const titleFrom = (msgs: Message[]) => { const f = msgs.find(m => m.role === 'user'); return f ? f.content.slice(0, 48) + (f.content.length > 48 ? '…' : '') : 'New conversation' }

// ── Atoms ──────────────────────────────────────────────────────────────────────

function Spinner() {
  return <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity }}
    style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', flexShrink: 0 }} />
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'flex-end', height: 16 }}>
      {[0,1,2].map(i => (
        <motion.span key={i} style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
      ))}
    </span>
  )
}

function Bubble({ msg, isLast, streaming }: { msg: Message; isLast: boolean; streaming: boolean }) {
  const u = msg.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      style={{ display: 'flex', gap: 12, flexDirection: u ? 'row-reverse' : 'row', padding: '2px 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: u ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(255,255,255,0.08)', border: u ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
        {u ? <User size={14} color="#fff" /> : <Bot size={14} color="rgba(255,255,255,0.8)" />}
      </div>
      <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: u ? '18px 4px 18px 18px' : '4px 18px 18px 18px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: u ? 'linear-gradient(135deg,#6366f1,#5254cc)' : 'rgba(255,255,255,0.07)', border: u ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
        {msg.content ? msg.content : isLast && streaming ? <Dots /> : null}
        {isLast && streaming && msg.content && <span style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><Dots /></span>}
      </div>
    </motion.div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

const SOURCES = [
  { icon: Globe,    label: 'Website',      color: '#3b82f6' },
  { icon: Upload,   label: 'Upload PDF',   color: '#8b5cf6' },
  { icon: FileText, label: 'Create a file', color: '#6366f1' },
  { icon: GitBranch, label: 'GitHub',      color: '#e5e7eb' },
  { icon: Database, label: 'All sources',  color: '#f59e0b' },
]

function Sidebar({ view, setView, convs, activeId, onNew, onSelect, onDelete, onClose, mobile, onKb }: {
  view: View; setView: (v: View) => void
  convs: Conversation[]; activeId: string | null
  onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void
  onClose?: () => void; mobile?: boolean; onKb: () => void
}) {
  const [srcOpen,   setSrcOpen]   = useState(false)
  const [chatsOpen, setChatsOpen] = useState(false)

  const navBtn = (id: View, label: string, Icon: React.ElementType, bottom = false) => {
    const active = view === id
    return (
      <button key={id} onClick={() => { setView(id); onClose?.() }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', width: '100%', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: active ? 'rgba(99,102,241,0.12)' : 'transparent', color: active ? '#818cf8' : bottom ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.65)', transition: 'all 0.15s', textAlign: 'left' }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = active ? '#818cf8' : bottom ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.65)' } }}
      >
        <Icon size={15} style={{ flexShrink: 0 }} /> {label}
      </button>
    )
  }

  return (
    <div style={{ width: mobile ? '100%' : 260, flexShrink: 0, background: '#0d0d0d', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={15} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px', color: '#fff' }}>Lamu AI</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Knowledge Agent</div>
        </div>
        {mobile && onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}><X size={15} /></button>
        )}
      </div>

      {/* New chat */}
      <div style={{ padding: '12px 10px 8px' }}>
        <button onClick={onNew} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)' }}>
          <Plus size={14} /> New chat
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {navBtn('home', 'Home', Home)}
        {navBtn('chat', 'Conversations', MessageSquare)}
        {navBtn('knowledge', 'Knowledge', Search)}
      </nav>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 10px' }} />

      {/* Knowledge sources */}
      <div style={{ padding: '0 10px' }}>
        <button onClick={() => { setSrcOpen(v => !v); onKb() }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>Knowledge Sources</span>
          <Plus size={12} style={{ opacity: 0.6 }} />
        </button>
        <AnimatePresence>
          {srcOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {SOURCES.map(s => {
                  const Icon = s.icon
                  return (
                    <button key={s.label} onClick={() => onKb()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, transition: 'all 0.12s', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}>
                      <Icon size={13} style={{ color: s.color, flexShrink: 0 }} /> {s.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent chats */}
      <div style={{ padding: '4px 10px', marginTop: 4 }}>
        <button onClick={() => setChatsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>Recent chats</span>
          <ChevronRight size={12} style={{ transform: chatsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6 }} />
        </button>
        <AnimatePresence>
          {chatsOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ maxHeight: 180, overflowY: 'auto', paddingBottom: 8 }}>
                {convs.length === 0
                  ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', padding: '8px 10px' }}>No conversations yet</p>
                  : [...convs].sort((a, b) => b.createdAt - a.createdAt).map(c => (
                    <div key={c.id} style={{ position: 'relative' }}
                      onMouseEnter={e => { const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.del'); if (b) b.style.opacity = '1' }}
                      onMouseLeave={e => { const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.del'); if (b) b.style.opacity = '0' }}>
                      <button onClick={() => { onSelect(c.id); onClose?.() }} style={{ width: '100%', textAlign: 'left', padding: '6px 28px 6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, background: c.id === activeId && view === 'chat' ? 'rgba(99,102,241,0.12)' : 'transparent', color: c.id === activeId && view === 'chat' ? '#a5b4fc' : 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.12s' }}
                        onMouseEnter={e => { if (!(c.id === activeId && view === 'chat')) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (!(c.id === activeId && view === 'chat')) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                        {c.title}
                      </button>
                      <button className="del" onClick={e => { e.stopPropagation(); onDelete(c.id) }} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', opacity: 0, transition: 'opacity 0.15s', padding: 3 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                }
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom nav */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px 12px' }}>
        {navBtn('dashboard', 'Dashboard', BarChart2, true)}
        {navBtn('settings', 'Settings', Settings, true)}
      </div>
    </div>
  )
}

// ── KB types ──────────────────────────────────────────────────────────────────

interface KbDoc { id: string; type: string; name: string; url?: string; chars: number; createdAt: number; content?: string; excerpt?: string }

// ── Source connection modal ────────────────────────────────────────────────────

type SourceKey = 'url' | 'pdf' | 'text' | 'github' | 'notion' | 'gdrive' | 'confluence' | 'jira' | 'shopify' | 'salesforce' | 'sharepoint'

const NATIVE_SOURCES: SourceKey[] = ['url', 'pdf', 'text']

function SourceModal({ srcKey, onClose, onAdded }: { srcKey: SourceKey; onClose: () => void; onAdded: (doc: KbDoc) => void }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [url,     setUrl]     = useState('')
  const [text,    setText]    = useState('')
  const [name,    setName]    = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isNative = NATIVE_SOURCES.includes(srcKey)

  const inp = (label: string, value: string, onChange: (v: string) => void, placeholder = '', type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
    </div>
  )

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      if (srcKey === 'url') {
        if (!url.trim()) { setError('Please enter a URL'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/url`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ url: url.trim() }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed')
        onAdded(d.doc)
      } else if (srcKey === 'pdf') {
        const file = fileRef.current?.files?.[0]
        if (!file) { setError('Please select a file'); setLoading(false); return }
        const base64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = e => res((e.target?.result as string).split(',')[1] ?? '')
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ name: file.name, content: base64, type: 'file' }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed')
        onAdded(d.doc)
      } else if (srcKey === 'text') {
        if (!name.trim() || !text.trim()) { setError('Please fill in name and content'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ name: name.trim(), content: btoa(unescape(encodeURIComponent(text))), type: 'text' }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed')
        onAdded(d.doc)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const srcMeta: Record<SourceKey, { label: string; icon: React.ElementType; color: string }> = {
    url:        { label: 'Website URL',    icon: Globe,       color: '#3b82f6' },
    pdf:        { label: 'Upload File',    icon: Upload,      color: '#8b5cf6' },
    text:       { label: 'Paste Text',     icon: FileText,    color: '#6366f1' },
    github:     { label: 'GitHub',         icon: GitBranch,   color: '#6ee7b7' },
    notion:     { label: 'Notion',         icon: FileText,    color: '#e5e7eb' },
    gdrive:     { label: 'Google Drive',   icon: Database,    color: '#34d399' },
    confluence: { label: 'Confluence',     icon: Building2,   color: '#60a5fa' },
    jira:       { label: 'Jira',           icon: FileText,    color: '#818cf8' },
    shopify:    { label: 'Shopify',        icon: ShoppingBag, color: '#a78bfa' },
    salesforce: { label: 'Salesforce',     icon: Building2,   color: '#38bdf8' },
    sharepoint: { label: 'SharePoint',     icon: Globe,       color: '#2563eb' },
  }
  const meta = srcMeta[srcKey]
  const Icon = meta.icon

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 460, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={17} style={{ color: meta.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Connect {meta.label}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {isNative ? 'Index content directly in Lamu' : 'Available in the desktop app'}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}><X size={16} /></button>
          </div>

          {isNative ? (
            <>
              {srcKey === 'url' && inp('Page URL', url, setUrl, 'https://docs.example.com', 'url')}
              {srcKey === 'pdf' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 500 }}>File (PDF, TXT, DOCX)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLLabelElement).style.borderColor = 'rgba(99,102,241,0.5)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLLabelElement).style.borderColor = 'rgba(255,255,255,0.2)')}>
                    <Upload size={15} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Click to browse…</span>
                    <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,.docx" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setFileName(file.name)
                          if (!name) setName(file.name)
                        }
                      }} />
                  </label>
                  {fileName && <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Selected file: {fileName}</div>}
                </div>
              )}
              {srcKey === 'text' && (
                <>
                  {inp('Document name', name, setName, 'e.g. Product FAQ')}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 500 }}>Content</label>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Paste your text here…"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              {error && <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={submit} disabled={loading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {loading ? <><Spinner /> Adding…</> : 'Add to knowledge base'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon size={24} style={{ color: meta.color }} />
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 20 }}>
                <strong style={{ color: '#fff' }}>{meta.label}</strong> integration is available in the <strong style={{ color: '#fff' }}>Lamu desktop app</strong>.<br />
                Download the app to connect {meta.label} and sync your knowledge automatically.
              </p>
              <a href="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#fff', color: '#000', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Download Lamu
              </a>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── KB management view ─────────────────────────────────────────────────────────

function KbView({ onClose }: { onClose: () => void }) {
  const [docs,          setDocs]          = useState<KbDoc[]>([])
  const [loading,       setLoading]       = useState(true)
  const [srcKey,        setSrcKey]        = useState<SourceKey | null>(null)
  const [search,        setSearch]        = useState('')
  const [selectedDoc,   setSelectedDoc]   = useState<KbDoc | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/kb`, { headers: hdrs() })
      if (r.ok) { const d = await r.json(); setDocs(d.docs || []) }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: string) => {
    await fetch(`${API_BASE}/api/kb/${id}`, { method: 'DELETE', headers: hdrs() })
    setDocs(prev => prev.filter(d => d.id !== id))
    if (selectedDoc?.id === id) setSelectedDoc(null)
  }

  const loadDocPreview = async (id: string) => {
    if (selectedDoc?.id === id) return
    setPreviewLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(id)}`, { headers: hdrs() })
      if (r.ok) {
        const d = await r.json()
        setSelectedDoc(d.doc || null)
      } else {
        setSelectedDoc(null)
      }
    } catch {
      setSelectedDoc(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const filteredDocs = docs.filter(doc => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return doc.name.toLowerCase().includes(term) || (doc.url || '').toLowerCase().includes(term)
  })

  const KB_SOURCES: { key: SourceKey; icon: React.ElementType; label: string; color: string }[] = [
    { key: 'url',  icon: Globe,    label: 'Website',     color: '#3b82f6' },
    { key: 'pdf',  icon: Upload,   label: 'Upload file', color: '#8b5cf6' },
    { key: 'text', icon: FileText, label: 'Paste text',  color: '#6366f1' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 580, maxHeight: '80vh', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Library size={18} style={{ color: '#818cf8' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#fff' }}>Knowledge Base</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}><X size={15} /></button>
        </div>

        {/* Add source row */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexShrink: 0 }}>
          {KB_SOURCES.map(s => {
            const Icon = s.icon
            return (
              <button key={s.key} onClick={() => setSrcKey(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '66'; b.style.background = s.color + '18'; b.style.color = '#fff' }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(255,255,255,0.1)'; b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = 'rgba(255,255,255,0.7)' }}>
                <Icon size={13} style={{ color: s.color }} /> {s.label}
              </button>
            )
          })}
          <button onClick={() => setSrcKey('github')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
            <Plus size={12} /> More integrations
          </button>
        </div>

        {/* Search + stats */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search KB documents…"
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', minWidth: 160 }}>{filteredDocs.length} of {docs.length} sources</div>
          <button onClick={() => { setSearch(''); setSelectedDoc(null) }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)', fontSize: 12, cursor: 'pointer' }}>Clear</button>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedDoc ? '1.1fr 0.9fr' : '1fr', gap: 12, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 12px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.25)' }}>
                <Database size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 13, margin: 0 }}>No documents yet — add a source above</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.25)' }}>
                <p style={{ fontSize: 13, margin: 0 }}>No documents match your search.</p>
              </div>
            ) : (
              filteredDocs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 10, marginBottom: 4, transition: 'background 0.15s', cursor: 'pointer', background: selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : 'transparent' }}
                  onClick={() => loadDocPreview(doc.id)}
                  onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : 'transparent')}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: doc.type === 'url' ? '#3b82f622' : '#8b5cf622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {doc.type === 'url' ? <Link size={14} style={{ color: '#3b82f6' }} /> : <FileText size={14} style={{ color: '#8b5cf6' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      {doc.url ? <span style={{ marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 220 }}>{doc.url}</span> : null}
                      {(doc.chars / 1000).toFixed(1)}k chars · {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); remove(doc.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 4, flexShrink: 0, transition: 'color 0.15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#f87171')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {selectedDoc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{selectedDoc.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{selectedDoc.type.toUpperCase()} • {(selectedDoc.chars / 1000).toFixed(1)}k chars</div>
                </div>
                <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px', color: 'rgba(255,255,255,0.65)', fontSize: 12, cursor: 'pointer' }}>Close</button>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{selectedDoc.url ? `Source URL: ${selectedDoc.url}` : 'Uploaded file / pasted text'}</div>
              <div style={{ padding: '14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', color: '#e5e7eb', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {previewLoading ? 'Loading preview…' : selectedDoc.content ? selectedDoc.content.slice(0, 2600) + (selectedDoc.content.length > 2600 ? '…' : '') : 'No preview available.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={!selectedDoc.content} onClick={() => navigator.clipboard.writeText(selectedDoc.content || '')}
                  style={{ padding: '10px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer' }}>
                  Copy preview
                </button>
                {selectedDoc.url && (
                  <a href={selectedDoc.url} target="_blank" rel="noreferrer" style={{ padding: '10px 16px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontSize: 12, textDecoration: 'none' }}>
                    Open source
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Source sub-modal */}
      {srcKey && (
        <SourceModal srcKey={srcKey} onClose={() => setSrcKey(null)} onAdded={doc => { setDocs(prev => [...prev, doc]); setSrcKey(null) }} />
      )}
    </motion.div>
  )
}

// ── Home / Onboarding ──────────────────────────────────────────────────────────

function StepCard({ num, title, done, open, onToggle, children, last, tag }: {
  num: number; title: string; done: boolean; open: boolean
  onToggle?: () => void; children: React.ReactNode
  last?: boolean; tag?: string
}) {
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 28px', background: 'transparent', border: 'none', cursor: onToggle ? 'pointer' : 'default', textAlign: 'left' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#22c55e' : 'rgba(99,102,241,0.8)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {done ? <CheckCircle size={15} /> : num}
        </div>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: done ? 'rgba(255,255,255,0.45)' : '#fff' }}>{title}</span>
        {tag && <span style={{ fontSize: 12, color: done ? '#4ade80' : '#818cf8', fontWeight: 600 }}>{tag}</span>}
        {children && !done && <ChevronDown size={15} style={{ color: 'rgba(255,255,255,0.3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />}
      </button>
      <AnimatePresence>
        {open && !done && children && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 28px 24px 70px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ALL_INTEGRATIONS = [
  { icon: Globe,       label: 'Website',     sub: 'Crawl any URL',           color: '#3b82f6' },
  { icon: Upload,      label: 'Upload PDF',  sub: 'PDF, DOCX, TXT',          color: '#8b5cf6' },
  { icon: FileText,    label: 'Notion',      sub: 'Pages & databases',       color: '#e5e7eb' },
  { icon: GitBranch,   label: 'GitHub',      sub: 'Repos & issues',          color: '#6ee7b7' },
  { icon: Database,    label: 'Google Drive',sub: 'Docs & sheets',           color: '#34d399' },
  { icon: Building2,   label: 'Confluence',  sub: 'Spaces & pages',          color: '#60a5fa' },
  { icon: FileText,    label: 'Jira',        sub: 'Tickets & projects',      color: '#818cf8' },
  { icon: ShoppingBag, label: 'Shopify',     sub: 'Products & orders',       color: '#a78bfa' },
  { icon: Building2,   label: 'Salesforce',  sub: 'CRM & contacts',          color: '#38bdf8' },
  { icon: Globe,       label: 'SharePoint',  sub: 'Sites & documents',       color: '#2563eb' },
]

const CAPABILITIES = [
  { icon: Brain,       label: 'RAG-Powered Chat',     desc: 'Answers grounded in your knowledge base — not just training data', color: '#6366f1' },
  { icon: Search,      label: 'Semantic Search',       desc: 'Vector search across all sources to find the most relevant context', color: '#8b5cf6' },
  { icon: RefreshCw,   label: 'Auto-Sync',             desc: 'Keep sources fresh with scheduled re-crawls and incremental updates', color: '#06b6d4' },
  { icon: Mic,         label: 'Voice Input',           desc: 'Whisper-powered speech-to-text — speak your questions hands-free', color: '#f59e0b' },
  { icon: Sparkles,    label: 'Custom Personas',       desc: 'System prompts let you build focused agents for any use case', color: '#ec4899' },
  { icon: BarChart2,   label: 'Activity Tracking',     desc: 'Every search logged with source citations and similarity scores', color: '#22c55e' },
  { icon: Shield,      label: 'Private by Default',    desc: 'Everything runs locally — your data never leaves your machine', color: '#f97316' },
  { icon: Zap,         label: 'Multi-Model Support',   desc: 'OpenAI, Anthropic, Groq, Ollama — swap models without changing code', color: '#a78bfa' },
]

function SourceBtn({ icon: Icon, label, color, onClick }: { icon: React.ElementType; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = color + '66'; b.style.background = color + '18'; b.style.color = '#fff' }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(255,255,255,0.1)'; b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = 'rgba(255,255,255,0.75)' }}>
      <Icon size={13} style={{ color, flexShrink: 0 }} /> {label}
    </button>
  )
}

const SRC_KEY_MAP: Record<string, SourceKey> = {
  'Website': 'url', 'Upload PDF': 'pdf', 'Notion': 'text',
  'GitHub': 'github', 'Google Drive': 'gdrive', 'Confluence': 'confluence',
  'Jira': 'jira', 'Shopify': 'shopify', 'Salesforce': 'salesforce', 'SharePoint': 'sharepoint',
}

function HomeView({ hasChatted, onNewChat, setView }: { hasChatted: boolean; onNewChat: () => void; setView: (v: View) => void }) {
  const [s1, setS1] = useState(true)
  const [s3, setS3] = useState(false)
  const [srcKey, setSrcKey] = useState<SourceKey | null>(null)
  const [showKb, setShowKb] = useState(false)
  const done = [false, hasChatted, false]
  const count = done.filter(Boolean).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Onboarding card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26 }}>👋</span>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', color: '#fff' }}>Get Lamu ready</h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Complete these steps to set up your AI knowledge agent</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < count ? '#6366f1' : 'rgba(255,255,255,0.12)' }} />)}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>{count}/3</span>
            </div>
          </div>

          <StepCard num={1} title="Connect a knowledge source" done={done[0]} open={s1} onToggle={() => setS1(v => !v)}>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Give Lamu something to learn from. Pick a source — the agent will embed and index it automatically.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_INTEGRATIONS.map(s => <SourceBtn key={s.label} icon={s.icon} label={s.label} color={s.color} onClick={() => setSrcKey(SRC_KEY_MAP[s.label] ?? 'url')} />)}
            </div>
          </StepCard>

          <StepCard num={2} title="Have a chat with Lamu" done={done[1]} open={false} onToggle={hasChatted ? undefined : onNewChat} tag={hasChatted ? 'Done' : 'Start chatting →'}>
            {null}
          </StepCard>

          <StepCard num={3} title="Configure your agent" done={done[2]} open={s3} onToggle={() => setS3(v => !v)} last>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Set a system prompt, pick your AI model, and tune Lamu for your use case.</p>
            <button onClick={() => setView('settings')} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Open settings
            </button>
          </StepCard>
        </motion.div>

        {/* ── Quick actions ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Quick actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { icon: MessageSquare, label: 'New chat',         sub: 'Start a conversation',     color: '#6366f1', action: onNewChat },
              { icon: Library,       label: 'Knowledge base',   sub: 'Manage your sources',       color: '#22c55e', action: () => setShowKb(true) },
              { icon: Settings,      label: 'Settings',         sub: 'Model & system prompt',     color: '#f59e0b', action: () => setView('settings') },
              { icon: Zap,           label: 'Quick test',       sub: 'Ask a question now',        color: '#ec4899', action: onNewChat },
            ].map(card => {
              const Icon = card.icon
              return (
                <button key={card.label} onClick={card.action} style={{ padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,255,255,0.06)'; b.style.borderColor = card.color + '44' }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,255,255,0.03)'; b.style.borderColor = 'rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: card.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <Icon size={16} style={{ color: card.color }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{card.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{card.sub}</div>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* ── What Lamu can do ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>What Lamu can do</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {CAPABILITIES.map(cap => {
              const Icon = cap.icon
              return (
                <div key={cap.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: cap.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon size={16} style={{ color: cap.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{cap.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55 }}>{cap.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* ── All integrations ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Supported integrations</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {ALL_INTEGRATIONS.map(s => {
              const Icon = s.icon
              return (
                <button key={s.label} onClick={() => setSrcKey(SRC_KEY_MAP[s.label] ?? 'url')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '44'; b.style.background = s.color + '0d' }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(255,255,255,0.06)'; b.style.background = 'rgba(255,255,255,0.02)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} style={{ color: s.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </motion.div>

      </div>

      {/* Modals */}
      <AnimatePresence>
        {srcKey && <SourceModal srcKey={srcKey} onClose={() => setSrcKey(null)} onAdded={() => setSrcKey(null)} />}
        {showKb && <KbView onClose={() => setShowKb(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── Chat view ──────────────────────────────────────────────────────────────────

function ChatView({ convs, activeId, setActiveId, setConvs, model, models, setModel, system, setSystem, prompts, streaming, setStreaming, kbContext, clearKbContext }: {
  convs: Conversation[]; activeId: string | null
  setActiveId: (id: string | null) => void
  setConvs: React.Dispatch<React.SetStateAction<Conversation[]>>
  model: string; models: Model[]; setModel: (m: string) => void
  system: string; setSystem: (s: string) => void
  prompts: Prompt[]; streaming: boolean; setStreaming: (b: boolean) => void
  kbContext: { id: string; name: string; excerpt: string } | null
  clearKbContext: () => void
}) {
  const [input,       setInput]       = useState('')
  const [error,       setError]       = useState('')
  const [showCfg,     setShowCfg]     = useState(false)
  const [showPrompts, setShowPrompts] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const msgs = convs.find(c => c.id === activeId)?.messages ?? []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const newChat = useCallback(() => {
    const c: Conversation = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now() }
    setConvs(p => [...p, c]); setActiveId(c.id); setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [setConvs, setActiveId])

  const send = useCallback(async () => {
    const text = input.trim(); if (!text || streaming) return
    setInput(''); setError('')
    let convId = activeId
    if (!convId) { const c: Conversation = { id: uid(), title: text.slice(0, 48), messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); convId = c.id }
    const uMsg: Message = { id: uid(), role: 'user',      content: text }
    const aMsg: Message = { id: uid(), role: 'assistant', content: '' }
    setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: [...c.messages, uMsg, aMsg] }))
    setStreaming(true); abortRef.current = new AbortController()
    try {
        const prev = convs.find(c => c.id === convId)?.messages ?? []
      const body: any = { messages: [...prev, uMsg].map(m => ({ role: m.role, content: m.content })), model: model || undefined, system: system || undefined }
      if (kbContext?.id) body.kbIds = [kbContext.id]
      const resp = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body), signal: abortRef.current.signal })
      if (!resp.ok || !resp.body) { const e = await resp.json().catch(() => ({ error: 'Request failed' })); throw new Error(e.error || `Server error ${resp.status}`) }
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1)
          if (!line.startsWith('data: ')) continue
          try {
            const j = JSON.parse(line.slice(6))
            if (j.error) throw new Error(j.error)
            if (j.delta) setConvs(p => p.map(c => { if (c.id !== convId) return c; const ms = [...c.messages]; ms[ms.length - 1] = { ...ms[ms.length - 1], content: ms[ms.length - 1].content + j.delta }; return { ...c, messages: ms } }))
          } catch (e: unknown) { if (e instanceof Error && e.message) throw e }
        }
      }
      setConvs(p => p.map(c => c.id !== convId || c.title !== 'New conversation' ? c : { ...c, title: titleFrom(c.messages) }))
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Something went wrong. Check the server is running.')
      setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: c.messages.filter((m, i) => !(i === c.messages.length - 1 && m.role === 'assistant' && !m.content)) }))
    } finally { setStreaming(false) }
  }, [input, activeId, convs, model, system, streaming, setConvs, setActiveId, setStreaming, kbContext])

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Top bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,8,8,0.9)', backdropFilter: 'blur(12px)', flexShrink: 0 }}>
        {models.length > 0 && (
          <button onClick={() => setShowCfg(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <Bot size={12} style={{ color: '#818cf8' }} />{models.find(m => m.model === model)?.name ?? model}<ChevronDown size={11} style={{ opacity: 0.5 }} />
          </button>
        )}
        {prompts.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowPrompts(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>
              <Sparkles size={11} style={{ color: '#f59e0b' }} /> Prompts
            </button>
            <AnimatePresence>
              {showPrompts && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  style={{ position: 'absolute', top: '110%', left: 0, width: 260, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 6, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {prompts.map(p => (
                    <button key={p.title} onClick={() => { setSystem(p.prompt); setShowPrompts(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.prompt}</div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCfg(v => !v)} style={{ display: 'flex', alignItems: 'center', background: showCfg ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${showCfg ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '5px 10px', color: showCfg ? '#818cf8' : 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>
          <Settings size={12} />
        </button>
        <button onClick={newChat} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>
          <Plus size={13} />
        </button>
      </div>
      {kbContext && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(99,102,241,0.05)', color: '#dbeafe', fontSize: 13 }}>
          <div>Using knowledge source: <strong style={{ color: '#fff' }}>{kbContext.name}</strong></div>
          <button onClick={clearKbContext} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer' }}>Clear source</button>
        </div>
      )}

      {/* Config panel */}
      <AnimatePresence>
        {showCfg && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {models.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Model</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {models.map(m => <button key={m.model} onClick={() => setModel(m.model)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${model === m.model ? '#6366f1' : 'rgba(255,255,255,0.12)'}`, background: model === m.model ? 'rgba(99,102,241,0.2)' : 'transparent', color: model === m.model ? '#818cf8' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}>{m.name}</button>)}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>System Prompt</div>
                <textarea value={system} onChange={e => setSystem(e.target.value)} rows={2} placeholder="You are a helpful assistant…" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {system && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(99,102,241,0.9)', background: 'rgba(99,102,241,0.08)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}><BookOpen size={12} /> System prompt active</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {msgs.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }}>
                <Bot size={26} color="#fff" />
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px', color: '#fff' }}>How can I help?</h2>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 360, margin: '0 auto 32px', lineHeight: 1.7 }}>Ask anything — I'm connected to your knowledge base and ready to assist.</p>
              {prompts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520, margin: '0 auto' }}>
                  {prompts.slice(0, 6).map(p => (
                    <button key={p.title} onClick={() => { setSystem(p.prompt); inputRef.current?.focus() }} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)' }}>
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : msgs.map((m, i) => <Bubble key={m.id} msg={m} isLast={i === msgs.length - 1 && m.role === 'assistant'} streaming={streaming} />)}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>
              <div style={{ flex: 1 }}>{error}</div>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6 }}><X size={14} /></button>
            </motion.div>
          )}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '12px 20px 20px', background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '10px 12px', transition: 'border-color 0.2s' }}
            onFocusCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlurCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.1)')}>
            <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={onKey} placeholder="Message Lamu… (Enter ↵ to send)" disabled={streaming} rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, lineHeight: 1.55, resize: 'none', maxHeight: 140, overflowY: 'auto', fontFamily: 'inherit', opacity: streaming ? 0.7 : 1 }} />
            <button onClick={send} disabled={!input.trim() || streaming} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: !input.trim() || streaming ? 'rgba(99,102,241,0.3)' : '#6366f1', transition: 'all 0.2s' }}>
              {streaming ? <Spinner /> : <Send size={15} color="#fff" />}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>Shift+Enter for new line · Conversations saved locally</p>
        </div>
      </div>
    </div>
  )
}

// ── Settings view ──────────────────────────────────────────────────────────────

function SettingsView({ model, models, setModel, system, setSystem }: { model: string; models: Model[]; setModel: (m: string) => void; system: string; setSystem: (s: string) => void }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.4px', color: '#fff' }}>Settings</h2>
        <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Connection</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: models.length > 0 ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
            {models.length > 0 ? `Connected — ${models.length} model(s) available` : 'Not connected — make sure the Lamu backend is running on port 3000'}
          </div>
        </div>
        {models.length > 0 && (
          <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Model</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {models.map(m => <button key={m.model} onClick={() => setModel(m.model)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${model === m.model ? '#6366f1' : 'rgba(255,255,255,0.12)'}`, background: model === m.model ? 'rgba(99,102,241,0.2)' : 'transparent', color: model === m.model ? '#818cf8' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}>{m.name}</button>)}
            </div>
          </div>
        )}
        <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Default System Prompt</div>
          <textarea value={system} onChange={e => setSystem(e.target.value)} rows={4} placeholder="You are a helpful AI assistant…" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
        </div>
      </div>
    </div>
  )
}

// ── Activity placeholder ───────────────────────────────────────────────────────

function KnowledgeSearchView({ onAskDoc }: { onAskDoc: (doc: KbDoc) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KbDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ total: number; chars: number } | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<KbDoc | null>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/kb/stats`, { headers: hdrs() })
      if (!r.ok) return
      const d = await r.json()
      setStats(d.stats || null)
    } catch {
      setStats(null)
    }
  }, [])

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${API_BASE}/api/kb/search?q=${encodeURIComponent(q)}`, { headers: hdrs() })
      if (!r.ok) { throw new Error('Search failed') }
      const d = await r.json()
      setResults(d.docs || [])
      setSelectedDoc(d.docs?.[0] || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
      setSelectedDoc(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const summarizeDoc = useCallback(async (id: string) => {
    setSummarizing(true)
    setSummary('')
    try {
      const r = await fetch(`${API_BASE}/api/kb/summarize`, {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({ id })
      })
      if (!r.ok) { throw new Error('Summarize failed') }
      const d = await r.json()
      setSummary(d.summary || 'No summary available')
    } catch (e) {
      setSummary('Failed to generate summary')
    } finally {
      setSummarizing(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
    runSearch('')
  }, [loadStats, runSearch])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderRadius: 18, padding: '24px 28px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Knowledge Search</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Search your sources and focus chat on the most relevant documents.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(99,102,241,0.12)', color: '#dbeafe', fontSize: 12 }}>Sources {stats ? stats.total : '–'}</div>
                <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(99,102,241,0.12)', color: '#dbeafe', fontSize: 12 }}>Chars {stats ? Math.round(stats.chars / 1000) + 'k' : '–'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch(query) }} placeholder="Search documents, URLs, keywords..."
                  style={{ width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '14px 16px', fontSize: 14, outline: 'none' }} />
              </div>
              <button onClick={() => runSearch(query)} style={{ padding: '14px 20px', borderRadius: 14, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Search</button>
              <button onClick={() => { setQuery(''); runSearch('') }} style={{ padding: '14px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', cursor: 'pointer' }}>Reset</button>
            </div>
            {error && <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13 }}>{error}</div>}
          </div>

          <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>Results</div>
            <div style={{ minHeight: 260, maxHeight: 680, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 36 }}><Spinner /></div>
              ) : results.length === 0 ? (
                <div style={{ padding: 32, color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center' }}>No matching documents found.</div>
              ) : results.map(doc => (
                <div key={doc.id} onClick={() => { setSelectedDoc(doc); setSummary(''); setSummarizing(false) }} style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', background: selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{doc.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{doc.url || doc.type.toUpperCase()}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{(doc.chars / 1000).toFixed(1)}k chars</span>
                  </div>
                  {doc.excerpt ? <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.7 }}>{doc.excerpt}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderRadius: 18, padding: '24px 26px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Selected source</div>
            {!selectedDoc ? (
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, lineHeight: 1.7 }}>Click a result to preview its content and ask Lamu about it.</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{selectedDoc.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>{selectedDoc.url || selectedDoc.type.toUpperCase()}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, minHeight: 140, whiteSpace: 'pre-wrap' }}>{selectedDoc.excerpt || 'No preview available for this source.'}</div>
                {summary && (
                  <div style={{ marginTop: 16, padding: '12px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#dbeafe', marginBottom: 8 }}>AI Summary</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{summary}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => summarizeDoc(selectedDoc.id)} disabled={summarizing} style={{ padding: '10px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {summarizing ? <Spinner /> : <Brain size={14} />} {summarizing ? 'Summarizing...' : 'Summarize'}
                  </button>
                  <button onClick={() => onAskDoc(selectedDoc)} style={{ padding: '10px 16px', borderRadius: 14, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Use in chat</button>
                </div>
              </>
            )}
          </div>

          <div style={{ borderRadius: 18, padding: '22px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Why this matters</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.8 }}>
              <li>Search across KB sources before asking.</li>
              <li>Focus the assistant on the exact document you need.</li>
              <li>Keep knowledge retrieval efficient and accurate.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView() {
  const [stats, setStats] = useState<{ total: number; chars: number } | null>(null)
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [statsRes, docsRes] = await Promise.all([
          fetch(`${API_BASE}/api/kb/stats`, { headers: hdrs() }),
          fetch(`${API_BASE}/api/kb`, { headers: hdrs() })
        ])
        if (statsRes.ok) {
          const d = await statsRes.json()
          setStats(d.stats)
        }
        if (docsRes.ok) {
          const d = await docsRes.json()
          setDocs(d.docs || [])
        }
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const sourceTypeData = docs.reduce((acc, doc) => {
    const type = doc.type === 'url' ? 'URLs' : doc.type === 'file' ? 'Files' : 'Text'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const maxChars = docs.length > 0 ? Math.max(...docs.map(d => d.chars)) : 1

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#fff' }}>Knowledge Dashboard</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>Overview of your knowledge base</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <Database size={32} style={{ color: '#6366f1', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{stats?.total || 0}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Total Sources</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <FileText size={32} style={{ color: '#8b5cf6', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{stats ? Math.round(stats.chars / 1000) : 0}k</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Total Characters</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <BarChart2 size={32} style={{ color: '#22c55e', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{Object.keys(sourceTypeData).length}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Source Types</div>
          </div>
        </div>

        {/* Source Type Distribution */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 20px' }}>Sources by Type</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(sourceTypeData).map(([type, count]) => (
              <div key={type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{type}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#818cf8' }}>{count}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#818cf8)', width: `${(count / Math.max(...Object.values(sourceTypeData))) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Documents */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 20px' }}>Top Documents by Size</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {docs.slice(0, 5).map(doc => (
              <div key={doc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{(doc.chars / 1000).toFixed(1)}k</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#6366f1)', width: `${(doc.chars / maxChars) * 100}%` }} />
                </div>
              </div>
            ))}
            {docs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.3)' }}>
                No documents yet. Add some sources to see your dashboard.
              </div>
            )}
          </div>
        </div>

        {/* Recent Documents */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 20px' }}>Recent Documents</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {docs.slice(0, 5).map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: doc.type === 'url' ? '#3b82f622' : '#8b5cf622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {doc.type === 'url' ? <Link size={14} style={{ color: '#3b82f6' }} /> : <FileText size={14} style={{ color: '#8b5cf6' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{doc.url || doc.type.toUpperCase()} • {(doc.chars / 1000).toFixed(1)}k chars • {new Date(doc.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
            {docs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>
                No documents yet. Add some sources to see your dashboard.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function WebApp() {
  const [view,       setView]       = useState<View>('knowledge')
  const [convs,      setConvs]      = useState<Conversation[]>(loadConvs)
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [streaming,  setStreaming]  = useState(false)
  const [prompts,    setPrompts]    = useState<Prompt[]>([])
  const [models,     setModels]     = useState<Model[]>([])
  const [model,      setModel]      = useState('')
  const [system,     setSystem]     = useState('')
  const [mobileSide, setMobileSide] = useState(false)
  const [showKbRoot, setShowKbRoot] = useState(false)
  const [kbContext, setKbContext] = useState<{ id: string; name: string; excerpt: string } | null>(null)

  const hasChatted = convs.some(c => c.messages.some(m => m.role === 'user'))

  useEffect(() => { saveConvs(convs) }, [convs])

  useEffect(() => {
    fetch(`${API_BASE}/api/prompts`, { method: 'POST', headers: hdrs() })
      .then(r => r.ok ? r.json() : null).then(d => d && setPrompts(d.prompts || [])).catch(() => {})
    fetch(`${API_BASE}/api/models`, { method: 'POST', headers: hdrs() })
      .then(r => r.ok ? r.json() : null).then(d => { if (!d) return; const av = (d.models || []).filter((m: Model) => m.isAvailable); setModels(av); if (av.length) setModel(av[0].model) }).catch(() => {})
  }, [])

  const delConv  = useCallback((id: string) => { setConvs(p => p.filter(c => c.id !== id)); setActiveId(p => p === id ? null : p) }, [])
  const newChat  = useCallback(() => { const c: Conversation = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); setView('chat'); setMobileSide(false) }, [])
  const selConv  = useCallback((id: string) => { setActiveId(id); setView('chat'); setMobileSide(false) }, [])

  const sidebar = (mobile = false, onClose?: () => void) => (
    <Sidebar view={view} setView={setView} convs={convs} activeId={activeId} onNew={newChat} onSelect={selConv} onDelete={delConv} onClose={onClose} mobile={mobile} onKb={() => setShowKbRoot(true)} />
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#080808', color: '#fff', position: 'relative' }}>

      <div className="desktop-sidebar" style={{ height: '100%', display: 'flex' }}>{sidebar()}</div>

      <AnimatePresence>
        {mobileSide && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileSide(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 280, zIndex: 51 }}>
              {sidebar(true, () => setMobileSide(false))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Mobile topbar */}
        <div className="mobile-topbar" style={{ display: 'none', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', alignItems: 'center', gap: 10, background: 'rgba(8,8,8,0.9)', flexShrink: 0 }}>
          <button onClick={() => setMobileSide(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4 }}><Menu size={18} /></button>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{view === 'home' ? 'Home' : view === 'chat' ? 'Conversations' : view === 'knowledge' ? 'Knowledge' : view === 'dashboard' ? 'Dashboard' : 'Settings'}</span>
        </div>

        {view === 'home'     && <HomeView hasChatted={hasChatted} onNewChat={newChat} setView={setView} />}
        {view === 'chat'     && <ChatView convs={convs} activeId={activeId} setActiveId={setActiveId} setConvs={setConvs} model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} prompts={prompts} streaming={streaming} setStreaming={setStreaming} kbContext={kbContext} clearKbContext={() => setKbContext(null)} />}
        {view === 'knowledge' && <KnowledgeSearchView onAskDoc={doc => { setSystem(`Use the following source to answer the next question:\n\n${doc.name}\n\n${doc.excerpt || 'No preview available.'}`); setKbContext({ id: doc.id, name: doc.name, excerpt: doc.excerpt || '' }); setView('chat') }} />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'settings' && <SettingsView model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} />}
      </div>

      <AnimatePresence>
        {showKbRoot && <KbView onClose={() => setShowKbRoot(false)} />}
      </AnimatePresence>

      <style>{`
        .desktop-sidebar { display: flex !important; }
        .mobile-topbar { display: none !important; }
      `}</style>
    </div>
  )
}
