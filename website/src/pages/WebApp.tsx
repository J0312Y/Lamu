import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, Plus, MessageSquare, Trash2,
  Settings, X, BookOpen, Home, LogOut, Mail,
  Globe, Upload, GitBranch, ChevronRight, CheckCircle,
  Menu, Database, FileText, Zap, Mic, Link,
  ChevronDown, Sparkles, Brain, Search, BarChart2,
  ShoppingBag, Building2, RefreshCw, Shield, Library,
  ThumbsUp, ThumbsDown, Share2, Copy, Check,
  TrendingUp, MessageCircle, Star, Briefcase, Scale,
  Users, Code, HeartHandshake, GraduationCap,
  Sun, Moon, Download, AlertTriangle, Crown,
  UserCircle, Paperclip, Keyboard, ExternalLink,
  ChevronUp,
} from 'lucide-react'

// All backend calls go through the Vite proxy at /lamu-api — the proxy injects
// the Authorization header server-side so no secret is exposed to the browser.
const API_BASE = '/lamu-api'
const hdrs = () => ({ 'Content-Type': 'application/json' })

type Theme = 'dark' | 'light'
const THEME_KEY = 'lamu_web_theme'
const getTheme = (): Theme => (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
const T = {
  dark: { bg: '#080808', bgAlt: '#0d0d0d', card: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#fff', textSub: 'rgba(255,255,255,0.5)', textMuted: 'rgba(255,255,255,0.35)', input: 'rgba(255,255,255,0.05)', inputBorder: 'rgba(255,255,255,0.1)', bubble: 'rgba(255,255,255,0.07)', bubbleBorder: 'rgba(255,255,255,0.08)' },
  light: { bg: '#f8f9fa', bgAlt: '#ffffff', card: 'rgba(0,0,0,0.02)', border: 'rgba(0,0,0,0.08)', text: '#1a1a2e', textSub: 'rgba(0,0,0,0.5)', textMuted: 'rgba(0,0,0,0.35)', input: 'rgba(0,0,0,0.04)', inputBorder: 'rgba(0,0,0,0.12)', bubble: 'rgba(0,0,0,0.04)', bubbleBorder: 'rgba(0,0,0,0.08)' },
}

type View = 'home' | 'chat' | 'knowledge' | 'dashboard' | 'settings' | 'widget' | 'pricing' | 'profile' | 'integrations' | 'helpdesk' | 'analytics' | 'simulation' | 'escalation' | 'team' | 'channels' | 'kb-gaps'
interface Message      { id: string; role: 'user' | 'assistant'; content: string }
interface Conversation { id: string; title: string; messages: Message[]; createdAt: number }
interface Prompt       { title: string; prompt: string }
interface Model        { model: string; name: string; isAvailable: boolean }
interface WebUser      { email: string; name: string | null; plan: string; plan_name: string; features: string[]; max_requests: number; expires_at: string | null; trial?: boolean; messages_used?: number; messages_remaining?: number }

function uid() { return Math.random().toString(36).slice(2) }
const STORE = 'lamu_web_conversations'
const TOKEN_KEY = 'lamu_web_token'
const loadConvs = (): Conversation[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
const saveConvs = (c: Conversation[]) => localStorage.setItem(STORE, JSON.stringify(c))
const titleFrom = (msgs: Message[]) => { const f = msgs.find(m => m.role === 'user'); return f ? f.content.slice(0, 48) + (f.content.length > 48 ? '…' : '') : 'New conversation' }
const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
const webHdrs = () => ({ 'Content-Type': 'application/json', 'X-Webapp-Token': getToken() })

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

function Bubble({ msg, isLast, streaming, feedback, onFeedback, onCopy }: {
  msg: Message; isLast: boolean; streaming: boolean
  feedback?: 'up' | 'down' | null; onFeedback?: (rating: 'up' | 'down' | null) => void; onCopy?: (text: string) => void
}) {
  const u = msg.role === 'user'
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)
  const isAssistant = !u && msg.content && !(isLast && streaming && !msg.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    onCopy?.(msg.content)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', gap: 12, flexDirection: u ? 'row-reverse' : 'row', padding: '2px 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: u ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(255,255,255,0.08)', border: u ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
        {u ? <User size={14} color="#fff" /> : <Bot size={14} color="rgba(255,255,255,0.8)" />}
      </div>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ padding: '10px 14px', borderRadius: u ? '18px 4px 18px 18px' : '4px 18px 18px 18px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: u ? 'linear-gradient(135deg,#6366f1,#5254cc)' : 'rgba(255,255,255,0.07)', border: u ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
          {msg.content ? msg.content : isLast && streaming ? <Dots /> : null}
          {isLast && streaming && msg.content && <span style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><Dots /></span>}
        </div>
        {isAssistant && (hover || feedback) && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 4 }}>
            {([['up', ThumbsUp], ['down', ThumbsDown]] as const).map(([r, Icon]) => (
              <button key={r} onClick={() => onFeedback?.(feedback === r ? null : r)}
                style={{ background: feedback === r ? (r === 'up' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}>
                <Icon size={13} style={{ color: feedback === r ? (r === 'up' ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.25)' }} />
              </button>
            ))}
            <button onClick={handleCopy}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', marginLeft: 2 }}>
              {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} style={{ color: 'rgba(255,255,255,0.25)' }} />}
            </button>
          </div>
        )}
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
  const [chatSearch, setChatSearch] = useState('')

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
        {navBtn('integrations', 'Integrations', GitBranch)}
        {navBtn('helpdesk', 'Helpdesk AI', Bot)}
        {navBtn('analytics', 'Analytics', TrendingUp)}
        {navBtn('simulation', 'Simulation', Zap)}
        {navBtn('escalation', 'Escalation', AlertTriangle)}
        {navBtn('channels', 'Channels', Globe)}
        {navBtn('kb-gaps', 'KB Gaps', Library)}
        {navBtn('team', 'Team', Users)}
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
              {convs.length > 3 && (
                <div style={{ padding: '4px 0 6px' }}>
                  <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats..." style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '5px 8px', color: '#fff', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ maxHeight: 180, overflowY: 'auto', paddingBottom: 8 }}>
                {convs.length === 0
                  ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', padding: '8px 10px' }}>No conversations yet</p>
                  : [...convs].filter(c => !chatSearch || c.title.toLowerCase().includes(chatSearch.toLowerCase()) || c.messages.some(m => m.content.toLowerCase().includes(chatSearch.toLowerCase()))).sort((a, b) => b.createdAt - a.createdAt).map(c => (
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
        {navBtn('widget', 'Widget', Code, true)}
        {navBtn('dashboard', 'Dashboard', BarChart2, true)}
        {navBtn('pricing', 'Pricing', Crown, true)}
        {navBtn('profile', 'Profile', UserCircle, true)}
        {navBtn('settings', 'Settings', Settings, true)}
      </div>
    </div>
  )
}

// ── KB types ──────────────────────────────────────────────────────────────────

interface KbDoc { id: string; type: string; name: string; url?: string; chars: number; createdAt: number; content?: string; excerpt?: string }

// ── Source connection modal ────────────────────────────────────────────────────

type SourceKey = 'url' | 'pdf' | 'text' | 'crawl' | 'github' | 'notion' | 'gdrive' | 'confluence' | 'jira' | 'shopify' | 'salesforce' | 'sharepoint'

const NATIVE_SOURCES: SourceKey[] = ['url', 'pdf', 'text', 'crawl']

function SourceModal({ srcKey, onClose, onAdded, trialLimitReached }: { srcKey: SourceKey; onClose: () => void; onAdded: (doc: KbDoc) => void; trialLimitReached?: boolean }) {
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
        const r = await fetch(`${API_BASE}/api/kb/url`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ url: url.trim() }) })
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
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name: file.name, content: base64, type: 'file' }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed')
        onAdded(d.doc)
      } else if (srcKey === 'crawl') {
        if (!url.trim()) { setError('Please enter a URL to crawl'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/crawl`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ url: url.trim(), max_pages: 10 }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Crawl failed')
        if (d.docs?.length > 0) onAdded(d.docs[0])
        else throw new Error('No pages found to crawl')
      } else if (srcKey === 'text') {
        if (!name.trim() || !text.trim()) { setError('Please fill in name and content'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name: name.trim(), content: btoa(unescape(encodeURIComponent(text))), type: 'text' }) })
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
    crawl:      { label: 'Crawl Website',  icon: RefreshCw,   color: '#14b8a6' },
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
              {srcKey === 'crawl' && (
                <>
                  {inp('Website URL to crawl', url, setUrl, 'https://docs.example.com', 'url')}
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.6 }}>
                    <RefreshCw size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Lamu will crawl up to 10 pages from this domain and index their content automatically.
                  </div>
                </>
              )}
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

              {trialLimitReached ? (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <p style={{ fontSize: 13, color: '#fbbf24', marginBottom: 14 }}>Limite atteinte — le Free Trial est limité à 1 document.</p>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Passer à un plan payant
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submit} disabled={loading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                    {loading ? <><Spinner /> Adding…</> : 'Add to knowledge base'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon size={24} style={{ color: meta.color }} />
              </div>
              {trialLimitReached ? (
                <>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 20 }}>
                    Les intégrations comme <strong style={{ color: '#fff' }}>{meta.label}</strong> nécessitent un plan payant.
                  </p>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Passer à un plan payant
                  </a>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 20 }}>
                    <strong style={{ color: '#fff' }}>{meta.label}</strong> integration is available in the <strong style={{ color: '#fff' }}>Lamu desktop app</strong>.<br />
                    Download the app to connect {meta.label} and sync your knowledge automatically.
                  </p>
                  <a href="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#fff', color: '#000', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Download Lamu
                  </a>
                </>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── KB management view ─────────────────────────────────────────────────────────

function KbView({ onClose, isTrial }: { onClose: () => void; isTrial?: boolean }) {
  const [docs,          setDocs]          = useState<KbDoc[]>([])
  const [loading,       setLoading]       = useState(true)
  const [srcKey,        setSrcKey]        = useState<SourceKey | null>(null)
  const [search,        setSearch]        = useState('')
  const [selectedDoc,   setSelectedDoc]   = useState<KbDoc | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/kb`, { headers: webHdrs() })
      if (r.ok) { const d = await r.json(); setDocs(d.docs || []) }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: string) => {
    await fetch(`${API_BASE}/api/kb/${id}`, { method: 'DELETE', headers: webHdrs() })
    setDocs(prev => prev.filter(d => d.id !== id))
    if (selectedDoc?.id === id) setSelectedDoc(null)
  }

  const loadDocPreview = async (id: string) => {
    if (selectedDoc?.id === id) return
    setPreviewLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(id)}`, { headers: webHdrs() })
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
        <SourceModal srcKey={srcKey} onClose={() => setSrcKey(null)} onAdded={doc => { setDocs(prev => [...prev, doc]); setSrcKey(null) }} trialLimitReached={isTrial && docs.length >= 1} />
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
  { icon: Globe,       label: 'Website',     sub: 'Index a single page',     color: '#3b82f6' },
  { icon: RefreshCw,   label: 'Crawl Site',  sub: 'Crawl entire website',    color: '#14b8a6' },
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
  'Website': 'url', 'Crawl Site': 'crawl', 'Upload PDF': 'pdf', 'Notion': 'text',
  'GitHub': 'github', 'Google Drive': 'gdrive', 'Confluence': 'confluence',
  'Jira': 'jira', 'Shopify': 'shopify', 'Salesforce': 'salesforce', 'SharePoint': 'sharepoint',
}

function HomeView({ hasChatted, onNewChat, setView, isTrial, userName }: { hasChatted: boolean; onNewChat: () => void; setView: (v: View) => void; isTrial?: boolean; userName?: string | null }) {
  const [s1, setS1] = useState(true)
  const [s3, setS3] = useState(false)
  const [srcKey, setSrcKey] = useState<SourceKey | null>(null)
  const [showKb, setShowKb] = useState(false)
  const [docCount, setDocCount] = useState(0)
  const done = [false, hasChatted, false]

  useEffect(() => {
    if (!isTrial) return
    fetch(`${API_BASE}/api/kb`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : { docs: [] })
      .then(d => setDocCount((d.docs || []).length))
      .catch(() => {})
  }, [isTrial])
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
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', color: '#fff' }}>{userName ? `Bienvenue, ${userName}!` : 'Get Lamu ready'}</h2>
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
        {srcKey && <SourceModal srcKey={srcKey} onClose={() => setSrcKey(null)} onAdded={() => { setDocCount(c => c + 1); setSrcKey(null) }} trialLimitReached={isTrial && docCount >= 1} />}
        {showKb && <KbView onClose={() => setShowKb(false)} isTrial={isTrial} />}
      </AnimatePresence>
    </div>
  )
}

// ── Chat view ──────────────────────────────────────────────────────────────────

function ChatView({ convs, activeId, setActiveId, setConvs, model, models, setModel, system, setSystem, prompts, streaming, setStreaming, kbContext, clearKbContext, userName, onMessageSent }: {
  convs: Conversation[]; activeId: string | null
  setActiveId: (id: string | null) => void
  setConvs: React.Dispatch<React.SetStateAction<Conversation[]>>
  model: string; models: Model[]; setModel: (m: string) => void
  system: string; setSystem: (s: string) => void
  prompts: Prompt[]; streaming: boolean; setStreaming: (b: boolean) => void
  kbContext: { id: string; name: string; excerpt: string } | null
  clearKbContext: () => void
  userName: string | null
  onMessageSent?: () => void
}) {
  const [input,       setInput]       = useState('')
  const [error,       setError]       = useState('')
  const [showCfg,     setShowCfg]     = useState(false)
  const [showPrompts, setShowPrompts] = useState(false)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({})
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [agents, setAgents] = useState<{ id: string; name: string; system_prompt: string }[]>([])
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [showAgents, setShowAgents] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const msgs = convs.find(c => c.id === activeId)?.messages ?? []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Load available agents
  useEffect(() => {
    fetch(`${API_BASE}/api/webapp/agents`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : { agents: [] })
      .then(d => setAgents(d.agents || []))
      .catch(() => {})
  }, [])

  // Load feedback when conversation changes
  useEffect(() => {
    if (!activeId) { setFeedbackMap({}); return }
    fetch(`${API_BASE}/api/webapp/feedback/${activeId}`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : { feedback: {} })
      .then(d => setFeedbackMap(d.feedback || {}))
      .catch(() => setFeedbackMap({}))
  }, [activeId])

  const handleFeedback = useCallback((msgId: string, rating: 'up' | 'down' | null) => {
    if (!activeId) return
    if (rating === null) {
      setFeedbackMap(p => { const n = { ...p }; delete n[msgId]; return n })
      fetch(`${API_BASE}/api/webapp/feedback/${msgId}`, { method: 'DELETE', headers: webHdrs() }).catch(() => {})
    } else {
      setFeedbackMap(p => ({ ...p, [msgId]: rating }))
      fetch(`${API_BASE}/api/webapp/feedback`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ message_id: msgId, conversation_id: activeId, rating }) }).catch(() => {})
    }
  }, [activeId])

  const newChat = useCallback(() => {
    const c: Conversation = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now() }
    setConvs(p => [...p, c]); setActiveId(c.id); setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [setConvs, setActiveId])

  const send = useCallback(async () => {
    const text = input.trim(); if (!text || streaming) return
    const currentFile = attachedFile
    setInput(''); setError(''); setSuggestions([]); setAttachedFile(null)
    let convId = activeId
    if (!convId) { const c: Conversation = { id: uid(), title: text.slice(0, 48), messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); convId = c.id }
    const displayText = currentFile ? `${text}\n📎 ${currentFile.name}` : text
    const uMsg: Message = { id: uid(), role: 'user',      content: displayText }
    const aMsg: Message = { id: uid(), role: 'assistant', content: '' }
    setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: [...c.messages, uMsg, aMsg] }))
    setStreaming(true); abortRef.current = new AbortController()
    try {
        const prev = convs.find(c => c.id === convId)?.messages ?? []
      const apiText = currentFile ? `${text}\n\n[Attached file: ${currentFile.name}]\n${currentFile.content}` : text
      const body: any = { messages: [...prev.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: apiText }], model: model || undefined, system: system || undefined, userName: userName || undefined }
      if (kbContext?.id) body.kbIds = [kbContext.id]
      const resp = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(body), signal: abortRef.current.signal })
      if (!resp.ok || !resp.body) {
        const e = await resp.json().catch(() => ({ error: 'Request failed' }))
        if (e.trial_exhausted) throw new Error(e.error + '\n\n[TRIAL_EXHAUSTED]')
        throw new Error(e.error || `Server error ${resp.status}`)
      }
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
      onMessageSent?.()
      // Fetch follow-up suggestions
      const recentMsgs = [...prev.map(m => ({ role: m.role, content: m.content })).slice(-3), { role: 'user' as const, content: text }]
      fetch(`${API_BASE}/api/webapp/suggestions`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ messages: recentMsgs }) })
        .then(r => r.ok ? r.json() : { suggestions: [] })
        .then(d => setSuggestions(d.suggestions || []))
        .catch(() => {})
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Something went wrong. Check the server is running.')
      setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: c.messages.filter((m, i) => !(i === c.messages.length - 1 && m.role === 'assistant' && !m.content)) }))
    } finally { setStreaming(false) }
  }, [input, activeId, convs, model, system, streaming, setConvs, setActiveId, setStreaming, kbContext, attachedFile])

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
        {agents.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAgents(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: activeAgent ? 'rgba(20,184,166,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${activeAgent ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '5px 10px', color: activeAgent ? '#5eead4' : 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>
              <Users size={11} /> {activeAgent ? agents.find(a => a.id === activeAgent)?.name || 'Agent' : 'Agents'}
              <ChevronDown size={11} style={{ opacity: 0.5 }} />
            </button>
            <AnimatePresence>
              {showAgents && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  style={{ position: 'absolute', top: '110%', left: 0, width: 220, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 6, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  <button onClick={() => { setActiveAgent(null); setSystem(''); setShowAgents(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, background: !activeAgent ? 'rgba(255,255,255,0.07)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: !activeAgent ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                    Default (Lamu)
                  </button>
                  {agents.map(a => (
                    <button key={a.id} onClick={() => { setActiveAgent(a.id); setSystem(a.system_prompt || ''); setShowAgents(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, background: activeAgent === a.id ? 'rgba(20,184,166,0.12)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: activeAgent === a.id ? '#5eead4' : 'rgba(255,255,255,0.6)' }}
                      onMouseEnter={e => { if (activeAgent !== a.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (activeAgent !== a.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                      {a.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {activeId && msgs.length > 0 && (
          <button onClick={async () => {
            const r = await fetch(`${API_BASE}/api/webapp/share`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ conversation_id: activeId }) })
            const d = await r.json()
            if (d.share_id) {
              const url = `${window.location.origin}/shared/${d.share_id}`
              navigator.clipboard.writeText(url)
              setError('Link copied! ' + url)
              setTimeout(() => setError(''), 3000)
            }
          }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>
            <Share2 size={12} /> Share
          </button>
        )}
        {activeId && msgs.length > 0 && (
          <button onClick={() => {
            const conv = convs.find(c => c.id === activeId)
            if (!conv) return
            const md = `# ${conv.title}\n\n*Exported from Lamu AI — ${new Date().toLocaleDateString()}*\n\n---\n\n${conv.messages.map(m => `### ${m.role === 'user' ? 'You' : 'Lamu'}\n\n${m.content}\n`).join('\n---\n\n')}`
            const blob = new Blob([md], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `${conv.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').slice(0, 50)}.md`; a.click(); URL.revokeObjectURL(url)
          }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>
            <Download size={12} /> Export
          </button>
        )}
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
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px', color: '#fff' }}>{userName ? `Bonjour ${userName} !` : 'How can I help?'}</h2>
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
          ) : msgs.map((m, i) => <Bubble key={m.id} msg={m} isLast={i === msgs.length - 1 && m.role === 'assistant'} streaming={streaming} feedback={feedbackMap[m.id] || null} onFeedback={r => handleFeedback(m.id, r)} />)}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>
              <div style={{ flex: 1 }}>{error}</div>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6 }}><X size={14} /></button>
            </motion.div>
          )}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* Suggested replies */}
      {suggestions.length > 0 && !streaming && (
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { setInput(s); setSuggestions([]); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.25)' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '12px 20px 20px', background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {attachedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 12, color: '#a5b4fc' }}>
              <Paperclip size={11} /> {attachedFile.name} <span style={{ color: 'rgba(255,255,255,0.3)' }}>({(attachedFile.content.length / 1000).toFixed(1)}k chars)</span>
              <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto', padding: 2 }}><X size={11} /></button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '10px 12px', transition: 'border-color 0.2s' }}
            onFocusCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlurCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.1)')}>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.csv,.json,.js,.ts,.py,.html,.css,.xml,.log,.docx" style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
                const isPdf = file.name.toLowerCase().endsWith('.pdf')
                const isDocx = file.name.toLowerCase().endsWith('.docx')
                if (isPdf || isDocx) {
                  // Send binary files to backend for text extraction
                  const base64 = await new Promise<string>((res, rej) => {
                    const r = new FileReader(); r.onload = ev => res((ev.target?.result as string).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file)
                  })
                  try {
                    const resp = await fetch(`${API_BASE}/api/kb/extract-text`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name: file.name, content: base64 }) })
                    const d = await resp.json()
                    if (d.text) setAttachedFile({ name: file.name, content: d.text.slice(0, 12000) })
                    else setAttachedFile({ name: file.name, content: '[Failed to extract text from file]' })
                  } catch { setAttachedFile({ name: file.name, content: '[Failed to extract text from file]' }) }
                } else {
                  const reader = new FileReader(); reader.onload = ev => setAttachedFile({ name: file.name, content: (ev.target?.result as string || '').slice(0, 12000) }); reader.readAsText(file)
                }
              }} />
            <button onClick={() => fileInputRef.current?.click()} title="Attach file"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachedFile ? '#818cf8' : 'rgba(255,255,255,0.3)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Paperclip size={16} />
            </button>
            <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={onKey} placeholder="Message Lamu… (Enter ↵ to send)" disabled={streaming} rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, lineHeight: 1.55, resize: 'none', maxHeight: 140, overflowY: 'auto', fontFamily: 'inherit', opacity: streaming ? 0.7 : 1 }} />
            <button onClick={send} disabled={!input.trim() || streaming} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: !input.trim() || streaming ? 'rgba(99,102,241,0.3)' : '#6366f1', transition: 'all 0.2s' }}>
              {streaming ? <Spinner /> : <Send size={15} color="#fff" />}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>Shift+Enter for new line · 📎 Attach files · Conversations saved locally</p>
        </div>
      </div>
    </div>
  )
}

