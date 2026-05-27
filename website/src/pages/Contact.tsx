import { motion, AnimatePresence } from 'framer-motion'
import { Mail, MessageSquare, Clock, KeyRound, Send, CheckCircle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

const API = 'http://localhost:3000'

type Topic = { key: string; icon: React.ElementType; title: string; desc: string; form: boolean; href?: string; internal?: boolean }

const topics: Topic[] = [
  { key: 'license', icon: KeyRound,      title: 'Clé de licence perdue',  desc: 'Récupérez votre licence automatiquement.', form: false, href: '/recover', internal: true },
  { key: 'support', icon: MessageSquare, title: 'Support technique',       desc: 'Bug, installation, problème avec l\'app.',  form: true },
  { key: 'billing', icon: Mail,          title: 'Questions de facturation', desc: 'Remboursement, reçu, modification.',        form: true },
  { key: 'partner', icon: Clock,         title: 'Partenariat / Affilié',   desc: 'Programmes de partenariat et affiliation.',  form: false, href: '/affiliate', internal: true },
]

function ContactForm({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/api/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim(), topic: topic.title }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erreur')
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: '#fff', padding: '11px 14px', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color 0.2s',
  }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 7 }

  if (done) return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '32px 20px' }}>
      <CheckCircle size={48} color="#4ade80" style={{ marginBottom: 16 }} />
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Message envoyé !</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24 }}>
        Nous vous répondrons sous <strong style={{ color: '#fff' }}>24–48h</strong>.<br />
        Un accusé de réception a été envoyé à <strong style={{ color: '#fff' }}>{email}</strong>.
      </div>
      <button onClick={onClose} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontWeight: 600, padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
        Fermer
      </button>
    </motion.div>
  )

  return (
    <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{topic.title}</div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Nom</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" required
            onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" required
            onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Message</label>
        <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Décrivez votre problème ou question en détail…" required
          onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
      </div>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}
      <button type="submit" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#818cf8)', border: 'none', color: '#fff', fontWeight: 700, padding: '12px 24px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit', transition: 'all 0.2s' }}>
        <Send size={14} />
        {loading ? 'Envoi…' : 'Envoyer le message'}
      </button>
    </motion.form>
  )
}

export default function Contact() {
  const [activeForm, setActiveForm] = useState<string | null>(null)

  return (
    <div style={{ paddingTop: 60 }}>
      <section style={{ padding: '80px 24px 60px', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 24 }}>
            <Mail size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Contact</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 800, letterSpacing: -1.5, marginBottom: 16, lineHeight: 1.1 }}>Comment pouvons-nous vous aider ?</h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>Choisissez le sujet qui correspond à votre demande.</p>
        </motion.div>
      </section>

      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
          {topics.map((t, i) => (
            <motion.div key={t.key} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}>
              <motion.div whileHover={{ y: activeForm === t.key ? 0 : -3 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ background: activeForm === t.key ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${activeForm === t.key ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', transition: 'all 0.2s' }}>

                <AnimatePresence mode="wait">
                  {activeForm === t.key && t.form ? (
                    <ContactForm key="form" topic={t} onClose={() => setActiveForm(null)} />
                  ) : (
                    <motion.div key="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                      <div style={{ width: 42, height: 42, background: 'rgba(99,102,241,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <t.icon size={20} color="#818cf8" />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t.title}</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{t.desc}</div>
                      </div>
                      {t.form ? (
                        <button onClick={() => setActiveForm(t.key)} style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 600, padding: '10px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Envoyer un message →
                        </button>
                      ) : t.internal ? (
                        <Link to={t.href!} style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 600, padding: '10px 18px', borderRadius: 10, fontSize: 13, textDecoration: 'none' }}>
                          {t.key === 'license' ? 'Récupérer ma clé' : 'En savoir plus'} →
                        </Link>
                      ) : (
                        <a href={t.href} style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 600, padding: '10px 18px', borderRadius: 10, fontSize: 13, textDecoration: 'none' }}>
                          Contacter →
                        </a>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Délai de réponse</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Nous répondons généralement sous <strong style={{ color: '#fff' }}>24–48h</strong> les jours ouvrables.<br />
            Pour les problèmes urgents, précisez "URGENT" dans votre message.
          </div>
        </div>
      </section>
    </div>
  )
}
