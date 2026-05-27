import { motion, AnimatePresence } from 'framer-motion'
import { Check, Zap, X, Phone, Copy, CheckCircle2, Loader2, AlertCircle, ArrowLeft, Calendar, Clock, Shield, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BorderBeam } from '../components/BorderBeam'
import { useState, useRef, useEffect } from 'react'

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } },
}
const stagger = { show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ── Feature key → label lisible ───────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  drag_window:      'Déplacer la fenêtre overlay',
  screenshot:       "Capture d'écran",
  file_attachments: 'Pièces jointes (fichiers)',
  audio_capture:    'Capture audio / microphone',
  meeting_mode:     'Mode réunion',
  knowledge_base:   'Base de connaissances (KB)',
  contact_support:  'Support prioritaire',
}

function featureLabel(key: string) {
  return FEATURE_LABELS[key] || key
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiPlan {
  id: string
  name: string
  description: string
  price: number
  currency: string
  billing_period: 'free' | 'lifetime' | 'monthly' | 'yearly'
  max_requests: number
  features: string[]
  color: string
  sort_order: number
}

interface LicenseRecord {
  licenseKey: string
  txId: string
  msisdn: string
  fullName: string
  email: string
  issuedAt: string
  validUntil: string
  amount: number
  currency: string
  product: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function saveLicenseToStorage(record: LicenseRecord) {
  try {
    const existing: LicenseRecord[] = JSON.parse(localStorage.getItem('lamuka_licenses') || '[]')
    existing.push(record)
    localStorage.setItem('lamuka_licenses', JSON.stringify(existing))
    localStorage.setItem('lamuka_latest_license', JSON.stringify(record))
  } catch { /* non-critical */ }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function periodLabel(p: ApiPlan['billing_period']) {
  return { free: 'pour toujours', lifetime: 'à vie', monthly: '/mois', yearly: '/an' }[p] ?? p
}

function priceDisplay(plan: ApiPlan) {
  if (plan.price === 0) return 'Gratuit'
  return `${plan.price.toLocaleString()} ${plan.currency}`
}

async function initiatePayment(msisdn: string, planId: string, customerName: string, customerEmail: string) {
  const res = await fetch(`${API_BASE}/api/payment/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msisdn, plan_id: planId, customer_name: customerName, customer_email: customerEmail }),
  })
  return res.json()
}

async function checkPaymentStatus(txId: string) {
  const res = await fetch(`${API_BASE}/api/payment/status/${encodeURIComponent(txId)}`)
  return res.json()
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

type PayStep = 'info' | 'form' | 'loading' | 'waiting' | 'success' | 'error'

function PaymentModal({ plan, onClose }: { plan: ApiPlan; onClose: () => void }) {
  const [step, setStep]           = useState<PayStep>('info')
  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [msisdn, setMsisdn]       = useState('')
  const [txId, setTxId]           = useState('')
  const [license, setLicense]     = useState<LicenseRecord | null>(null)
  const [error, setError]         = useState('')
  const [copied, setCopied]       = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canProceedInfo = fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const priceLabel = priceDisplay(plan)

  const handlePay = async () => {
    if (!msisdn.trim()) return
    setStep('loading')
    setError('')
    try {
      const data = await initiatePayment(msisdn.trim(), plan.id, fullName.trim(), email.trim())

      if (data?.ok && data?.tx_id) {
        const id: string = data.tx_id
        setTxId(id)
        setStep('waiting')
        setPollCount(0)

        pollRef.current = setInterval(async () => {
          setPollCount(c => c + 1)
          try {
            const d2 = await checkPaymentStatus(id)
            if (d2?.confirmed && d2?.license_key) {
              clearInterval(pollRef.current!)
              const record: LicenseRecord = {
                licenseKey: d2.license_key,
                txId: id,
                msisdn: msisdn.trim(),
                fullName: fullName.trim(),
                email: email.trim(),
                issuedAt: new Date().toISOString(),
                validUntil: plan.billing_period === 'lifetime' ? 'À vie' : periodLabel(plan.billing_period),
                amount: plan.price,
                currency: plan.currency,
                product: `Lamuka ${d2.plan_name || plan.name}`,
              }
              saveLicenseToStorage(record)
              setLicense(record)
              setStep('success')
            }
          } catch { /* keep polling */ }
        }, 5000)

        setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          setStep(s => s === 'waiting' ? 'error' : s)
          setError('Délai dépassé. Veuillez réessayer ou contacter support@lamuka.com')
        }, 10 * 60 * 1000)

      } else {
        setError(data?.error || "Échec de l'initiation du paiement. Veuillez réessayer.")
        setStep('error')
      }
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion et réessayez.')
      setStep('error')
    }
  }

  const copyKey = () => {
    if (!license) return
    navigator.clipboard.writeText(license.licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        onClick={e => { if (e.target === e.currentTarget && step !== 'waiting') onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 24 }}
          transition={{ duration: 0.35 }}
          style={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40, maxWidth: 500, width: '100%', position: 'relative', overflow: 'hidden' }}
        >
          <BorderBeam colorTo={`${plan.color}cc`} duration={4} />

          {step !== 'waiting' && (
            <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
              <X size={15} />
            </button>
          )}

          {/* ── INFO ── */}
          {step === 'info' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{ width: 44, height: 44, background: `${plan.color}18`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={22} color={plan.color} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Obtenir {plan.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Étape 1/2 · Vos informations · {priceLabel}</div>
                </div>
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Nom complet</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} onKeyDown={e => e.key === 'Enter' && canProceedInfo && setStep('form')} placeholder="ex: Jean Dupont" autoFocus style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '12px 14px', fontSize: 15, color: '#fff', fontFamily: 'inherit' }} />
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Adresse email</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && canProceedInfo && setStep('form')} placeholder="ex: jean@example.com" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '12px 14px', fontSize: 15, color: '#fff', fontFamily: 'inherit' }} />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                Votre licence vous sera envoyée par email. Vous pourrez aussi la récupérer sur <Link to="/recover" style={{ color: plan.color, textDecoration: 'none' }}>lamuka.com/recover</Link>.
              </div>

              <motion.button whileHover={{ scale: canProceedInfo ? 1.02 : 1 }} whileTap={{ scale: canProceedInfo ? 0.98 : 1 }} onClick={() => canProceedInfo && setStep('form')} disabled={!canProceedInfo} style={{ width: '100%', background: canProceedInfo ? '#fff' : 'rgba(255,255,255,0.08)', color: canProceedInfo ? '#000' : 'rgba(255,255,255,0.25)', fontWeight: 700, padding: '14px 20px', borderRadius: 12, fontSize: 15, border: 'none', cursor: canProceedInfo ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
                Continuer →
              </motion.button>
            </div>
          )}

          {/* ── FORM ── */}
          {step === 'form' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <button onClick={() => setStep('info')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex', alignItems: 'center' }}><ArrowLeft size={16} /></button>
                <div style={{ width: 44, height: 44, background: `${plan.color}18`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={20} color={plan.color} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Paiement Mobile Money</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Étape 2/2 · {fullName} · {priceLabel} · {plan.billing_period === 'lifetime' ? 'À vie' : periodLabel(plan.billing_period)}</div>
                </div>
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Numéro Mobile Money</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                  <Phone size={14} color="rgba(255,255,255,0.4)" />
                </div>
                <input type="tel" value={msisdn} onChange={e => setMsisdn(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePay()} placeholder="ex: 050489037" autoFocus style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '12px 14px', fontSize: 15, color: '#fff', fontFamily: 'inherit' }} />
              </div>

              <div style={{ background: `${plan.color}0d`, border: `1px solid ${plan.color}20`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                {[{ icon: Shield, label: 'Licence unique générée à votre nom' }, { icon: Clock, label: `Validité : ${plan.billing_period === 'lifetime' ? 'À vie' : periodLabel(plan.billing_period)}` }, { icon: Calendar, label: 'Activation immédiate après paiement' }].map(({ icon: Icon, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                    <Icon size={13} color={plan.color} />{label}
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Une demande de paiement sera envoyée sur votre téléphone. Confirmez-la pour recevoir votre clé.
              </div>

              <motion.button whileHover={{ scale: msisdn.trim() ? 1.02 : 1 }} whileTap={{ scale: msisdn.trim() ? 0.98 : 1 }} onClick={handlePay} disabled={!msisdn.trim()} style={{ width: '100%', background: msisdn.trim() ? '#fff' : 'rgba(255,255,255,0.08)', color: msisdn.trim() ? '#000' : 'rgba(255,255,255,0.25)', fontWeight: 700, padding: '14px 20px', borderRadius: 12, fontSize: 15, border: 'none', cursor: msisdn.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
                Payer {priceLabel} via Mobile Money
              </motion.button>
            </div>
          )}

          {/* ── LOADING ── */}
          {step === 'loading' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Loader2 size={40} color={plan.color} style={{ margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Initialisation du paiement…</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Connexion à la passerelle de paiement</div>
            </div>
          )}

          {/* ── WAITING ── */}
          {step === 'waiting' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, background: 'rgba(251,191,36,0.1)', border: '2px solid rgba(251,191,36,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Phone size={28} color="#fbbf24" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Confirmez sur votre téléphone</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24 }}>
                Une demande de <strong style={{ color: '#fbbf24' }}>{priceLabel}</strong> a été envoyée au <strong style={{ color: '#fff' }}>{msisdn}</strong>.<br />Veuillez la confirmer pour valider votre achat.
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>ID TRANSACTION</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>{txId}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                <Loader2 size={14} color={plan.color} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                Vérification en cours{'.'.repeat((pollCount % 3) + 1)}
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && license && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 44, height: 44, background: 'rgba(74,222,128,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={24} color="#4ade80" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Paiement confirmé !</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Votre licence est prête, {license.fullName}. Un email a été envoyé à {license.email}.</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, marginBottom: 8 }}>CLÉ DE LICENCE</div>
                <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#4ade80', wordBreak: 'break-all', lineHeight: 1.5 }}>{license.licenseKey}</span>
                  <button onClick={copyKey} style={{ display: 'flex', alignItems: 'center', gap: 5, background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)', flexShrink: 0, transition: 'all 0.2s' }}>
                    {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    {copied ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {[['Nom', license.fullName], ['Email', license.email], ['Produit', license.product], ['Validité', license.validUntil], ['Émis le', formatDate(license.issuedAt)], ['Montant', `${license.amount} ${license.currency}`]].map(([label, value]) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5, marginBottom: 3 }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>COMMENT ACTIVER DANS LAMUKA :</div>
                {['Ouvrez Lamuka sur votre bureau', 'Allez dans Paramètres → Licence', 'Collez votre clé de licence', "Cliquez sur Activer — c'est tout !"].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < 3 ? 8 : 0, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                    <span style={{ width: 20, height: 20, background: 'rgba(99,102,241,0.2)', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#818cf8', flexShrink: 0 }}>{i + 1}</span>{s}
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                Clé perdue ? <Link to="/recover" style={{ color: '#818cf8', textDecoration: 'none' }}>Récupérer ma licence</Link> · <a href="mailto:support@lamuka.com" style={{ color: '#818cf8', textDecoration: 'none' }}>support@lamuka.com</a>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 56, height: 56, background: 'rgba(248,113,113,0.1)', border: '2px solid rgba(248,113,113,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <AlertCircle size={28} color="#f87171" />
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Une erreur est survenue</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 28 }}>{error}</div>
              <button onClick={() => { setStep('form'); setError('') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontWeight: 600, padding: '11px 22px', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
                <ArrowLeft size={14} /> Réessayer
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const faqItems = [
  { q: "Ai-je besoin d'une licence pour utiliser Lamuka ?", a: "Non. Toutes les fonctionnalités de base fonctionnent gratuitement avec vos propres clés API. La licence débloque des fonctionnalités avancées selon votre plan." },
  { q: "Comment recevoir ma clé de licence ?", a: "Après confirmation du paiement, votre clé s'affiche immédiatement à l'écran et vous est envoyée par email. Copiez-la et collez-la dans Lamuka sous Paramètres → Licence." },
  { q: "J'ai perdu ma clé de licence, que faire ?", a: "Rendez-vous sur lamuka.com/recover, entrez votre email d'achat, et nous vous renverrons votre clé instantanément." },
  { q: "Quel mode de paiement est accepté ?", a: "Nous acceptons les paiements Mobile Money (Airtel Money). Entrez votre numéro, confirmez la demande sur votre téléphone, et votre clé est prête." },
  { q: "La licence lifetime est-elle vraiment à vie ?", a: "Oui. Paiement unique, pas d'abonnement, pas de renouvellement. Payez une fois, utilisez pour toujours avec toutes les mises à jour." },
  { q: "Ma licence est-elle transférable ?", a: "Non. Chaque licence est nominative et liée à un seul utilisateur." },
]

function FaqItem({ q, a, delay = 0 }: { q: string; a: string; delay?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay }} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 22px' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }} style={{ fontSize: 20, color: 'rgba(255,255,255,0.4)', flexShrink: 0, lineHeight: 1 }}>+</motion.span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 22px 18px', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState<ApiPlan | null>(null)
  const [plans, setPlans]               = useState<ApiPlan[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState(false)

  const fetchPlans = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`${API_BASE}/api/plans`)
      const data = await res.json()
      setPlans(data.plans || [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [])

  return (
    <div style={{ paddingTop: 60 }}>
      {selectedPlan && <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}

      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)' }} />
        <motion.div initial="hidden" animate="show" variants={{ ...stagger, hidden: {} }} style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Zap size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Tarification</span>
          </motion.div>
          <motion.h1 variants={fadeUp} style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Tarification Simple, <span className="gradient-text">Honnête</span>
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Commencez gratuitement. Passez à la version supérieure pour débloquer les fonctionnalités avancées.
          </motion.p>
        </motion.div>
      </section>

      {/* Plans */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={32} color="#818cf8" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Chargement des plans…</div>
            </div>
          )}

          {/* Error */}
          {loadError && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <AlertCircle size={32} color="#f87171" style={{ margin: '0 auto 16px' }} />
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 16 }}>Impossible de charger les plans.</div>
              <button onClick={fetchPlans} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                <RefreshCw size={14} /> Réessayer
              </button>
            </div>
          )}

          {/* Plans grid */}
          {!loading && !loadError && (
            <>
              <motion.div
                initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
                variants={{ ...stagger, hidden: {} }}
                style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(260px,1fr))`, gap: 20 }}
              >
                {plans.map(plan => {
                  const isPaid = plan.price > 0
                  const isFeatured = plan.billing_period === 'lifetime' && plan.price > 0
                  const bg = `${plan.color}14`
                  const border = isFeatured ? `${plan.color}55` : `${plan.color}28`

                  return (
                    <motion.div key={plan.id} variants={fadeUp}>
                      <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} style={{ background: isFeatured ? `${plan.color}0a` : 'rgba(255,255,255,0.025)', border: `1px solid ${border}`, borderRadius: 24, padding: 32, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        {isFeatured && <BorderBeam duration={3.5} colorTo={`${plan.color}dd`} />}
                        {isFeatured && (
                          <div style={{ position: 'absolute', top: 18, right: 18, background: `${plan.color}20`, border: `1px solid ${plan.color}50`, borderRadius: 100, padding: '3px 12px', fontSize: 11, fontWeight: 700, color: plan.color, letterSpacing: 0.5 }}>POPULAIRE</div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                          <div style={{ width: 42, height: 42, background: bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={20} color={plan.color} />
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{plan.name}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{plan.description}</div>
                          </div>
                        </div>

                        <div style={{ marginBottom: 24 }}>
                          <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1.5, color: isPaid ? plan.color : '#fff' }}>{priceDisplay(plan)}</span>
                          {plan.price > 0 && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>/ {periodLabel(plan.billing_period)}</span>}
                        </div>

                        {/* Features */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 24 }}>
                          {plan.features.length === 0 && (
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>Aucune fonctionnalité premium</div>
                          )}
                          {plan.features.map(f => (
                            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                              <div style={{ width: 17, height: 17, background: bg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Check size={9} color={plan.color} strokeWidth={3} />
                              </div>
                              {featureLabel(f)}
                            </div>
                          ))}
                        </div>

                        {/* CTA */}
                        {plan.price === 0 ? (
                          <Link to="/downloads" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 600, padding: '13px 20px', borderRadius: 12, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)' }}>
                            Télécharger Gratuitement
                          </Link>
                        ) : (
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSelectedPlan(plan)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: isFeatured ? '#fff' : `${plan.color}22`, color: isFeatured ? '#000' : plan.color, fontWeight: 700, padding: '13px 20px', borderRadius: 12, fontSize: 14, border: isFeatured ? 'none' : `1px solid ${plan.color}44`, cursor: 'pointer', width: '100%' }}>
                            <Zap size={14} />
                            Obtenir {plan.name}
                          </motion.button>
                        )}
                      </motion.div>
                    </motion.div>
                  )
                })}
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} style={{ marginTop: 20, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 16, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>💬 Une question avant d'acheter ?</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Clé perdue ? <Link to="/recover" style={{ color: '#818cf8', textDecoration: 'none' }}>Récupérer ma licence</Link> · Notre équipe est disponible avant et après l'achat.</div>
                </div>
                <a href="mailto:support@lamuka.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 600, padding: '10px 20px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}>
                  Contacter le support →
                </a>
              </motion.div>
            </>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 40, letterSpacing: -0.5 }}>Questions Fréquentes</motion.h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faqItems.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} delay={i * 0.06} />)}
          </div>
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