// ── Settings view ──────────────────────────────────────────────────────────────

// ── Widget management view ───────────────────────────────────────────────────

interface WidgetAgent { id: string; name: string; system_prompt: string; welcome_message: string; color: string; allowed_origins: string; created_at: string }

function WidgetView() {
  const [agents, setAgents] = useState<WidgetAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<WidgetAgent | null>(null)
  const [form, setForm] = useState({ name: '', system_prompt: '', welcome_message: '', color: '#6366f1', allowed_origins: '' })
  const [copied, setCopied] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/webapp/agents`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : { agents: [] })
      .then(d => setAgents(d.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    const method = editing?.id ? 'PUT' : 'POST'
    const url = editing?.id ? `${API_BASE}/api/webapp/agents/${editing.id}` : `${API_BASE}/api/webapp/agents`
    const r = await fetch(url, { method, headers: webHdrs(), body: JSON.stringify(form) })
    const d = await r.json()
    if (d.ok || d.id) {
      const refreshed = await fetch(`${API_BASE}/api/webapp/agents`, { headers: webHdrs() }).then(r => r.json())
      setAgents(refreshed.agents || [])
      setEditing(null)
    }
  }

  const del = async (id: string) => {
    await fetch(`${API_BASE}/api/webapp/agents/${id}`, { method: 'DELETE', headers: webHdrs() })
    setAgents(p => p.filter(a => a.id !== id))
  }

  const openEdit = (agent?: WidgetAgent) => {
    if (agent) {
      setForm({ name: agent.name, system_prompt: agent.system_prompt, welcome_message: agent.welcome_message, color: agent.color, allowed_origins: agent.allowed_origins })
      setEditing(agent)
    } else {
      setForm({ name: '', system_prompt: '', welcome_message: 'Bonjour ! Comment puis-je vous aider ?', color: '#6366f1', allowed_origins: '' })
      setEditing({} as WidgetAgent)
    }
  }

  const getSnippet = (agent: WidgetAgent) =>
    `<script src="${window.location.origin}/widget.js" data-agent="${agent.id}"${agent.color !== '#6366f1' ? ` data-color="${agent.color}"` : ''}${agent.welcome_message ? ` data-welcome="${agent.welcome_message.replace(/"/g, '&quot;')}"` : ''}></script>`

  const copySnippet = (agent: WidgetAgent) => {
    navigator.clipboard.writeText(getSnippet(agent))
    setCopied(agent.id)
    setTimeout(() => setCopied(''), 2000)
  }

  const cardStyle: React.CSSProperties = { padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8, display: 'block' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: '#fff', margin: 0 }}>Widget Agents</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>Embed an AI chatbot on your website</p>
          </div>
          <button onClick={() => openEdit()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Agent
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>Loading...</div>}

        {!loading && agents.length === 0 && !editing && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 20px' }}>
            <Code size={36} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>No agents yet</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>Create your first widget agent and embed it on your website.</p>
            <button onClick={() => openEdit()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Create Agent</button>
          </div>
        )}

        {/* Agent list */}
        {agents.map(agent => (
          <div key={agent.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#fff' }}>{agent.name}</div>
              <button onClick={() => openEdit(agent)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => del(agent.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Delete</button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>ID: {agent.id}</div>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: '#a5b4fc', wordBreak: 'break-all', lineHeight: 1.6, position: 'relative' }}>
              {getSnippet(agent)}
              <button onClick={() => copySnippet(agent)} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: copied === agent.id ? '#4ade80' : 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                {copied === agent.id ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>
        ))}

        {/* Edit/Create form */}
        <AnimatePresence>
          {editing && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              style={{ ...cardStyle, borderColor: 'rgba(99,102,241,0.3)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>{editing.id ? 'Edit Agent' : 'New Agent'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Agent Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Support Agent" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>System Prompt</label>
                  <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={3} placeholder="You are a customer support agent for..." style={{ ...inputStyle, resize: 'vertical' as const }} />
                </div>
                <div>
                  <label style={labelStyle}>Welcome Message</label>
                  <input value={form.welcome_message} onChange={e => setForm(f => ({ ...f, welcome_message: e.target.value }))} placeholder="Bonjour ! Comment puis-je vous aider ?" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Color</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
                      <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                    </div>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Allowed Origins (comma-separated, empty = all)</label>
                    <input value={form.allowed_origins} onChange={e => setForm(f => ({ ...f, allowed_origins: e.target.value }))} placeholder="example.com, mysite.com" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Agent</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const INDUSTRY_TEMPLATES = [
  { icon: HeartHandshake, label: 'Support Client', color: '#22c55e', prompt: `Tu es un agent de support client professionnel et empathique. Tu aides les utilisateurs avec leurs questions sur les produits et services. Tu es patient, clair et tu proposes toujours des solutions concretes. Si tu ne connais pas la reponse, oriente vers le support humain.` },
  { icon: ShoppingBag, label: 'E-commerce', color: '#f59e0b', prompt: `Tu es un assistant e-commerce expert. Tu aides les clients a trouver les bons produits, tu reponds aux questions sur les commandes, livraisons et retours. Tu fais des recommandations personnalisees basees sur les besoins du client. Sois enthousiaste mais professionnel.` },
  { icon: Scale, label: 'Juridique', color: '#8b5cf6', prompt: `Tu es un assistant juridique. Tu aides a comprendre les documents legaux, contrats et procedures. Tu donnes des explications claires en langage simple. Important: tu rappelles toujours que tes reponses sont informatives et ne remplacent pas un avis juridique professionnel.` },
  { icon: Users, label: 'Ressources Humaines', color: '#ec4899', prompt: `Tu es un assistant RH. Tu aides avec les questions sur les politiques internes, les processus de recrutement, les avantages sociaux et le developpement de carriere. Tu es bienveillant, confidentiel et oriente solutions.` },
  { icon: Code, label: 'Support Technique', color: '#3b82f6', prompt: `Tu es un assistant technique expert. Tu aides les utilisateurs a resoudre des problemes techniques, tu guides pas a pas avec des instructions claires. Tu diagnostiques les problemes methodiquement et tu proposes des solutions du plus simple au plus complexe.` },
  { icon: GraduationCap, label: 'Education', color: '#14b8a6', prompt: `Tu es un tuteur pedagogique patient et encourageant. Tu expliques les concepts de maniere progressive, tu utilises des analogies et des exemples concrets. Tu poses des questions pour verifier la comprehension et tu adaptes ton niveau au besoin de l'apprenant.` },
  { icon: Building2, label: 'Immobilier', color: '#f97316', prompt: `Tu es un assistant immobilier. Tu aides les clients a trouver des biens, tu reponds aux questions sur les prix, les quartiers, les procedures d'achat/location. Tu connais bien le marche et tu donnes des conseils pratiques.` },
  { icon: Briefcase, label: 'Business & Sales', color: '#6366f1', prompt: `Tu es un assistant commercial et business. Tu aides a qualifier les prospects, tu reponds aux questions sur les offres et tu guides vers la meilleure solution. Tu es persuasif mais honnete, et tu cherches toujours a creer de la valeur pour le client.` },
]

