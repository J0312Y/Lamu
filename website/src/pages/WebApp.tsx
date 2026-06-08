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
  ChevronUp, LayoutDashboard, Archive, Clock,
} from 'lucide-react'

// All backend calls go through the Vite proxy at /lamu-api — the proxy injects
// the Authorization header server-side so no secret is exposed to the browser.
const API_BASE = '/lamu-api'
const hdrs = () => ({ 'Content-Type': 'application/json' })

type Theme = 'dark' | 'light'
const THEME_KEY = 'lamu_web_theme'
const getTheme = (): Theme => (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
const T = {
  dark: {
    bg: '#080808', bgAlt: '#0d0d0d', card: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)',
    text: '#fff', textSub: 'rgba(255,255,255,0.5)', textMuted: 'rgba(255,255,255,0.35)',
    input: 'rgba(255,255,255,0.05)', inputBorder: 'rgba(255,255,255,0.1)',
    bubble: 'rgba(255,255,255,0.07)', bubbleBorder: 'rgba(255,255,255,0.08)',
    sidebar: '#0d0d0d', sidebarBorder: 'rgba(255,255,255,0.07)',
    modal: '#111', modalBorder: 'rgba(255,255,255,0.1)',
    dropdown: '#1a1a2e', dropdownBorder: 'rgba(255,255,255,0.12)',
    headerBg: 'rgba(8,8,8,0.9)', divider: 'rgba(255,255,255,0.06)',
    hover: 'rgba(255,255,255,0.06)', activeItem: 'rgba(99,102,241,0.12)',
    codeBg: 'rgba(0,0,0,0.3)', spinnerBg: 'rgba(255,255,255,0.2)',
    btnSecBg: 'rgba(255,255,255,0.04)', btnSecBorder: 'rgba(255,255,255,0.12)',
    toastBg: 'rgba(0,0,0,0.85)',
  },
  light: {
    bg: '#f7f8fa', bgAlt: '#ffffff', card: '#ffffff', border: 'rgba(0,0,0,0.08)',
    text: '#1a1a2e', textSub: 'rgba(0,0,0,0.55)', textMuted: 'rgba(0,0,0,0.38)',
    input: '#ffffff', inputBorder: 'rgba(0,0,0,0.12)',
    bubble: '#f0f0f5', bubbleBorder: 'rgba(0,0,0,0.06)',
    sidebar: '#ffffff', sidebarBorder: 'rgba(0,0,0,0.08)',
    modal: '#ffffff', modalBorder: 'rgba(0,0,0,0.1)',
    dropdown: '#ffffff', dropdownBorder: 'rgba(0,0,0,0.12)',
    headerBg: 'rgba(255,255,255,0.92)', divider: 'rgba(0,0,0,0.06)',
    hover: 'rgba(0,0,0,0.04)', activeItem: 'rgba(99,102,241,0.08)',
    codeBg: 'rgba(0,0,0,0.04)', spinnerBg: 'rgba(0,0,0,0.15)',
    btnSecBg: 'rgba(0,0,0,0.03)', btnSecBorder: 'rgba(0,0,0,0.12)',
    toastBg: 'rgba(255,255,255,0.95)',
  },
}
type ThemeColors = typeof T.dark
const ThemeCtx = React.createContext<ThemeColors>(T.dark)
const useTheme = () => React.useContext(ThemeCtx)

type View = 'home' | 'chat' | 'knowledge' | 'dashboard' | 'settings' | 'widget' | 'pricing' | 'profile' | 'integrations' | 'helpdesk' | 'analytics' | 'simulation' | 'escalation' | 'team' | 'channels' | 'kb-gaps' | 'csat' | 'workflows' | 'custom-dashboards' | 'ab-tests' | 'archive' | 'onboarding' | 'auto-sync' | 'ai-actions'
interface Message      { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean }
interface Conversation { id: string; title: string; messages: Message[]; createdAt: number }
interface Prompt       { title: string; prompt: string }
interface Model        { model: string; name: string; isAvailable: boolean }
interface WebUser      { email: string; name: string | null; plan: string; plan_name: string; features: string[]; max_requests: number; expires_at: string | null; trial?: boolean; messages_used?: number; messages_remaining?: number }

function uid() { return Math.random().toString(36).slice(2) }
const STORE = 'lamu_web_conversations'
const TOKEN_KEY = 'lamu_web_token'
const loadConvs = (): Conversation[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
const saveConvs = (c: Conversation[]) => localStorage.setItem(STORE, JSON.stringify(c))
const titleFrom = (msgs: Message[]) => { const f = msgs.find(m => m.role === 'user'); return f ? f.content.slice(0, 48) + (f.content.length > 48 ? '…' : '') : 'Nouvelle conversation' }
async function generateConvTitle(msgs: Message[]): Promise<string> {
  try {
    const exchange = msgs.slice(0, 4).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
    const resp = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST', headers: webHdrs(),
      body: JSON.stringify({ messages: [{ role: 'user', content: `Génère un titre court (3-6 mots max) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale, sans explication.\n\nConversation :\n${exchange}` }], system: 'Tu génères des titres de conversation. Réponds uniquement avec le titre, rien d\'autre. Pas de guillemets. Pas de ponctuation finale. 3 à 6 mots maximum. En français si la conversation est en français, en anglais sinon.' }),
    })
    if (!resp.ok || !resp.body) return titleFrom(msgs)
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let title = '', buf = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1)
        if (!line.startsWith('data: ')) continue
        try { const j = JSON.parse(line.slice(6)); if (j.delta) title += j.delta } catch {}
      }
    }
    title = title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/, '').trim()
    return title.length > 2 && title.length < 80 ? title : titleFrom(msgs)
  } catch { return titleFrom(msgs) }
}
const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
const webHdrs = () => ({ 'Content-Type': 'application/json', 'X-Webapp-Token': getToken() })

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const r = await fetch(url, opts)
  if (r.status === 503) {
    const d = await r.clone().json().catch(() => ({ error: 'Database not connected' }))
    showToast(d.error || 'Database not connected — check backend configuration', 'error')
    throw new Error(d.error || 'Service unavailable')
  }
  return r
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function Spinner() {
  const th = useTheme()
  return <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity }}
    style={{ width: 16, height: 16, border: `2px solid ${th.spinnerBg}`, borderTopColor: th.text, borderRadius: '50%', flexShrink: 0 }} />
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'flex-end', height: 16 }}>
      {[0,1,2].map(i => (
        <motion.span key={i} style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', background: useTheme().textSub }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
      ))}
    </span>
  )
}

// ── Toast notification system ─────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'
interface ToastItem { id: string; message: string; type: ToastType }
const toastListeners = new Set<(t: ToastItem) => void>()
function showToast(message: string, type: ToastType = 'info') {
  const t: ToastItem = { id: uid(), message, type }
  toastListeners.forEach(fn => fn(t))
}

