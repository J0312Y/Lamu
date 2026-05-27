import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function Recover() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [error, setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/license/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (data?.sent) setStatus('sent')
      else { setError(data?.error || 'Erreur inattendue'); setStatus('error') }
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion.')
      setStatus('error')
    }
  }

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ maxWidth: 480, width: '100%' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <KeyRound size={26} color="#818cf8" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1, marginBottom: 10 }}>Récupérer ma licence</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Entrez l'adresse email utilisée lors de votre achat.<br />Nous vous renverrons votre clé de licence.
          </p>
        </div>

        {/* Form */}
        {status !== 'sent' && (
          <form onSubmit={handleSubmit} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
              Adresse email
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '12px 14px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                <Mail size={16} color="rgba(255,255,255,0.35)" />
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jean@example.com"
                autoFocus
                required
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '12px 14px', fontSize: 15, color: '#fff', fontFamily: 'inherit' }}
              />
            </div>

            {status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !email.trim()}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: email.trim() && status !== 'loading' ? '#fff' : 'rgba(255,255,255,0.08)', color: email.trim() && status !== 'loading' ? '#000' : 'rgba(255,255,255,0.25)', fontWeight: 700, padding: '14px 20px', borderRadius: 12, fontSize: 15, border: 'none', cursor: email.trim() && status !== 'loading' ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
            >
              {status === 'loading' ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Envoi en cours…</> : 'Envoyer ma clé par email'}
            </button>
          </form>
        )}

        {/* Success */}
        {status === 'sent' && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: 32, textAlign: 'center' }}>
            <CheckCircle2 size={44} color="#4ade80" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Email envoyé !</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              Si une licence est associée à <strong style={{ color: '#fff' }}>{email}</strong>, vous recevrez un email sous quelques secondes.<br /><br />
              Vérifiez aussi vos spams.
            </div>
            <button onClick={() => { setStatus('idle'); setEmail('') }} style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Essayer un autre email
            </button>
          </motion.div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
          Toujours bloqué ? <a href="mailto:support@lamuka.com" style={{ color: '#818cf8', textDecoration: 'none' }}>support@lamuka.com</a>
        </div>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