function SettingsView({ model, models, setModel, system, setSystem }: { model: string; models: Model[]; setModel: (m: string) => void; system: string; setSystem: (s: string) => void }) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  const applyTemplate = (t: typeof INDUSTRY_TEMPLATES[0]) => {
    setSystem(t.prompt)
    setActiveTemplate(t.label)
  }

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

        {/* Industry Templates */}
        <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Quick Templates</div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 14px' }}>Pick a template to pre-configure your agent for a specific use case.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {INDUSTRY_TEMPLATES.map(t => {
              const Icon = t.icon
              const isActive = activeTemplate === t.label
              return (
                <button key={t.label} onClick={() => applyTemplate(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${isActive ? t.color + '55' : 'rgba(255,255,255,0.08)'}`, background: isActive ? t.color + '15' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = t.color + '33' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <Icon size={16} style={{ color: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? t.color : 'rgba(255,255,255,0.7)' }}>{t.label}</span>
                  {isActive && <Check size={12} style={{ color: t.color, marginLeft: 'auto' }} />}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Custom System Prompt</div>
          <textarea value={system} onChange={e => { setSystem(e.target.value); setActiveTemplate(null) }} rows={4} placeholder="You are a helpful AI assistant…" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
          {system && (
            <button onClick={() => { setSystem(''); setActiveTemplate(null) }} style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear prompt
            </button>
          )}
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
  const [aiAnswer, setAiAnswer] = useState('')
  const [isAiAnswering, setIsAiAnswering] = useState(false)
  const aiAbortRef = useRef<AbortController | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/kb/stats`, { headers: webHdrs() })
      if (!r.ok) return
      const d = await r.json()
      setStats(d.stats || null)
    } catch {
      setStats(null)
    }
  }, [])

  const askAiFromResults = useCallback(async (question: string, docs: KbDoc[]) => {
    if (!question.trim()) return
    if (aiAbortRef.current) aiAbortRef.current.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller
    setAiAnswer('')
    setIsAiAnswering(true)
    try {
      let systemPrompt = 'Answer the user\'s question using the knowledge base documents. Cite sources by name in brackets [Document Name]. If no document contains relevant information, say so.'
      if (docs.length > 0) {
        const context = docs.map((d: any, i: number) => `[${i + 1}] ${d.name}:\n${d.chunk_content || d.excerpt || ''}`).join('\n\n')
        systemPrompt += `\n\nMost relevant documents found:\n${context}`
      }
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST', headers: webHdrs(), signal: controller.signal,
        body: JSON.stringify({ messages: [{ role: 'user', content: question }], system: systemPrompt })
      })
      if (!resp.ok || !resp.body) {
        const errBody = await resp.json().catch(() => ({}))
        console.error('[KB AI] response error', resp.status, errBody)
        throw new Error(errBody.error || 'AI request failed')
      }
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
            if (j.error) { setAiAnswer(j.error); return }
            if (j.delta) setAiAnswer(prev => prev + j.delta)
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('[KB AI] error:', e)
      setAiAnswer(e instanceof Error ? e.message : 'Failed to generate AI answer.')
    } finally {
      setIsAiAnswering(false)
    }
  }, [])

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    setAiAnswer('')
    try {
      const r = await fetch(`${API_BASE}/api/kb/search?q=${encodeURIComponent(q)}`, { headers: webHdrs() })
      if (!r.ok) { throw new Error('Search failed') }
      const d = await r.json()
      const docs = d.docs || []
      setResults(docs)
      setSelectedDoc(docs[0] || null)
      // Call AI even with no SQL results — the backend injects all KB docs as context
      if (q.trim()) askAiFromResults(q, docs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
      setSelectedDoc(null)
    } finally {
      setLoading(false)
    }
  }, [askAiFromResults])

  const summarizeDoc = useCallback(async (id: string) => {
    setSummarizing(true)
    setSummary('')
    try {
      const r = await fetch(`${API_BASE}/api/kb/summarize`, {
        method: 'POST',
        headers: webHdrs(),
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(doc as any).similarity != null && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600 }}>{Math.round((doc as any).similarity * 100)}%</span>}
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{(doc.chars / 1000).toFixed(1)}k</span>
                    </div>
                  </div>
                  {doc.excerpt ? <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.7 }}>{doc.excerpt}</p> : null}
                </div>
              ))}
            </div>
          </div>

          {(aiAnswer || isAiAnswering) && (
            <div style={{ borderRadius: 18, padding: '20px 24px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Brain size={16} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#dbeafe' }}>AI Answer</span>
                {isAiAnswering && <Spinner />}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiAnswer || 'Thinking…'}</div>
            </div>
          )}
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
  const [analytics, setAnalytics] = useState<{ daily: { date: string; count: number }[]; total_conversations: number; total_messages: number; feedback: { up: number; down: number }; satisfaction_rate: number | null; recent_questions: string[] } | null>(null)
  const [widgetHistory, setWidgetHistory] = useState<{ id: string; agent_name: string; messages: Message[]; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [statsRes, docsRes, analyticsRes, widgetRes] = await Promise.all([
          fetch(`${API_BASE}/api/kb/stats`, { headers: webHdrs() }),
          fetch(`${API_BASE}/api/kb`, { headers: webHdrs() }),
          fetch(`${API_BASE}/api/webapp/analytics`, { headers: webHdrs() }),
          fetch(`${API_BASE}/api/webapp/widget-history`, { headers: webHdrs() }),
        ])
        if (statsRes.ok) { const d = await statsRes.json(); setStats(d.stats) }
        if (docsRes.ok) { const d = await docsRes.json(); setDocs(d.docs || []) }
        if (analyticsRes.ok) { const d = await analyticsRes.json(); setAnalytics(d) }
        if (widgetRes.ok) { const d = await widgetRes.json(); setWidgetHistory(d.conversations || []) }
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
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#fff' }}>Dashboard</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>Activity overview and analytics</p>
        </div>

        {/* Chat Analytics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
          {[
            { icon: MessageCircle, color: '#6366f1', value: analytics?.total_messages || 0, label: 'Total Messages' },
            { icon: MessageSquare, color: '#8b5cf6', value: analytics?.total_conversations || 0, label: 'Conversations' },
            { icon: ThumbsUp, color: '#22c55e', value: analytics?.feedback?.up || 0, label: 'Positive Feedback' },
            { icon: ThumbsDown, color: '#ef4444', value: analytics?.feedback?.down || 0, label: 'Negative Feedback' },
            { icon: Star, color: '#f59e0b', value: analytics?.satisfaction_rate != null ? `${analytics.satisfaction_rate}%` : '—', label: 'Satisfaction' },
            { icon: Database, color: '#3b82f6', value: stats?.total || 0, label: 'KB Sources' },
          ].map((card, i) => {
            const Icon = card.icon
            return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px', textAlign: 'center' }}>
                <Icon size={24} style={{ color: card.color, margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{card.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{card.label}</div>
              </div>
            )
          })}
        </div>

        {/* Messages per day chart */}
        {analytics?.daily && analytics.daily.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 20px' }}>Messages per Day (30 days)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
              {analytics.daily.map((d, i) => {
                const max = Math.max(...analytics.daily.map(x => x.count))
                const h = max > 0 ? (d.count / max) * 100 : 0
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${d.count} messages`}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{d.count || ''}</div>
                    <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(h, 3)}%`, background: 'linear-gradient(180deg, #6366f1, #4f46e5)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    {i % 5 === 0 && <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{d.date.slice(5)}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Questions */}
        {analytics?.recent_questions && analytics.recent_questions.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>Recent Questions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analytics.recent_questions.map((q, i) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MessageCircle size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
                  {q}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Widget Chat History */}
        {widgetHistory.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>Widget Conversations</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {widgetHistory.slice(0, 10).map(wc => {
                const firstUserMsg = (wc.messages || []).find((m: Message) => m.role === 'user')
                return (
                  <div key={wc.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Code size={14} style={{ color: '#14b8a6', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {firstUserMsg?.content || 'No message'}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                        {wc.agent_name || 'Default Agent'} · {(wc.messages || []).length} msgs · {new Date(wc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* KB Stats Cards */}
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

// ── Pricing view ──────────────────────────────────────────────────────────────

interface DbPlan { id: string; name: string; description: string; price: number; currency: string; billing_period: string; max_requests: number; features: string[]; color: string }

function PricingView({ currentPlan, onUpgrade }: { currentPlan?: string; onUpgrade?: () => void }) {
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/plans`)
      .then(r => r.ok ? r.json() : { plans: [] })
      .then(d => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const PLAN_COLORS = ['#22c55e', '#6366f1', '#8b5cf6', '#f59e0b', '#ec4899']
  const formatFeature = (f: string) => f.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px 48px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.5px' }}>Choisissez votre plan</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Adaptez Lamu AI à vos besoins</p>
        </div>
        {plans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Aucun plan configuré. Configurez vos plans dans l'admin SaaS.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`, gap: 18 }}>
            {plans.map((plan, idx) => {
              const color = plan.color || PLAN_COLORS[idx % PLAN_COLORS.length]
              const isCurrent = currentPlan === String(plan.id) || currentPlan === plan.name.toLowerCase().replace(/\s+/g, '_')
              const isPopular = idx === Math.floor(plans.length / 2)
              const priceDisplay = plan.price <= 0 ? 'Gratuit' : `${plan.price.toLocaleString()} ${plan.currency || 'XAF'}`
              return (
                <div key={plan.id} style={{ position: 'relative', borderRadius: 16, border: `1px solid ${isPopular ? color + '55' : 'rgba(255,255,255,0.08)'}`, background: isPopular ? color + '08' : 'rgba(255,255,255,0.03)', padding: '28px 22px', display: 'flex', flexDirection: 'column' }}>
                  {isPopular && (
                    <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 20, background: color, color: '#fff', fontSize: 11, fontWeight: 700 }}>Populaire</div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 6 }}>{plan.name}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                    {priceDisplay}
                  </div>
                  {plan.billing_period && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>/ {plan.billing_period}</div>}
                  {plan.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 16px', lineHeight: 1.5 }}>{plan.description}</p>}
                  {plan.max_requests > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                      <CheckCircle size={14} style={{ color, flexShrink: 0 }} /> {plan.max_requests.toLocaleString()} requêtes
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                    {(plan.features || []).map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        <CheckCircle size={14} style={{ color, flexShrink: 0 }} /> {formatFeature(f)}
                      </div>
                    ))}
                  </div>
                  <button onClick={isCurrent ? undefined : onUpgrade}
                    style={{ width: '100%', padding: '11px', borderRadius: 10, border: isCurrent ? `1px solid ${color}44` : 'none', background: isCurrent ? 'transparent' : isPopular ? color : 'rgba(255,255,255,0.08)', color: isCurrent ? color : '#fff', fontSize: 13, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer', opacity: isCurrent ? 0.7 : 1 }}>
                    {isCurrent ? 'Plan actuel' : 'Choisir ce plan'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 32, padding: '20px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            Tous les plans incluent le chiffrement de bout en bout et un support dédié.
            <br />Questions ? <a href="/contact" style={{ color: '#818cf8', textDecoration: 'none' }}>Contactez notre équipe</a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Profile view ──────────────────────────────────────────────────────────────

function ProfileView({ user, onLogout, setView }: { user: WebUser; onLogout: () => void; setView: (v: View) => void }) {
  const [convCount, setConvCount] = useState(0)
  const [msgCount, setMsgCount] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE}/api/webapp/analytics`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setConvCount(d.total_conversations || 0); setMsgCount(d.total_messages || 0) } })
      .catch(() => {})
  }, [])

  const infoRow = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || '#fff' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(99,102,241,0.25)' }}>
            <UserCircle size={36} color="#fff" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{user.name || user.email.split('@')[0]}</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{user.email}</p>
        </div>

        <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 20px', marginBottom: 20 }}>
          {infoRow('Plan', user.plan_name, user.trial ? '#4ade80' : '#818cf8')}
          {infoRow('Max requests', user.trial ? `${user.max_requests} (trial)` : 'Unlimited')}
          {user.trial && infoRow('Messages used', `${user.messages_used ?? 0} / ${user.max_requests}`, (user.messages_remaining ?? 0) <= 3 ? '#fbbf24' : undefined)}
          {user.trial && infoRow('Messages remaining', `${user.messages_remaining ?? 0}`, (user.messages_remaining ?? 0) <= 3 ? '#f87171' : '#4ade80')}
          {user.expires_at && infoRow('Expires', new Date(user.expires_at).toLocaleDateString())}
        </div>

        <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 20px', marginBottom: 20 }}>
          {infoRow('Total conversations', String(convCount))}
          {infoRow('Total messages sent', String(msgCount))}
          <div style={{ padding: '12px 0' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Features</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {(user.features?.length ? user.features : ['chat', 'knowledge_base']).map(f => (
                <span key={f} style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontSize: 11, fontWeight: 600 }}>{f.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        </div>

        {user.trial && (
          <button onClick={() => setView('pricing')}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
            <Crown size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Upgrade to Pro
          </button>
        )}

        <button onClick={onLogout}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <LogOut size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Sign out
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

const cardStyle = { borderRadius: 18, padding: '24px 28px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' } as const
const btnPrimary = { padding: '10px 20px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 } as const
const btnSecondary = { padding: '10px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', cursor: 'pointer', fontSize: 13 } as const
const inputStyle = { width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '10px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
const badgeStyle = (color: string) => ({ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${color}20`, color })
const viewWrap = { flex: 1, overflowY: 'auto' as const, padding: '28px 24px 48px' }
const viewInner = { maxWidth: 1000, margin: '0 auto' }

// ── 1. Integrations ──────────────────────────────────────────────────────────

function IntegrationsView() {
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ provider: 'google_drive', name: '', config: '' })
  const [syncing, setSyncing] = useState('')

  const load = useCallback(async () => {
    try { const r = await fetch(`${API_BASE}/api/integrations`, { headers: webHdrs() }); const d = await r.json(); setIntegrations(d.integrations || []) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.name) return
    let config = {}
    try { config = form.config ? JSON.parse(form.config) : {} } catch { return alert('Invalid JSON config') }
    await fetch(`${API_BASE}/api/integrations`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, config }) })
    setShowAdd(false); setForm({ provider: 'google_drive', name: '', config: '' }); load()
  }

  const sync = async (id: string) => {
    setSyncing(id)
    try { const r = await fetch(`${API_BASE}/api/integrations/${id}/sync`, { method: 'POST', headers: webHdrs() }); const d = await r.json(); alert(`Synced! ${d.docs_added || 0} documents added.`) } catch { alert('Sync failed') }
    finally { setSyncing(''); load() }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this integration?')) return
    await fetch(`${API_BASE}/api/integrations/${id}`, { method: 'DELETE', headers: webHdrs() }); load()
  }

  const providers = [
    { id: 'google_drive', label: 'Google Drive', icon: '📁', hint: '{"access_token":"..."}' },
    { id: 'notion', label: 'Notion', icon: '📝', hint: '{"api_key":"..."}' },
    { id: 'slack', label: 'Slack', icon: '💬', hint: '{"bot_token":"xoxb-...","channels":["C01..."]}' },
    { id: 'zendesk', label: 'Zendesk', icon: '🎫', hint: '{"subdomain":"...","token":"..."}' },
    { id: 'hubspot', label: 'HubSpot', icon: '🔧', hint: '{"api_key":"..."}' },
  ]

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Integrations</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Connect external sources to your knowledge base</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 6 }} />Add Integration</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <select value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {providers.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Integration name" style={inputStyle} />
          </div>
          <textarea value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))} placeholder={providers.find(p => p.id === form.provider)?.hint || 'JSON config'} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={add} style={btnPrimary}>Save</button>
            <button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : integrations.length === 0 ? (
        <div style={cardStyle}><div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No integrations configured yet. Add one to sync external documents.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {integrations.map(i => (
            <div key={i.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{providers.find(p => p.id === i.provider)?.icon} {i.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{i.provider} · {i.docs_synced} docs · {i.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => sync(i.id)} disabled={syncing === i.id} style={btnPrimary}>{syncing === i.id ? 'Syncing…' : 'Sync'}</button>
                <button onClick={() => remove(i.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

// ── 2. Helpdesk AI ───────────────────────────────────────────────────────────

function HelpdeskView() {
  const [agents, setAgents] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [tab, setTab] = useState<'agents' | 'tickets'>('agents')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', system_prompt: '', auto_reply: true, confidence_threshold: '0.70', escalation_enabled: false })
  const [selectedTicket, setSelectedTicket] = useState<any>(null)

  const loadAgents = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/helpdesk/agents`, { headers: webHdrs() }); const d = await r.json(); setAgents(d.agents || []) } catch {} }, [])
  const loadTickets = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/helpdesk/tickets`, { headers: webHdrs() }); const d = await r.json(); setTickets(d.tickets || []) } catch {} }, [])
  useEffect(() => { loadAgents(); loadTickets() }, [loadAgents, loadTickets])

  const addAgent = async () => {
    if (!form.name) return
    await fetch(`${API_BASE}/api/helpdesk/agents`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, confidence_threshold: parseFloat(form.confidence_threshold) }) })
    setShowAdd(false); setForm({ name: '', description: '', system_prompt: '', auto_reply: true, confidence_threshold: '0.70', escalation_enabled: false }); loadAgents()
  }

  const toggleAgent = async (id: string, active: boolean) => {
    await fetch(`${API_BASE}/api/helpdesk/agents/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }); loadAgents()
  }

  const resolveTicket = async (id: string) => {
    await fetch(`${API_BASE}/api/helpdesk/tickets/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ resolved: true }) }); loadTickets(); setSelectedTicket(null)
  }

  const sentimentColor = (s: string) => s === 'positive' ? '#4ade80' : s === 'negative' ? '#f87171' : '#fbbf24'

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Helpdesk AI</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>AI agents that auto-reply to customer messages using your knowledge base</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab('agents')} style={tab === 'agents' ? btnPrimary : btnSecondary}>Agents</button>
        <button onClick={() => setTab('tickets')} style={tab === 'tickets' ? btnPrimary : btnSecondary}>Tickets ({tickets.length})</button>
        {tab === 'agents' && <button onClick={() => setShowAdd(!showAdd)} style={{ ...btnPrimary, marginLeft: 'auto' }}><Plus size={14} style={{ marginRight: 4 }} />New Agent</button>}
      </div>

      {tab === 'agents' && <>
        {showAdd && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Agent name" style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} placeholder="System prompt for this agent…" rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
              <label style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.auto_reply} onChange={e => setForm(f => ({ ...f, auto_reply: e.target.checked }))} /> Auto-reply</label>
              <label style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.escalation_enabled} onChange={e => setForm(f => ({ ...f, escalation_enabled: e.target.checked }))} /> Escalation</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}><button onClick={addAgent} style={btnPrimary}>Create Agent</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button></div>
          </div>
        )}
        {agents.map(a => (
          <div key={a.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={16} style={{ color: '#818cf8' }} /><span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{a.name}</span><span style={badgeStyle(a.is_active ? '#4ade80' : '#f87171')}>{a.is_active ? 'Active' : 'Inactive'}</span></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{a.description || 'No description'} · Auto-reply: {a.auto_reply ? 'ON' : 'OFF'} · Threshold: {a.confidence_threshold}</div>
            </div>
            <button onClick={() => toggleAgent(a.id, a.is_active)} style={btnSecondary}>{a.is_active ? 'Disable' : 'Enable'}</button>
          </div>
        ))}
        {agents.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No agents yet. Create one to start auto-replying.</div>}
      </>}

      {tab === 'tickets' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div>
            {tickets.map(t => (
              <div key={t.id} onClick={() => setSelectedTicket(t)} style={{ ...cardStyle, marginBottom: 8, cursor: 'pointer', borderColor: selectedTicket?.id === t.id ? '#6366f1' : 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{t.subject?.slice(0, 60) || 'No subject'}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={badgeStyle(sentimentColor(t.sentiment))}>{t.sentiment}</span>
                    {t.escalated ? <span style={badgeStyle('#f87171')}>Escalated</span> : null}
                    <span style={badgeStyle(t.status === 'open' ? '#fbbf24' : '#4ade80')}>{t.status}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{t.customer_email || t.channel} · {t.auto_replies_count} auto-replies</div>
              </div>
            ))}
            {tickets.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No tickets yet. Send a message to /api/helpdesk/incoming to test.</div>}
          </div>
          {selectedTicket && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Ticket: {selectedTicket.subject?.slice(0, 80)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{selectedTicket.customer_email} · {selectedTicket.channel} · {selectedTicket.sentiment}</div>
              <button onClick={() => resolveTicket(selectedTicket.id)} style={btnPrimary}>Mark Resolved</button>
            </div>
          )}
        </div>
      )}
    </div></div>
  )
}

// ── 3. KB Gaps (Auto-updater) ────────────────────────────────────────────────

function KbGapsView() {
  const [gaps, setGaps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState('')

  const load = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/kb/gaps`, { headers: webHdrs() }); const d = await r.json(); setGaps(d.gaps || []) } catch {} finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])

  const generate = async (id: string) => {
    setGenerating(id)
    try { await fetch(`${API_BASE}/api/kb/gaps/${id}/generate`, { method: 'POST', headers: webHdrs() }); load() } catch {} finally { setGenerating('') }
  }

  const approve = async (id: string) => {
    await fetch(`${API_BASE}/api/kb/gaps/${id}/approve`, { method: 'POST', headers: webHdrs() }); load()
  }

  const dismiss = async (id: string) => {
    await fetch(`${API_BASE}/api/kb/gaps/${id}`, { method: 'DELETE', headers: webHdrs() }); load()
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>KB Auto-Updater</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Detected knowledge gaps from unanswered customer questions. Generate and approve articles automatically.</div>

      {loading ? <Spinner /> : gaps.length === 0 ? (
        <div style={cardStyle}><div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No knowledge gaps detected yet. Gaps are found when the helpdesk agent can't answer questions.</div></div>
      ) : gaps.map(g => (
        <div key={g.id} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{g.suggested_title || g.query.slice(0, 80)}</div>
            <div style={{ display: 'flex', gap: 6 }}><span style={badgeStyle('#818cf8')}>×{g.frequency}</span><span style={badgeStyle(g.status === 'generated' ? '#4ade80' : g.status === 'approved' ? '#6366f1' : '#fbbf24')}>{g.status}</span></div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Original query: "{g.query}"</div>
          {g.suggested_content && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 10, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{g.suggested_content.slice(0, 500)}{g.suggested_content.length > 500 ? '…' : ''}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            {g.status === 'pending' && <button onClick={() => generate(g.id)} disabled={generating === g.id} style={btnPrimary}>{generating === g.id ? 'Generating…' : 'Generate Article'}</button>}
            {g.status === 'generated' && <button onClick={() => approve(g.id)} style={btnPrimary}>Approve & Add to KB</button>}
            <button onClick={() => dismiss(g.id)} style={btnSecondary}>Dismiss</button>
          </div>
        </div>
      ))}
    </div></div>
  )
}

// ── 4. Advanced Analytics ────────────────────────────────────────────────────

function AnalyticsView() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/analytics/overview`, { headers: webHdrs() }).then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...viewWrap, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>
  if (!data) return <div style={viewWrap}><div style={{ color: '#fca5a5' }}>Failed to load analytics</div></div>

  const statCard = (label: string, value: string | number, color: string) => (
    <div style={{ ...cardStyle, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{label}</div>
    </div>
  )

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Advanced Analytics</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Conversation patterns, sentiment trends, resolution rates</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {statCard('Total Tickets', data.total_tickets, '#fff')}
        {statCard('Open', data.open_tickets, '#fbbf24')}
        {statCard('Resolved', data.resolved_tickets, '#4ade80')}
        {statCard('Escalated', data.escalated_tickets, '#f87171')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Sentiment Breakdown</div>
          {(data.sentiment_breakdown || []).map((s: any) => (
            <div key={s.sentiment} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: s.sentiment === 'positive' ? '#4ade80' : s.sentiment === 'negative' ? '#f87171' : '#fbbf24', fontSize: 13, fontWeight: 600 }}>{s.sentiment}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{s.count}</span>
            </div>
          ))}
          {(data.sentiment_breakdown || []).length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No data yet</div>}
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Avg sentiment score: <span style={{ color: '#fff', fontWeight: 700 }}>{data.avg_sentiment}</span></div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Top Topics</div>
          {(data.topic_breakdown || []).slice(0, 8).map((t: any) => (
            <div key={t.topic} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: '#dbeafe', fontSize: 13 }}>{t.topic}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{t.count}</span>
            </div>
          ))}
          {(data.topic_breakdown || []).length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No topics detected yet</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Channel Breakdown</div>
          {(data.channel_breakdown || []).map((c: any) => (
            <div key={c.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: '#dbeafe', fontSize: 13 }}>{c.channel}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{c.count}</span>
            </div>
          ))}
          {(data.channel_breakdown || []).length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No data yet</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Auto-Resolution</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#4ade80' }}>{data.auto_resolved}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>tickets auto-resolved by AI</div>
          {data.total_tickets > 0 && <div style={{ fontSize: 13, color: '#818cf8', marginTop: 8 }}>{Math.round(data.auto_resolved / data.total_tickets * 100)}% auto-resolution rate</div>}
        </div>
      </div>
    </div></div>
  )
}

// ── 5. Simulation / Testing ──────────────────────────────────────────────────

function SimulationView() {
  const [tests, setTests] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [casesText, setCasesText] = useState('')
  const [running, setRunning] = useState('')
  const [results, setResults] = useState<any>(null)

  const load = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/simulation/tests`, { headers: webHdrs() }); const d = await r.json(); setTests(d.tests || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!name || !casesText) return
    try {
      const cases = JSON.parse(casesText)
      await fetch(`${API_BASE}/api/simulation/tests`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name, test_cases: cases }) })
      setShowAdd(false); setName(''); setCasesText(''); load()
    } catch { alert('Invalid JSON. Format: [{"question":"...","expected_answer":"..."}]') }
  }

  const run = async (id: string) => {
    setRunning(id); setResults(null)
    try { const r = await fetch(`${API_BASE}/api/simulation/tests/${id}/run`, { method: 'POST', headers: webHdrs() }); const d = await r.json(); setResults(d); load() } catch { alert('Test run failed') } finally { setRunning('') }
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Simulation</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Test AI responses against expected answers</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />New Test</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Test name" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea value={casesText} onChange={e => setCasesText(e.target.value)} placeholder='[{"question":"How do I reset?","expected_answer":"Go to settings and click reset"}]' rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}><button onClick={create} style={btnPrimary}>Create</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button></div>
        </div>
      )}

      {tests.map(t => (
        <div key={t.id} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Accuracy: {t.accuracy}% · Avg similarity: {t.avg_similarity}% · Status: {t.status}</div>
            </div>
            <button onClick={() => run(t.id)} disabled={running === t.id} style={btnPrimary}>{running === t.id ? 'Running…' : 'Run Test'}</button>
          </div>
        </div>
      ))}

      {results && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Results — Accuracy: {results.accuracy}%</div>
          {(results.results || []).map((r: any, i: number) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Q: {r.question}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Expected: {r.expected?.slice(0, 100)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>AI: {r.actual?.slice(0, 150)}</div>
              <span style={badgeStyle(r.pass ? '#4ade80' : '#f87171')}>{r.similarity}% — {r.pass ? 'PASS' : 'FAIL'}</span>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

// ── 6. Channels (Multi-channel deployment) ───────────────────────────────────

function ChannelsView() {
  const [channels, setChannels] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ agent_id: '', channel_type: 'website', config: '' })

  const load = useCallback(async () => {
    const [ch, ag] = await Promise.all([
      fetch(`${API_BASE}/api/channels`, { headers: webHdrs() }).then(r => r.json()),
      fetch(`${API_BASE}/api/helpdesk/agents`, { headers: webHdrs() }).then(r => r.json()),
    ])
    setChannels(ch.channels || []); setAgents(ag.agents || [])
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.agent_id || !form.channel_type) return
    let config = {}
    try { config = form.config ? JSON.parse(form.config) : {} } catch { return alert('Invalid JSON') }
    await fetch(`${API_BASE}/api/channels`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, config }) })
    setShowAdd(false); load()
  }

  const toggle = async (id: string, active: boolean) => {
    await fetch(`${API_BASE}/api/channels/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }); load()
  }

  const remove = async (id: string) => { await fetch(`${API_BASE}/api/channels/${id}`, { method: 'DELETE', headers: webHdrs() }); load() }

  const channelTypes = ['website', 'slack', 'zendesk', 'freshdesk', 'intercom', 'email', 'whatsapp', 'api']
  const channelIcons: Record<string, string> = { website: '🌐', slack: '💬', zendesk: '🎫', freshdesk: '📋', intercom: '💭', email: '📧', whatsapp: '📱', api: '🔌' }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Multi-Channel Deployment</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Deploy AI agents across multiple channels simultaneously</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Add Channel</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={form.channel_type} onChange={e => setForm(f => ({ ...f, channel_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {channelTypes.map(t => <option key={t} value={t}>{channelIcons[t]} {t}</option>)}
            </select>
          </div>
          <textarea value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))} placeholder='{"webhook_url":"..."}' rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}><button onClick={add} style={btnPrimary}>Deploy</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {channels.map(c => (
          <div key={c.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 20 }}>{channelIcons[c.channel_type] || '🔌'}</div>
              <span style={badgeStyle(c.is_active ? '#4ade80' : '#f87171')}>{c.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.channel_type}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Agent: {c.agent_name || 'Unknown'} · {c.messages_handled} msgs handled</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => toggle(c.id, c.is_active)} style={btnSecondary}>{c.is_active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => remove(c.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {channels.length === 0 && <div style={{ ...cardStyle, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No channels deployed. Create an agent first, then deploy it here.</div>}
    </div></div>
  )
}

// ── 7. Escalation Workflows ──────────────────────────────────────────────────

function EscalationView() {
  const [rules, setRules] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', condition_type: 'keyword', condition_value: '', action_type: 'escalate', action_value: '', priority: '0' })

  const load = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/escalation/rules`, { headers: webHdrs() }); const d = await r.json(); setRules(d.rules || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.name || !form.condition_value) return
    await fetch(`${API_BASE}/api/escalation/rules`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, priority: parseInt(form.priority) }) })
    setShowAdd(false); setForm({ name: '', condition_type: 'keyword', condition_value: '', action_type: 'escalate', action_value: '', priority: '0' }); load()
  }

  const toggle = async (id: string, active: boolean) => {
    await fetch(`${API_BASE}/api/escalation/rules/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }); load()
  }

  const remove = async (id: string) => { await fetch(`${API_BASE}/api/escalation/rules/${id}`, { method: 'DELETE', headers: webHdrs() }); load() }

  const conditionTypes = [
    { id: 'keyword', label: 'Contains keyword', hint: 'e.g. "refund"' },
    { id: 'sentiment', label: 'Sentiment is', hint: 'e.g. "negative"' },
    { id: 'max_replies', label: 'Auto-replies exceed', hint: 'e.g. "3"' },
    { id: 'amount', label: 'Amount exceeds', hint: 'e.g. "100"' },
  ]

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Escalation Workflows</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Conditional rules that escalate tickets to humans when needed</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />New Rule</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rule name" style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <select value={form.condition_type} onChange={e => setForm(f => ({ ...f, condition_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {conditionTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.label}</option>)}
            </select>
            <input value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} placeholder={conditionTypes.find(c => c.id === form.condition_type)?.hint} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <select value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="escalate">Escalate to human</option>
              <option value="notify">Send notification</option>
              <option value="tag">Add tag</option>
            </select>
            <input value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} placeholder="Priority (0 = highest)" style={inputStyle} type="number" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={add} style={btnPrimary}>Create Rule</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button></div>
        </div>
      )}

      {rules.map(r => (
        <div key={r.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{r.name}</span>
              <span style={badgeStyle(r.is_active ? '#4ade80' : '#f87171')}>{r.is_active ? 'Active' : 'Off'}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              IF {r.condition_type} = "{r.condition_value}" → {r.action_type} · Triggered {r.triggers_count}× · Priority {r.priority}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => toggle(r.id, r.is_active)} style={btnSecondary}>{r.is_active ? 'Disable' : 'Enable'}</button>
            <button onClick={() => remove(r.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Delete</button>
          </div>
        </div>
      ))}
      {rules.length === 0 && <div style={{ ...cardStyle, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 }}>No escalation rules. Create rules to auto-escalate sensitive tickets.</div>}
    </div></div>
  )
}