function ToastContainer() {
  const th = useTheme()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  useEffect(() => {
    const handler = (t: ToastItem) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000)
    }
    toastListeners.add(handler)
    return () => { toastListeners.delete(handler) }
  }, [])
  const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', icon: '#22c55e' },
    error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: '#ef4444' },
    info: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', icon: '#6366f1' },
  }
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 60, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.95 }} transition={{ duration: 0.25 }}
            style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: 12, background: th.toastBg, border: `1px solid ${colors[t.type].border}`, backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxWidth: 380, cursor: 'pointer' }}
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            {t.type === 'success' ? <CheckCircle size={16} style={{ color: colors[t.type].icon, flexShrink: 0 }} /> :
             t.type === 'error' ? <AlertTriangle size={16} style={{ color: colors[t.type].icon, flexShrink: 0 }} /> :
             <Zap size={16} style={{ color: colors[t.type].icon, flexShrink: 0 }} />}
            <span style={{ fontSize: 13, fontWeight: 500, color: th.text, lineHeight: 1.4 }}>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── Custom Select dropdown ────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options, placeholder, style: extraStyle }: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  style?: React.CSSProperties
}) {
  const th = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)
  const iStyle = mkInput(th)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...extraStyle }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{ ...iStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', width: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? th.text : th.textMuted }}>
          {selected ? selected.label : (placeholder || 'Select...')}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: th.textMuted, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }}
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: th.dropdown, border: `1px solid ${th.dropdownBorder}`, borderRadius: 10, overflow: 'hidden', zIndex: 9999, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxHeight: 240, overflowY: 'auto' }}>
            {options.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13, background: o.value === value ? th.activeItem : 'transparent', color: o.value === value ? '#6366f1' : th.text, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.12s' }}
                onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLButtonElement).style.background = th.hover }}
                onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                {o.value === value && <Check size={13} style={{ color: '#6366f1', flexShrink: 0 }} />}
                <span>{o.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Custom Confirm Dialog ────────────────────────────────────────────────────

let _confirmResolve: ((v: boolean) => void) | null = null
let _confirmShow: ((opts: { title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => void) | null = null

function confirmDialog(opts: { title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    _confirmResolve = resolve
    _confirmShow?.(opts)
  })
}

function ConfirmDialog() {
  const th = useTheme()
  const [state, setState] = useState<{ visible: boolean; title: string; message: string; confirmText: string; cancelText: string; danger: boolean }>({
    visible: false, title: '', message: '', confirmText: 'Confirmer', cancelText: 'Annuler', danger: false,
  })

  useEffect(() => {
    _confirmShow = (opts) => setState({ visible: true, title: opts.title, message: opts.message, confirmText: opts.confirmText || 'Confirmer', cancelText: opts.cancelText || 'Annuler', danger: opts.danger || false })
    return () => { _confirmShow = null }
  }, [])

  const close = (result: boolean) => {
    _confirmResolve?.(result)
    _confirmResolve = null
    setState(prev => ({ ...prev, visible: false }))
  }

  if (!state.visible) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => close(false)}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        style={{ background: th.modal, border: `1px solid ${th.modalBorder}`, borderRadius: 16, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${th.divider}` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: state.danger ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)', border: `1px solid ${state.danger ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}` }}>
            {state.danger
              ? <AlertTriangle size={20} style={{ color: '#ef4444' }} />
              : <Zap size={20} style={{ color: '#818cf8' }} />}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: th.text }}>{state.title}</div>
          <div style={{ fontSize: 14, color: th.textSub, marginTop: 8, lineHeight: 1.5 }}>{state.message}</div>
        </div>
        <div style={{ padding: '14px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end', background: th.hover }}>
          <button onClick={() => close(false)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${th.btnSecBorder}`, background: th.btnSecBg, color: th.text, transition: 'background 0.15s', fontFamily: 'inherit' }}
            onMouseOver={e => (e.currentTarget.style.background = th.hover)}
            onMouseOut={e => (e.currentTarget.style.background = th.btnSecBg)}>
            {state.cancelText}
          </button>
          <button onClick={() => close(true)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', color: '#fff', background: state.danger ? '#dc2626' : '#6366f1', transition: 'background 0.15s', fontFamily: 'inherit' }}
            onMouseOver={e => (e.currentTarget.style.background = state.danger ? '#b91c1c' : '#5558e6')}
            onMouseOut={e => (e.currentTarget.style.background = state.danger ? '#dc2626' : '#6366f1')}>
            {state.confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function Bubble({ msg, isLast, streaming, feedback, onFeedback, onCopy }: {
  msg: Message; isLast: boolean; streaming: boolean
  feedback?: 'up' | 'down' | null; onFeedback?: (rating: 'up' | 'down' | null) => void; onCopy?: (text: string) => void
}) {
  const th = useTheme()
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
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: u ? 'linear-gradient(135deg,#6366f1,#818cf8)' : th.bubble, border: u ? 'none' : `1px solid ${th.bubbleBorder}` }}>
        {u ? <User size={14} color="#fff" /> : <Bot size={14} color={th.textSub} />}
      </div>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ padding: '10px 14px', borderRadius: u ? '18px 4px 18px 18px' : '4px 18px 18px 18px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: u ? 'linear-gradient(135deg,#6366f1,#5254cc)' : th.bubble, border: u ? 'none' : `1px solid ${th.bubbleBorder}`, color: u ? '#fff' : th.text, opacity: msg.pending ? 0.7 : 1 }}>
          {msg.content ? msg.content : isLast && streaming ? <Dots /> : null}
          {isLast && streaming && msg.content && <span style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><Dots /></span>}
          {msg.pending && <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, opacity: 0.8 }}><Clock size={11} /> En attente...</span>}
        </div>
        {isAssistant && (hover || feedback) && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 4 }}>
            {([['up', ThumbsUp], ['down', ThumbsDown]] as const).map(([r, Icon]) => (
              <button key={r} onClick={() => onFeedback?.(feedback === r ? null : r)}
                style={{ background: feedback === r ? (r === 'up' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}>
                <Icon size={13} style={{ color: feedback === r ? (r === 'up' ? '#4ade80' : '#f87171') : th.textMuted }} />
              </button>
            ))}
            <button onClick={handleCopy}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', marginLeft: 2 }}>
              {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} style={{ color: th.textMuted }} />}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

const SOURCES = [
  { icon: Globe,    label: 'Site web',        color: '#3b82f6' },
  { icon: Upload,   label: 'Importer PDF',   color: '#8b5cf6' },
  { icon: FileText, label: 'Créer un fichier', color: '#6366f1' },
  { icon: GitBranch, label: 'GitHub',         color: '#e5e7eb' },
  { icon: Database, label: 'Toutes les sources', color: '#f59e0b' },
]

function Sidebar({ view, setView, convs, activeId, onNew, onSelect, onDelete, onClose, mobile, onKb }: {
  view: View; setView: (v: View) => void
  convs: Conversation[]; activeId: string | null
  onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void
  onClose?: () => void; mobile?: boolean; onKb: () => void
}) {
  const th = useTheme()
  const [srcOpen,   setSrcOpen]   = useState(false)
  const [chatsOpen, setChatsOpen] = useState(false)
  const [chatSearch, setChatSearch] = useState('')
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>({ main: true, support: false, advanced: false })

  const toggleSec = (key: string) => setSecOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const navBtn = (id: View, label: string, Icon: React.ElementType, bottom = false) => {
    const active = view === id
    return (
      <button key={id} onClick={() => { setView(id); onClose?.() }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', width: '100%', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: active ? th.activeItem : 'transparent', color: active ? '#6366f1' : bottom ? th.textMuted : th.textSub, transition: 'all 0.15s', textAlign: 'left' }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = th.hover; (e.currentTarget as HTMLButtonElement).style.color = th.text } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = active ? '#6366f1' : bottom ? th.textMuted : th.textSub } }}
      >
        <Icon size={14} style={{ flexShrink: 0 }} /> {label}
      </button>
    )
  }

  const sectionHeader = (label: string, key: string) => (
    <button onClick={() => toggleSec(key)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '5px 8px', margin: '4px 0 2px', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      <ChevronRight size={10} style={{ transform: secOpen[key] ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }} />
    </button>
  )

  return (
    <div style={{ width: mobile ? '100%' : 260, flexShrink: 0, background: th.sidebar, borderRight: `1px solid ${th.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${th.divider}` }}>
        <img src="/lamu-icon.png" alt="Lamu AI" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px', color: th.text }}>Lamu AI</div>
          <div style={{ fontSize: 10, color: th.textMuted, marginTop: 1 }}>Agent IA</div>
        </div>
        {mobile && onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}><X size={15} /></button>
        )}
      </div>

      {/* New chat */}
      <div style={{ padding: '10px 10px 6px' }}>
        <button onClick={onNew} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: 'transparent', border: `1px solid ${th.border}`, color: th.textSub, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = th.hover; (e.currentTarget as HTMLButtonElement).style.color = th.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = th.textSub }}>
          <Plus size={14} /> Nouveau chat
        </button>
      </div>

      {/* Scrollable nav area */}
      <nav style={{ padding: '2px 10px', display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* ── Principal ── */}
        {navBtn('home', 'Accueil', Home)}
        {navBtn('chat', 'Conversations', MessageSquare)}
        {navBtn('knowledge', 'Connaissances', Search)}
        {navBtn('integrations', 'Intégrations', GitBranch)}

        {/* ── Support & Helpdesk ── */}
        {sectionHeader('Support & Helpdesk', 'support')}
        {secOpen.support && <>
          {navBtn('helpdesk', 'Helpdesk IA', Bot)}
          {navBtn('channels', 'Canaux', Globe)}
          {navBtn('escalation', 'Escalade', AlertTriangle)}
          {navBtn('csat', 'CSAT / NPS', Star)}
          {navBtn('kb-gaps', 'Lacunes KB', Library)}
          {navBtn('workflows', 'Workflows', GitBranch)}
        </>}

        {/* ── Analytics & Avancé ── */}
        {sectionHeader('Analytics & Avancé', 'advanced')}
        {secOpen.advanced && <>
          {navBtn('analytics', 'Analytiques', TrendingUp)}
          {navBtn('simulation', 'Simulation', Zap)}
          {navBtn('custom-dashboards', 'Dashboards', LayoutDashboard)}
          {navBtn('ab-tests', 'A/B Tests', Zap)}
          {navBtn('auto-sync', 'Auto-Sync KB', RefreshCw)}
          {navBtn('ai-actions', 'Actions IA', Zap)}
          {navBtn('team', 'Équipe', Users)}
        </>}

        {navBtn('onboarding', 'Onboarding', Sparkles)}
        {navBtn('archive', 'Archives', Archive)}

        {/* ── Sources de connaissances ── */}
        <div style={{ marginTop: 6 }}>
          <button onClick={() => { setSrcOpen(v => !v); onKb() }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            <span style={{ flex: 1, textAlign: 'left' }}>Sources</span>
            <Plus size={10} style={{ opacity: 0.5 }} />
          </button>
          <AnimatePresence>
            {srcOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {SOURCES.map(s => {
                    const Icon = s.icon
                    return (
                      <button key={s.label} onClick={() => onKb()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: th.textSub, fontSize: 11.5, transition: 'all 0.12s', textAlign: 'left' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = th.hover; (e.currentTarget as HTMLButtonElement).style.color = th.text }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = th.textSub }}>
                        <Icon size={12} style={{ color: s.color, flexShrink: 0 }} /> {s.label}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Chats récents ── */}
        <div style={{ marginTop: 2 }}>
          <button onClick={() => setChatsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            <span style={{ flex: 1, textAlign: 'left' }}>Chats récents</span>
            <ChevronRight size={10} style={{ transform: chatsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }} />
          </button>
          <AnimatePresence>
            {chatsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                {convs.length > 3 && (
                  <div style={{ padding: '4px 0 6px' }}>
                    <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', background: th.input, border: `1px solid ${th.inputBorder}`, borderRadius: 7, padding: '5px 8px', color: th.text, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ maxHeight: 160, overflowY: 'auto', paddingBottom: 6 }}>
                  {convs.length === 0
                    ? <p style={{ fontSize: 11, color: th.textMuted, padding: '6px 10px' }}>Aucune conversation</p>
                    : [...convs].filter(c => !chatSearch || c.title.toLowerCase().includes(chatSearch.toLowerCase()) || c.messages.some(m => m.content.toLowerCase().includes(chatSearch.toLowerCase()))).sort((a, b) => b.createdAt - a.createdAt).map(c => (
                      <div key={c.id} style={{ position: 'relative' }}
                        onMouseEnter={e => { const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.del'); if (b) b.style.opacity = '1' }}
                        onMouseLeave={e => { const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.del'); if (b) b.style.opacity = '0' }}>
                        <button onClick={() => { onSelect(c.id); onClose?.() }} style={{ width: '100%', textAlign: 'left', padding: '5px 28px 5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11.5, background: c.id === activeId && view === 'chat' ? th.activeItem : 'transparent', color: c.id === activeId && view === 'chat' ? '#6366f1' : th.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.12s' }}
                          onMouseEnter={e => { if (!(c.id === activeId && view === 'chat')) (e.currentTarget as HTMLButtonElement).style.background = th.hover }}
                          onMouseLeave={e => { if (!(c.id === activeId && view === 'chat')) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                          {c.title}
                        </button>
                        <button className="del" onClick={e => { e.stopPropagation(); onDelete(c.id) }} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, opacity: 0, transition: 'opacity 0.15s', padding: 3 }}>
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
      </nav>

      {/* Bottom nav — always visible */}
      <div style={{ borderTop: `1px solid ${th.divider}`, padding: '6px 10px 10px', flexShrink: 0 }}>
        {navBtn('widget', 'Widget', Code, true)}
        {navBtn('dashboard', 'Tableau de bord', BarChart2, true)}
        {navBtn('pricing', 'Tarifs', Crown, true)}
        {navBtn('profile', 'Profil', UserCircle, true)}
        {navBtn('settings', 'Paramètres', Settings, true)}
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
  const th = useTheme()
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
      <label style={{ display: 'block', fontSize: 12, color: th.textSub, marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '9px 12px', color: th.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
        onBlur={e => (e.target.style.borderColor = th.border)} />
    </div>
  )

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      if (srcKey === 'url') {
        if (!url.trim()) { setError('Veuillez entrer une URL'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/url`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ url: url.trim() }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Échec')
        onAdded(d.doc)
      } else if (srcKey === 'pdf') {
        const file = fileRef.current?.files?.[0]
        if (!file) { setError('Veuillez sélectionner un fichier'); setLoading(false); return }
        const base64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = e => res((e.target?.result as string).split(',')[1] ?? '')
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name: file.name, content: base64, type: 'file' }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Échec')
        onAdded(d.doc)
      } else if (srcKey === 'crawl') {
        if (!url.trim()) { setError('Veuillez entrer une URL à explorer'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/crawl`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ url: url.trim(), max_pages: 10 }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Échec de l\'exploration')
        if (d.docs?.length > 0) onAdded(d.docs[0])
        else throw new Error('Aucune page trouvée')
      } else if (srcKey === 'text') {
        if (!name.trim() || !text.trim()) { setError('Veuillez remplir le nom et le contenu'); setLoading(false); return }
        const r = await fetch(`${API_BASE}/api/kb/text`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name: name.trim(), content: btoa(unescape(encodeURIComponent(text))), type: 'text' }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Échec')
        onAdded(d.doc)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const srcMeta: Record<SourceKey, { label: string; icon: React.ElementType; color: string }> = {
    url:        { label: 'URL du site',      icon: Globe,       color: '#3b82f6' },
    pdf:        { label: 'Importer fichier', icon: Upload,      color: '#8b5cf6' },
    text:       { label: 'Coller du texte',  icon: FileText,    color: '#6366f1' },
    crawl:      { label: 'Explorer un site', icon: RefreshCw,   color: '#14b8a6' },
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
          style={{ width: '100%', maxWidth: 460, background: th.modal, border: `1px solid ${th.border}`, borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={17} style={{ color: meta.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: th.text }}>Connecter {meta.label}</div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 2 }}>
                {isNative ? 'Indexer le contenu directement dans Lamu' : 'Disponible dans l\'app desktop'}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}><X size={16} /></button>
          </div>

          {isNative ? (
            <>
              {srcKey === 'url' && inp('URL de la page', url, setUrl, 'https://docs.example.com', 'url')}
              {srcKey === 'crawl' && (
                <>
                  {inp('URL du site à explorer', url, setUrl, 'https://docs.example.com', 'url')}
                  <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
                    <RefreshCw size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Lamu explorera jusqu'à 10 pages de ce domaine et indexera leur contenu automatiquement.
                  </div>
                </>
              )}
              {srcKey === 'pdf' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: th.textSub, marginBottom: 6, fontWeight: 500 }}>Fichier (PDF, TXT, DOCX)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px dashed ${th.border}`, cursor: 'pointer', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLLabelElement).style.borderColor = 'rgba(99,102,241,0.5)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLLabelElement).style.borderColor = th.border)}>
                    <Upload size={15} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: th.textSub }}>Cliquer pour parcourir…</span>
                    <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,.docx" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setFileName(file.name)
                          if (!name) setName(file.name)
                        }
                      }} />
                  </label>
                  {fileName && <div style={{ marginTop: 10, fontSize: 12, color: th.textSub }}>Fichier sélectionné : {fileName}</div>}
                </div>
              )}
              {srcKey === 'text' && (
                <>
                  {inp('Nom du document', name, setName, 'ex. FAQ Produit')}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, color: th.textSub, marginBottom: 6, fontWeight: 500 }}>Contenu</label>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Collez votre texte ici…"
                      style={{ width: '100%', background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '9px 12px', color: th.text, fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              {error && <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}

              {trialLimitReached ? (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <p style={{ fontSize: 13, color: '#fbbf24', marginBottom: 14 }}>Limite atteinte — le Free Trial est limité à 1 document.</p>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: th.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Passer à un plan payant
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${th.border}`, background: 'transparent', color: th.textSub, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
                  <button onClick={submit} disabled={loading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                    {loading ? <><Spinner /> Ajout en cours…</> : 'Ajouter à la base'}
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
                  <p style={{ fontSize: 13, color: th.textSub, lineHeight: 1.7, marginBottom: 20 }}>
                    Les intégrations comme <strong style={{ color: th.text }}>{meta.label}</strong> nécessitent un plan payant.
                  </p>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: th.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Passer à un plan payant
                  </a>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: th.textSub, lineHeight: 1.7, marginBottom: 20 }}>
                    L'intégration <strong style={{ color: th.text }}>{meta.label}</strong> est disponible dans l'<strong style={{ color: th.text }}>app desktop Lamu</strong>.<br />
                    Téléchargez l'app pour connecter {meta.label} et synchroniser vos connaissances automatiquement.
                  </p>
                  <a href="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#fff', color: '#000', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Télécharger Lamu
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
  const th = useTheme()
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
    { key: 'url',  icon: Globe,    label: 'Site web',        color: '#3b82f6' },
    { key: 'pdf',  icon: Upload,   label: 'Importer fichier', color: '#8b5cf6' },
    { key: 'text', icon: FileText, label: 'Coller du texte',  color: '#6366f1' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 580, maxHeight: '80vh', background: th.modal, border: `1px solid ${th.border}`, borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${th.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Library size={18} style={{ color: '#818cf8' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: th.text }}>Base de connaissances</span>
          <span style={{ fontSize: 12, color: th.textMuted }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}><X size={15} /></button>
        </div>

        {/* Add source row */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${th.divider}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          {KB_SOURCES.map(s => {
            const Icon = s.icon
            return (
              <button key={s.key} onClick={() => setSrcKey(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: `1px solid ${th.border}`, background: th.card, color: th.textSub, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '66'; b.style.background = s.color + '18'; b.style.color = '#fff' }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = th.border; b.style.background = th.card; b.style.color = th.textSub }}>
                <Icon size={13} style={{ color: s.color }} /> {s.label}
              </button>
            )
          })}
          <button onClick={() => setSrcKey('github')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: `1px solid ${th.border}`, background: 'transparent', color: th.textMuted, fontSize: 12, cursor: 'pointer' }}>
            <Plus size={12} /> Plus d'intégrations
          </button>
        </div>

        {/* Search + stats */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${th.divider}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans les documents…"
              style={{ width: '100%', background: th.hover, border: `1px solid ${th.border}`, borderRadius: 12, padding: '10px 14px', color: th.text, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ fontSize: 12, color: th.textMuted, minWidth: 160 }}>{filteredDocs.length} sur {docs.length} sources</div>
          <button onClick={() => { setSearch(''); setSelectedDoc(null) }} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${th.border}`, background: th.card, color: th.text, fontSize: 12, cursor: 'pointer' }}>Effacer</button>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedDoc ? '1.1fr 0.9fr' : '1fr', gap: 12, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 12px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: th.textMuted }}>
                <Database size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 13, margin: 0 }}>Aucun document — ajoutez une source ci-dessus</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: th.textMuted }}>
                <p style={{ fontSize: 13, margin: 0 }}>Aucun document ne correspond à votre recherche.</p>
              </div>
            ) : (
              filteredDocs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 10, marginBottom: 4, transition: 'background 0.15s', cursor: 'pointer', background: selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : 'transparent' }}
                  onClick={() => loadDocPreview(doc.id)}
                  onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : th.hover)}
                  onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.12)' : 'transparent')}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: doc.type === 'url' ? '#3b82f622' : '#8b5cf622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {doc.type === 'url' ? <Link size={14} style={{ color: '#3b82f6' }} /> : <FileText size={14} style={{ color: '#8b5cf6' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                    <div style={{ fontSize: 11, color: th.textMuted, marginTop: 2 }}>
                      {doc.url ? <span style={{ marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 220 }}>{doc.url}</span> : null}
                      {(doc.chars / 1000).toFixed(1)}k chars · {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); remove(doc.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4, flexShrink: 0, transition: 'color 0.15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#f87171')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = th.textMuted)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {selectedDoc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', borderRadius: 16, background: th.card, border: `1px solid ${th.border}`, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{selectedDoc.name}</div>
                  <div style={{ fontSize: 12, color: th.textMuted, marginTop: 3 }}>{selectedDoc.type.toUpperCase()} • {(selectedDoc.chars / 1000).toFixed(1)}k chars</div>
                </div>
                <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: `1px solid ${th.border}`, borderRadius: 10, padding: '6px 12px', color: th.textSub, fontSize: 12, cursor: 'pointer' }}>Fermer</button>
              </div>
              <div style={{ fontSize: 11, color: th.textMuted }}>{selectedDoc.url ? `URL source : ${selectedDoc.url}` : 'Fichier importé / texte collé'}</div>
              <div style={{ padding: '14px', borderRadius: 14, background: th.card, color: '#e5e7eb', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {previewLoading ? 'Chargement…' : selectedDoc.content ? selectedDoc.content.slice(0, 2600) + (selectedDoc.content.length > 2600 ? '…' : '') : 'Aperçu non disponible.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={!selectedDoc.content} onClick={() => navigator.clipboard.writeText(selectedDoc.content || '')}
                  style={{ padding: '10px 16px', borderRadius: 14, border: `1px solid ${th.border}`, background: th.card, color: th.text, fontSize: 12, cursor: 'pointer' }}>
                  Copier l'aperçu
                </button>
                {selectedDoc.url && (
                  <a href={selectedDoc.url} target="_blank" rel="noreferrer" style={{ padding: '10px 16px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontSize: 12, textDecoration: 'none' }}>
                    Ouvrir la source
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
  const th = useTheme()
  return (
    <div style={{ borderBottom: last ? 'none' : `1px solid ${th.divider}` }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 28px', background: 'transparent', border: 'none', cursor: onToggle ? 'pointer' : 'default', textAlign: 'left' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#22c55e' : 'rgba(99,102,241,0.8)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {done ? <CheckCircle size={15} /> : num}
        </div>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: done ? th.textMuted : th.text }}>{title}</span>
        {tag && <span style={{ fontSize: 12, color: done ? '#4ade80' : '#818cf8', fontWeight: 600 }}>{tag}</span>}
        {children && !done && <ChevronDown size={15} style={{ color: th.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />}
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
  { icon: Globe,       label: 'Website',     sub: 'Indexer une page',          color: '#3b82f6' },
  { icon: RefreshCw,   label: 'Crawl Site',  sub: 'Explorer un site entier',  color: '#14b8a6' },
  { icon: Upload,      label: 'Upload PDF',  sub: 'PDF, DOCX, TXT',          color: '#8b5cf6' },
  { icon: FileText,    label: 'Notion',      sub: 'Pages & bases de données', color: '#e5e7eb' },
  { icon: GitBranch,   label: 'GitHub',      sub: 'Repos & issues',          color: '#6ee7b7' },
  { icon: Database,    label: 'Google Drive',sub: 'Docs & feuilles',          color: '#34d399' },
  { icon: Building2,   label: 'Confluence',  sub: 'Espaces & pages',          color: '#60a5fa' },
  { icon: FileText,    label: 'Jira',        sub: 'Tickets & projets',        color: '#818cf8' },
  { icon: ShoppingBag, label: 'Shopify',     sub: 'Produits & commandes',     color: '#a78bfa' },
  { icon: Building2,   label: 'Salesforce',  sub: 'CRM & contacts',          color: '#38bdf8' },
  { icon: Globe,       label: 'SharePoint',  sub: 'Sites & documents',       color: '#2563eb' },
]

const CAPABILITIES = [
  { icon: Brain,       label: 'Chat RAG',                desc: 'Réponses basées sur votre base de connaissances — pas juste les données d\'entraînement', color: '#6366f1' },
  { icon: Search,      label: 'Recherche sémantique',   desc: 'Recherche vectorielle dans toutes vos sources pour trouver le contexte le plus pertinent', color: '#8b5cf6' },
  { icon: RefreshCw,   label: 'Sync automatique',       desc: 'Gardez vos sources à jour avec des re-crawls programmés et des mises à jour incrémentales', color: '#06b6d4' },
  { icon: Mic,         label: 'Entrée vocale',          desc: 'Speech-to-text Whisper — posez vos questions à la voix, mains libres', color: '#f59e0b' },
  { icon: Sparkles,    label: 'Personas personnalisés', desc: 'Les prompts système vous permettent de créer des agents spécialisés', color: '#ec4899' },
  { icon: BarChart2,   label: 'Suivi d\'activité',      desc: 'Chaque recherche enregistrée avec citations de sources et scores de similarité', color: '#22c55e' },
  { icon: Shield,      label: 'Privé par défaut',       desc: 'Tout fonctionne localement — vos données ne quittent jamais votre machine', color: '#f97316' },
  { icon: Zap,         label: 'IA Intelligente',          desc: 'Routage automatique vers le meilleur modele IA pour chaque tache', color: '#a78bfa' },
]

function SourceBtn({ icon: Icon, label, color, onClick }: { icon: React.ElementType; label: string; color: string; onClick: () => void }) {
  const th = useTheme()
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 20, border: `1px solid ${th.border}`, background: th.card, color: th.text, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = color + '66'; b.style.background = color + '18'; b.style.color = '#fff' }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = th.border; b.style.background = th.card; b.style.color = th.textSub }}>
      <Icon size={13} style={{ color, flexShrink: 0 }} /> {label}
    </button>
  )
}

const SRC_KEY_MAP: Record<string, SourceKey> = {
  'Website': 'url', 'Crawl Site': 'crawl', 'Upload PDF': 'pdf', 'Notion': 'text',
  'GitHub': 'github', 'Google Drive': 'gdrive', 'Confluence': 'confluence',
  'Jira': 'jira', 'Shopify': 'shopify', 'Salesforce': 'salesforce', 'SharePoint': 'sharepoint',
}

function HomeView({ hasChatted, onNewChat, setView, isTrial, userName, hasConfigured }: { hasChatted: boolean; onNewChat: () => void; setView: (v: View) => void; isTrial?: boolean; userName?: string | null; hasConfigured?: boolean }) {
  const th = useTheme()
  const [s1, setS1] = useState(true)
  const [s3, setS3] = useState(false)
  const [srcKey, setSrcKey] = useState<SourceKey | null>(null)
  const [showKb, setShowKb] = useState(false)
  const [docCount, setDocCount] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE}/api/kb`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : { docs: [] })
      .then(d => setDocCount((d.docs || []).length))
      .catch(() => {})
  }, [])

  const done = [docCount > 0, hasChatted, !!hasConfigured]
  const count = done.filter(Boolean).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Onboarding card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '22px 28px 18px', borderBottom: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26 }}>👋</span>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', color: th.text }}>{userName ? `Bienvenue, ${userName} !` : 'Préparer Lamu'}</h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: th.textMuted }}>Complétez ces étapes pour configurer votre agent IA</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < count ? '#6366f1' : th.border }} />)}
              <span style={{ fontSize: 12, color: th.textMuted, marginLeft: 4 }}>{count}/3</span>
            </div>
          </div>

          <StepCard num={1} title="Connecter une source de connaissances" done={done[0]} open={s1 && !done[0]} onToggle={() => setS1(v => !v)} tag={done[0] ? 'Fait' : undefined}>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: th.textMuted, lineHeight: 1.6 }}>Donnez à Lamu quelque chose à apprendre. Choisissez une source — l'agent l'indexera automatiquement.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_INTEGRATIONS.map(s => <SourceBtn key={s.label} icon={s.icon} label={s.label} color={s.color} onClick={() => setSrcKey(SRC_KEY_MAP[s.label] ?? 'url')} />)}
            </div>
          </StepCard>

          <StepCard num={2} title="Discuter avec Lamu" done={done[1]} open={false} onToggle={hasChatted ? undefined : onNewChat} tag={hasChatted ? 'Fait' : 'Commencer →'}>
            {null}
          </StepCard>

          <StepCard num={3} title="Configurer votre agent" done={done[2]} open={s3 && !done[2]} onToggle={() => setS3(v => !v)} tag={done[2] ? 'Fait' : undefined} last>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: th.textMuted, lineHeight: 1.6 }}>Definissez un prompt systeme et adaptez le comportement de Lamu a votre usage.</p>
            <button onClick={() => setView('settings')} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Ouvrir les paramètres
            </button>
          </StepCard>
        </motion.div>

        {/* ── Quick actions ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Actions rapides</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { icon: MessageSquare, label: 'Nouveau chat',        sub: 'Démarrer une conversation',  color: '#6366f1', action: onNewChat },
              { icon: Library,       label: 'Base de connaissances', sub: 'Gérer vos sources',         color: '#22c55e', action: () => setShowKb(true) },
              { icon: Settings,      label: 'Paramètres',          sub: 'Profil & prompt système',    color: '#f59e0b', action: () => setView('settings') },
              { icon: Zap,           label: 'Test rapide',         sub: 'Poser une question',         color: '#ec4899', action: onNewChat },
            ].map(card => {
              const Icon = card.icon
              return (
                <button key={card.label} onClick={card.action} style={{ padding: '16px', borderRadius: 12, border: `1px solid ${th.divider}`, background: th.card, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = th.hover; b.style.borderColor = card.color + '44' }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = th.card; b.style.borderColor = th.divider }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: card.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <Icon size={16} style={{ color: card.color }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: th.text, marginBottom: 2 }}>{card.label}</div>
                  <div style={{ fontSize: 11, color: th.textMuted }}>{card.sub}</div>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* ── What Lamu can do ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Ce que Lamu peut faire</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {CAPABILITIES.map(cap => {
              const Icon = cap.icon
              return (
                <div key={cap.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', borderRadius: 12, border: `1px solid ${th.divider}`, background: th.card }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: cap.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon size={16} style={{ color: cap.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: th.text, marginBottom: 4 }}>{cap.label}</div>
                    <div style={{ fontSize: 12, color: th.textMuted, lineHeight: 1.55 }}>{cap.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* ── All integrations ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Intégrations supportées</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {ALL_INTEGRATIONS.map(s => {
              const Icon = s.icon
              return (
                <button key={s.label} onClick={() => setSrcKey(SRC_KEY_MAP[s.label] ?? 'url')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 10px', borderRadius: 12, border: `1px solid ${th.divider}`, background: th.card, textAlign: 'center', cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '44'; b.style.background = s.color + '0d' }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = th.divider; b.style.background = th.card }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} style={{ color: s.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: th.text }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: th.textMuted, marginTop: 2 }}>{s.sub}</div>
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
  const th = useTheme()
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
  const [retryStatus, setRetryStatus] = useState('')
  const [pendingMessage, setPendingMessage] = useState<{ text: string; file: { name: string; content: string } | null } | null>(null)
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
    const c: Conversation = { id: uid(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() }
    setConvs(p => [...p, c]); setActiveId(c.id); setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [setConvs, setActiveId])

  // Send a message with auto-retry on network failure and offline queuing
  const sendMessage = useCallback(async (text: string, currentFile: { name: string; content: string } | null) => {
    if (!text || streaming) return
    setError(''); setSuggestions([]); setRetryStatus('')
    let convId = activeId
    if (!convId) { const c: Conversation = { id: uid(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); convId = c.id }

    // If offline, queue the message and show it as pending
    if (!navigator.onLine) {
      const displayText = currentFile ? `${text}\n📎 ${currentFile.name}` : text
      const uMsg: Message = { id: uid(), role: 'user', content: displayText, pending: true }
      setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: [...c.messages, uMsg] }))
      setPendingMessage({ text, file: currentFile })
      return
    }

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

      // Retry logic with exponential backoff (2s, 4s, 8s)
      const MAX_RETRIES = 3
      const BACKOFF_BASE = 2000
      let resp: Response | null = null
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          resp = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(body), signal: abortRef.current.signal })
          if (resp.ok && resp.body) break
          // Non-network error (e.g. 4xx/5xx) — don't retry
          const e = await resp.json().catch(() => ({ error: 'Request failed' }))
          if (e.trial_exhausted) throw new Error(e.error + '\n\n[TRIAL_EXHAUSTED]')
          throw new Error(e.error || `Server error ${resp.status}`)
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.name === 'AbortError') throw fetchErr
          const isNetworkError = !navigator.onLine || (fetchErr instanceof TypeError && (fetchErr.message.includes('Failed to fetch') || fetchErr.message.includes('NetworkError') || fetchErr.message.includes('Network request failed')))
          if (!isNetworkError || attempt >= MAX_RETRIES) throw fetchErr
          const delay = BACKOFF_BASE * Math.pow(2, attempt)
          setRetryStatus(`Reconnexion... (tentative ${attempt + 2}/${MAX_RETRIES + 1})`)
          await new Promise(r => setTimeout(r, delay))
        }
      }
      setRetryStatus('')
      if (!resp || !resp.ok || !resp.body) throw new Error('Request failed after retries')

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
      // Generate smart title for new conversations
      setConvs(p => {
        const conv = p.find(c => c.id === convId)
        if (conv && (conv.title === 'New conversation' || conv.title === 'Nouvelle conversation')) {
          generateConvTitle(conv.messages).then(title => {
            setConvs(pp => pp.map(c => c.id !== convId ? c : { ...c, title }))
          })
        }
        return p
      })
      onMessageSent?.()
      // Fetch follow-up suggestions
      const recentMsgs = [...prev.map(m => ({ role: m.role, content: m.content })).slice(-3), { role: 'user' as const, content: text }]
      fetch(`${API_BASE}/api/webapp/suggestions`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ messages: recentMsgs }) })
        .then(r => r.ok ? r.json() : { suggestions: [] })
        .then(d => setSuggestions(d.suggestions || []))
        .catch(() => {})
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setRetryStatus('')
      const isOffline = !navigator.onLine || (e instanceof TypeError && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('Network request failed')))
      setError(isOffline ? 'Vous êtes hors ligne. Vérifiez votre connexion internet et réessayez.' : (e instanceof Error ? e.message : 'Une erreur est survenue. Vérifiez que le serveur est en cours d\'exécution.'))
      setConvs(p => p.map(c => c.id !== convId ? c : { ...c, messages: c.messages.filter((m, i) => !(i === c.messages.length - 1 && m.role === 'assistant' && !m.content)) }))
    } finally { setStreaming(false) }
  }, [activeId, convs, model, system, streaming, setConvs, setActiveId, setStreaming, kbContext])

  const send = useCallback(() => {
    const text = input.trim(); if (!text || streaming) return
    const currentFile = attachedFile
    setInput(''); setAttachedFile(null)
    sendMessage(text, currentFile)
  }, [input, streaming, attachedFile, sendMessage])

  // Listen for online event to send queued message
  useEffect(() => {
    if (!pendingMessage) return
    const handleOnline = () => {
      const pm = pendingMessage
      setPendingMessage(null)
      // Remove the pending user message, sendMessage will re-add it properly
      setConvs(p => p.map(c => c.id !== activeId ? c : { ...c, messages: c.messages.filter(m => !m.pending) }))
      sendMessage(pm.text, pm.file)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [pendingMessage, activeId, sendMessage, setConvs])

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Top bar */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', gap: 8, background: th.headerBg, backdropFilter: 'blur(12px)', flexShrink: 0 }}>
        <button onClick={() => setShowCfg(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '5px 10px', color: th.text, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            <img src="/lamu-icon.png" alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />Lamu AI<ChevronDown size={11} style={{ opacity: 0.5 }} />
          </button>
        {prompts.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowPrompts(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '5px 10px', color: th.textSub, fontSize: 12, cursor: 'pointer' }}>
              <Sparkles size={11} style={{ color: '#f59e0b' }} /> Modèles
            </button>
            <AnimatePresence>
              {showPrompts && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  style={{ position: 'absolute', top: '110%', left: 0, width: 260, background: th.modal, border: `1px solid ${th.border}`, borderRadius: 12, padding: 6, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {prompts.map(p => (
                    <button key={p.title} onClick={() => { setSystem(p.prompt); setShowPrompts(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = th.hover)}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: th.text }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: th.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.prompt}</div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {agents.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAgents(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: activeAgent ? 'rgba(20,184,166,0.12)' : th.hover, border: `1px solid ${activeAgent ? 'rgba(20,184,166,0.3)' : th.border}`, borderRadius: 8, padding: '5px 10px', color: activeAgent ? '#5eead4' : th.textSub, fontSize: 12, cursor: 'pointer' }}>
              <Users size={11} /> {activeAgent ? agents.find(a => a.id === activeAgent)?.name || 'Agent' : 'Agents IA'}
              <ChevronDown size={11} style={{ opacity: 0.5 }} />
            </button>
            <AnimatePresence>
              {showAgents && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  style={{ position: 'absolute', top: '110%', left: 0, width: 220, background: th.modal, border: `1px solid ${th.border}`, borderRadius: 12, padding: 6, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  <button onClick={() => { setActiveAgent(null); setSystem(''); setShowAgents(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, background: !activeAgent ? th.hover : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: !activeAgent ? th.text : th.textSub }}>
                    Par défaut (Lamu)
                  </button>
                  {agents.map(a => (
                    <button key={a.id} onClick={() => { setActiveAgent(a.id); setSystem(a.system_prompt || ''); setShowAgents(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, background: activeAgent === a.id ? 'rgba(20,184,166,0.12)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: activeAgent === a.id ? '#5eead4' : th.textSub }}
                      onMouseEnter={e => { if (activeAgent !== a.id) (e.currentTarget as HTMLButtonElement).style.background = th.hover }}
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
              setError('Lien copié ! ' + url)
              setTimeout(() => setError(''), 3000)
            }
          }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '5px 10px', color: th.textSub, fontSize: 12, cursor: 'pointer' }}>
            <Share2 size={12} /> Partager
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
          }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '5px 10px', color: th.textSub, fontSize: 12, cursor: 'pointer' }}>
            <Download size={12} /> Exporter
          </button>
        )}
        <button onClick={() => setShowCfg(v => !v)} style={{ display: 'flex', alignItems: 'center', background: showCfg ? 'rgba(99,102,241,0.15)' : th.hover, border: `1px solid ${showCfg ? 'rgba(99,102,241,0.3)' : th.border}`, borderRadius: 8, padding: '5px 10px', color: showCfg ? '#818cf8' : th.textSub, fontSize: 12, cursor: 'pointer' }}>
          <Settings size={12} />
        </button>
        <button onClick={newChat} style={{ display: 'flex', alignItems: 'center', background: th.hover, border: `1px solid ${th.border}`, borderRadius: 8, padding: '5px 10px', color: th.textSub, fontSize: 12, cursor: 'pointer' }}>
          <Plus size={13} />
        </button>
      </div>
      {kbContext && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(99,102,241,0.05)', color: th.text, fontSize: 13 }}>
          <div>Source de connaissances : <strong style={{ color: th.text }}>{kbContext.name}</strong></div>
          <button onClick={clearKbContext} style={{ background: 'none', border: `1px solid ${th.border}`, borderRadius: 8, padding: '6px 10px', color: th.text, cursor: 'pointer' }}>Retirer la source</button>
        </div>
      )}

      {/* Config panel */}
      <AnimatePresence>
        {showCfg && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: `1px solid ${th.divider}`, background: th.card, flexShrink: 0 }}>
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Prompt système</div>
                <textarea value={system} onChange={e => setSystem(e.target.value)} rows={2} placeholder="Vous êtes un assistant utile…" style={{ width: '100%', background: th.input, border: `1px solid ${th.border}`, borderRadius: 8, padding: '8px 12px', color: th.text, fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {system && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(99,102,241,0.9)', background: 'rgba(99,102,241,0.08)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}><BookOpen size={12} /> Prompt système actif</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {msgs.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '80px 20px 40px' }}>
              <img src="/lamu-icon.png" alt="Lamu AI" style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto 20px', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }} />
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px', color: th.text }}>{userName ? `Bonjour ${userName} !` : 'Comment puis-je vous aider ?'}</h2>
              <p style={{ color: th.textMuted, fontSize: 14, maxWidth: 360, margin: '0 auto 32px', lineHeight: 1.7 }}>Posez vos questions — je suis connecté à votre base de connaissances et prêt à vous assister.</p>
              {prompts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520, margin: '0 auto' }}>
                  {prompts.slice(0, 6).map(p => (
                    <button key={p.title} onClick={() => { setSystem(p.prompt); inputRef.current?.focus() }} style={{ padding: '8px 16px', borderRadius: 20, border: `1px solid ${th.border}`, background: th.card, color: th.textSub, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = th.text }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = th.border; (e.currentTarget as HTMLButtonElement).style.color = th.textSub }}>
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : msgs.map((m, i) => <Bubble key={m.id} msg={m} isLast={i === msgs.length - 1 && m.role === 'assistant'} streaming={streaming} feedback={feedbackMap[m.id] || null} onFeedback={r => handleFeedback(m.id, r)} />)}
          {retryStatus && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24', fontSize: 13 }}>
              <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> {retryStatus}
            </motion.div>
          )}
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
      <div style={{ flexShrink: 0, padding: '12px 20px 20px', background: th.headerBg, backdropFilter: 'blur(12px)', borderTop: `1px solid ${th.divider}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {attachedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 12, color: '#a5b4fc' }}>
              <Paperclip size={11} /> {attachedFile.name} <span style={{ color: th.textMuted }}>({(attachedFile.content.length / 1000).toFixed(1)}k chars)</span>
              <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, marginLeft: 'auto', padding: 2 }}><X size={11} /></button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: th.hover, border: `1px solid ${th.border}`, borderRadius: 16, padding: '10px 12px', transition: 'border-color 0.2s' }}
            onFocusCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlurCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = th.border)}>
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
                    else setAttachedFile({ name: file.name, content: '[Impossible d\'extraire le texte du fichier]' })
                  } catch { setAttachedFile({ name: file.name, content: '[Impossible d\'extraire le texte du fichier]' }) }
                } else {
                  const reader = new FileReader(); reader.onload = ev => setAttachedFile({ name: file.name, content: (ev.target?.result as string || '').slice(0, 12000) }); reader.readAsText(file)
                }
              }} />
            <button onClick={() => fileInputRef.current?.click()} title="Attach file"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: attachedFile ? '#818cf8' : th.textMuted, padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Paperclip size={16} />
            </button>
            <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={onKey} placeholder="Message Lamu… (Entrée ↵ pour envoyer)" disabled={streaming} rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: th.text, fontSize: 14, lineHeight: 1.55, resize: 'none', maxHeight: 140, overflowY: 'auto', fontFamily: 'inherit', opacity: streaming ? 0.7 : 1 }} />
            <button onClick={send} disabled={!input.trim() || streaming} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: !input.trim() || streaming ? 'rgba(99,102,241,0.3)' : '#6366f1', transition: 'all 0.2s' }}>
              {streaming ? <Spinner /> : <Send size={15} color="#fff" />}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: th.textMuted, marginTop: 8 }}>Shift+Entrée pour nouvelle ligne · 📎 Joindre des fichiers · Conversations sauvegardées localement</p>
        </div>
      </div>
    </div>
  )
}

// ── Settings view ──────────────────────────────────────────────────────────────

// ── Widget management view ───────────────────────────────────────────────────

interface WidgetAgent { id: string; name: string; system_prompt: string; welcome_message: string; color: string; allowed_origins: string; created_at: string }

function WidgetView() {
  const th = useTheme()
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

  const cardStyle: React.CSSProperties = { padding: '16px 20px', borderRadius: 12, background: th.card, border: `1px solid ${th.border}`, marginBottom: 14 }
  const inputStyle: React.CSSProperties = { width: '100%', background: th.input, border: `1px solid ${th.border}`, borderRadius: 8, padding: '10px 14px', color: th.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8, display: 'block' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: th.text, margin: 0 }}>Agents Widget</h2>
            <p style={{ fontSize: 13, color: th.textMuted, margin: '4px 0 0' }}>Intégrez un chatbot IA sur votre site web</p>
          </div>
          <button onClick={() => openEdit()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: th.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nouvel Agent
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: th.textMuted }}>Chargement...</div>}

        {!loading && agents.length === 0 && !editing && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 20px' }}>
            <Code size={36} style={{ color: th.textMuted, marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: th.text, margin: '0 0 8px' }}>Aucun agent</h3>
            <p style={{ fontSize: 13, color: th.textMuted, margin: '0 0 20px' }}>Créez votre premier agent widget et intégrez-le sur votre site web.</p>
            <button onClick={() => openEdit()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Créer un agent</button>
          </div>
        )}

        {/* Agent list */}
        {agents.map(agent => (
          <div key={agent.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: th.text }}>{agent.name}</div>
              <button onClick={() => openEdit(agent)} style={{ background: th.hover, border: `1px solid ${th.border}`, borderRadius: 6, padding: '4px 10px', color: th.textSub, fontSize: 11, cursor: 'pointer' }}>Modifier</button>
              <button onClick={() => del(agent.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Supprimer</button>
            </div>
            <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 10 }}>ID: {agent.id}</div>
            <div style={{ background: th.codeBg, borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: '#a5b4fc', wordBreak: 'break-all', lineHeight: 1.6, position: 'relative' }}>
              {getSnippet(agent)}
              <button onClick={() => copySnippet(agent)} style={{ position: 'absolute', top: 8, right: 8, background: th.hover, border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: copied === agent.id ? '#4ade80' : th.textSub, fontSize: 11 }}>
                {copied === agent.id ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
              </button>
            </div>
          </div>
        ))}

        {/* Edit/Create form */}
        <AnimatePresence>
          {editing && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              style={{ ...cardStyle, borderColor: 'rgba(99,102,241,0.3)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: th.text, margin: '0 0 16px' }}>{editing.id ? 'Modifier l\'agent' : 'Nouvel Agent'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom de l'agent</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mon agent support" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Prompt système</label>
                  <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={3} placeholder="Tu es un agent de support client pour..." style={{ ...inputStyle, resize: 'vertical' as const }} />
                </div>
                <div>
                  <label style={labelStyle}>Message d'accueil</label>
                  <input value={form.welcome_message} onChange={e => setForm(f => ({ ...f, welcome_message: e.target.value }))} placeholder="Bonjour ! Comment puis-je vous aider ?" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Couleur</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
                      <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                    </div>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Origines autorisées (séparées par virgules, vide = toutes)</label>
                    <input value={form.allowed_origins} onChange={e => setForm(f => ({ ...f, allowed_origins: e.target.value }))} placeholder="example.com, mysite.com" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${th.border}`, background: 'transparent', color: th.textSub, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
                  <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sauvegarder</button>
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
  const th = useTheme()
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  const applyTemplate = (t: typeof INDUSTRY_TEMPLATES[0]) => {
    setSystem(t.prompt)
    setActiveTemplate(t.label)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.4px', color: th.text }}>Paramètres</h2>
        <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: th.card, border: `1px solid ${th.border}` }}>
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Connexion</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.textSub }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: models.length > 0 ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
            {models.length > 0 ? 'Connecté — Lamu AI opérationnel' : 'Non connecté — vérifiez que le backend Lamu fonctionne sur le port 3000'}
          </div>
        </div>

        {/* Industry Templates */}
        <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: th.card, border: `1px solid ${th.border}` }}>
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Profils rapides</div>
          <p style={{ fontSize: 12, color: th.textMuted, margin: '0 0 14px' }}>Appliquez un profil pour adapter le comportement de Lamu a votre cas d'usage.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {INDUSTRY_TEMPLATES.map(t => {
              const Icon = t.icon
              const isActive = activeTemplate === t.label
              return (
                <button key={t.label} onClick={() => applyTemplate(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${isActive ? t.color + '55' : th.border}`, background: isActive ? t.color + '15' : th.card, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = t.color + '33' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = th.border }}>
                  <Icon size={16} style={{ color: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? t.color : th.textSub }}>{t.label}</span>
                  {isActive && <Check size={12} style={{ color: t.color, marginLeft: 'auto' }} />}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRadius: 12, background: th.card, border: `1px solid ${th.border}` }}>
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Prompt système personnalisé</div>
          <textarea value={system} onChange={e => { setSystem(e.target.value); setActiveTemplate(null) }} rows={4} placeholder="Tu es un assistant IA utile…" style={{ width: '100%', background: th.input, border: `1px solid ${th.border}`, borderRadius: 8, padding: '10px 14px', color: th.text, fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
          {system && (
            <button onClick={() => { setSystem(''); setActiveTemplate(null) }} style={{ marginTop: 8, fontSize: 12, color: th.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Effacer le prompt
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Activity placeholder ───────────────────────────────────────────────────────

function KnowledgeSearchView({ onAskDoc }: { onAskDoc: (doc: KbDoc) => void }) {
  const th = useTheme()
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
      let systemPrompt = 'Réponds à la question de l\'utilisateur en utilisant les documents de la base de connaissances. Cite tes sources entre crochets [Nom du Document]. Si aucun document ne contient d\'information pertinente, dis-le. Réponds dans la même langue que la question (français si français, anglais si anglais). Écris des phrases complètes et correctes.'
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
        throw new Error(errBody.error || 'Échec de la requête IA')
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
      setAiAnswer(e instanceof Error ? e.message : 'Échec de la génération de réponse IA.')
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
      if (!r.ok) { throw new Error('Échec de la recherche') }
      const d = await r.json()
      const docs = d.docs || []
      setResults(docs)
      setSelectedDoc(docs[0] || null)
      // Call AI even with no SQL results — the backend injects all KB docs as context
      if (q.trim()) askAiFromResults(q, docs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la recherche')
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
      if (!r.ok) { throw new Error('Échec du résumé') }
      const d = await r.json()
      setSummary(d.summary || 'No summary available')
    } catch (e) {
      setSummary('Échec de la génération du résumé')
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
          <div style={{ borderRadius: 18, padding: '24px 28px', background: th.card, border: `1px solid ${th.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Recherche de connaissances</div>
                <div style={{ fontSize: 13, color: th.textSub, marginTop: 6 }}>Recherchez dans vos sources et focalisez le chat sur les documents les plus pertinents.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(99,102,241,0.12)', color: th.text, fontSize: 12 }}>Sources {stats ? stats.total : '–'}</div>
                <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(99,102,241,0.12)', color: th.text, fontSize: 12 }}>Chars {stats ? Math.round(stats.chars / 1000) + 'k' : '–'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch(query) }} placeholder="Rechercher documents, URLs, mots-clés..."
                  style={{ width: '100%', borderRadius: 14, border: `1px solid ${th.inputBorder}`, background: th.input, color: th.text, padding: '14px 16px', fontSize: 14, outline: 'none' }} />
              </div>
              <button onClick={() => runSearch(query)} style={{ padding: '14px 20px', borderRadius: 14, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Rechercher</button>
              <button onClick={() => { setQuery(''); runSearch('') }} style={{ padding: '14px 20px', borderRadius: 14, border: `1px solid ${th.border}`, background: th.card, color: th.text, cursor: 'pointer' }}>Réinitialiser</button>
            </div>
            {error && <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13 }}>{error}</div>}
          </div>

          <div style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${th.border}`, background: th.card }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${th.border}`, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: th.textMuted }}>Résultats</div>
            <div style={{ minHeight: 260, maxHeight: 680, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 36 }}><Spinner /></div>
              ) : results.length === 0 ? (
                <div style={{ padding: 32, color: th.textMuted, fontSize: 13, textAlign: 'center' }}>Aucun document trouvé.</div>
              ) : results.map(doc => (
                <div key={doc.id} onClick={() => { setSelectedDoc(doc); setSummary(''); setSummarizing(false) }} style={{ padding: '16px 18px', borderBottom: `1px solid ${th.border}`, cursor: 'pointer', background: selectedDoc?.id === doc.id ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{doc.name}</div>
                      <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>{doc.url || doc.type.toUpperCase()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(doc as any).similarity != null && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600 }}>{Math.round((doc as any).similarity * 100)}%</span>}
                      <span style={{ fontSize: 11, color: th.textMuted, whiteSpace: 'nowrap' }}>{(doc.chars / 1000).toFixed(1)}k</span>
                    </div>
                  </div>
                  {doc.excerpt ? <p style={{ margin: '12px 0 0', color: th.textSub, fontSize: 13, lineHeight: 1.7 }}>{doc.excerpt}</p> : null}
                </div>
              ))}
            </div>
          </div>

          {(aiAnswer || isAiAnswering) && (
            <div style={{ borderRadius: 18, padding: '20px 24px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Brain size={16} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>Réponse IA</span>
                {isAiAnswering && <Spinner />}
              </div>
              <div style={{ fontSize: 13, color: th.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{aiAnswer || 'Réflexion…'}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderRadius: 18, padding: '24px 26px', background: th.card, border: `1px solid ${th.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 12 }}>Source sélectionnée</div>
            {!selectedDoc ? (
              <div style={{ color: th.textMuted, fontSize: 13, lineHeight: 1.7 }}>Cliquez sur un résultat pour voir son contenu et interroger Lamu.</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 4 }}>{selectedDoc.name}</div>
                <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 16 }}>{selectedDoc.url || selectedDoc.type.toUpperCase()}</div>
                <div style={{ fontSize: 13, color: th.textSub, lineHeight: 1.7, minHeight: 140, whiteSpace: 'pre-wrap' }}>{selectedDoc.excerpt || 'Aperçu non disponible pour cette source.'}</div>
                {summary && (
                  <div style={{ marginTop: 16, padding: '12px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: th.text, marginBottom: 8 }}>Résumé IA</div>
                    <div style={{ fontSize: 13, color: th.text, lineHeight: 1.6 }}>{summary}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => summarizeDoc(selectedDoc.id)} disabled={summarizing} style={{ padding: '10px 16px', borderRadius: 14, border: `1px solid ${th.border}`, background: th.card, color: th.text, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {summarizing ? <Spinner /> : <Brain size={14} />} {summarizing ? 'Résumé en cours...' : 'Résumer'}
                  </button>
                  <button onClick={() => onAskDoc(selectedDoc)} style={{ padding: '10px 16px', borderRadius: 14, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Utiliser dans le chat</button>
                </div>
              </>
            )}
          </div>

          <div style={{ borderRadius: 18, padding: '22px 24px', background: th.card, border: `1px solid ${th.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 12 }}>Pourquoi c'est important</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: th.textSub, fontSize: 13, lineHeight: 1.8 }}>
              <li>Recherchez dans vos sources avant de poser une question.</li>
              <li>Focalisez l'assistant sur le document exact dont vous avez besoin.</li>
              <li>Gardez la recherche de connaissances efficace et précise.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView() {
  const th = useTheme()
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
    const type = doc.type === 'url' ? 'URLs' : doc.type === 'file' ? 'Fichiers' : 'Texte'
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
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: th.text }}>Tableau de bord</h1>
          <p style={{ fontSize: 14, color: th.textSub, marginTop: 8 }}>Vue d'ensemble de l'activité et analytiques</p>
        </div>

        {/* Chat Analytics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
          {[
            { icon: MessageCircle, color: '#6366f1', value: analytics?.total_messages || 0, label: 'Messages totaux' },
            { icon: MessageSquare, color: '#8b5cf6', value: analytics?.total_conversations || 0, label: 'Conversations' },
            { icon: ThumbsUp, color: '#22c55e', value: analytics?.feedback?.up || 0, label: 'Retours positifs' },
            { icon: ThumbsDown, color: '#ef4444', value: analytics?.feedback?.down || 0, label: 'Retours négatifs' },
            { icon: Star, color: '#f59e0b', value: analytics?.satisfaction_rate != null ? `${analytics.satisfaction_rate}%` : '—', label: 'Satisfaction' },
            { icon: Database, color: '#3b82f6', value: stats?.total || 0, label: 'Sources KB' },
          ].map((card, i) => {
            const Icon = card.icon
            return (
              <div key={i} style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 14, padding: '20px', textAlign: 'center' }}>
                <Icon size={24} style={{ color: card.color, margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: 22, fontWeight: 700, color: th.text }}>{card.value}</div>
                <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4 }}>{card.label}</div>
              </div>
            )
          })}
        </div>

        {/* Messages per day chart */}
        {analytics?.daily && analytics.daily.length > 0 && (
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 20px' }}>Messages par jour (30 jours)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
              {analytics.daily.map((d, i) => {
                const max = Math.max(...analytics.daily.map(x => x.count))
                const h = max > 0 ? (d.count / max) * 100 : 0
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${d.count} messages`}>
                    <div style={{ fontSize: 9, color: th.textMuted }}>{d.count || ''}</div>
                    <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(h, 3)}%`, background: 'linear-gradient(180deg, #6366f1, #4f46e5)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    {i % 5 === 0 && <div style={{ fontSize: 8, color: th.textMuted, marginTop: 2 }}>{d.date.slice(5)}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Questions */}
        {analytics?.recent_questions && analytics.recent_questions.length > 0 && (
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 16px' }}>Questions récentes</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analytics.recent_questions.map((q, i) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: th.card, border: `1px solid ${th.divider}`, fontSize: 13, color: th.textSub, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MessageCircle size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
                  {q}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Widget Chat History */}
        {widgetHistory.length > 0 && (
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 16px' }}>Conversations Widget</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {widgetHistory.slice(0, 10).map(wc => {
                const firstUserMsg = (wc.messages || []).find((m: Message) => m.role === 'user')
                return (
                  <div key={wc.id} style={{ padding: '12px 14px', borderRadius: 10, background: th.card, border: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Code size={14} style={{ color: '#14b8a6', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: th.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {firstUserMsg?.content || 'Aucun message'}
                      </div>
                      <div style={{ fontSize: 11, color: th.textMuted, marginTop: 2 }}>
                        {wc.agent_name || 'Agent par défaut'} · {(wc.messages || []).length} msgs · {new Date(wc.created_at).toLocaleDateString()}
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
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <Database size={32} style={{ color: '#6366f1', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: th.text }}>{stats?.total || 0}</div>
            <div style={{ fontSize: 12, color: th.textSub }}>Sources totales</div>
          </div>
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <FileText size={32} style={{ color: '#8b5cf6', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: th.text }}>{stats ? Math.round(stats.chars / 1000) : 0}k</div>
            <div style={{ fontSize: 12, color: th.textSub }}>Caractères totaux</div>
          </div>
          <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px', textAlign: 'center' }}>
            <BarChart2 size={32} style={{ color: '#22c55e', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 24, fontWeight: 700, color: th.text }}>{Object.keys(sourceTypeData).length}</div>
            <div style={{ fontSize: 12, color: th.textSub }}>Types de sources</div>
          </div>
        </div>

        {/* Source Type Distribution */}
        <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 20px' }}>Sources par type</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(sourceTypeData).map(([type, count]) => (
              <div key={type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: th.text }}>{type}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#818cf8' }}>{count}</span>
                </div>
                <div style={{ height: 8, background: th.hover, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#818cf8)', width: `${(count / Math.max(...Object.values(sourceTypeData))) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Documents */}
        <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 20px' }}>Documents les plus volumineux</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {docs.slice(0, 5).map(doc => (
              <div key={doc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: th.text, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                  <span style={{ fontSize: 12, color: th.textSub }}>{(doc.chars / 1000).toFixed(1)}k</span>
                </div>
                <div style={{ height: 8, background: th.hover, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#6366f1)', width: `${(doc.chars / maxChars) * 100}%` }} />
                </div>
              </div>
            ))}
            {docs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: th.textMuted }}>
                Aucun document. Ajoutez des sources pour voir votre tableau de bord.
              </div>
            )}
          </div>
        </div>

        {/* Recent Documents */}
        <div style={{ background: th.card, border: `1px solid ${th.border}`, borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 20px' }}>Documents récents</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {docs.slice(0, 5).map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 10, background: th.card, border: `1px solid ${th.divider}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: doc.type === 'url' ? '#3b82f622' : '#8b5cf622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {doc.type === 'url' ? <Link size={14} style={{ color: '#3b82f6' }} /> : <FileText size={14} style={{ color: '#8b5cf6' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: th.text }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: th.textMuted }}>{doc.url || doc.type.toUpperCase()} • {(doc.chars / 1000).toFixed(1)}k chars • {new Date(doc.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
            {docs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted }}>
                Aucun document. Ajoutez des sources pour voir votre tableau de bord.
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

function PricingView({ currentPlan, onUpgrade }: { currentPlan?: string; onUpgrade?: (planId: string) => void }) {
  const th = useTheme()
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState('')
  const [success, setSuccess] = useState<{ plan_name: string; license_key: string } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/plans`)
      .then(r => r.ok ? r.json() : { plans: [] })
      .then(d => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId)
    try {
      const r = await apiFetch(`${API_BASE}/api/payment/initiate`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ plan_id: planId }) })
      const d = await r.json()
      if (!r.ok || !d.success) { showToast(d.error || 'Échec de la mise à niveau', 'error'); return }

      // If provider returned a checkout URL, redirect user to payment page
      if (d.payment_url) {
        // Save tx_id so we can check on return
        localStorage.setItem('lamu_pending_tx', d.tx_id)
        window.location.href = d.payment_url
        return
      }

      // Mock mode (no provider configured) — instant confirmation
      if (d.mock && d.license_key) {
        setSuccess({ plan_name: d.plan_name, license_key: d.license_key })
        showToast(`Upgrade vers ${d.plan_name} réussi !`, 'success')
        onUpgrade?.(planId)
      }
    } catch { showToast('Erreur réseau', 'error') }
    finally { setUpgrading('') }
  }

  // On mount: check if returning from payment redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const txFromUrl = params.get('tx_id')
    const txFromStorage = localStorage.getItem('lamu_pending_tx')
    const txId = txFromUrl || txFromStorage
    if (!txId) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 20 // ~60 seconds

    const poll = async () => {
      if (cancelled) return
      try {
        const r = await fetch(`${API_BASE}/api/payment/verify/${txId}`)
        const d = await r.json()
        if (d.status === 'confirmed') {
          localStorage.removeItem('lamu_pending_tx')
          setSuccess({ plan_name: d.plan_name || '', license_key: d.license_key || '' })
          showToast('Paiement confirmé ! Votre licence est active.', 'success')
          onUpgrade?.('')
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname)
          return
        }
        if (d.status === 'failed' || d.status === 'expired') {
          localStorage.removeItem('lamu_pending_tx')
          showToast(d.status === 'expired' ? 'Le paiement a expiré' : 'Le paiement a échoué', 'error')
          window.history.replaceState({}, '', window.location.pathname)
          return
        }
        // Still pending — retry
        attempts++
        if (attempts < maxAttempts) setTimeout(poll, 3000)
        else { localStorage.removeItem('lamu_pending_tx'); showToast('Délai d\'attente dépassé. Vérifiez votre email pour la licence.', 'info') }
      } catch {
        attempts++
        if (attempts < maxAttempts) setTimeout(poll, 5000)
      }
    }
    poll()
    return () => { cancelled = true }
  }, [])

  const PLAN_COLORS = ['#22c55e', '#6366f1', '#8b5cf6', '#f59e0b', '#ec4899']
  const formatFeature = (f: string) => f.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px 48px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: th.text, margin: '0 0 8px', letterSpacing: '-0.5px' }}>Choisissez votre plan</h1>
          <p style={{ fontSize: 14, color: th.textMuted, margin: 0 }}>Adaptez Lamu AI à vos besoins</p>
        </div>

        {success && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '20px 24px', borderRadius: 14, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>Bienvenue sur {success.plan_name} !</div>
            <div style={{ fontSize: 13, color: th.textSub, marginBottom: 8 }}>Votre compte a été mis à niveau. Rechargez la page pour voir les changements.</div>
            <div style={{ fontSize: 11, color: th.textMuted, fontFamily: 'monospace' }}>Licence : {success.license_key}</div>
          </motion.div>
        )}

        {plans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: th.textMuted }}>Aucun plan configuré. Configurez vos plans dans l'admin SaaS.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`, gap: 18 }}>
            {plans.map((plan, idx) => {
              const color = plan.color || PLAN_COLORS[idx % PLAN_COLORS.length]
              const isCurrent = currentPlan === String(plan.id) || currentPlan === plan.name.toLowerCase().replace(/\s+/g, '_')
              const isPopular = idx === Math.floor(plans.length / 2)
              const priceDisplay = plan.price <= 0 ? 'Gratuit' : `${plan.price.toLocaleString()} ${plan.currency || 'XAF'}`
              const isUpgrading = upgrading === plan.id
              return (
                <div key={plan.id} style={{ position: 'relative', borderRadius: 16, border: `1px solid ${isPopular ? color + '55' : th.border}`, background: isPopular ? color + '08' : th.card, padding: '28px 22px', display: 'flex', flexDirection: 'column' }}>
                  {isPopular && (
                    <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 20, background: color, color: '#fff', fontSize: 11, fontWeight: 700 }}>Populaire</div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 6 }}>{plan.name}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: th.text, marginBottom: 4 }}>
                    {priceDisplay}
                  </div>
                  {plan.billing_period && <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 12 }}>/ {plan.billing_period}</div>}
                  {plan.description && <p style={{ fontSize: 12, color: th.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>{plan.description}</p>}
                  {plan.max_requests > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.textSub, marginBottom: 6 }}>
                      <CheckCircle size={14} style={{ color, flexShrink: 0 }} /> {plan.max_requests.toLocaleString()} requêtes
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                    {(plan.features || []).map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.textSub }}>
                        <CheckCircle size={14} style={{ color, flexShrink: 0 }} /> {formatFeature(f)}
                      </div>
                    ))}
                  </div>
                  <button onClick={isCurrent ? undefined : () => handleUpgrade(plan.id)} disabled={isUpgrading}
                    style={{ width: '100%', padding: '11px', borderRadius: 10, border: isCurrent ? `1px solid ${color}44` : 'none', background: isCurrent ? 'transparent' : isPopular ? color : th.hover, color: isCurrent ? color : '#fff', fontSize: 13, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer', opacity: isCurrent || isUpgrading ? 0.7 : 1 }}>
                    {isCurrent ? 'Plan actuel' : isUpgrading ? 'Traitement…' : 'Choisir ce plan'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 32, padding: '20px', borderRadius: 12, background: th.card, border: `1px solid ${th.divider}` }}>
          <p style={{ fontSize: 13, color: th.textMuted, margin: 0 }}>
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
  const th = useTheme()
  const [convCount, setConvCount] = useState(0)
  const [msgCount, setMsgCount] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE}/api/webapp/analytics`, { headers: webHdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setConvCount(d.total_conversations || 0); setMsgCount(d.total_messages || 0) } })
      .catch(() => {})
  }, [])

  const infoRow = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${th.divider}` }}>
      <span style={{ fontSize: 13, color: th.textSub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || th.text }}>{value}</span>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(99,102,241,0.25)' }}>
            <UserCircle size={36} color="#fff" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: th.text, margin: '0 0 4px' }}>{user.name || user.email.split('@')[0]}</h2>
          <p style={{ fontSize: 13, color: th.textMuted, margin: 0 }}>{user.email}</p>
        </div>

        <div style={{ borderRadius: 14, background: th.card, border: `1px solid ${th.border}`, padding: '4px 20px', marginBottom: 20 }}>
          {infoRow('Plan', user.plan_name, user.trial ? '#4ade80' : '#818cf8')}
          {infoRow('Requêtes max', user.trial ? `${user.max_requests} (essai)` : 'Illimité')}
          {user.trial && infoRow('Messages utilisés', `${user.messages_used ?? 0} / ${user.max_requests}`, (user.messages_remaining ?? 0) <= 3 ? '#fbbf24' : undefined)}
          {user.trial && infoRow('Messages restants', `${user.messages_remaining ?? 0}`, (user.messages_remaining ?? 0) <= 3 ? '#f87171' : '#4ade80')}
          {user.expires_at && infoRow('Expiration', new Date(user.expires_at).toLocaleDateString())}
        </div>

        <div style={{ borderRadius: 14, background: th.card, border: `1px solid ${th.border}`, padding: '4px 20px', marginBottom: 20 }}>
          {infoRow('Total conversations', String(convCount))}
          {infoRow('Messages envoyés', String(msgCount))}
          <div style={{ padding: '12px 0' }}>
            <span style={{ fontSize: 13, color: th.textSub }}>Fonctionnalités</span>
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
            <Crown size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Passer au Pro
          </button>
        )}

        <button onClick={onLogout}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <LogOut size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Se déconnecter
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

const mkCard = (th: ThemeColors) => ({ borderRadius: 18, padding: '24px 28px', background: th.card, border: `1px solid ${th.border}` }) as const
const mkBtnP = (th: ThemeColors) => ({ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700 as const, cursor: 'pointer' as const, fontSize: 13 })
const mkBtnS = (th: ThemeColors) => ({ padding: '10px 20px', borderRadius: 12, border: `1px solid ${th.btnSecBorder}`, background: th.btnSecBg, color: th.text, cursor: 'pointer' as const, fontSize: 13 })
const mkInput = (th: ThemeColors) => ({ width: '100%', borderRadius: 10, border: `1px solid ${th.inputBorder}`, background: th.input, color: th.text, padding: '10px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const })
const badgeStyle = (color: string) => ({ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${color}20`, color })
const viewWrap = { flex: 1, overflowY: 'auto' as const, padding: '28px 24px 48px' }
const viewInner = { maxWidth: 1000, margin: '0 auto' }

// ── 1. Integrations ──────────────────────────────────────────────────────────

function IntegrationsView({ userEmail }: { userEmail?: string }) {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [integrations, setIntegrations] = useState<any[]>([])
  const [oauthStatus, setOauthStatus] = useState<any>({ configured: {}, connected: {} })
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<'picker' | 'form'>('picker')
  const [form, setForm] = useState({ provider: '', name: '', token: '' })
  const [syncing, setSyncing] = useState('')
  const [connecting, setConnecting] = useState('')

  const load = useCallback(async () => {
    try {
      const [intRes, availRes, statusRes] = await Promise.all([
        apiFetch(`${API_BASE}/api/integrations`, { headers: webHdrs() }).then(r => r.json()),
        apiFetch(`${API_BASE}/api/client/integrations/available`, { headers: webHdrs() }).then(r => r.json()).catch(() => ({ enabled: [], oauth_configured: {}, api_configured: {} })),
        userEmail
          ? apiFetch(`${API_BASE}/api/client/integrations/status?user_email=${encodeURIComponent(userEmail)}`, { headers: webHdrs() }).then(r => r.json()).catch(() => ({ connected: {} }))
          : Promise.resolve({ connected: {} }),
      ])
      setIntegrations(intRes.integrations || [])
      setOauthStatus({ configured: availRes.oauth_configured || {}, connected: statusRes.connected || {} })
    } catch {} finally { setLoading(false) }
  }, [userEmail])
  useEffect(() => { load() }, [load])

  // Listen for OAuth popup success
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'oauth_success') {
        showToast(`${e.data.provider === 'google' ? 'Google Drive' : 'Slack'} connecté !`, 'success')
        setConnecting('')
        load()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [load])

  const startOAuth = async (provider: string) => {
    setConnecting(provider)
    try {
      const emailParam = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : ''
      const r = await apiFetch(`${API_BASE}/api/oauth/${provider}/start${emailParam}`, { headers: webHdrs() })
      const d = await r.json()
      if (d.auth_url) {
        const w = 500, h = 650
        const left = window.screenX + (window.outerWidth - w) / 2
        const top = window.screenY + (window.outerHeight - h) / 2
        window.open(d.auth_url, `oauth_${provider}`, `width=${w},height=${h},left=${left},top=${top}`)
      } else {
        showToast(d.error || 'Impossible de démarrer la connexion', 'error')
        setConnecting('')
      }
    } catch { setConnecting('') }
  }

  const disconnectOAuth = async (provider: string) => {
    const emailParam = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : ''
    try { await apiFetch(`${API_BASE}/api/client/integrations/${provider}${emailParam}`, { method: 'DELETE', headers: webHdrs() }) } catch { return }
    showToast('Déconnecté', 'info')
    load()
  }

  const addApiKey = async () => {
    if (!form.provider || !form.token) return
    const providerNames: Record<string, string> = { notion: 'Notion', zendesk: 'Zendesk', hubspot: 'HubSpot', freshdesk: 'Freshdesk', intercom: 'Intercom', confluence: 'Confluence', woocommerce: 'WooCommerce', gitlab: 'GitLab' }
    const configMap: Record<string, any> = {
      notion: { api_key: form.token },
      zendesk: { token: form.token, subdomain: form.name || '' },
      hubspot: { api_key: form.token },
      freshdesk: { api_key: form.token, domain: form.name || '' },
      intercom: { token: form.token },
      confluence: { api_token: form.token, email: form.name?.split('|')[0]?.trim() || '', url: form.name?.split('|')[1]?.trim() || '' },
      woocommerce: { consumer_key: form.token, consumer_secret: form.name?.split('|')[0]?.trim() || '', url: form.name?.split('|')[1]?.trim() || '' },
      gitlab: { token: form.token, base_url: form.name || 'https://gitlab.com' },
    }
    const name = form.name?.split('|')[0]?.trim() || (providerNames[form.provider] || form.provider)
    try {
      await apiFetch(`${API_BASE}/api/integrations`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ provider: form.provider, name, config: configMap[form.provider] || { token: form.token } }) })
      showToast(`${providerNames[form.provider] || form.provider} ajouté !`, 'success')
    } catch { return }
    setShowAdd(false); setAddMode('picker'); setForm({ provider: '', name: '', token: '' }); load()
  }

  const sync = async (id: string) => {
    setSyncing(id)
    try {
      const r = await apiFetch(`${API_BASE}/api/integrations/${id}/sync`, { method: 'POST', headers: webHdrs() })
      const d = await r.json()
      if (d.error) showToast(d.error, 'error')
      else showToast(`Synchronisé ! ${d.docs_added || 0} documents ajoutés.`, 'success')
    } catch { showToast('Échec de la synchronisation', 'error') }
    finally { setSyncing(''); load() }
  }

  const remove = async (id: string) => {
    const ok = await confirmDialog({ title: 'Supprimer l\'intégration', message: 'Supprimer cette intégration ? Cette action est irréversible.', confirmText: 'Supprimer', danger: true })
    if (!ok) return
    try { await apiFetch(`${API_BASE}/api/integrations/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch { return }
    load()
  }

  const oauthProviders = [
    { id: 'google', provider: 'google_drive', label: 'Google Drive', icon: '📁', desc: 'Synchronisez vos documents Google Drive', type: 'oauth' as const },
    { id: 'slack', provider: 'slack', label: 'Slack', icon: '💬', desc: 'Importez les messages de vos channels Slack', type: 'oauth' as const },
    { id: 'github', provider: 'github', label: 'GitHub', icon: '🐙', desc: 'Connectez vos repos et issues GitHub', type: 'oauth' as const },
    { id: 'shopify', provider: 'shopify', label: 'Shopify', icon: '🛒', desc: 'Produits, commandes et clients', type: 'oauth' as const },
    { id: 'teams', provider: 'teams', label: 'Microsoft Teams', icon: '👥', desc: 'Canaux, messages et fichiers', type: 'oauth' as const },
  ]
  const apiKeyProviders = [
    { id: 'notion', provider: 'notion', label: 'Notion', icon: '📝', desc: 'Importez vos pages Notion', type: 'apikey' as const, placeholder: 'ntn_xxxxxxxxxxxx', helpUrl: 'https://www.notion.so/my-integrations' },
    { id: 'gitlab', provider: 'gitlab', label: 'GitLab', icon: '🦊', desc: 'Connectez vos projets GitLab', type: 'apikey' as const, placeholder: 'glpat-xxxxxxxxxxxx', helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens' },
    { id: 'zendesk', provider: 'zendesk', label: 'Zendesk', icon: '🎫', desc: 'Articles et tickets support', type: 'apikey' as const, placeholder: 'votre-token-api', helpUrl: '' },
    { id: 'hubspot', provider: 'hubspot', label: 'HubSpot', icon: '🔶', desc: 'Contacts et deals CRM', type: 'apikey' as const, placeholder: 'pat-xxxxxxxx', helpUrl: '' },
    { id: 'freshdesk', provider: 'freshdesk', label: 'Freshdesk', icon: '🟢', desc: 'Articles et tickets support', type: 'apikey' as const, placeholder: 'votre-api-key', helpUrl: '' },
    { id: 'intercom', provider: 'intercom', label: 'Intercom', icon: '💙', desc: 'Articles et conversations', type: 'apikey' as const, placeholder: 'dG9rOxxxxxxx', helpUrl: '' },
    { id: 'confluence', provider: 'confluence', label: 'Confluence', icon: '📋', desc: 'Pages et documentation Atlassian', type: 'apikey' as const, placeholder: 'votre-api-token', helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' },
    { id: 'woocommerce', provider: 'woocommerce', label: 'WooCommerce', icon: '🛍️', desc: 'Produits et commandes WordPress', type: 'apikey' as const, placeholder: 'ck_xxxxxxxx', helpUrl: '' },
  ]
  const allProviders = [...oauthProviders, ...apiKeyProviders]
  const providerMap = Object.fromEntries(allProviders.map(p => [p.provider, p]))

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Intégrations</div><div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>Connectez des sources externes à votre base de connaissances</div></div>
        <button onClick={() => { setShowAdd(!showAdd); setAddMode('picker') }} style={btnPrimary}><Plus size={14} style={{ marginRight: 6 }} />Connecter</button>
      </div>

      {showAdd && addMode === 'picker' && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 14 }}>Choisir un service</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {oauthProviders.map(p => {
              const isConnected = oauthStatus.connected?.[p.id]
              const isConfigured = oauthStatus.configured?.[p.id]
              return (
                <div key={p.id} style={{ ...cardStyle, padding: '16px', textAlign: 'center', opacity: isConfigured ? 1 : 0.5 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 12 }}>{p.desc}</div>
                  {isConnected ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Connecté</span>
                      <button onClick={() => disconnectOAuth(p.id)} style={{ ...btnSecondary, fontSize: 11, padding: '2px 8px', color: '#fca5a5' }}>Déconnecter</button>
                    </div>
                  ) : isConfigured ? (
                    <button onClick={() => startOAuth(p.id)} disabled={connecting === p.id} style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }}>
                      {connecting === p.id ? 'Connexion…' : 'Connecter'}
                    </button>
                  ) : (
                    <div style={{ fontSize: 11, color: th.textMuted }}>Non disponible</div>
                  )}
                </div>
              )
            })}
            {apiKeyProviders.map(p => (
              <div key={p.id} style={{ ...cardStyle, padding: '16px', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => { setForm({ provider: p.id, name: '', token: '' }); setAddMode('form') }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 12 }}>{p.desc}</div>
                <button style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }}>Ajouter</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setShowAdd(false)} style={btnSecondary}>Fermer</button>
          </div>
        </div>
      )}

      {showAdd && addMode === 'form' && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 4 }}>
            {apiKeyProviders.find(p => p.id === form.provider)?.icon} {apiKeyProviders.find(p => p.id === form.provider)?.label}
          </div>
          <div style={{ fontSize: 12, color: th.textMuted, marginBottom: 14 }}>
            {apiKeyProviders.find(p => p.id === form.provider)?.desc}
            {apiKeyProviders.find(p => p.id === form.provider)?.helpUrl && (
              <> — <a href={apiKeyProviders.find(p => p.id === form.provider)?.helpUrl} target="_blank" rel="noopener" style={{ color: '#818cf8' }}>Obtenir une clé API</a></>
            )}
          </div>
          {form.provider === 'zendesk' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Votre sous-domaine Zendesk (ex: monentreprise)" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          {form.provider === 'freshdesk' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Votre domaine Freshdesk (ex: monentreprise.freshdesk.com)" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          {form.provider === 'gitlab' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="URL GitLab (ex: https://gitlab.com ou votre instance)" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          {form.provider === 'confluence' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="email@company.com | https://company.atlassian.net" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          {form.provider === 'woocommerce' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="consumer_secret | https://yourstore.com" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          <input value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} type="password"
            placeholder={apiKeyProviders.find(p => p.id === form.provider)?.placeholder || 'Clé API / Token'} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={addApiKey} disabled={!form.token} style={{ ...btnPrimary, opacity: form.token ? 1 : 0.5 }}>Connecter</button>
            <button onClick={() => { setAddMode('picker'); setForm({ provider: '', name: '', token: '' }) }} style={btnSecondary}>Retour</button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : integrations.length === 0 ? (
        <div style={cardStyle}><div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucune intégration configurée. Cliquez "Connecter" pour ajouter une source de données.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {integrations.map(i => {
            const p = providerMap[i.provider]
            return (
              <div key={i.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{p?.icon || '🔌'} {i.name}</div>
                  <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>
                    {p?.label || i.provider} · {i.docs_synced} docs synchro · {i.last_sync_at ? new Date(i.last_sync_at).toLocaleDateString() : 'jamais'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => sync(i.id)} disabled={syncing === i.id} style={btnPrimary}>{syncing === i.id ? 'Synchro…' : 'Synchroniser'}</button>
                  <button onClick={() => remove(i.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Supprimer</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div></div>
  )
}

// ── 2. Helpdesk AI ───────────────────────────────────────────────────────────

function HelpdeskView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [agents, setAgents] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [tab, setTab] = useState<'agents' | 'tickets' | 'routing' | 'performance'>('agents')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', system_prompt: '', auto_reply: true, confidence_threshold: '0.70', escalation_enabled: false, department: '' })
  // Routing rules state
  const [routingRules, setRoutingRules] = useState<any[]>([])
  const [showAddRule, setShowAddRule] = useState(false)
  const [ruleForm, setRuleForm] = useState({ name: '', condition_type: 'channel', condition_value: '', agent_id: '', fallback_agent_id: '', priority: '0' })
  const [routingTest, setRoutingTest] = useState({ message: '', channel: '', result: null as any })
  // Performance state
  const [performance, setPerformance] = useState<any[]>([])
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [ticketDetail, setTicketDetail] = useState<any>(null)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [ticketTags, setTicketTags] = useState<any[]>([])
  const [newTagName, setNewTagName] = useState('')

  const loadAgents = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/helpdesk/agents`, { headers: webHdrs() }); const d = await r.json(); setAgents(d.agents || []) } catch {} }, [])
  const loadTickets = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets`, { headers: webHdrs() }); const d = await r.json(); setTickets(d.tickets || []) } catch {} }, [])
  const loadRules = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/helpdesk/routing-rules`, { headers: webHdrs() }); const d = await r.json(); setRoutingRules(d.rules || []) } catch {} }, [])
  const loadPerformance = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/helpdesk/agents/performance`, { headers: webHdrs() }); const d = await r.json(); setPerformance(d.agents || []) } catch {} }, [])
  useEffect(() => { loadAgents(); loadTickets(); loadRules(); loadPerformance() }, [loadAgents, loadTickets, loadRules, loadPerformance])

  const addAgent = async () => {
    if (!form.name) return
    try { await apiFetch(`${API_BASE}/api/helpdesk/agents`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, confidence_threshold: parseFloat(form.confidence_threshold) }) }) } catch { return }
    setShowAdd(false); setForm({ name: '', description: '', system_prompt: '', auto_reply: true, confidence_threshold: '0.70', escalation_enabled: false, department: '' }); loadAgents()
  }

  // Routing rules actions
  const addRule = async () => {
    if (!ruleForm.name || !ruleForm.condition_value || !ruleForm.agent_id) return
    try { await apiFetch(`${API_BASE}/api/helpdesk/routing-rules`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...ruleForm, priority: parseInt(ruleForm.priority) || 0 }) }) } catch { return }
    setShowAddRule(false); setRuleForm({ name: '', condition_type: 'channel', condition_value: '', agent_id: '', fallback_agent_id: '', priority: '0' }); loadRules()
  }
  const deleteRule = async (id: string) => { try { await apiFetch(`${API_BASE}/api/helpdesk/routing-rules/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch {} loadRules() }
  const toggleRule = async (id: string, active: boolean) => { try { await apiFetch(`${API_BASE}/api/helpdesk/routing-rules/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }) } catch {} loadRules() }
  const testRouting = async () => {
    if (!routingTest.message) return
    try {
      const r = await apiFetch(`${API_BASE}/api/helpdesk/routing-rules/test`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ message: routingTest.message, channel: routingTest.channel || undefined }) })
      const d = await r.json(); setRoutingTest(prev => ({ ...prev, result: d }))
    } catch {}
  }

  const toggleAgent = async (id: string, active: boolean) => {
    try { await apiFetch(`${API_BASE}/api/helpdesk/agents/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }) } catch { return }
    loadAgents()
  }

  const resolveTicket = async (id: string) => {
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ resolved: true }) }) } catch { return }
    loadTickets(); setSelectedTicket(null); setTicketDetail(null)
  }

  const selectTicket = async (t: any) => {
    setSelectedTicket(t); setAiSuggestion(''); setQuickReplies([]); setReplyText(''); setNewTagName('')
    try {
      const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets/${t.id}`, { headers: webHdrs() })
      const d = await r.json(); setTicketDetail(d.ticket || t)
    } catch { setTicketDetail(t) }
    try {
      const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets/${t.id}/tags`, { headers: webHdrs() })
      const d = await r.json(); setTicketTags(d.tags || [])
    } catch { setTicketTags([]) }
  }

  const addTag = async () => {
    if (!newTagName.trim() || !selectedTicket) return
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/${selectedTicket.id}/tags`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ tag_name: newTagName.trim() }) }) } catch {}
    setNewTagName('')
    try { const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets/${selectedTicket.id}/tags`, { headers: webHdrs() }); const d = await r.json(); setTicketTags(d.tags || []) } catch {}
  }

  const removeTag = async (tagId: number) => {
    if (!selectedTicket) return
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/${selectedTicket.id}/tags/${tagId}`, { method: 'DELETE', headers: webHdrs() }) } catch {}
    setTicketTags(prev => prev.filter(t => t.id !== tagId))
  }

  const getSuggestion = async () => {
    if (!selectedTicket) return
    setLoadingSuggestion(true); setAiSuggestion(''); setQuickReplies([])
    try {
      const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets/${selectedTicket.id}/suggest`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ tone: 'professional' }) })
      const d = await r.json()
      setAiSuggestion(d.suggestion || '')
      setQuickReplies(d.quick_replies || [])
      setReplyText(d.suggestion || '')
    } catch {} finally { setLoadingSuggestion(false) }
  }

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    setSendingReply(true)
    try {
      await apiFetch(`${API_BASE}/api/helpdesk/tickets/${selectedTicket.id}/reply`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ message: replyText }) })
      setReplyText(''); setAiSuggestion(''); setQuickReplies([])
      loadTickets(); selectTicket(selectedTicket)
    } catch {} finally { setSendingReply(false) }
  }

  const setPriority = async (id: string, priority: string) => {
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/${id}/priority`, { method: 'PATCH', headers: webHdrs(), body: JSON.stringify({ priority }) }) } catch {}
    loadTickets()
  }

  const searchTickets = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    try {
      const r = await apiFetch(`${API_BASE}/api/helpdesk/search?q=${encodeURIComponent(searchQuery)}`, { headers: webHdrs() })
      const d = await r.json(); setSearchResults(d.tickets || [])
    } catch { setSearchResults([]) }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const executeBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    const body: any = { ids: Array.from(selectedIds), action: bulkAction }
    if (bulkAction === 'assign') body.assigned_to = prompt('Assigné à (email):')
    if (bulkAction === 'priority') body.priority = prompt('Priorité (low/medium/high/urgent):')
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/bulk`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(body) }) } catch {}
    setSelectedIds(new Set()); setBulkAction(''); loadTickets()
  }

  const archiveTicket = async (id: string) => {
    try { await apiFetch(`${API_BASE}/api/helpdesk/tickets/${id}/archive`, { method: 'POST', headers: webHdrs() }) } catch {}
    loadTickets(); setSelectedTicket(null); setTicketDetail(null)
  }

  const sentimentColor = (s: string) => s === 'positive' ? '#4ade80' : s === 'negative' ? '#f87171' : '#fbbf24'
  const priorityColor = (p: string) => p === 'urgent' ? '#dc2626' : p === 'high' ? '#d97706' : p === 'low' ? '#6b7280' : '#6366f1'

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>Helpdesk IA</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 20 }}>Agents IA qui répondent automatiquement aux messages clients avec votre base de connaissances</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('agents')} style={tab === 'agents' ? btnPrimary : btnSecondary}>Agents ({agents.length})</button>
        <button onClick={() => setTab('tickets')} style={tab === 'tickets' ? btnPrimary : btnSecondary}>Tickets ({tickets.length})</button>
        <button onClick={() => setTab('routing')} style={tab === 'routing' ? btnPrimary : btnSecondary}>Routage ({routingRules.length})</button>
        <button onClick={() => { setTab('performance'); loadPerformance() }} style={tab === 'performance' ? btnPrimary : btnSecondary}>Performance</button>
        {tab === 'agents' && <button onClick={() => setShowAdd(!showAdd)} style={{ ...btnPrimary, marginLeft: 'auto' }}><Plus size={14} style={{ marginRight: 4 }} />Nouvel agent</button>}
        {tab === 'routing' && <button onClick={() => setShowAddRule(!showAddRule)} style={{ ...btnPrimary, marginLeft: 'auto' }}><Plus size={14} style={{ marginRight: 4 }} />Nouvelle règle</button>}
      </div>

      {tab === 'agents' && <>
        {showAdd && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom de l'agent" style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} placeholder="Prompt systeme pour cet agent..." rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
              <label style={{ color: th.text, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.auto_reply} onChange={e => setForm(f => ({ ...f, auto_reply: e.target.checked }))} /> Reponse auto</label>
              <label style={{ color: th.text, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.escalation_enabled} onChange={e => setForm(f => ({ ...f, escalation_enabled: e.target.checked }))} /> Escalade</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}><button onClick={addAgent} style={btnPrimary}>Creer l'agent</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Annuler</button></div>
          </div>
        )}
        {agents.map(a => (
          <div key={a.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={16} style={{ color: '#818cf8' }} /><span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{a.name}</span><span style={badgeStyle(a.is_active ? '#4ade80' : '#f87171')}>{a.is_active ? 'Actif' : 'Inactif'}</span></div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>{a.description || 'Pas de description'} · Reponse auto : {a.auto_reply ? 'OUI' : 'NON'} · Seuil : {a.confidence_threshold}</div>
            </div>
            <button onClick={() => toggleAgent(a.id, a.is_active)} style={btnSecondary}>{a.is_active ? 'Desactiver' : 'Activer'}</button>
          </div>
        ))}
        {agents.length === 0 && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun agent. Creez-en un pour commencer a repondre automatiquement.</div>}
      </>}

      {tab === 'tickets' && (<>
        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchTickets()} placeholder="Rechercher tickets..." style={{ ...inputStyle, flex: 1 }} />
          <button onClick={searchTickets} style={{ ...btnSecondary, padding: '8px 14px' }}><Search size={14} /></button>
          {searchResults && <button onClick={() => { setSearchResults(null); setSearchQuery('') }} style={{ ...btnSecondary, padding: '8px 14px', fontSize: 12 }}>Effacer</button>}
        </div>
        {/* Bulk operations */}
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', padding: '8px 12px', background: th.bg === '#0f172a' ? '#1e293b' : '#f1f5f9', borderRadius: 10 }}>
            <span style={{ fontSize: 12, color: th.text, fontWeight: 600 }}>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
            <CustomSelect value={bulkAction} onChange={v => setBulkAction(v)} placeholder="Action..."
              options={[
                { value: '', label: 'Action...' },
                { value: 'close', label: 'Fermer' },
                { value: 'resolve', label: 'Résoudre' },
                { value: 'reopen', label: 'Réouvrir' },
                { value: 'assign', label: 'Assigner' },
                { value: 'priority', label: 'Priorité' },
                { value: 'categorize', label: 'Catégoriser (IA)' },
                { value: 'delete', label: 'Supprimer' },
              ]}
              style={{ minWidth: 140 }} />
            <button onClick={executeBulk} disabled={!bulkAction} style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}>Appliquer</button>
            <button onClick={() => setSelectedIds(new Set())} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>Désélectionner</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '1fr 1.2fr' : '1fr', gap: 16 }}>
          <div>
            {(searchResults || tickets).map(t => (
              <div key={t.id} style={{ ...cardStyle, marginBottom: 8, cursor: 'pointer', borderColor: selectedTicket?.id === t.id ? '#6366f1' : th.border, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} onClick={e => e.stopPropagation()} style={{ marginTop: 4, accentColor: '#6366f1' }} />
                <div onClick={() => selectTicket(t)} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: th.text, flex: 1 }}>{t.subject?.slice(0, 60) || 'Sans objet'}</div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {t.topic && <span style={badgeStyle('#818cf8')}>{t.topic}</span>}
                    <span style={badgeStyle(sentimentColor(t.sentiment))}>{t.sentiment}</span>
                    {t.auto_resolved ? <span style={badgeStyle('#4ade80')}>Auto-résolu</span> : null}
                    {t.escalated ? <span style={badgeStyle('#f87171')}>Escalade</span> : null}
                    {t.sla_first_response_breached ? <span style={badgeStyle('#dc2626')}>SLA!</span> : null}
                    <span style={badgeStyle(t.status === 'open' ? '#fbbf24' : t.status === 'resolved' ? '#4ade80' : '#818cf8')}>{t.status}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{t.customer_email || t.channel}</span>
                  <span>· {t.auto_replies_count} reponses auto</span>
                  {t.priority && <span style={{ ...badgeStyle(priorityColor(t.priority)), fontSize: 9, padding: '1px 6px' }}>{t.priority}</span>}
                </div>
                </div>
              </div>
            ))}
            {tickets.length === 0 && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun ticket. Envoyez un message a /api/helpdesk/incoming pour tester.</div>}
          </div>
          {selectedTicket && (
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden' }}>
              <div style={{ padding: '0 0 12px', borderBottom: `1px solid ${th.divider}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 6 }}>Ticket: {selectedTicket.subject?.slice(0, 80)}</div>
                <div style={{ fontSize: 12, color: th.textSub, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{selectedTicket.customer_email || selectedTicket.customer_name}</span>
                  <span>· {selectedTicket.channel}</span>
                  {selectedTicket.topic && <span style={badgeStyle('#818cf8')}>{selectedTicket.topic}</span>}
                  <CustomSelect value={selectedTicket.priority || 'medium'} onChange={v => setPriority(selectedTicket.id, v)}
                    options={[
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                      { value: 'urgent', label: 'Urgent' },
                    ]}
                    style={{ minWidth: 100 }} />
                  {selectedTicket.sla_first_response_breached ? <span style={{ ...badgeStyle('#dc2626'), fontSize: 10 }}>SLA 1ere reponse depasse</span> : null}
                  {selectedTicket.sla_resolution_breached ? <span style={{ ...badgeStyle('#dc2626'), fontSize: 10 }}>SLA resolution depasse</span> : null}
                </div>
                {/* Tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                  {ticketTags.map(tag => (
                    <span key={tag.id} style={{ ...badgeStyle(tag.color || '#6366f1'), fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {tag.name}
                      <button onClick={() => removeTag(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                  <input value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="+ tag" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: `1px solid ${th.border}`, background: 'transparent', color: th.textSub, width: 60, outline: 'none' }} />
                </div>
              </div>

              {/* Conversation messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const msgs = ticketDetail?.messages ? (typeof ticketDetail.messages === 'string' ? JSON.parse(ticketDetail.messages) : ticketDetail.messages) : []
                  return msgs.map((m: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-start' : 'flex-end' }}>
                      <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.5, background: m.role === 'user' ? (th.bg === '#0f172a' ? '#1e293b' : '#f1f5f9') : '#6366f1', color: m.role === 'user' ? th.text : '#fff' }}>
                        {m.content}
                        {m.is_human && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 6 }}>(agent humain)</span>}
                        <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>{m.ts ? new Date(m.ts).toLocaleTimeString() : ''}</div>
                      </div>
                    </div>
                  ))
                })()}
              </div>

              {/* AI Suggestion area */}
              <div style={{ borderTop: `1px solid ${th.divider}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button onClick={getSuggestion} disabled={loadingSuggestion} style={{ ...btnSecondary, fontSize: 11, padding: '4px 10px' }}>
                    {loadingSuggestion ? 'Generation...' : 'Suggestion IA'}
                  </button>
                  {quickReplies.map((qr, i) => (
                    <button key={i} onClick={() => setReplyText(qr)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, border: `1px solid ${th.border}`, background: 'transparent', color: th.textSub, cursor: 'pointer' }}>{qr.slice(0, 50)}{qr.length > 50 ? '...' : ''}</button>
                  ))}
                </div>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ecrivez votre reponse ou utilisez la suggestion IA..." rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8, fontSize: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={sendReply} disabled={sendingReply || !replyText.trim()} style={{ ...btnPrimary, flex: 1 }}>{sendingReply ? 'Envoi...' : 'Envoyer la reponse'}</button>
                  <button onClick={() => resolveTicket(selectedTicket.id)} style={btnSecondary}>Resolu</button>
                  <button onClick={() => archiveTicket(selectedTicket.id)} style={{ ...btnSecondary, color: '#6b7280' }}><Archive size={13} style={{ marginRight: 4 }} />Archiver</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* ── Routing rules tab ── */}
      {tab === 'routing' && (<>
        {showAddRule && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 10 }}>Nouvelle règle de routage</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom de la règle" style={inputStyle} />
              <CustomSelect value={ruleForm.condition_type} onChange={v => setRuleForm(f => ({ ...f, condition_type: v }))}
                options={[
                  { value: 'channel', label: 'Canal' }, { value: 'keyword', label: 'Mots-clés' },
                  { value: 'language', label: 'Langue' }, { value: 'topic', label: 'Sujet' },
                  { value: 'email_domain', label: 'Domaine email' }, { value: 'all', label: 'Tout (catch-all)' },
                ]} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={ruleForm.condition_value} onChange={e => setRuleForm(f => ({ ...f, condition_value: e.target.value }))}
                placeholder={ruleForm.condition_type === 'channel' ? 'website, slack, email...' : ruleForm.condition_type === 'keyword' ? 'remboursement, bug, facturation' : ruleForm.condition_type === 'language' ? 'fr, en, es' : 'valeur...'} style={inputStyle} />
              <input value={ruleForm.priority} onChange={e => setRuleForm(f => ({ ...f, priority: e.target.value }))} placeholder="Priorité (0-100)" type="number" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <CustomSelect value={ruleForm.agent_id} onChange={v => setRuleForm(f => ({ ...f, agent_id: v }))}
                options={[{ value: '', label: 'Agent principal...' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} placeholder="Agent principal" />
              <CustomSelect value={ruleForm.fallback_agent_id} onChange={v => setRuleForm(f => ({ ...f, fallback_agent_id: v }))}
                options={[{ value: '', label: 'Agent fallback (optionnel)' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} placeholder="Agent fallback" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}><button onClick={addRule} style={btnPrimary}>Créer</button><button onClick={() => setShowAddRule(false)} style={btnSecondary}>Annuler</button></div>
          </div>
        )}

        {/* Routing test panel */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: th.text, marginBottom: 8 }}>Tester le routage</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={routingTest.message} onChange={e => setRoutingTest(p => ({ ...p, message: e.target.value, result: null }))} placeholder="Message test..." style={{ ...inputStyle, flex: 1 }} />
            <input value={routingTest.channel} onChange={e => setRoutingTest(p => ({ ...p, channel: e.target.value, result: null }))} placeholder="Canal (opt.)" style={{ ...inputStyle, width: 120 }} />
            <button onClick={testRouting} style={btnPrimary}>Tester</button>
          </div>
          {routingTest.result && (
            <div style={{ marginTop: 8, padding: 8, background: th.codeBg, borderRadius: 6, fontSize: 12 }}>
              <span style={{ color: th.textSub }}>Agent : </span><span style={{ color: '#4ade80', fontWeight: 700 }}>{routingTest.result.agent_name || 'Aucun'}</span>
              <span style={{ color: th.textMuted, marginLeft: 12 }}>Règle : {routingTest.result.matched_rule || 'aucune'}</span>
            </div>
          )}
        </div>

        {/* Rules list */}
        {routingRules.length === 0 ? (
          <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucune règle de routage. Les tickets iront au premier agent actif.</div>
        ) : routingRules.map(rule => (
          <div key={rule.id} style={{ ...cardStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{rule.name}</span>
                <span style={badgeStyle(rule.is_active ? '#4ade80' : '#f87171')}>{rule.is_active ? 'Actif' : 'Inactif'}</span>
                <span style={badgeStyle('#818cf8')}>{rule.condition_type}</span>
              </div>
              <div style={{ fontSize: 12, color: th.textSub, marginTop: 4 }}>
                Si <strong style={{ color: th.text }}>{rule.condition_type}</strong> = "{rule.condition_value}" → <strong style={{ color: '#4ade80' }}>{rule.agent_name}</strong>
                {rule.fallback_agent_name && <span> (fallback: {rule.fallback_agent_name})</span>}
                <span style={{ color: th.textMuted, marginLeft: 8 }}>Priorité: {rule.priority} · {rule.matches_count} matchs</span>
              </div>
            </div>
            <button onClick={() => toggleRule(rule.id, rule.is_active)} style={btnSecondary}>{rule.is_active ? 'Désactiver' : 'Activer'}</button>
            <button onClick={() => deleteRule(rule.id)} style={{ ...btnSecondary, color: '#fca5a5' }}><Trash2 size={13} /></button>
          </div>
        ))}
      </>)}

      {/* ── Performance tab ── */}
      {tab === 'performance' && (<>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Comparatif des agents IA</div>
        {performance.length === 0 ? (
          <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun agent configuré</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {performance.map((a: any) => (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: th.text }}>{a.name}</div>
                  <span style={badgeStyle(a.is_active ? '#4ade80' : '#f87171')}>{a.is_active ? 'Actif' : 'Inactif'}</span>
                </div>
                {a.department && <div style={{ fontSize: 12, color: '#818cf8', marginBottom: 6 }}>{a.department}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {a.topics?.map((t: string) => <span key={t} style={badgeStyle('#6366f1')}>{t}</span>)}
                  {a.languages?.map((l: string) => <span key={l} style={badgeStyle('#22c55e')}>{l}</span>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
                  <div style={{ padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
                    <div style={{ color: th.textSub }}>Tickets traités</div>
                    <div style={{ color: th.text, fontWeight: 700, fontSize: 18 }}>{a.tickets_handled}</div>
                  </div>
                  <div style={{ padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
                    <div style={{ color: th.textSub }}>Auto-résolus</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 18 }}>{a.auto_resolved_count}</div>
                  </div>
                  <div style={{ padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
                    <div style={{ color: th.textSub }}>Taux résolution</div>
                    <div style={{ color: a.resolution_rate >= 70 ? '#4ade80' : a.resolution_rate >= 40 ? '#fbbf24' : '#f87171', fontWeight: 700, fontSize: 16 }}>{a.resolution_rate}%</div>
                  </div>
                  <div style={{ padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
                    <div style={{ color: th.textSub }}>Confiance moy.</div>
                    <div style={{ color: th.text, fontWeight: 700, fontSize: 16 }}>{(a.avg_confidence * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ padding: '6px 0' }}>
                    <div style={{ color: th.textSub }}>Tickets ouverts</div>
                    <div style={{ color: '#fbbf24', fontWeight: 700 }}>{a.open_tickets}</div>
                  </div>
                  <div style={{ padding: '6px 0' }}>
                    <div style={{ color: th.textSub }}>Escaladés</div>
                    <div style={{ color: '#f87171', fontWeight: 700 }}>{a.escalated_tickets}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: th.textMuted }}>
                  {a.active_channels} canaux · {a.routing_rules} règles · {a.routing_matches} routages
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}

    </div></div>
  )
}

// ── 3. KB Gaps (Auto-updater) ────────────────────────────────────────────────

function KbGapsView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th)
  const [gaps, setGaps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState('')

  const load = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/kb/gaps`, { headers: webHdrs() }); const d = await r.json(); setGaps(d.gaps || []) } catch {} finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])

  const generate = async (id: string) => {
    setGenerating(id)
    try { await apiFetch(`${API_BASE}/api/kb/gaps/${id}/generate`, { method: 'POST', headers: webHdrs() }); load() } catch {} finally { setGenerating('') }
  }

  const approve = async (id: string) => {
    try { await apiFetch(`${API_BASE}/api/kb/gaps/${id}/approve`, { method: 'POST', headers: webHdrs() }) } catch { return }
    load()
  }

  const dismiss = async (id: string) => {
    try { await apiFetch(`${API_BASE}/api/kb/gaps/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch { return }
    load()
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>Mise à jour KB auto</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 20 }}>Lacunes détectées dans les questions clients sans réponse. Générez et approuvez des articles automatiquement.</div>

      {loading ? <Spinner /> : gaps.length === 0 ? (
        <div style={cardStyle}><div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucune lacune détectée. Les lacunes sont trouvées quand l'agent helpdesk ne peut pas répondre.</div></div>
      ) : gaps.map(g => (
        <div key={g.id} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{g.suggested_title || g.query.slice(0, 80)}</div>
            <div style={{ display: 'flex', gap: 6 }}><span style={badgeStyle('#818cf8')}>×{g.frequency}</span><span style={badgeStyle(g.status === 'generated' ? '#4ade80' : g.status === 'approved' ? '#6366f1' : '#fbbf24')}>{g.status}</span></div>
          </div>
          <div style={{ fontSize: 12, color: th.textSub, marginBottom: 8 }}>Question originale : « {g.query} »</div>
          {g.suggested_content && <div style={{ fontSize: 12, color: th.textSub, padding: 12, borderRadius: 10, background: th.card, marginBottom: 10, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{g.suggested_content.slice(0, 500)}{g.suggested_content.length > 500 ? '…' : ''}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            {g.status === 'pending' && <button onClick={() => generate(g.id)} disabled={generating === g.id} style={btnPrimary}>{generating === g.id ? 'Génération…' : 'Générer l\'article'}</button>}
            {g.status === 'generated' && <button onClick={() => approve(g.id)} style={btnPrimary}>Approuver et ajouter à la KB</button>}
            <button onClick={() => dismiss(g.id)} style={btnSecondary}>Ignorer</button>
          </div>
        </div>
      ))}
    </div></div>
  )
}

// ── 4. Advanced Analytics ────────────────────────────────────────────────────

function AnalyticsView() {
  const th = useTheme()
  const cardStyle = mkCard(th)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch(`${API_BASE}/api/analytics/overview`, { headers: webHdrs() }).then(r => r.json()).catch(() => ({})),
      apiFetch(`${API_BASE}/api/helpdesk/auto-resolution/stats`, { headers: webHdrs() }).then(r => r.json()).catch(() => ({})),
    ]).then(([overview, autoRes]) => setData({ ...overview, ...autoRes })).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...viewWrap, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>
  if (!data) return <div style={viewWrap}><div style={{ color: '#fca5a5' }}>Échec du chargement des analytiques</div></div>

  const statCard = (label: string, value: string | number, color: string) => (
    <div style={{ ...cardStyle, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: th.textSub, marginTop: 4 }}>{label}</div>
    </div>
  )

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>Analytiques avancées</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 20 }}>Tendances de conversations, sentiments, taux de résolution</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {statCard('Total tickets', data.total_tickets, th.text)}
        {statCard('Ouverts', data.open_tickets, '#fbbf24')}
        {statCard('Résolus', data.resolved_tickets, '#4ade80')}
        {statCard('Escaladés', data.escalated_tickets, '#f87171')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Répartition des sentiments</div>
          {(data.sentiment_breakdown || []).map((s: any) => (
            <div key={s.sentiment} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
              <span style={{ color: s.sentiment === 'positive' ? '#4ade80' : s.sentiment === 'negative' ? '#f87171' : '#fbbf24', fontSize: 13, fontWeight: 600 }}>{s.sentiment}</span>
              <span style={{ color: th.textSub, fontSize: 13 }}>{s.count}</span>
            </div>
          ))}
          {(data.sentiment_breakdown || []).length === 0 && <div style={{ color: th.textMuted, fontSize: 13 }}>Aucune donnée</div>}
          <div style={{ marginTop: 12, fontSize: 13, color: th.textSub }}>Score moyen de sentiment : <span style={{ color: th.text, fontWeight: 700 }}>{data.avg_sentiment}</span></div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Sujets principaux</div>
          {(data.topic_breakdown || []).slice(0, 8).map((t: any) => (
            <div key={t.topic} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${th.divider}` }}>
              <span style={{ color: th.text, fontSize: 13 }}>{t.topic}</span>
              <span style={{ color: th.textSub, fontSize: 13 }}>{t.count}</span>
            </div>
          ))}
          {(data.topic_breakdown || []).length === 0 && <div style={{ color: th.textMuted, fontSize: 13 }}>Aucun sujet détecté</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Répartition par canal</div>
          {(data.channel_breakdown || []).map((c: any) => (
            <div key={c.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: th.text, fontSize: 13 }}>{c.channel}</span>
              <span style={{ color: th.textSub, fontSize: 13 }}>{c.count}</span>
            </div>
          ))}
          {(data.channel_breakdown || []).length === 0 && <div style={{ color: th.textMuted, fontSize: 13 }}>Aucune donnée</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Résolution automatique IA</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#4ade80' }}>{data.auto_resolved}</div>
          <div style={{ fontSize: 12, color: th.textSub }}>tickets résolus automatiquement</div>
          {data.total_tickets > 0 && <div style={{ fontSize: 13, color: '#818cf8', marginTop: 8 }}>{Math.round(data.auto_resolved / data.total_tickets * 100)}% taux de résolution auto</div>}
          {data.auto_resolution_success_rate != null && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '6px 0', borderTop: `1px solid ${th.divider}` }}>
            <span style={{ fontSize: 12, color: th.textSub }}>Taux de succès</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: data.auto_resolution_success_rate >= 80 ? '#4ade80' : data.auto_resolution_success_rate >= 50 ? '#fbbf24' : '#f87171' }}>{data.auto_resolution_success_rate}%</span>
          </div>}
          {data.avg_confidence != null && data.avg_confidence > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: th.textSub }}>Confiance moy.</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{(data.avg_confidence * 100).toFixed(0)}%</span>
          </div>}
          {data.reopened_after_auto != null && data.reopened_after_auto > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: th.textSub }}>Réouvertures</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>{data.reopened_after_auto}</span>
          </div>}
        </div>
      </div>
    </div></div>
  )
}

