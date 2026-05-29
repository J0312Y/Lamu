import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, User } from 'lucide-react'

const API_BASE = '/lamu-api'

interface Message { id: string; role: 'user' | 'assistant'; content: string }
interface SharedData { conversation: { id: string; title: string; created_at: string; messages: Message[] } }

export default function SharedConversation() {
  const { shareId } = useParams<{ shareId: string }>()
  const [data, setData] = useState<SharedData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/webapp/shared/${shareId}`)
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error || 'Not found') }))
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080808', color: 'rgba(255,255,255,0.4)' }}>
      Loading...
    </div>
  )

  if (error || !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080808', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48, opacity: 0.2 }}>404</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{error || 'Conversation not found'}</div>
      <a href="/" style={{ color: '#818cf8', fontSize: 13, marginTop: 8 }}>Go to Lamu</a>
    </div>
  )

  const { conversation } = data

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={16} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{conversation.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Shared conversation — Lamu AI</div>
        </div>
        <a href="/app" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
          Try Lamu AI
        </a>
      </div>

      {/* Messages */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {conversation.messages.map((m) => {
            const isUser = m.role === 'user'
            return (
              <div key={m.id} style={{ display: 'flex', gap: 12, flexDirection: isUser ? 'row-reverse' : 'row' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUser ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'rgba(255,255,255,0.08)', border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                  {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="rgba(255,255,255,0.8)" />}
                </div>
                <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: isUser ? 'linear-gradient(135deg,#6366f1,#5254cc)' : 'rgba(255,255,255,0.07)', border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                  {m.content}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
        Powered by <a href="/" style={{ color: '#818cf8', textDecoration: 'none' }}>Lamu AI</a>
      </div>
    </div>
  )
}