// ── 8. Team Collaboration ────────────────────────────────────────────────────

function TeamView() {
  const [members, setMembers] = useState<any[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'member' })

  const load = useCallback(async () => { try { const r = await fetch(`${API_BASE}/api/team`, { headers: webHdrs() }); const d = await r.json(); setMembers(d.members || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const invite = async () => {
    if (!form.email) return
    const r = await fetch(`${API_BASE}/api/team/invite`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(form) })
    if (r.ok) { setShowInvite(false); setForm({ email: '', name: '', role: 'member' }); load() }
    else { const d = await r.json(); alert(d.error || 'Failed') }
  }

  const changeRole = async (id: string, role: string) => {
    await fetch(`${API_BASE}/api/team/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ role }) }); load()
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this team member?')) return
    await fetch(`${API_BASE}/api/team/${id}`, { method: 'DELETE', headers: webHdrs() }); load()
  }

  const roleColor = (r: string) => r === 'admin' ? '#818cf8' : r === 'editor' ? '#fbbf24' : '#4ade80'

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Team</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Manage team members, roles, and permissions</div></div>
        <button onClick={() => setShowInvite(!showInvite)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Invite Member</button>
      </div>

      {showInvite && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" style={inputStyle} />
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name (optional)" style={inputStyle} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="member">Member</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={invite} style={btnPrimary}>Send Invite</button><button onClick={() => setShowInvite(false)} style={btnSecondary}>Cancel</button></div>
        </div>
      )}

      <div style={{ ...cardStyle }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Member', 'Role', 'Status', 'Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '12px' }}><div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.name || m.email}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{m.email}</div></td>
                <td style={{ padding: '12px' }}>
                  <select value={m.role} onChange={e => changeRole(m.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: roleColor(m.role), fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    <option value="member">Member</option><option value="editor">Editor</option><option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: '12px' }}><span style={badgeStyle(m.status === 'active' ? '#4ade80' : '#fbbf24')}>{m.status}</span></td>
                <td style={{ padding: '12px' }}><button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24 }}>No team members yet. Invite colleagues to collaborate.</div>}
      </div>
    </div></div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: (token: string, user: WebUser) => void }) {
  const [step,    setStep]    = useState<'email' | 'otp'>('email')
  const [email,   setEmail]   = useState('')
  const [name,    setName]    = useState('')
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [resendCd, setResendCd] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  // Countdown for resend button
  useEffect(() => {
    if (resendCd <= 0) return
    const t = setTimeout(() => setResendCd(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCd])

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) { setError('Entrez votre email'); return }
    setError(''); setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/webapp/send-otp`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ email: trimmed, name: name.trim() || undefined }) })
      const d = await r.json()
      if (!d.success) { setError(d.error || 'Erreur'); setLoading(false); return }
      setStep('otp')
      setResendCd(60)
      setTimeout(() => codeRef.current?.focus(), 100)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = code.trim()
    if (trimmed.length !== 6) { setError('Entrez le code à 6 chiffres'); return }
    setError(''); setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/webapp/verify-otp`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ email: email.trim(), code: trimmed }) })
      const d = await r.json()
      if (!d.success) { setError(d.error || 'Code invalide'); setLoading(false); return }
      localStorage.setItem(TOKEN_KEY, d.token)
      onLogin(d.token, d.user)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px 13px 40px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const btnStyle: React.CSSProperties = { padding: '13px 20px', borderRadius: 12, border: 'none', background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#5254cc)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080808', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={step}
        style={{ width: '100%', maxWidth: 400, padding: 32, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }}>
            <Bot size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Lamu AI</h1>
          {step === 'email' ? (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>Votre assistant IA avec base de connaissances</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Zap size={12} style={{ color: '#4ade80' }} />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>20 messages gratuits — aucune carte requise</span>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                Code envoyé à <strong style={{ color: '#fff' }}>{email}</strong>
              </p>
            </>
          )}
        </div>

        {step === 'email' ? (
          <form onSubmit={sendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" autoFocus
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
            </div>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom (optionnel)"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
            </div>
            {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? <><Spinner /> Envoi du code…</> : 'Recevoir un code par email'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              Vous avez une licence ? Entrez le même email — votre plan sera automatiquement activé.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Shield size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
              <input ref={codeRef} type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) { setCode(v); setTimeout(() => verifyOtp(), 50) } }}
                placeholder="000000"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 8, paddingLeft: 14 }}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
            </div>
            {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading || code.length !== 6} style={btnStyle}>
              {loading ? <><Spinner /> Vérification…</> : 'Vérifier le code'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4 }}>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12, textDecoration: 'underline' }}>
                Changer d'email
              </button>
              <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
              <button type="button" onClick={() => { setCode(''); setError(''); sendOtp() }} disabled={resendCd > 0 || loading}
                style={{ background: 'none', border: 'none', cursor: resendCd > 0 ? 'default' : 'pointer', color: resendCd > 0 ? 'rgba(255,255,255,0.2)' : '#818cf8', fontSize: 12, textDecoration: resendCd > 0 ? 'none' : 'underline' }}>
                {resendCd > 0 ? `Renvoyer (${resendCd}s)` : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function WebApp() {
  const [user,       setUser]       = useState<WebUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view,       setView]       = useState<View>('home')
  const [convs,      setConvs]      = useState<Conversation[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [streaming,  setStreaming]  = useState(false)
  const [prompts,    setPrompts]    = useState<Prompt[]>([])
  const [models,     setModels]     = useState<Model[]>([])
  const [model,      setModel]      = useState('')
  const [system,     setSystem]     = useState('')
  const [mobileSide, setMobileSide] = useState(false)
  const [showKbRoot, setShowKbRoot] = useState(false)
  const [kbContext, setKbContext] = useState<{ id: string; name: string; excerpt: string } | null>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [searchQuery, setSearchQuery] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const th = T[theme]

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem(THEME_KEY, t) }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); newChat() }
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setSearchQuery(q => q ? '' : ' ') }
      if (e.key === 'Escape') { setMobileSide(false); setShowKbRoot(false); setSearchQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hasChatted = convs.some(c => c.messages.some(m => m.role === 'user'))

  // ── Auth: verify token on mount ──
  useEffect(() => {
    const token = getToken()
    if (!token) { setAuthLoading(false); return }
    fetch(`${API_BASE}/api/webapp/verify`, { method: 'POST', headers: webHdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.valid) setUser(d.user)
        else { localStorage.removeItem(TOKEN_KEY); setUser(null) }
      })
      .catch(() => { setUser(null) })
      .finally(() => setAuthLoading(false))
  }, [])

  // ── Load conversations from server once after initial login ──
  const convsLoadedRef = useRef(false)
  useEffect(() => {
    if (!user || convsLoadedRef.current) return
    convsLoadedRef.current = true
    fetch(`${API_BASE}/api/webapp/conversations`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.conversations?.length) {
          setConvs(d.conversations)
        } else {
          // Fallback: load from localStorage for migration
          const local = loadConvs()
          if (local.length) setConvs(local)
        }
      })
      .catch(() => { setConvs(loadConvs()) })
  }, [user])

  // ── Save conversations: localStorage + debounced server sync ──
  useEffect(() => {
    saveConvs(convs)
    if (!user || convs.length === 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // Save each conversation with messages to server
      for (const c of convs) {
        if (c.messages.length === 0) continue
        fetch(`${API_BASE}/api/webapp/conversations/save`, {
          method: 'POST', headers: webHdrs(),
          body: JSON.stringify({ id: c.id, title: c.title, messages: c.messages, createdAt: c.createdAt }),
        }).catch(() => {})
      }
    }, 2000)
  }, [convs, user])

  // ── Load prompts + models ──
  useEffect(() => {
    if (!user) return
    fetch(`${API_BASE}/api/prompts`, { method: 'POST', headers: webHdrs() })
      .then(r => r.ok ? r.json() : null).then(d => d && setPrompts(d.prompts || [])).catch(() => {})
    fetch(`${API_BASE}/api/models`, { method: 'POST', headers: webHdrs() })
      .then(r => r.ok ? r.json() : null).then(d => { if (!d) return; const av = (d.models || []).filter((m: Model) => m.isAvailable); setModels(av); if (av.length) setModel(av[0].model) }).catch(() => {})
  }, [user])

  const handleLogin = useCallback((_token: string, u: WebUser) => { setUser(u) }, [])

  const refreshUser = useCallback(() => {
    const token = getToken()
    if (!token) return
    fetch(`${API_BASE}/api/webapp/verify`, { method: 'POST', headers: webHdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.valid) setUser(d.user) })
      .catch(() => {})
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null); setConvs([]); setActiveId(null); setView('home')
  }, [])

  const delConv = useCallback((id: string) => {
    setConvs(p => p.filter(c => c.id !== id))
    setActiveId(p => p === id ? null : p)
    // Delete from server
    fetch(`${API_BASE}/api/webapp/conversations/${id}`, { method: 'DELETE', headers: webHdrs() }).catch(() => {})
  }, [])

  const newChat  = useCallback(() => { const c: Conversation = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); setView('chat'); setMobileSide(false) }, [])
  const selConv  = useCallback((id: string) => { setActiveId(id); setView('chat'); setMobileSide(false) }, [])

  // ── Auth loading screen ──
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080808' }}>
        <Spinner />
      </div>
    )
  }

  // ── Login screen ──
  if (!user) {
    return <LoginView onLogin={handleLogin} />
  }

  const sidebar = (mobile = false, onClose?: () => void) => (
    <Sidebar view={view} setView={setView} convs={convs} activeId={activeId} onNew={newChat} onSelect={selConv} onDelete={delConv} onClose={onClose} mobile={mobile} onKb={() => setShowKbRoot(true)} />
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: th.bg, color: th.text, position: 'relative' }}>

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
        {/* Top user bar */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,8,8,0.9)', flexShrink: 0 }}>
          <button className="mobile-menu-btn" onClick={() => setMobileSide(true)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4 }}><Menu size={16} /></button>
          <div style={{ flex: 1 }} />
          {user.trial && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
              <div style={{ fontSize: 11, color: (user.messages_remaining ?? 0) <= 5 ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>
                {user.messages_remaining ?? 0}/{user.max_requests} messages
              </div>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: (user.messages_remaining ?? 0) <= 5 ? '#f59e0b' : '#6366f1', width: `${((user.messages_remaining ?? 0) / user.max_requests) * 100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{user.email}</span>
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: user.trial ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)', color: user.trial ? '#4ade80' : '#818cf8', fontWeight: 600 }}>{user.plan_name}</span>
          {user.trial && (
            <a href="/pricing" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Upgrade
            </a>
          )}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme"
            style={{ background: 'none', border: `1px solid ${th.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: th.textMuted, display: 'flex', alignItems: 'center', fontSize: 11 }}>
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <button onClick={handleLogout} title="Se déconnecter"
            style={{ background: 'none', border: `1px solid ${th.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: th.textMuted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,0.3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = th.textMuted; (e.currentTarget as HTMLButtonElement).style.borderColor = th.border }}>
            <LogOut size={12} />
          </button>
        </div>

        {user.trial && (() => {
          const remaining = user.messages_remaining ?? 0
          const urgent = remaining <= 3
          const exhausted = remaining <= 0
          return (
            <div style={{ padding: '10px 16px', background: urgent ? 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.12))' : 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))', borderBottom: `1px solid ${urgent ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                {urgent ? <AlertTriangle size={14} style={{ color: '#f87171' }} /> : <Zap size={14} style={{ color: '#818cf8' }} />}
                <span style={{ fontSize: 13, color: urgent ? '#fca5a5' : '#c4b5fd', fontWeight: 600 }}>{exhausted ? 'Trial terminé' : urgent ? 'Trial presque épuisé !' : 'Free Trial'}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>—</span>
                <span style={{ fontSize: 12, color: urgent ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
                  {exhausted ? 'Passez au Pro pour continuer' : `${remaining} message${remaining !== 1 ? 's' : ''} restant${remaining !== 1 ? 's' : ''} sur ${user.max_requests}`}
                </span>
                {!exhausted && (
                  <div style={{ width: 80, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginLeft: 4 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: urgent ? '#ef4444' : remaining <= 5 ? '#f59e0b' : '#6366f1', width: `${(remaining / user.max_requests) * 100}%`, transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
              <button onClick={() => setView('pricing')} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 8, background: urgent ? 'linear-gradient(135deg,#ef4444,#f59e0b)' : 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {exhausted ? 'Upgrade maintenant' : 'Passer au Pro'}
              </button>
            </div>
          )
        })()}
        {view === 'home'     && <HomeView hasChatted={hasChatted} onNewChat={newChat} setView={setView} isTrial={user?.trial} userName={user?.name || user?.email?.split('@')[0] || null} />}
        {view === 'chat'     && <ChatView convs={convs} activeId={activeId} setActiveId={setActiveId} setConvs={setConvs} model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} prompts={prompts} streaming={streaming} setStreaming={setStreaming} kbContext={kbContext} clearKbContext={() => setKbContext(null)} userName={user?.name || user?.email?.split('@')[0] || null} onMessageSent={refreshUser} />}
        {view === 'knowledge' && <KnowledgeSearchView onAskDoc={doc => { setSystem(`Use the following source to answer the next question:\n\n${doc.name}\n\n${doc.excerpt || 'No preview available.'}`); setKbContext({ id: doc.id, name: doc.name, excerpt: doc.excerpt || '' }); setView('chat') }} />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'widget' && <WidgetView />}
        {view === 'pricing' && <PricingView currentPlan={user?.trial ? 'trial' : user?.plan} onUpgrade={() => window.open('/pricing', '_blank')} />}
        {view === 'profile' && <ProfileView user={user!} onLogout={handleLogout} setView={setView} />}
        {view === 'settings' && <SettingsView model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} />}
        {view === 'integrations' && <IntegrationsView />}
        {view === 'helpdesk' && <HelpdeskView />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'simulation' && <SimulationView />}
        {view === 'escalation' && <EscalationView />}
        {view === 'channels' && <ChannelsView />}
        {view === 'kb-gaps' && <KbGapsView />}
        {view === 'team' && <TeamView />}
      </div>

      <AnimatePresence>
        {showKbRoot && <KbView onClose={() => setShowKbRoot(false)} isTrial={user.trial} />}
      </AnimatePresence>

      <style>{`
        .desktop-sidebar { display: flex !important; }
        .mobile-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