// ── 5. Simulation / Testing ──────────────────────────────────────────────────

function SimulationView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [tests, setTests] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [casesText, setCasesText] = useState('')
  const [running, setRunning] = useState('')
  const [results, setResults] = useState<any>(null)

  const load = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/simulation/tests`, { headers: webHdrs() }); const d = await r.json(); setTests(d.tests || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!name || !casesText) return
    try {
      const cases = JSON.parse(casesText)
      await apiFetch(`${API_BASE}/api/simulation/tests`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ name, test_cases: cases }) })
      setShowAdd(false); setName(''); setCasesText(''); load()
    } catch { showToast('JSON invalide. Format : [{"question":"...","expected_answer":"..."}]', 'error') }
  }

  const run = async (id: string) => {
    setRunning(id); setResults(null)
    try { const r = await apiFetch(`${API_BASE}/api/simulation/tests/${id}/run`, { method: 'POST', headers: webHdrs() }); const d = await r.json(); setResults(d); load() } catch { showToast('Échec du test', 'error') } finally { setRunning('') }
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Simulation</div><div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>Tester les réponses IA contre les réponses attendues</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Nouveau test</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du test" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea value={casesText} onChange={e => setCasesText(e.target.value)} placeholder='[{"question":"Comment réinitialiser ?","expected_answer":"Allez dans les paramètres et cliquez sur réinitialiser"}]' rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}><button onClick={create} style={btnPrimary}>Créer</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Annuler</button></div>
        </div>
      )}

      {tests.map(t => (
        <div key={t.id} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{t.name}</div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>Précision : {t.accuracy}% · Similarité moy. : {t.avg_similarity}% · Statut : {t.status}</div>
            </div>
            <button onClick={() => run(t.id)} disabled={running === t.id} style={btnPrimary}>{running === t.id ? 'En cours…' : 'Lancer le test'}</button>
          </div>
        </div>
      ))}

      {results && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Résultats — Précision : {results.accuracy}%</div>
          {(results.results || []).map((r: any, i: number) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${th.divider}` }}>
              <div style={{ fontSize: 13, color: th.text, fontWeight: 600 }}>Q: {r.question}</div>
              <div style={{ fontSize: 12, color: th.textSub, marginTop: 4 }}>Attendu : {r.expected?.slice(0, 100)}</div>
              <div style={{ fontSize: 12, color: th.textSub, marginTop: 4 }}>IA : {r.actual?.slice(0, 150)}</div>
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
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [channels, setChannels] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ agent_id: '', channel_type: 'website', config: '' })

  const load = useCallback(async () => {
    try {
      const [ch, ag] = await Promise.all([
        apiFetch(`${API_BASE}/api/channels`, { headers: webHdrs() }).then(r => r.json()),
        apiFetch(`${API_BASE}/api/helpdesk/agents`, { headers: webHdrs() }).then(r => r.json()),
      ])
      setChannels(ch.channels || []); setAgents(ag.agents || [])
    } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.agent_id || !form.channel_type) return
    let config = {}
    try { config = form.config ? JSON.parse(form.config) : {} } catch { return showToast('Invalid JSON', 'error') }
    try { await apiFetch(`${API_BASE}/api/channels`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, config }) }) } catch { return }
    setShowAdd(false); load()
  }

  const toggle = async (id: string, active: boolean) => {
    try { await apiFetch(`${API_BASE}/api/channels/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }) } catch { return }
    load()
  }

  const remove = async (id: string) => { try { await apiFetch(`${API_BASE}/api/channels/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch { return } load() }

  const channelTypes = ['website', 'slack', 'discord', 'zendesk', 'freshdesk', 'intercom', 'gorgias', 'helpscout', 'zoho', 'reamaze', 'email', 'whatsapp', 'api']
  const channelIcons: Record<string, string> = { website: '🌐', slack: '💬', discord: '🎮', zendesk: '🎫', freshdesk: '📋', intercom: '💭', gorgias: '🛒', helpscout: '🔵', zoho: '📊', reamaze: '💬', email: '📧', whatsapp: '📱', api: '🔌' }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Déploiement multi-canal</div><div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>Déployez des agents IA sur plusieurs canaux simultanément</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Ajouter un canal</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <CustomSelect value={form.agent_id} onChange={v => setForm(f => ({ ...f, agent_id: v }))}
              options={[{ value: '', label: 'Sélectionner un agent...' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} placeholder="Sélectionner un agent..." />
            <CustomSelect value={form.channel_type} onChange={v => setForm(f => ({ ...f, channel_type: v }))}
              options={channelTypes.map(t => ({ value: t, label: `${channelIcons[t]} ${t}` }))} />
          </div>
          <textarea value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))} placeholder='{"webhook_url":"..."}' rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}><button onClick={add} style={btnPrimary}>Déployer</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Annuler</button></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {channels.map(c => (
          <div key={c.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 20 }}>{channelIcons[c.channel_type] || '🔌'}</div>
              <span style={badgeStyle(c.is_active ? '#4ade80' : '#f87171')}>{c.is_active ? 'Actif' : 'Inactif'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{c.channel_type}</div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>Agent : {c.agent_name || 'Inconnu'} · {c.messages_handled} msgs traités</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => toggle(c.id, c.is_active)} style={btnSecondary}>{c.is_active ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => remove(c.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
      {channels.length === 0 && <div style={{ ...cardStyle, color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun canal déployé. Créez d'abord un agent, puis déployez-le ici.</div>}
    </div></div>
  )
}

// ── 7. Escalation Workflows ──────────────────────────────────────────────────

function EscalationView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [rules, setRules] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', condition_type: 'keyword', condition_value: '', action_type: 'escalate', action_value: '', priority: '0' })

  const load = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/escalation/rules`, { headers: webHdrs() }); const d = await r.json(); setRules(d.rules || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.name || !form.condition_value) return
    try { await apiFetch(`${API_BASE}/api/escalation/rules`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ ...form, priority: parseInt(form.priority) }) }) } catch { return }
    setShowAdd(false); setForm({ name: '', condition_type: 'keyword', condition_value: '', action_type: 'escalate', action_value: '', priority: '0' }); load()
  }

  const toggle = async (id: string, active: boolean) => {
    try { await apiFetch(`${API_BASE}/api/escalation/rules/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ is_active: !active }) }) } catch { return }
    load()
  }

  const remove = async (id: string) => { try { await apiFetch(`${API_BASE}/api/escalation/rules/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch { return } load() }

  const conditionTypes = [
    { id: 'keyword', label: 'Contient le mot-clé', hint: 'ex. "remboursement"' },
    { id: 'sentiment', label: 'Sentiment est', hint: 'ex. "négatif"' },
    { id: 'max_replies', label: 'Réponses auto dépassent', hint: 'ex. "3"' },
    { id: 'amount', label: 'Montant dépasse', hint: 'ex. "100"' },
  ]

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Workflows d'escalade</div><div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>Règles conditionnelles pour escalader les tickets vers un humain</div></div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Nouvelle règle</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom de la règle" style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <CustomSelect value={form.condition_type} onChange={v => setForm(f => ({ ...f, condition_type: v }))}
              options={conditionTypes.map(ct => ({ value: ct.id, label: ct.label }))} />
            <input value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} placeholder={conditionTypes.find(c => c.id === form.condition_type)?.hint} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <CustomSelect value={form.action_type} onChange={v => setForm(f => ({ ...f, action_type: v }))}
              options={[{ value: 'escalate', label: 'Escalader vers un humain' }, { value: 'notify', label: 'Envoyer une notification' }, { value: 'tag', label: 'Ajouter un tag' }]} />
            <input value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} placeholder="Priorité (0 = la plus haute)" style={inputStyle} type="number" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={add} style={btnPrimary}>Créer la règle</button><button onClick={() => setShowAdd(false)} style={btnSecondary}>Annuler</button></div>
        </div>
      )}

      {rules.map(r => (
        <div key={r.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{r.name}</span>
              <span style={badgeStyle(r.is_active ? '#4ade80' : '#f87171')}>{r.is_active ? 'Actif' : 'Inactif'}</span>
            </div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>
              SI {r.condition_type} = "{r.condition_value}" → {r.action_type} · Déclenché {r.triggers_count}× · Priorité {r.priority}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => toggle(r.id, r.is_active)} style={btnSecondary}>{r.is_active ? 'Désactiver' : 'Activer'}</button>
            <button onClick={() => remove(r.id)} style={{ ...btnSecondary, color: '#fca5a5' }}>Supprimer</button>
          </div>
        </div>
      ))}
      {rules.length === 0 && <div style={{ ...cardStyle, color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucune règle d'escalade. Créez des règles pour escalader automatiquement les tickets sensibles.</div>}
    </div></div>
  )
}

// ── 8. Team Collaboration ────────────────────────────────────────────────────

function TeamView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [members, setMembers] = useState<any[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'member' })

  const load = useCallback(async () => { try { const r = await apiFetch(`${API_BASE}/api/team`, { headers: webHdrs() }); const d = await r.json(); setMembers(d.members || []) } catch {} }, [])
  useEffect(() => { load() }, [load])

  const invite = async () => {
    if (!form.email) return
    try {
      const r = await apiFetch(`${API_BASE}/api/team/invite`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(form) })
      if (r.ok) { setShowInvite(false); setForm({ email: '', name: '', role: 'member' }); load() }
      else { const d = await r.json(); showToast(d.error || 'Échec', 'error') }
    } catch {}
  }

  const changeRole = async (id: string, role: string) => {
    try { await apiFetch(`${API_BASE}/api/team/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ role }) }) } catch { return }
    load()
  }

  const remove = async (id: string) => {
    const ok = await confirmDialog({ title: 'Supprimer le membre', message: 'Supprimer ce membre de l\'équipe ? Il perdra l\'accès immédiatement.', confirmText: 'Supprimer', danger: true })
    if (!ok) return
    try { await apiFetch(`${API_BASE}/api/team/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch { return }
    load()
  }

  const roleColor = (r: string) => r === 'admin' ? '#818cf8' : r === 'editor' ? '#fbbf24' : '#4ade80'

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Équipe</div><div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>Gérer les membres, rôles et permissions de l'équipe</div></div>
        <button onClick={() => setShowInvite(!showInvite)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Inviter un membre</button>
      </div>

      {showInvite && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" style={inputStyle} />
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom (optionnel)" style={inputStyle} />
            <CustomSelect value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
              options={[{ value: 'member', label: 'Membre' }, { value: 'editor', label: 'Éditeur' }, { value: 'admin', label: 'Admin' }]} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={invite} style={btnPrimary}>Envoyer l'invitation</button><button onClick={() => setShowInvite(false)} style={btnSecondary}>Annuler</button></div>
        </div>
      )}

      <div style={{ ...cardStyle }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${th.divider}` }}>
              {['Membre', 'Rôle', 'Statut', 'Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: `1px solid ${th.divider}` }}>
                <td style={{ padding: '12px' }}><div style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{m.name || m.email}</div><div style={{ fontSize: 11, color: th.textMuted }}>{m.email}</div></td>
                <td style={{ padding: '12px' }}>
                  <CustomSelect value={m.role} onChange={v => changeRole(m.id, v)}
                    options={[{ value: 'member', label: 'Membre' }, { value: 'editor', label: 'Éditeur' }, { value: 'admin', label: 'Admin' }]}
                    style={{ width: 120 }} />
                </td>
                <td style={{ padding: '12px' }}><span style={badgeStyle(m.status === 'active' ? '#4ade80' : '#fbbf24')}>{m.status}</span></td>
                <td style={{ padding: '12px' }}><button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <div style={{ color: th.textMuted, textAlign: 'center', padding: 24 }}>Aucun membre pour l'instant. Invitez des collègues à collaborer.</div>}
      </div>
    </div></div>
  )
}

// ── CSAT / NPS View ──────────────────────────────────────────────────────────

function CsatView() {
  const th = useTheme()
  const cardStyle = mkCard(th)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/api/csat/stats`, { headers: webHdrs() })
        const d = await r.json(); setStats(d)
      } catch {} finally { setLoading(false) }
    })()
  }, [])

  const barRow = (label: string, count: number, max: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 32, fontSize: 12, fontWeight: 600, color: th.text, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, background: th.bg === '#0f172a' ? '#1e293b' : '#f1f5f9', borderRadius: 4, height: 16 }}>
        <div style={{ width: `${max > 0 ? Math.round(count / max * 100) : 0}%`, background: color, height: '100%', borderRadius: 4, minWidth: count ? 2 : 0 }} />
      </div>
      <span style={{ width: 28, fontSize: 11, color: th.textMuted, textAlign: 'right' }}>{count}</span>
    </div>
  )

  if (loading) return <div style={viewWrap}><div style={viewInner}><div style={{ color: th.textMuted, textAlign: 'center', padding: 40 }}>Chargement...</div></div></div>

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>CSAT & NPS</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 20 }}>Satisfaction client et Net Promoter Score</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Note moyenne', value: stats?.average_rating ? `${stats.average_rating.toFixed(1)}/5` : '—', color: '#6366f1' },
          { label: 'NPS Score', value: stats?.nps_score ?? '—', color: '#f59e0b' },
          { label: 'Total réponses', value: stats?.total_responses ?? 0, color: '#6366f1' },
          { label: 'Promoteurs', value: stats?.nps_breakdown ? `${stats.nps_breakdown.promoters}%` : '—', color: '#16a34a' },
        ].map((s, i) => (
          <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Distribution des notes</div>
          {[5, 4, 3, 2, 1].map(r => {
            const count = stats?.rating_distribution?.[r] || 0
            const max = Math.max(...Object.values(stats?.rating_distribution || { 0: 1 }).map(Number), 1)
            return barRow(`${r}★`, count, max, r >= 4 ? '#16a34a' : r === 3 ? '#f59e0b' : '#ef4444')
          })}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Distribution NPS</div>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(r => {
            const count = stats?.nps_distribution?.[r] || 0
            const max = Math.max(...Object.values(stats?.nps_distribution || { 0: 1 }).map(Number), 1)
            return barRow(String(r), count, max, r >= 9 ? '#16a34a' : r >= 7 ? '#f59e0b' : '#ef4444')
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 12 }}>Commentaires récents</div>
        {stats?.recent_comments?.length ? stats.recent_comments.map((c: any, i: number) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${th.divider}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: th.text, fontSize: 13 }}>{c.customer_email || 'Anonyme'}</span>
              <span style={{ color: th.textMuted, fontSize: 11 }}>{c.rating ? `${c.rating}★` : ''} {c.nps_score != null ? `NPS: ${c.nps_score}` : ''}</span>
            </div>
            <div style={{ color: th.textSub, fontSize: 12 }}>{c.comment}</div>
          </div>
        )) : <div style={{ color: th.textMuted, textAlign: 'center', padding: 20 }}>Aucun commentaire</div>}
      </div>
    </div></div>
  )
}

// ── Workflows View ───────────────────────────────────────────────────────────

function WorkflowsView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [workflows, setWorkflows] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', nodes: '[]', edges: '[]' })
  const [editId, setEditId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/api/workflows`, { headers: webHdrs() }); const d = await r.json(); setWorkflows(d.workflows || []) } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const body: any = { ...form }
    try { body.nodes = JSON.parse(body.nodes) } catch {}
    try { body.edges = JSON.parse(body.edges) } catch {}
    const url = editId ? `${API_BASE}/api/workflows/${editId}` : `${API_BASE}/api/workflows`
    const method = editId ? 'PUT' : 'POST'
    try { await apiFetch(url, { method, headers: webHdrs(), body: JSON.stringify(body) }) } catch {}
    setShowForm(false); setEditId(null); setForm({ name: '', description: '', nodes: '[]', edges: '[]' }); load()
  }

  const del = async (id: number) => {
    try { await apiFetch(`${API_BASE}/api/workflows/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch {}
    load()
  }

  const toggle = async (id: number, active: number) => {
    try { await apiFetch(`${API_BASE}/api/workflows/${id}`, { method: 'PUT', headers: webHdrs(), body: JSON.stringify({ active }) }) } catch {}
    load()
  }

  const edit = async (id: number) => {
    try {
      const r = await apiFetch(`${API_BASE}/api/workflows/${id}`, { headers: webHdrs() })
      const d = await r.json()
      if (d.workflow) {
        setForm({ name: d.workflow.name, description: d.workflow.description || '', nodes: typeof d.workflow.nodes === 'string' ? d.workflow.nodes : JSON.stringify(d.workflow.nodes, null, 2), edges: typeof d.workflow.edges === 'string' ? d.workflow.edges : JSON.stringify(d.workflow.edges, null, 2) })
        setEditId(id); setShowForm(true)
      }
    } catch {}
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Workflows d'escalade</div>
          <div style={{ fontSize: 13, color: th.textSub }}>Automatisations visuelles pour vos tickets</div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', description: '', nodes: '[]', edges: '[]' }) }} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Nouveau workflow</button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du workflow" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea value={form.nodes} onChange={e => setForm(f => ({ ...f, nodes: e.target.value }))} placeholder="Noeuds JSON" rows={4} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 8 }} />
          <textarea value={form.edges} onChange={e => setForm(f => ({ ...f, edges: e.target.value }))} placeholder="Arêtes JSON" rows={3} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={btnPrimary}>{editId ? 'Modifier' : 'Créer'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} style={btnSecondary}>Annuler</button>
          </div>
        </div>
      )}

      {workflows.map(w => {
        const nodes = typeof w.nodes === 'string' ? JSON.parse(w.nodes || '[]') : (w.nodes || [])
        return (
          <div key={w.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitBranch size={16} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{w.name}</span>
                <span style={badgeStyle(w.active ? '#4ade80' : '#6b7280')}>{w.active ? 'Actif' : 'Inactif'}</span>
              </div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>{nodes.length} noeud{nodes.length !== 1 ? 's' : ''} · {w.description || ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => edit(w.id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>Modifier</button>
              <button onClick={() => toggle(w.id, w.active ? 0 : 1)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>{w.active ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => del(w.id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, color: '#ef4444' }}>Suppr.</button>
            </div>
          </div>
        )
      })}
      {workflows.length === 0 && !showForm && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun workflow. Créez-en un pour automatiser l'escalade.</div>}
    </div></div>
  )
}

// ── Custom Dashboards View ───────────────────────────────────────────────────

function CustomDashboardsView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [dashboards, setDashboards] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', widgets: '[]' })
  const [editId, setEditId] = useState<number | null>(null)
  const [viewingDash, setViewingDash] = useState<any>(null)
  const [widgetData, setWidgetData] = useState<Record<string, any>>({})

  const load = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/api/dashboards`, { headers: webHdrs() }); const d = await r.json(); setDashboards(d.dashboards || []) } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const body: any = { ...form }
    try { body.widgets = JSON.parse(body.widgets) } catch {}
    const url = editId ? `${API_BASE}/api/dashboards/${editId}` : `${API_BASE}/api/dashboards`
    try { await apiFetch(url, { method: editId ? 'PUT' : 'POST', headers: webHdrs(), body: JSON.stringify(body) }) } catch {}
    setShowForm(false); setEditId(null); setForm({ name: '', description: '', widgets: '[]' }); load()
  }

  const del = async (id: number) => {
    try { await apiFetch(`${API_BASE}/api/dashboards/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch {}
    load()
  }

  const viewDash = async (id: number) => {
    try {
      const r = await apiFetch(`${API_BASE}/api/dashboards/${id}`, { headers: webHdrs() })
      const d = await r.json()
      if (d.dashboard) {
        setViewingDash(d.dashboard)
        const widgets = typeof d.dashboard.widgets === 'string' ? JSON.parse(d.dashboard.widgets) : (d.dashboard.widgets || [])
        const dataMap: Record<string, any> = {}
        for (const w of widgets) {
          try {
            const wr = await apiFetch(`${API_BASE}/api/dashboards/widget-data`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ widget_type: w.type }) })
            dataMap[w.type] = await wr.json()
          } catch { dataMap[w.type] = { error: true } }
        }
        setWidgetData(dataMap)
      }
    } catch {}
  }

  if (viewingDash) {
    const widgets = typeof viewingDash.widgets === 'string' ? JSON.parse(viewingDash.widgets) : (viewingDash.widgets || [])
    return (
      <div style={viewWrap}><div style={viewInner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setViewingDash(null); setWidgetData({}) }} style={btnSecondary}>← Retour</button>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>{viewingDash.name}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {widgets.map((w: any, i: number) => {
            const d = widgetData[w.type]
            return (
              <div key={i} style={{ ...cardStyle, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: th.text, marginBottom: 8 }}>{w.title || w.type}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>
                  {d?.value != null ? d.value : d?.error ? 'Erreur' : JSON.stringify(d?.data || d?.items || '—').substring(0, 80)}
                </div>
              </div>
            )
          })}
        </div>
      </div></div>
    )
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Dashboards personnalisés</div>
          <div style={{ fontSize: 13, color: th.textSub }}>Créez vos tableaux de bord avec widgets</div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', description: '', widgets: '[]' }) }} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Nouveau dashboard</button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du dashboard" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea value={form.widgets} onChange={e => setForm(f => ({ ...f, widgets: e.target.value }))} placeholder='Widgets JSON — ex: [{"type":"stat_total_tickets","title":"Total tickets"}]' rows={5} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={btnPrimary}>{editId ? 'Modifier' : 'Créer'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} style={btnSecondary}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {dashboards.map(d => {
          const widgets = typeof d.widgets === 'string' ? JSON.parse(d.widgets || '[]') : (d.widgets || [])
          return (
            <div key={d.id} onClick={() => viewDash(d.id)} style={{ ...cardStyle, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: th.text }}>{d.name}</div>
                <button onClick={e => { e.stopPropagation(); del(d.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: th.textMuted }}>{d.description || ''}</div>
              <div style={{ fontSize: 11, color: th.textMuted, marginTop: 8 }}>{widgets.length} widget{widgets.length !== 1 ? 's' : ''}</div>
            </div>
          )
        })}
      </div>
      {dashboards.length === 0 && !showForm && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun dashboard. Créez-en un !</div>}
    </div></div>
  )
}

// ── A/B Tests View ───────────────────────────────────────────────────────────

function AbTestsView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [tests, setTests] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', agent_id: '', prompt_a: '', prompt_b: '', test_cases: '' })

  const load = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/api/ab-tests`, { headers: webHdrs() }); const d = await r.json(); setTests(d.tests || []) } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const body: any = { ...form, agent_id: parseInt(form.agent_id) || null }
    try { body.test_cases = JSON.parse(body.test_cases) } catch {}
    try { await apiFetch(`${API_BASE}/api/ab-tests`, { method: 'POST', headers: webHdrs(), body: JSON.stringify(body) }) } catch {}
    setShowForm(false); setForm({ name: '', agent_id: '', prompt_a: '', prompt_b: '', test_cases: '' }); load()
  }

  const run = async (id: number) => {
    try { await apiFetch(`${API_BASE}/api/ab-tests/${id}/run`, { method: 'POST', headers: webHdrs() }) } catch {}
    load()
  }

  const apply = async (id: number) => {
    try { await apiFetch(`${API_BASE}/api/ab-tests/${id}/apply`, { method: 'POST', headers: webHdrs() }) } catch {}
    load()
  }

  const del = async (id: number) => {
    try { await apiFetch(`${API_BASE}/api/ab-tests/${id}`, { method: 'DELETE', headers: webHdrs() }) } catch {}
    load()
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>A/B Tests de prompts</div>
          <div style={{ fontSize: 13, color: th.textSub }}>Comparez les performances de vos prompts IA</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Nouveau test</button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du test" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} placeholder="ID de l'agent" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea value={form.prompt_a} onChange={e => setForm(f => ({ ...f, prompt_a: e.target.value }))} placeholder="Prompt A" rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
          <textarea value={form.prompt_b} onChange={e => setForm(f => ({ ...f, prompt_b: e.target.value }))} placeholder="Prompt B" rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
          <textarea value={form.test_cases} onChange={e => setForm(f => ({ ...f, test_cases: e.target.value }))} placeholder='Cas de test JSON — ex: ["Bonjour...","Mon produit..."]' rows={2} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={btnPrimary}>Créer</button>
            <button onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
          </div>
        </div>
      )}

      {tests.map(t => (
        <div key={t.id} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={16} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{t.name}</span>
                <span style={badgeStyle(t.status === 'completed' ? '#16a34a' : t.status === 'running' ? '#f59e0b' : '#6b7280')}>{t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>
                Agent: {t.agent_id || '—'} · Score A: {t.score_a?.toFixed(1) ?? '—'} · Score B: {t.score_b?.toFixed(1) ?? '—'}
                {t.winner && <span style={{ marginLeft: 8, fontWeight: 700, color: '#16a34a' }}>Gagnant: {t.winner}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {t.status === 'draft' && <button onClick={() => run(t.id)} style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}>Lancer</button>}
              {t.winner && <button onClick={() => apply(t.id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>Appliquer</button>}
              <button onClick={() => del(t.id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, color: '#ef4444' }}>Suppr.</button>
            </div>
          </div>
        </div>
      ))}
      {tests.length === 0 && !showForm && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun A/B test. Créez-en un pour comparer vos prompts.</div>}
    </div></div>
  )
}

// ── Onboarding Wizard View ──────────────────────────────────────────────────

function OnboardingView({ userEmail, setView }: { userEmail?: string; setView: (v: View) => void }) {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [step, setStep] = useState(1)
  const [steps, setSteps] = useState<any[]>([])
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<any>({ agent_name: '', agent_description: '', system_prompt: '', integrations: [], channel_type: 'website' })

  useEffect(() => {
    apiFetch(`${API_BASE}/api/onboarding/status?email=${encodeURIComponent(userEmail || '')}`, { headers: webHdrs() })
      .then(r => r.json())
      .then(d => { setSteps(d.steps || []); setStep(d.current_step || 1); setCompletedSteps(d.completed_steps || []); if (d.config_data) setConfig((c: any) => ({ ...c, ...d.config_data })) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userEmail])

  const completeStep = async (s: number, data?: any) => {
    try {
      await apiFetch(`${API_BASE}/api/onboarding/step`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ email: userEmail, step: s, data }) })
      setCompletedSteps(prev => [...prev, s])
      setStep(s + 1)
    } catch {}
  }

  const applyConfig = async () => {
    try {
      await apiFetch(`${API_BASE}/api/onboarding/apply`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ email: userEmail, config }) })
      showToast('Configuration appliquée !', 'success')
      setView('home')
    } catch { showToast('Erreur lors de l\'application', 'error') }
  }

  const skip = async () => {
    try {
      await apiFetch(`${API_BASE}/api/onboarding/skip`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ email: userEmail }) })
      setView('home')
    } catch {}
  }

  if (loading) return <div style={{ ...viewWrap, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>

  const stepIcons: Record<string, any> = { sparkles: Sparkles, database: Database, bot: Bot, plug: Link, rocket: Zap }

  return (
    <div style={viewWrap}><div style={{ ...viewInner, maxWidth: 640 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: th.text }}>Bienvenue sur Lamu</div>
        <div style={{ fontSize: 14, color: th.textSub, marginTop: 8 }}>Configurez votre assistant IA en quelques étapes</div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {steps.map((s: any) => (
          <div key={s.step} style={{ flex: 1, height: 4, borderRadius: 2, background: completedSteps.includes(s.step) ? '#6366f1' : step === s.step ? '#818cf8' : th.border }} />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div style={{ ...cardStyle, padding: 32, textAlign: 'center' }}>
          <Sparkles size={48} style={{ color: '#6366f1', marginBottom: 16 }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 8 }}>Prêt à démarrer ?</div>
          <div style={{ fontSize: 13, color: th.textSub, marginBottom: 24, lineHeight: 1.6 }}>
            Lamu est votre assistant IA tout-en-un. En 4 étapes, vous allez connecter vos données, créer un agent IA, et le déployer sur vos canaux.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => completeStep(1)} style={btnPrimary}>Commencer</button>
            <button onClick={skip} style={btnSecondary}>Passer</button>
          </div>
        </div>
      )}

      {/* Step 2: Connect data */}
      {step === 2 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: th.text, marginBottom: 16 }}>Connectez vos données</div>
          <div style={{ fontSize: 13, color: th.textSub, marginBottom: 16 }}>Sélectionnez les sources à importer dans la base de connaissances :</div>
          {['google_drive', 'notion', 'confluence', 'zendesk', 'freshdesk', 'github', 'webcrawl'].map(p => {
            const names: Record<string, string> = { google_drive: 'Google Drive', notion: 'Notion', confluence: 'Confluence', zendesk: 'Zendesk', freshdesk: 'Freshdesk', github: 'GitHub', webcrawl: 'Site web' }
            const selected = config.integrations?.some((i: any) => i.provider === p)
            return (
              <div key={p} onClick={() => setConfig((c: any) => {
                const integs = [...(c.integrations || [])]
                const idx = integs.findIndex((i: any) => i.provider === p)
                if (idx >= 0) integs.splice(idx, 1)
                else integs.push({ provider: p, name: names[p], auto_sync: true, config: {} })
                return { ...c, integrations: integs }
              })}
                style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderColor: selected ? '#6366f1' : th.border, background: selected ? 'rgba(99,102,241,0.08)' : th.card }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? '#6366f1' : th.border}`, background: selected ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selected && <Check size={12} style={{ color: '#fff' }} />}
                </div>
                <span style={{ fontSize: 14, color: th.text, fontWeight: 600 }}>{names[p] || p}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => completeStep(2, { integrations: config.integrations })} style={btnPrimary}>Continuer</button>
            <button onClick={() => completeStep(2)} style={btnSecondary}>Passer cette étape</button>
          </div>
        </div>
      )}

      {/* Step 3: Create agent */}
      {step === 3 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: th.text, marginBottom: 16 }}>Créez votre agent IA</div>
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Nom de l'agent</div>
          <input value={config.agent_name} onChange={e => setConfig((c: any) => ({ ...c, agent_name: e.target.value }))} placeholder="ex: Support Bot" style={{ ...inputStyle, marginBottom: 12 }} />
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Description</div>
          <input value={config.agent_description} onChange={e => setConfig((c: any) => ({ ...c, agent_description: e.target.value }))} placeholder="ex: Assistant pour le support client" style={{ ...inputStyle, marginBottom: 12 }} />
          <div style={{ fontSize: 11, color: th.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Instructions système (prompt)</div>
          <textarea value={config.system_prompt} onChange={e => setConfig((c: any) => ({ ...c, system_prompt: e.target.value }))} placeholder="ex: Tu es un agent de support amical et efficace..." rows={4} style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => completeStep(3, { agent_name: config.agent_name, agent_description: config.agent_description, system_prompt: config.system_prompt })} style={btnPrimary}>Continuer</button>
            <button onClick={() => completeStep(3)} style={btnSecondary}>Passer</button>
          </div>
        </div>
      )}

      {/* Step 4: Connect integrations */}
      {step === 4 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: th.text, marginBottom: 16 }}>Connectez vos outils</div>
          <div style={{ fontSize: 13, color: th.textSub, marginBottom: 16 }}>Vous pourrez configurer les détails plus tard dans la page Intégrations.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => completeStep(4)} style={btnPrimary}>Continuer</button>
          </div>
        </div>
      )}

      {/* Step 5: Deploy */}
      {step === 5 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: th.text, marginBottom: 16 }}>Déployez votre agent</div>
          <div style={{ fontSize: 13, color: th.textSub, marginBottom: 16 }}>Choisissez où déployer votre agent :</div>
          {['website', 'slack', 'email', 'zendesk', 'api'].map(ch => (
            <div key={ch} onClick={() => setConfig((c: any) => ({ ...c, channel_type: ch }))}
              style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderColor: config.channel_type === ch ? '#6366f1' : th.border, background: config.channel_type === ch ? 'rgba(99,102,241,0.08)' : th.card }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${config.channel_type === ch ? '#6366f1' : th.border}`, background: config.channel_type === ch ? '#6366f1' : 'transparent' }} />
              <span style={{ fontSize: 14, color: th.text, fontWeight: 600 }}>{ch === 'website' ? 'Widget site web' : ch === 'slack' ? 'Slack' : ch === 'email' ? 'Email' : ch === 'zendesk' ? 'Zendesk' : 'API'}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={applyConfig} style={btnPrimary}>Terminer et déployer</button>
            <button onClick={() => completeStep(5)} style={btnSecondary}>Passer</button>
          </div>
        </div>
      )}

      {step > 5 && (
        <div style={{ ...cardStyle, padding: 32, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#4ade80', marginBottom: 16 }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: th.text }}>Configuration terminée !</div>
          <div style={{ fontSize: 13, color: th.textSub, marginTop: 8, marginBottom: 24 }}>Votre assistant IA est prêt.</div>
          <button onClick={() => setView('home')} style={btnPrimary}>Aller au dashboard</button>
        </div>
      )}
    </div></div>
  )
}

