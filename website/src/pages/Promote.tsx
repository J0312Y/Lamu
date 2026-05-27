import { motion } from 'framer-motion'
import { Megaphone, Copy, Image, FileText, Mail } from 'lucide-react'
import { useState } from 'react'

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } },
}
const stagger = { show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }

const copyTexts = [
  {
    label: 'Court (Twitter / X)',
    text: "Lamu est l'assistant IA invisible que j'attendais. ~10MB, fonctionne avec n'importe quel fournisseur IA, completement indetectable en visio. Integrations DB, email vocal, simulateur d'entretien et bien plus. lamuka.com",
  },
  {
    label: 'Moyen (LinkedIn / Blog)',
    text: "J'utilise Lamu — un assistant IA ultra-rapide et axe confidentialite, construit avec Tauri et Rust. Seulement ~10MB, demarrage en moins de 100ms, compatible avec OpenAI, Anthropic, Gemini et tout fournisseur custom, et completement invisible dans Zoom et Google Meet. Il integre aussi vos bases de donnees MySQL/PostgreSQL, un email vocal avec approbation, un simulateur d'entretien avec scoring IA et un generateur de CV. Si vous privilegiez la confidentialite et la performance, c'est l'outil qu'il vous faut. lamuka.com",
  },
  {
    label: 'Long (Newsletter / Article)',
    text: "Lamu est un assistant IA de bureau pas comme les autres. Construit avec Tauri et Rust — pas Electron — il fait 27x moins que les alternatives avec seulement ~10MB. Il fonctionne entierement en local avec stockage SQLite, envoie les requetes directement a votre fournisseur IA (OpenAI, Claude, Gemini, Grok ou tout endpoint custom), et l'overlay est completement indetectable dans Zoom, Google Meet, Teams et tous les logiciels de partage d'ecran. Il supporte l'entree vocale via OpenAI Whisper, ElevenLabs et 7 autres fournisseurs STT. En plus de l'assistance en reunion, Lamu offre des integrations DB (MySQL/PostgreSQL) avec requetes en langage naturel, un email vocal avec countdown d'approbation, un simulateur d'entretien avec scoring IA, un generateur de CV et lettre de motivation, une base de connaissances RAG et des statistiques d'utilisation. L'offre gratuite fonctionne avec vos propres cles API, et la licence Dev Pro a vie coute 120$. lamuka.com",
  },
]

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 6, background: copied ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)', transition: 'all 0.2s' }}>
          <Copy size={12} />
          {copied ? 'Copie !' : 'Copier'}
        </button>
      </div>
      <p style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{text}</p>
    </div>
  )
}

const stats = [
  { value: '~10MB', label: "Taille de l'app" },
  { value: '27x', label: "Plus leger qu'Electron" },
  { value: '<100ms', label: 'Temps de demarrage' },
  { value: '9+', label: 'Fournisseurs IA' },
  { value: '9+', label: 'Fournisseurs STT' },
  { value: '100%', label: 'Local & Prive' },
]

export default function Promote() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div initial="hidden" animate="show" variants={{ ...stagger, hidden: {} }} style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Megaphone size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Promouvoir Lamu</span>
          </motion.div>
          <motion.h1 variants={fadeUp} style={{ fontSize: 'clamp(2.2rem,6vw,3.8rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Faites Passer le Mot<br /><span className="gradient-text">Gagnez Ensemble</span>
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Textes prets a copier, statistiques cles et arguments pour vous aider a promouvoir Lamu aupres de votre audience.
          </motion.p>
        </motion.div>
      </section>

      {/* Key stats */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 16, letterSpacing: 0.5 }}>STATISTIQUES CLES A PARTAGER</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
            {stats.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#818cf8', letterSpacing: -0.5, marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Copy-ready text */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <FileText size={18} color="#818cf8" />
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Descriptions Pretes a Copier</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {copyTexts.map(t => <CopyBlock key={t.label} label={t.label} text={t.text} />)}
          </div>
        </div>
      </section>

      {/* Talking points */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Megaphone size={18} color="#fbbf24" />
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Arguments Cles</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
            {[
              { point: 'Construit avec Tauri + Rust', detail: "Pas Electron — c'est pourquoi il fait 10MB au lieu de 270MB." },
              { point: 'Completement invisible', detail: "L'overlay est exclu de la capture video sur toutes les plateformes." },
              { point: "N'importe quel fournisseur IA", detail: 'Fonctionne avec OpenAI, Claude, Gemini, Grok, Mistral, Groq, Ollama ou un endpoint custom.' },
              { point: 'Stockage 100% local', detail: 'Toutes les donnees de conversation restent sur l\'appareil dans SQLite. Zero telemetrie.' },
              { point: 'Integrations puissantes', detail: 'Bases de donnees MySQL/PostgreSQL, email vocal, simulateur d\'entretien, generateur de CV, base de connaissances RAG.' },
              { point: 'Gratuit a utiliser', detail: 'Les fonctionnalites de base sont gratuites. Dev Pro est une licence a vie a 120$.' },
            ].map((tp, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{tp.point}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{tp.detail}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Assets */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Image size={18} color="#22d3ee" />
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ressources Media</h2>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24 }}>
              Besoin de logos, captures d'ecran, videos de demo ou bannieres pour votre contenu ?<br />
              Envoyez-nous un email et nous vous enverrons un kit media complet.
            </p>
            <a href="mailto:support@lamuka.com?subject=Demande de Kit Media" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '12px 24px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}>
              <Mail size={15} /> Demander le Kit Media
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
