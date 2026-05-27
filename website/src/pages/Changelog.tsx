import { motion } from 'framer-motion'
import { Clock, Zap, Shield, Bug, Star } from 'lucide-react'

const releases = [
  {
    version: '0.1.9',
    date: 'Avril 2026',
    tag: 'Derniere',
    tagColor: '#4ade80',
    tagBg: 'rgba(74,222,128,0.1)',
    changes: [
      { type: 'new', text: 'Capture audio systeme avec raccourci Ctrl+Shift+M' },
      { type: 'new', text: 'Support du fournisseur STT ElevenLabs' },
      { type: 'new', text: 'Integrations STT Speechmatics et Rev.ai' },
      { type: 'new', text: 'Integration bases de donnees MySQL et PostgreSQL' },
      { type: 'new', text: "Email vocal avec approbation et countdown" },
      { type: 'new', text: "Simulateur d'entretien avec scoring IA" },
      { type: 'new', text: 'Generateur de CV et lettre de motivation' },
      { type: 'new', text: 'Resume de reunion IA automatique' },
      { type: 'new', text: 'Coaching tips en temps reel' },
      { type: 'new', text: 'Widget calendrier dans l\'overlay' },
      { type: 'improve', text: "Invisibilite de l'overlay significativement amelioree sur Windows 11" },
      { type: 'improve', text: 'Changement de modele plus rapide sans perte de contexte' },
      { type: 'fix', text: "Correction de la selection de zone de capture d'ecran sur multi-ecrans" },
      { type: 'fix', text: 'Correction du conflit de raccourcis avec certaines applications sur macOS' },
    ],
  },
  {
    version: '0.1.8',
    date: 'Mars 2026',
    changes: [
      { type: 'new', text: "Fenetre overlay deplacable avec persistance de position" },
      { type: 'new', text: "Mode capture d'ecran automatique avec minuteur et prompt personnalise" },
      { type: 'new', text: 'Support des fournisseurs STT Groq et Deepgram' },
      { type: 'improve', text: 'Taille du binaire reduite de 12MB a 10MB' },
      { type: 'improve', text: "Latence de l'entree vocale amelioree de 40%" },
      { type: 'fix', text: "Correction de la fenetre restant au premier plan apres un jeu en plein ecran sur Windows" },
    ],
  },
  {
    version: '0.1.7',
    date: 'Fevrier 2026',
    changes: [
      { type: 'new', text: 'Support Azure Speech-to-Text et IBM Watson STT' },
      { type: 'new', text: 'Fournisseur IA personnalise via template cURL' },
      { type: 'new', text: 'Fournisseurs Google Gemini et Mistral pre-configures' },
      { type: 'improve', text: 'Refonte du tableau de bord avec parametres plus clairs' },
      { type: 'fix', text: "Correction du verrou de base de donnees SQLite lors d'envois rapides de messages" },
      { type: 'fix', text: 'Correction du scintillement de transparence sur macOS Sequoia' },
    ],
  },
  {
    version: '0.1.6',
    date: 'Janvier 2026',
    changes: [
      { type: 'new', text: "Systeme d'activation de licence Dev Pro" },
      { type: 'new', text: "Pieces jointes multi-captures d'ecran dans un seul message" },
      { type: 'new', text: 'Prompt systeme personnalise par conversation' },
      { type: 'improve', text: 'Temps de demarrage reduit a moins de 100ms' },
      { type: 'fix', text: "Correction de l'overlay ne se masquant pas avec Ctrl+\\ sur certaines distributions Linux" },
    ],
  },
  {
    version: '0.1.5',
    date: 'Decembre 2025',
    changes: [
      { type: 'new', text: 'Support Linux initial (Debian, RPM, AppImage)' },
      { type: 'new', text: 'Entree vocale OpenAI Whisper et ElevenLabs' },
      { type: 'new', text: "Historique de conversations SQLite local" },
      { type: 'improve', text: 'Installeur Windows (.msi et .exe)' },
      { type: 'fix', text: "Correction du crash sur Windows en l'absence de peripherique audio" },
    ],
  },
]

const typeConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  new:     { label: 'Nouveau',   color: '#4ade80', icon: Star },
  improve: { label: 'Ameliore',  color: '#818cf8', icon: Zap },
  fix:     { label: 'Corrige',   color: '#fbbf24', icon: Bug },
  security:{ label: 'Securite',  color: '#f87171', icon: Shield },
}

export default function Changelog() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6 }} style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Clock size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Changelog</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Quoi de <span className="gradient-text">Neuf</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Tous les changements notables de Lamu, version par version.
          </p>
        </motion.div>
      </section>

      {/* Releases */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
            {releases.map((release, i) => (
              <motion.div
                key={release.version}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                style={{ paddingLeft: 32, position: 'relative' }}
              >
                {/* Dot */}
                <div style={{ position: 'absolute', left: -5, top: 6, width: 10, height: 10, borderRadius: '50%', background: release.tag ? release.tagColor : 'rgba(255,255,255,0.2)', border: `2px solid ${release.tag ? release.tagColor : 'rgba(255,255,255,0.1)'}` }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>v{release.version}</h2>
                  {release.tag && (
                    <span style={{ background: release.tagBg, border: `1px solid ${release.tagColor}40`, borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: release.tagColor }}>
                      {release.tag}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{release.date}</span>
                </div>

                {/* Changes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {release.changes.map((change, j) => {
                    const cfg = typeConfig[change.type] || typeConfig.fix
                    const Icon = cfg.icon
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 1 }}>
                          <Icon size={13} color={cfg.color} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, letterSpacing: 0.5, minWidth: 52 }}>{cfg.label}</span>
                        </div>
                        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{change.text}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