// ── Auto-Sync KB View ───────────────────────────────────────────────────────

function AutoSyncView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th)
  const [syncs, setSyncs] = useState<any[]>([])
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedInteg, setSelectedInteg] = useState('')
  const [interval, setInterval] = useState('60')

  const load = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([
        apiFetch(`${API_BASE}/api/integrations/auto-sync/status`, { headers: webHdrs() }).then(r => r.json()),
        apiFetch(`${API_BASE}/api/integrations`, { headers: webHdrs() }).then(r => r.json()),
      ])
      setSyncs(sRes.syncs || [])
      setIntegrations(iRes.integrations || [])
    } catch {}
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const enableSync = async () => {
    if (!selectedInteg) return
    try {
      await apiFetch(`${API_BASE}/api/integrations/${selectedInteg}/auto-sync`, {
        method: 'POST', headers: webHdrs(),
        body: JSON.stringify({ interval_minutes: parseInt(interval) || 60 }),
      })
      setShowAdd(false); load()
    } catch {}
  }

  const toggle = async (integId: string, active: boolean) => {
    try {
      await apiFetch(`${API_BASE}/api/integrations/${integId}/auto-sync`, {
        method: 'POST', headers: webHdrs(),
        body: JSON.stringify({ enabled: !active }),
      })
      load()
    } catch {}
  }

  const remove = async (integId: string) => {
    try {
      await apiFetch(`${API_BASE}/api/integrations/${integId}/auto-sync`, { method: 'DELETE', headers: webHdrs() })
      load()
    } catch {}
  }

  const triggerSync = async (integId: string) => {
    try {
      await apiFetch(`${API_BASE}/api/integrations/${integId}/sync`, { method: 'POST', headers: webHdrs() })
      showToast('Sync lancé', 'success')
      load()
    } catch { showToast('Erreur sync', 'error') }
  }

  if (loading) return <div style={{ ...viewWrap, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>Auto-Sync KB</div>
          <div style={{ fontSize: 13, color: th.textSub }}>Synchronisation automatique de vos sources vers la Knowledge Base</div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnPrimary}><Plus size={14} style={{ marginRight: 4 }} />Ajouter</button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 4 }}>Intégration</div>
            <CustomSelect value={selectedInteg} onChange={v => setSelectedInteg(v)}
              options={[{ value: '', label: 'Choisir...' }, ...integrations.map((i: any) => ({ value: i.id, label: `${i.provider} — ${i.name}` }))]} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 4 }}>Intervalle (min)</div>
            <CustomSelect value={interval} onChange={v => setInterval(v)}
              options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '1h' }, { value: '360', label: '6h' }, { value: '1440', label: '24h' }]} />
          </div>
          <button onClick={enableSync} style={btnPrimary}>Activer</button>
          <button onClick={() => setShowAdd(false)} style={btnSecondary}>Annuler</button>
        </div>
      )}

      {syncs.map((s: any) => (
        <div key={s.id} style={{ ...cardStyle, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={16} style={{ color: s.is_active ? '#4ade80' : '#6b7280' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>{s.integration_name || s.provider}</span>
              <span style={badgeStyle(s.is_active ? '#4ade80' : '#6b7280')}>{s.is_active ? 'Actif' : 'Inactif'}</span>
              <span style={badgeStyle(s.last_status === 'success' ? '#4ade80' : s.last_status === 'error' ? '#f87171' : '#fbbf24')}>{s.last_status}</span>
            </div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 4 }}>
              Toutes les {s.interval_minutes} min · {s.last_docs_synced} docs au dernier sync
              {s.last_run_at && ` · Dernier: ${new Date(s.last_run_at).toLocaleString()}`}
              {s.last_error && <span style={{ color: '#f87171' }}> · Erreur: {s.last_error}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => triggerSync(s.integration_id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>Sync maintenant</button>
            <button onClick={() => toggle(s.integration_id, s.is_active)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>{s.is_active ? 'Pause' : 'Activer'}</button>
            <button onClick={() => remove(s.integration_id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, color: '#ef4444' }}>Suppr.</button>
          </div>
        </div>
      ))}
      {syncs.length === 0 && !showAdd && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucun auto-sync configuré. Ajoutez une intégration pour synchroniser automatiquement vos données.</div>}
    </div></div>
  )
}

// ── AI Actions View ─────────────────────────────────────────────────────────

function AiActionsView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th), inputStyle = mkInput(th)
  const [tab, setTab] = useState<'available' | 'log'>('available')
  const [actions, setActions] = useState<any[]>([])
  const [log, setLog] = useState<any[]>([])
  const [testAction, setTestAction] = useState('')
  const [testParams, setTestParams] = useState('{}')
  const [testResult, setTestResult] = useState<any>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    apiFetch(`${API_BASE}/api/ai-actions/available`, { headers: webHdrs() }).then(r => r.json()).then(d => setActions(d.actions || [])).catch(() => {})
    apiFetch(`${API_BASE}/api/ai-actions/log`, { headers: webHdrs() }).then(r => r.json()).then(d => setLog(d.actions || [])).catch(() => {})
  }, [])

  const runAction = async () => {
    if (!testAction) return
    setRunning(true); setTestResult(null)
    try {
      let params = {}
      try { params = JSON.parse(testParams) } catch {}
      const r = await apiFetch(`${API_BASE}/api/ai-actions/execute`, { method: 'POST', headers: webHdrs(), body: JSON.stringify({ action_type: testAction, params }) })
      setTestResult(await r.json())
      // Refresh log
      const logR = await apiFetch(`${API_BASE}/api/ai-actions/log`, { headers: webHdrs() })
      setLog((await logR.json()).actions || [])
    } catch (e: any) { setTestResult({ error: e.message }) }
    setRunning(false)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 6, border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : th.border}`,
    background: active ? 'rgba(99,102,241,0.15)' : th.card, color: active ? '#fff' : th.textSub,
    cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  })

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>Actions IA autonomes</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 16 }}>L'IA peut exécuter des actions sur vos outils connectés</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab('available')} style={tabStyle(tab === 'available')}>Actions disponibles</button>
        <button onClick={() => setTab('log')} style={tabStyle(tab === 'log')}>Historique ({log.length})</button>
      </div>

      {tab === 'available' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
            {actions.map((a: any) => (
              <div key={a.name} style={{ ...cardStyle, cursor: 'pointer', borderColor: testAction === a.name ? '#6366f1' : th.border }}
                onClick={() => { setTestAction(a.name); setTestParams(JSON.stringify(Object.fromEntries(Object.keys(a.parameters).map(k => [k, ''])), null, 2)) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 4 }}>{a.name.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 12, color: th.textSub }}>{a.description}</div>
                <div style={{ fontSize: 11, color: th.textMuted, marginTop: 8 }}>Params: {Object.keys(a.parameters).join(', ')}</div>
              </div>
            ))}
          </div>

          {testAction && (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: th.text, marginBottom: 8 }}>Test: {testAction}</div>
              <textarea value={testParams} onChange={e => setTestParams(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={runAction} disabled={running} style={btnPrimary}>{running ? 'En cours...' : 'Exécuter'}</button>
                <button onClick={() => { setTestAction(''); setTestResult(null) }} style={btnSecondary}>Fermer</button>
              </div>
              {testResult && (
                <pre style={{ marginTop: 12, padding: 12, borderRadius: 8, background: th.codeBg || 'rgba(0,0,0,0.3)', color: testResult.error ? '#f87171' : '#4ade80', fontSize: 11, overflow: 'auto', maxHeight: 200 }}>
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'log' && (
        <div>
          {log.map((a: any, i: number) => (
            <div key={i} style={{ ...cardStyle, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{(a.action_type || '').replace(/_/g, ' ')}</span>
                  <span style={badgeStyle(a.status === 'success' ? '#4ade80' : '#f87171')}>{a.status}</span>
                </div>
                <span style={{ fontSize: 11, color: th.textMuted }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
              </div>
              {a.ticket_id && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4 }}>Ticket #{a.ticket_id}</div>}
            </div>
          ))}
          {log.length === 0 && <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Aucune action exécutée pour l'instant.</div>}
        </div>
      )}
    </div></div>
  )
}

// ── Archive View ─────────────────────────────────────────────────────────────

function ArchiveView() {
  const th = useTheme()
  const cardStyle = mkCard(th), btnPrimary = mkBtnP(th), btnSecondary = mkBtnS(th)
  const [tab, setTab] = useState<'convs' | 'tickets'>('convs')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'convs') {
        const r = await apiFetch(`${API_BASE}/api/webapp/conversations/archived`, { headers: webHdrs() })
        const d = await r.json(); setItems(d.conversations || [])
      } else {
        const r = await apiFetch(`${API_BASE}/api/helpdesk/tickets/archived`, { headers: webHdrs() })
        const d = await r.json(); setItems(d.tickets || [])
      }
    } catch {} finally { setLoading(false) }
  }, [tab])
  useEffect(() => { load() }, [load])

  const restore = async (id: string | number) => {
    const endpoint = tab === 'convs' ? `${API_BASE}/api/webapp/conversations/${id}/restore` : `${API_BASE}/api/helpdesk/tickets/${id}/restore`
    try { await apiFetch(endpoint, { method: 'POST', headers: webHdrs() }) } catch {}
    load()
  }

  return (
    <div style={viewWrap}><div style={viewInner}>
      <div style={{ fontSize: 22, fontWeight: 800, color: th.text, marginBottom: 4 }}>Archives</div>
      <div style={{ fontSize: 13, color: th.textSub, marginBottom: 20 }}>Conversations et tickets archivés</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab('convs')} style={tab === 'convs' ? btnPrimary : btnSecondary}>Conversations</button>
        <button onClick={() => setTab('tickets')} style={tab === 'tickets' ? btnPrimary : btnSecondary}>Tickets</button>
      </div>

      {loading ? <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>Chargement...</div> : items.length === 0 ? (
        <div style={{ color: th.textMuted, textAlign: 'center', padding: 32 }}>{tab === 'convs' ? 'Aucune conversation archivée' : 'Aucun ticket archivé'}</div>
      ) : items.map((item, i) => (
        <div key={item.id || i} style={{ ...cardStyle, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: th.text }}>
              {tab === 'convs' ? (item.title || 'Sans titre') : (item.subject || 'Sans sujet')}
            </div>
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 2 }}>
              {tab === 'convs' ? item.user_email : item.customer_email} · Archivé le {item.archived_at ? new Date(item.archived_at).toLocaleDateString('fr-FR') : '—'}
            </div>
          </div>
          <button onClick={() => restore(item.id)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>Restaurer</button>
        </div>
      ))}
    </div></div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: (token: string, user: WebUser) => void }) {
  const th = useTheme()
  const [step,    setStep]    = useState<'email' | 'otp'>('email')
  const [email,   setEmail]   = useState('')
  const [name,    setName]    = useState('')
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [resendCd, setResendCd] = useState(0)
  const [ssoProviders, setSsoProviders] = useState<{id: number; provider: string; name: string}[]>([])
  const codeRef = useRef<HTMLInputElement>(null)

  // Load SSO providers
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/sso/providers`)
        const d = await r.json()
        setSsoProviders(d.providers || [])
      } catch {}
    })()
  }, [])

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

  const inputStyle: React.CSSProperties = { width: '100%', background: th.hover, border: `1px solid ${th.border}`, borderRadius: 12, padding: '13px 14px 13px 40px', color: th.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const btnStyle: React.CSSProperties = { padding: '13px 20px', borderRadius: 12, border: 'none', background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#5254cc)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: th.bg, padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={step}
        style={{ width: '100%', maxWidth: 400, padding: 32, borderRadius: 20, background: th.card, border: `1px solid ${th.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/lamu-icon.png" alt="Lamu AI" style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: th.text, margin: '0 0 6px', letterSpacing: '-0.5px' }}>Lamu AI</h1>
          {step === 'email' ? (
            <>
              <p style={{ fontSize: 13, color: th.textMuted, margin: '0 0 12px' }}>Votre assistant IA avec base de connaissances</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Zap size={12} style={{ color: '#4ade80' }} />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>20 messages gratuits — aucune carte requise</span>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: th.textMuted, margin: 0 }}>
                Code envoyé à <strong style={{ color: th.text }}>{email}</strong>
              </p>
            </>
          )}
        </div>

        {step === 'email' ? (
          <form onSubmit={sendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: th.textMuted, pointerEvents: 'none' }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" autoFocus
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = th.border)} />
            </div>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: th.textMuted, pointerEvents: 'none' }} />
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom (optionnel)"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = th.border)} />
            </div>
            {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? <><Spinner /> Envoi du code…</> : 'Recevoir un code par email'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: th.textMuted, marginTop: 4 }}>
              Vous avez une licence ? Entrez le même email — votre plan sera automatiquement activé.
            </p>
            {ssoProviders.length > 0 && <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px' }}>
                <div style={{ flex: 1, height: 1, background: th.divider }} />
                <span style={{ fontSize: 11, color: th.textMuted }}>ou connectez-vous via SSO</span>
                <div style={{ flex: 1, height: 1, background: th.divider }} />
              </div>
              {ssoProviders.map(p => (
                <a key={p.id} href={`${API_BASE}/api/sso/login/${p.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, border: `1px solid ${th.border}`, background: th.hover, color: th.text, fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                  <Shield size={14} /> {p.name}
                </a>
              ))}
            </>}
          </form>
        ) : (
          <form onSubmit={verifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Shield size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: th.textMuted, pointerEvents: 'none' }} />
              <input ref={codeRef} type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) { setCode(v); setTimeout(() => verifyOtp(), 50) } }}
                placeholder="000000"
                style={{ ...inputStyle, textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 8, paddingLeft: 14 }}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = th.border)} />
            </div>
            {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading || code.length !== 6} style={btnStyle}>
              {loading ? <><Spinner /> Vérification…</> : 'Vérifier le code'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4 }}>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 12, textDecoration: 'underline' }}>
                Changer d'email
              </button>
              <span style={{ color: th.divider }}>|</span>
              <button type="button" onClick={() => { setCode(''); setError(''); sendOtp() }} disabled={resendCd > 0 || loading}
                style={{ background: 'none', border: 'none', cursor: resendCd > 0 ? 'default' : 'pointer', color: resendCd > 0 ? th.textMuted : '#818cf8', fontSize: 12, textDecoration: resendCd > 0 ? 'none' : 'underline' }}>
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
  const [model,      setModel_]     = useState(() => localStorage.getItem('lamu_web_model') || '')
  const setModel = useCallback((m: string) => { localStorage.setItem('lamu_web_model', m); setModel_(m) }, [])
  const [system,     setSystem]     = useState('')
  const [mobileSide, setMobileSide] = useState(false)
  const [showKbRoot, setShowKbRoot] = useState(false)
  const [kbContext, setKbContext] = useState<{ id: string; name: string; excerpt: string } | null>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [searchQuery, setSearchQuery] = useState('')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const th = T[theme]

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem(THEME_KEY, t) }

  // ── Online/Offline detection ──
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [])

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

  // ── Auth: check for SSO token in URL, then verify ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoToken = params.get('sso_token')
    if (ssoToken) {
      localStorage.setItem(TOKEN_KEY, ssoToken)
      window.history.replaceState({}, '', window.location.pathname)
    }
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
      .then(r => r.ok ? r.json() : null).then(d => { if (!d) return; const av = (d.models || []).filter((m: Model) => m.isAvailable); setModels(av); const saved = localStorage.getItem('lamu_web_model'); if (saved && av.some(m => m.model === saved)) setModel(saved); else if (av.length) setModel(av[0].model) }).catch(() => {})
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

  const newChat  = useCallback(() => { const c: Conversation = { id: uid(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() }; setConvs(p => [...p, c]); setActiveId(c.id); setView('chat'); setMobileSide(false) }, [])
  const selConv  = useCallback((id: string) => { setActiveId(id); setView('chat'); setMobileSide(false) }, [])

  // ── Auth loading screen ──
  if (authLoading) {
    return (
      <ThemeCtx.Provider value={th}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: th.bg }}>
          <Spinner />
        </div>
      </ThemeCtx.Provider>
    )
  }

  // ── Login screen ──
  if (!user) {
    return <ThemeCtx.Provider value={th}><LoginView onLogin={handleLogin} /></ThemeCtx.Provider>
  }

  const sidebar = (mobile = false, onClose?: () => void) => (
    <Sidebar view={view} setView={setView} convs={convs} activeId={activeId} onNew={newChat} onSelect={selConv} onDelete={delConv} onClose={onClose} mobile={mobile} onKb={() => setShowKbRoot(true)} />
  )

  return (
    <ThemeCtx.Provider value={th}>
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: th.bg, color: th.text, position: 'relative' }}>
      <ToastContainer />
      <ConfirmDialog />
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
        {/* Offline banner */}
        {isOffline && (
          <div style={{ padding: '8px 16px', background: '#b45309', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', animation: 'pulse 2s infinite' }} />
            Vous etes hors ligne — les conversations enregistrees restent accessibles, mais l'IA necessite une connexion internet.
          </div>
        )}
        {/* Top user bar */}
        <div style={{ padding: '6px 16px', borderBottom: `1px solid ${th.divider}`, display: 'flex', alignItems: 'center', gap: 8, background: th.headerBg, flexShrink: 0 }}>
          <button className="mobile-menu-btn" onClick={() => setMobileSide(true)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: th.textSub, padding: 4 }}><Menu size={16} /></button>
          <div style={{ flex: 1 }} />
          {user.trial && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
              <div style={{ fontSize: 11, color: (user.messages_remaining ?? 0) <= 5 ? '#fbbf24' : th.textMuted }}>
                {user.messages_remaining ?? 0}/{user.max_requests} messages
              </div>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: th.hover, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: (user.messages_remaining ?? 0) <= 5 ? '#f59e0b' : '#6366f1', width: `${((user.messages_remaining ?? 0) / user.max_requests) * 100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          <span style={{ fontSize: 12, color: th.textMuted }}>{user.email}</span>
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: user.trial ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)', color: user.trial ? '#4ade80' : '#818cf8', fontWeight: 600 }}>{user.plan_name}</span>
          {user.trial && (
            <a href="/pricing" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Mettre à niveau
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
                <span style={{ fontSize: 12, color: th.textSub }}>—</span>
                <span style={{ fontSize: 12, color: urgent ? '#fbbf24' : th.textSub }}>
                  {exhausted ? 'Passez au Pro pour continuer' : `${remaining} message${remaining !== 1 ? 's' : ''} restant${remaining !== 1 ? 's' : ''} sur ${user.max_requests}`}
                </span>
                {!exhausted && (
                  <div style={{ width: 80, height: 5, borderRadius: 3, background: th.hover, overflow: 'hidden', marginLeft: 4 }}>
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
        {view === 'home'     && <HomeView hasChatted={hasChatted} onNewChat={newChat} setView={setView} isTrial={user?.trial} userName={user?.name || user?.email?.split('@')[0] || null} hasConfigured={!!system} />}
        {view === 'chat'     && <ChatView convs={convs} activeId={activeId} setActiveId={setActiveId} setConvs={setConvs} model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} prompts={prompts} streaming={streaming} setStreaming={setStreaming} kbContext={kbContext} clearKbContext={() => setKbContext(null)} userName={user?.name || user?.email?.split('@')[0] || null} onMessageSent={refreshUser} />}
        {view === 'knowledge' && <KnowledgeSearchView onAskDoc={doc => { setSystem(`Use the following source to answer the next question:\n\n${doc.name}\n\n${doc.excerpt || 'No preview available.'}`); setKbContext({ id: doc.id, name: doc.name, excerpt: doc.excerpt || '' }); setView('chat') }} />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'widget' && <WidgetView />}
        {view === 'pricing' && <PricingView currentPlan={user?.trial ? 'trial' : user?.plan} onUpgrade={() => refreshUser()} />}
        {view === 'profile' && <ProfileView user={user!} onLogout={handleLogout} setView={setView} />}
        {view === 'settings' && <SettingsView model={model} models={models} setModel={setModel} system={system} setSystem={setSystem} />}
        {view === 'integrations' && <IntegrationsView userEmail={user?.email} />}
        {view === 'helpdesk' && <HelpdeskView />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'simulation' && <SimulationView />}
        {view === 'escalation' && <EscalationView />}
        {view === 'channels' && <ChannelsView />}
        {view === 'kb-gaps' && <KbGapsView />}
        {view === 'team' && <TeamView />}
        {view === 'csat' && <CsatView />}
        {view === 'workflows' && <WorkflowsView />}
        {view === 'custom-dashboards' && <CustomDashboardsView />}
        {view === 'ab-tests' && <AbTestsView />}
        {view === 'archive' && <ArchiveView />}
        {view === 'onboarding' && <OnboardingView userEmail={user?.email} setView={setView} />}
        {view === 'auto-sync' && <AutoSyncView />}
        {view === 'ai-actions' && <AiActionsView />}
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
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
    </ThemeCtx.Provider>
  )
}
