import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BorderBeam } from '../components/BorderBeam'
import {
  Download, Shield, Zap, EyeOff, Monitor, Globe, ChevronDown, Mic, Database,
  Mail, Brain, FileText, BarChart3, Calendar, MessageSquare,
  GraduationCap, BookOpen, Layers, CheckCircle2, Play
} from 'lucide-react'

// ── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: 'blur(8px)' },
  show:   { opacity: 1, y: 0,  filter: 'blur(0px)' },
}

const stagger = (delayChildren = 0.1, staggerChildren = 0.08) => ({
  hidden: {},
  show: { transition: { delayChildren, staggerChildren } },
})

function FadeIn({ children, delay = 0, className = '', style = {} }: {
  children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      transition={{ duration: 0.65, delay }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

function StaggerGroup({ children, delay = 0, className = '', style = {} }: {
  children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      variants={stagger(delay, 0.1)}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

function StaggerItem({ children, className = '', style = {} }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties
}) {
  return (
    <motion.div variants={fadeUp} transition={{ duration: 0.6 }} className={className} style={style}>
      {children}
    </motion.div>
  )
}

// ── Feature data ──────────────────────────────────────────────────────────────

const features = [
  { icon: EyeOff, label: 'Totalement Invisible', desc: "Indetectable dans les appels video et les partages d'ecran", color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  { icon: Shield, label: 'Confidentialite Totale', desc: 'Toutes les donnees stockees localement, zero telemetrie', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { icon: Zap, label: 'Ultra Rapide', desc: '~10MB, 27x plus leger que les alternatives', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  { icon: Database, label: 'Integrations DB', desc: 'Connectez MySQL, PostgreSQL et interrogez vos bases en langage naturel', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
  { icon: Mail, label: 'Email Vocal', desc: 'Dictez vos emails, Lamu les envoie avec approbation et countdown', color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
  { icon: Brain, label: 'Base de Connaissances', desc: 'RAG avec chunking semantique et re-ranking hybride', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  { icon: GraduationCap, label: "Simulateur d'Entretien", desc: 'Questions comportementales, techniques et coding avec scoring IA', color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  { icon: FileText, label: 'Generateur CV', desc: 'CV + lettre de motivation generes par IA, export Markdown', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { icon: MessageSquare, label: 'Resume de Reunion', desc: "Resume IA automatique de vos reunions, sauvegarde dans la KB", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  { icon: Globe, label: 'Multi-Fournisseur IA', desc: 'OpenAI, Claude, Gemini, Grok, Mistral, ou endpoint custom', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  { icon: Mic, label: 'Multi-Fournisseur STT', desc: 'Whisper, ElevenLabs, Groq, Deepgram, ou custom', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
  { icon: Monitor, label: 'Multi-Plateforme', desc: 'Natif sur macOS, Windows et Linux', color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
]

const aiProviders = [
  { name: 'OpenAI',     logo: 'https://cdn.simpleicons.org/openai/ffffff',     bg: 'rgba(0,0,0,0.4)' },
  { name: 'Anthropic',  logo: 'https://cdn.simpleicons.org/anthropic/ffffff',   bg: 'rgba(204,150,82,0.15)' },
  { name: 'Google',     logo: 'https://cdn.simpleicons.org/google/ffffff',      bg: 'rgba(66,133,244,0.15)' },
  { name: 'xAI Grok',   logo: 'https://cdn.simpleicons.org/xai/ffffff',         bg: 'rgba(255,255,255,0.06)' },
  { name: 'Mistral',    logo: 'https://cdn.simpleicons.org/mistral/ffffff',     bg: 'rgba(255,122,0,0.15)' },
  { name: 'Groq',       logo: 'https://cdn.simpleicons.org/groq/ffffff',        bg: 'rgba(139,92,246,0.15)' },
  { name: 'Perplexity', logo: 'https://cdn.simpleicons.org/perplexity/ffffff',  bg: 'rgba(32,178,170,0.15)' },
  { name: 'Ollama',     logo: 'https://cdn.simpleicons.org/ollama/ffffff',      bg: 'rgba(255,255,255,0.06)' },
  { name: 'Cohere',     logo: 'https://cdn.simpleicons.org/cohere/ffffff',      bg: 'rgba(57,101,223,0.15)' },
  { name: '+ Custom',   logo: null, dashed: true, bg: 'rgba(255,255,255,0.04)' },
]

// ── Sections ──────────────────────────────────────────────────────────────────

function SectionHeader({ tag, title, subtitle }: { tag?: string; title: string; subtitle?: string }) {
  return (
    <FadeIn style={{ textAlign: 'center', marginBottom: 64 }}>
      {tag && (
        <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '4px 14px', marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#818cf8', textTransform: 'uppercase' }}>{tag}</span>
        </div>
      )}
      <h2 style={{ fontSize: 'clamp(1.9rem,4vw,2.7rem)', fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, marginBottom: 14 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>{subtitle}</p>}
    </FadeIn>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div>
      <HeroSection />
      <SystemAudioSection />
      <WhySection />
      <FeaturesSection />
      <IntegrationsSection />
      <ProductivitySection />
      <AIControlSection />
      <VoiceAudioSection />
      <FAQSection />
      <ExploreSection />
      <CtaSection />
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '120px 24px 80px', overflow: 'hidden' }}>

      {/* Video background */}
      <video
        autoPlay muted loop playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, zIndex: 0 }}
      >
        <source src="https://assets.pluely.com/bg.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 55%), radial-gradient(ellipse 100% 50% at 50% 110%, rgba(0,0,0,1) 0%, transparent 70%), linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.6) 50%, #000 100%)', zIndex: 1 }} />

      {/* Grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '64px 64px', zIndex: 1, maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)' }} />

      {/* Blobs */}
      <div className="float-anim" style={{ position: 'absolute', top: '18%', left: '5%', width: 450, height: 450, background: 'radial-gradient(circle,rgba(99,102,241,0.14) 0%,transparent 70%)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 1 }} />
      <div className="float-anim" style={{ position: 'absolute', top: '35%', right: '5%', width: 320, height: 320, background: 'radial-gradient(circle,rgba(139,92,246,0.1) 0%,transparent 70%)', borderRadius: '50%', filter: 'blur(45px)', zIndex: 1, animationDelay: '2s', animationDirection: 'reverse' }} />

      {/* Two-column layout */}
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }} className="hero-grid">

        {/* Left — text */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger(0.1, 0.12)}
        >
          {/* Badge */}
          <StaggerItem>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 100, padding: '6px 18px', marginBottom: 28 }}>
              <span className="glow-pulse" style={{ width: 6, height: 6, background: '#6366f1', borderRadius: '50%', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>L'Assistant IA Invisible</span>
            </div>
          </StaggerItem>

          {/* Headline */}
          <StaggerItem>
            <h1 style={{ fontSize: 'clamp(2.6rem,5vw,4.4rem)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-2px', marginBottom: 20 }}>
              Votre Assistant<br />
              <span className="gradient-text">IA Invisible</span>
            </h1>
          </StaggerItem>

          {/* Subheadline */}
          <StaggerItem>
            <p style={{ fontSize: 'clamp(15px,1.8vw,17px)', color: 'rgba(255,255,255,0.52)', lineHeight: 1.75, marginBottom: 36, fontWeight: 400 }}>
              Lamu fonctionne en toute discretion pendant vos reunions, entretiens et presentations. Indetectable dans les appels video, partages d'ecran et enregistrements. Construit avec Tauri et Rust — ~10MB, 100% prive.
            </p>
          </StaggerItem>

          {/* Buttons */}
          <StaggerItem>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <Link to="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '13px 26px', borderRadius: 12, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 24px rgba(255,255,255,0.1)' }}>
                  <Download size={16} />
                  Telecharger
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 500, padding: '13px 26px', borderRadius: 12, fontSize: 15, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.14)' }}>
                  Voir les Tarifs
                </Link>
              </motion.div>
            </div>
          </StaggerItem>

          {/* Stats */}
          <StaggerItem>
            <div style={{ display: 'flex', alignItems: 'center', gap: 32, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' }}>
              {[
                { value: '~10MB', label: "Taille de l'app" },
                { value: '<100ms', label: 'Demarrage' },
                { value: '27x', label: 'Plus leger' },
                { value: '100%', label: 'Prive' },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 'clamp(1.2rem,2.5vw,1.6rem)', fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </StaggerItem>
        </motion.div>

        {/* Right — app preview */}
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35 }}
        >
          <div style={{ position: 'relative', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 8, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
            <BorderBeam duration={5} colorTo="rgba(99,102,241,0.9)" />
            <video
              autoPlay muted loop playsInline
              disablePictureInPicture
              style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover' }}
            >
              <source src="https://assets.pluely.com/transparent.mp4" type="video/mp4" />
            </video>
          </div>
        </motion.div>

      </div>

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 2, color: 'rgba(255,255,255,0.2)' }}
      >
        <ChevronDown size={22} />
      </motion.div>
    </section>
  )
}

// ── System Audio Capture ──────────────────────────────────────────────────────

function SystemAudioSection() {
  return (
    <section style={{ padding: '64px 24px', background: '#000', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="feature-header-grid">
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 100, padding: '4px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#fbbf24' }}>AUDIO SYSTEME</span>
              </div>
              <h3 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15 }}>
                Capture Audio Systeme
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '3px 10px', fontSize: 14, fontFamily: 'monospace', fontWeight: 600, color: 'rgba(255,255,255,0.6)', verticalAlign: 'middle' }}>Ctrl+Shift+M</span>
              </h3>
            </div>
            <div style={{ paddingTop: 8 }}>
              <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 15, lineHeight: 1.8, marginBottom: 20 }}>
                Capturez l'audio systeme en direct pendant vos reunions, entretiens et presentations. Lamu ecoute ce qui se dit et le transmet directement a votre IA — sans saisie manuelle.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {["Capture l'audio systeme en temps reel", 'Fonctionne avec toutes les apps de reunion', 'Transcription auto avec votre fournisseur STT', 'Activation/desactivation par raccourci'].map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    <div style={{ width: 18, height: 18, background: 'rgba(251,191,36,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <motion.div
            whileHover={{ scale: 1.005 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            style={{ position: 'relative', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}
          >
            <BorderBeam colorTo="rgba(251,191,36,0.8)" duration={4} />
            <video
              autoPlay muted loop playsInline disablePictureInPicture
              style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover' }}
            >
              <source src="https://assets.pluely.com/system-audio.mp4" type="video/mp4" />
              <source src="https://assets.pluely.com/keyboard-shortcuts.mp4" type="video/mp4" />
            </video>
          </motion.div>
        </FadeIn>
      </div>
    </section>
  )
}

// ── Why Section ───────────────────────────────────────────────────────────────

function WhySection() {
  return (
    <section id="why" style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader tag="Pourquoi Lamu" title="Tout ce dont vous avez besoin" subtitle="Concu pour ceux qui privilegient la confidentialite et la performance." />

        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14 }}>
          {features.map((f, i) => (
            <StaggerItem key={f.label}>
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(255,255,255,0.2)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden', cursor: 'default' }}
                className="feature-card-hover"
              >
                <BorderBeam duration={3 + (i % 3)} delay={i * 0.2} />
                <div style={{ width: 40, height: 40, background: f.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <f.icon size={19} color={f.color} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 7 }}>{f.label}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.48)', lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

// ── Features detail ───────────────────────────────────────────────────────────

function FeaturesSection() {
  const featureRows = [
    {
      tag: 'INVISIBILITE',
      tagColor: '#818cf8',
      tagBg: 'rgba(99,102,241,0.1)',
      tagBorder: 'rgba(99,102,241,0.2)',
      title: 'Completement Indetectable',
      desc: "La fenetre overlay reste au-dessus de toutes les applications et reste invisible dans Zoom, Google Meet, Teams et tous les logiciels de partage d'ecran. Votre audience ne sait jamais qu'elle est la.",
      checks: ['Invisible sur toutes les plateformes de visio', "Design translucide resistant aux captures d'ecran", "Niveau de transparence ajustable"],
      videoSrc: 'https://assets.pluely.com/transparent.mp4',
      beamColor: 'rgba(99,102,241,0.8)',
    },
    {
      tag: 'RACCOURCIS',
      tagColor: '#fbbf24',
      tagBg: 'rgba(251,191,36,0.08)',
      tagBorder: 'rgba(251,191,36,0.2)',
      title: 'Controle au Clavier',
      desc: "Chaque action est a une touche de distance. Des raccourcis globaux entierement personnalisables vous permettent de controler l'app sans quitter votre contexte.",
      checks: ['Raccourcis entierement personnalisables', 'Fonctionne dans toute application', 'Basculer, capturer, parler instantanement'],
      videoSrc: 'https://assets.pluely.com/keyboard-shortcuts.mp4',
      beamColor: 'rgba(251,191,36,0.8)',
      shortcuts: [
        { action: 'Basculer Fenetre', key: 'Ctrl+\\' },
        { action: 'Tableau de Bord', key: 'Ctrl+Shift+D' },
        { action: "Capture d'Ecran", key: 'Ctrl+Shift+S' },
        { action: 'Entree Vocale', key: 'Ctrl+Shift+A' },
      ],
    },
    {
      tag: "CAPTURE D'ECRAN",
      tagColor: '#4ade80',
      tagBg: 'rgba(74,222,128,0.08)',
      tagBorder: 'rgba(74,222,128,0.2)',
      title: 'Analyse Visuelle Instantanee',
      desc: "Capturez votre ecran ou selectionnez une zone et envoyez-la instantanement a l'IA pour analyse. Le mode auto traite les captures automatiquement avec votre prompt personnalise.",
      checks: ['Plein ecran ou selection de zone', 'Mode auto avec prompt personnalise', "Joignez plusieurs captures d'ecran a la fois"],
      videoSrc: 'https://assets.pluely.com/manual-screenshot.mp4',
      beamColor: 'rgba(74,222,128,0.8)',
    },
    {
      tag: 'TOUJOURS PRET',
      tagColor: '#22d3ee',
      tagBg: 'rgba(34,211,238,0.08)',
      tagBorder: 'rgba(34,211,238,0.2)',
      title: 'Toujours Pret et Accessible',
      desc: "Deplacez l'overlay n'importe ou sur votre ecran. Un raccourci l'affiche instantanement, peu importe l'application en cours.",
      checks: ['Overlay librement deplacable', 'Raccourci global de basculement', 'Position persistante entre les sessions'],
      videoSrc: 'https://assets.pluely.com/draggable.mp4',
      beamColor: 'rgba(34,211,238,0.8)',
    },
  ]

  return (
    <section id="features" style={{ background: '#000' }}>
      {featureRows.map((row) => (
        <FadeIn key={row.tag} delay={0.1}>
          <div style={{ padding: '64px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* Title + desc row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="feature-header-grid">
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: row.tagBg, border: `1px solid ${row.tagBorder}`, borderRadius: 100, padding: '4px 14px', marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: row.tagColor }}>{row.tag}</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15 }}>{row.title}</h3>
                </div>
                <div style={{ paddingTop: 8 }}>
                  <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 15, lineHeight: 1.8, marginBottom: row.shortcuts ? 20 : 0 }}>{row.desc}</p>
                  {row.shortcuts ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {row.shortcuts.map(s => (
                        <div key={s.action} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 3 }}>{s.action}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'rgba(255,255,255,0.9)' }}>{s.key}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.checks.map(c => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                          <div style={{ width: 18, height: 18, background: 'rgba(74,222,128,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Full-width framed video */}
              <motion.div
                whileHover={{ scale: 1.005 }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                style={{ position: 'relative', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}
              >
                <BorderBeam colorTo={row.beamColor} duration={4} />
                <video
                  autoPlay muted loop playsInline
                  disablePictureInPicture
                  style={{ width: '100%', display: 'block', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover' }}
                >
                  <source src={row.videoSrc} type="video/mp4" />
                </video>
              </motion.div>

            </div>
          </div>
        </FadeIn>
      ))}

      <style>{`
        @media (max-width: 640px) {
          .feature-header-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

// ── Integrations Section (NEW) ───────────────────────────────────────────────

function IntegrationsSection() {
  const integrations = [
    {
      icon: Database,
      title: 'Bases de Donnees',
      desc: 'Connectez vos bases MySQL et PostgreSQL. Interrogez vos donnees en langage naturel, Lamu genere et execute le SQL automatiquement. Les ecritures (INSERT, UPDATE, DELETE) necessitent votre approbation avec countdown.',
      color: '#22d3ee',
      bg: 'rgba(34,211,238,0.08)',
      checks: ['MySQL et PostgreSQL supportes', 'Lectures auto-executees, ecritures avec approbation', 'Schema injecte automatiquement dans le contexte IA'],
    },
    {
      icon: Layers,
      title: 'Jira, Confluence, Notion',
      desc: "Connectez vos outils de gestion de projet. Lamu recupere vos tickets, sprints, pages de documentation et les integre dans le contexte de l'IA pour des reponses precises.",
      color: '#818cf8',
      bg: 'rgba(99,102,241,0.08)',
      checks: ['Sprints et tickets Jira en temps reel', 'Pages Confluence indexees dans la KB', 'Workspaces Notion synchronises'],
    },
    {
      icon: BookOpen,
      title: 'Base de Connaissances RAG',
      desc: "Importez vos documents (PDF, Markdown, texte) dans la base de connaissances. Chunking semantique intelligent et re-ranking hybride (75% cosine + 25% keyword) pour des reponses ultra-precises.",
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.08)',
      checks: ['Chunking semantique (1200 tokens)', 'Re-ranking hybride cosine + keyword', 'Panel de debug avec scores de pertinence'],
    },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Integrations"
          title="Connectez Vos Systemes"
          subtitle="Lamu s'integre a vos bases de donnees et outils existants pour des reponses IA contextuelles et precises."
        />

        <StaggerGroup delay={0.05} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {integrations.map((item) => (
            <StaggerItem key={item.title}>
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}
                className="feature-header-grid"
              >
                <div>
                  <div style={{ width: 44, height: 44, background: item.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <item.icon size={22} color={item.color} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>{item.desc}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                  {item.checks.map(c => (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                      <div style={{ width: 18, height: 18, background: `${item.color}20`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CheckCircle2 size={10} color={item.color} />
                      </div>
                      {c}
                    </div>
                  ))}
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

// ── Productivity Section (NEW) ───────────────────────────────────────────────

function ProductivitySection() {
  const tools = [
    { icon: Mail, title: 'Email Vocal', desc: "Dictez votre email, l'IA le redige et l'envoie avec approbation countdown 3s. Autocomplete des contacts et config SMTP integree.", color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
    { icon: MessageSquare, title: 'Resume de Reunion', desc: "L'IA genere automatiquement un resume de votre reunion a partir du transcript. Sauvegarde directe dans la base de connaissances.", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
    { icon: Brain, title: 'Coaching en Direct', desc: "Conseils IA generes en temps reel pendant vos reunions, bases sur le transcript en cours. Parfait pour les situations de vente ou entretien.", color: '#818cf8', bg: 'rgba(99,102,241,0.1)' },
    { icon: Calendar, title: 'Calendrier Integre', desc: "Votre agenda affiche directement dans l'overlay. Consultez vos prochains rendez-vous sans quitter votre reunion.", color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
    { icon: Play, title: 'Playbook / Script', desc: "Chargez un script ou des notes dans le contexte de l'IA pendant la reunion. L'IA les utilise pour generer des reponses alignees.", color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
    { icon: GraduationCap, title: "Simulateur d'Entretien", desc: "Preparez vos entretiens avec des questions comportementales, techniques, system design et coding. Scoring IA par question (clarte, pertinence, structure).", color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    { icon: FileText, title: 'Generateur de CV', desc: "Generez un resume de CV et une lettre de motivation par IA. Export Markdown, bilingue francais/anglais.", color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
    { icon: BarChart3, title: "Statistiques d'Utilisation", desc: "Suivez vos requetes et tokens utilises par jour. Tableau de bord visuel avec historique complet.", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(6,5,15,1),#000)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader
          tag="Productivite"
          title="Outils de Productivite Integres"
          subtitle="Bien plus qu'un assistant vocal. Lamu est une suite complete d'outils IA pour votre quotidien professionnel."
        />

        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
          {tools.map((t, i) => (
            <StaggerItem key={t.title}>
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(255,255,255,0.2)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden', cursor: 'default', height: '100%' }}
              >
                <BorderBeam duration={3 + (i % 3)} delay={i * 0.15} />
                <div style={{ width: 40, height: 40, background: t.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <t.icon size={19} color={t.color} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t.title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.48)', lineHeight: 1.65 }}>{t.desc}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

// ── Complete Control Over AI ──────────────────────────────────────────────────

function AIControlSection() {
  const preconfigured = [
    { name: 'Mistral AI', logo: 'https://cdn.simpleicons.org/mistral/ffffff', bg: 'rgba(255,122,0,0.12)' },
    { name: 'Cohere',     logo: 'https://cdn.simpleicons.org/cohere/ffffff',  bg: 'rgba(57,101,223,0.12)' },
    { name: 'Perplexity', logo: 'https://cdn.simpleicons.org/perplexity/ffffff', bg: 'rgba(32,178,170,0.12)' },
    { name: 'Groq',       logo: 'https://cdn.simpleicons.org/groq/ffffff',    bg: 'rgba(139,92,246,0.12)' },
    { name: 'Ollama',     logo: 'https://cdn.simpleicons.org/ollama/ffffff',  bg: 'rgba(255,255,255,0.05)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Fournisseurs IA"
          title="Controle Total sur l'IA"
          subtitle="Connectez n'importe quel fournisseur IA via de simples commandes cURL. OpenAI, Anthropic, Google, xAI, Mistral, Cohere, Perplexity, Groq, Ollama, ou votre propre endpoint."
        />

        {/* Two top cards */}
        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 32 }}>

          {/* Lamu API card */}
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', height: '100%' }}
            >
              <BorderBeam colorTo="rgba(99,102,241,0.8)" duration={4} />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '3px 12px', marginBottom: 16, fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: 0.5 }}>
                OPTIONNEL
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Lamu API</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Vous ne souhaitez pas gerer vos propres cles API ? Utilisez notre API optionnelle pour un acces pratique a 120+ modeles IA premium dont GPT-4, Claude et Gemini.
              </p>
            </motion.div>
          </StaggerItem>

          {/* Custom cURL card */}
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', height: '100%' }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Fournisseur IA Custom avec cURL</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 16 }}>
                Tout endpoint compatible OpenAI fonctionne. Utilisez le template ci-dessous — Lamu remplit <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 6px', fontSize: 12, color: '#818cf8' }}>{'{{PROMPT}}'}</code> et <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 6px', fontSize: 12, color: '#818cf8' }}>{'{{API_KEY}}'}</code> automatiquement.
              </p>
              <div style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, overflowX: 'auto' }}>
                <div><span style={{ color: '#4ade80' }}>curl</span> <span style={{ color: '#fbbf24' }}>-s</span> https://api.openai.com/v1/chat/completions \</div>
                <div style={{ paddingLeft: 16 }}><span style={{ color: '#fbbf24' }}>-H</span> <span style={{ color: '#f87171' }}>"Authorization: Bearer {'{{API_KEY}}'}"{'\u2033'}</span> \</div>
                <div style={{ paddingLeft: 16 }}><span style={{ color: '#fbbf24' }}>-H</span> <span style={{ color: '#f87171' }}>"Content-Type: application/json"</span> \</div>
                <div style={{ paddingLeft: 16 }}><span style={{ color: '#fbbf24' }}>-d</span> <span style={{ color: '#f87171' }}>'&#123;"model":"gpt-4o","messages":[&#123;"role":"user","content":"{'{{PROMPT}}'}"{'\u2033'}&#125;]&#125;'</span></div>
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerGroup>

        {/* All provider tiles */}
        <FadeIn>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>FOURNISSEURS IA PRE-CONFIGURES</h3>
            <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
              {aiProviders.map(p => (
                <StaggerItem key={p.name}>
                  <motion.div
                    whileHover={{ y: -3, borderColor: 'rgba(255,255,255,0.22)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: p.bg, border: `1px solid ${p.dashed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)'}`, borderStyle: p.dashed ? 'dashed' : 'solid', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'default' }}
                  >
                    <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.logo
                        ? <img src={p.logo} alt={p.name} width={18} height={18} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                        : <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1 }}>+</span>
                      }
                    </div>
                    {p.name}
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>AUTRES FOURNISSEURS PRE-CONFIGURES</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {preconfigured.map(p => (
                <motion.div
                  key={p.name}
                  whileHover={{ y: -2, borderColor: 'rgba(255,255,255,0.22)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: p.bg, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
                >
                  <img src={p.logo} alt={p.name} width={16} height={16} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  {p.name}
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ── Voice & Audio Capture ─────────────────────────────────────────────────────

function VoiceAudioSection() {
  const sttProviders = [
    { name: 'Groq Whisper',  logo: 'https://cdn.simpleicons.org/groq/ffffff',         bg: 'rgba(139,92,246,0.1)' },
    { name: 'Google STT',    logo: 'https://cdn.simpleicons.org/google/ffffff',        bg: 'rgba(66,133,244,0.1)' },
    { name: 'Deepgram',      logo: 'https://cdn.simpleicons.org/deepgram/ffffff',      bg: 'rgba(6,182,212,0.1)' },
    { name: 'Azure Speech',  logo: 'https://cdn.simpleicons.org/microsoftazure/ffffff',bg: 'rgba(0,120,212,0.1)' },
    { name: 'Speechmatics',  logo: null,                                               bg: 'rgba(16,185,129,0.08)' },
    { name: 'Rev.ai',        logo: null,                                               bg: 'rgba(249,115,22,0.08)' },
    { name: 'IBM Watson',    logo: 'https://cdn.simpleicons.org/ibm/ffffff',           bg: 'rgba(99,102,241,0.1)' },
    { name: '+ Custom',      logo: null, dashed: true,                                bg: 'rgba(255,255,255,0.04)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(6,5,15,1),#000)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Voix & Audio"
          title="Capture Voix & Audio"
          subtitle="Capturez l'audio systeme en temps reel pendant vos reunions et presentations. Enregistrez votre voix avec des fournisseurs STT avances."
        />

        {/* Provider feature cards */}
        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 32 }}>

          {/* OpenAI Whisper */}
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}
            >
              <BorderBeam colorTo="rgba(16,185,129,0.7)" duration={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="https://cdn.simpleicons.org/openai/ffffff" alt="OpenAI" width={20} height={20} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>OpenAI Whisper</h3>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Supporte 99+ langues avec detection automatique. Precision de transcription leader du marche pour tout accent ou style de parole.
              </p>
            </motion.div>
          </StaggerItem>

          {/* ElevenLabs */}
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}
            >
              <BorderBeam colorTo="rgba(99,102,241,0.8)" duration={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="https://cdn.simpleicons.org/elevenlabs/ffffff" alt="ElevenLabs" width={20} height={20} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>ElevenLabs STT</h3>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Speech-to-text ultra-faible latence avec precision de niveau professionnel. Parfait pour la transcription en temps reel pendant les reunions.
              </p>
            </motion.div>
          </StaggerItem>

          {/* Custom STT */}
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>STT Custom avec cURL</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 14 }}>
                Utilisez n'importe quelle API STT. Les variables dynamiques <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: 11, color: '#818cf8' }}>{'{{AUDIO}}'}</code>, <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: 11, color: '#818cf8' }}>{'{{API_KEY}}'}</code>, <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: 11, color: '#818cf8' }}>{'{{LANGUAGE}}'}</code> sont remplies automatiquement.
              </p>
              <div style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9, overflowX: 'auto' }}>
                <div><span style={{ color: '#4ade80' }}>curl</span> <span style={{ color: '#fbbf24' }}>-s</span> https://api.openai.com/v1/audio/transcriptions \</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#fbbf24' }}>-H</span> <span style={{ color: '#f87171' }}>"Authorization: Bearer {'{{API_KEY}}'}"{'\u2033'}</span> \</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#fbbf24' }}>-F</span> <span style={{ color: '#f87171' }}>"file=@{'{{AUDIO}}'}"</span> \</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#fbbf24' }}>-F</span> <span style={{ color: '#f87171' }}>"model=whisper-1"</span> \</div>
                <div style={{ paddingLeft: 12 }}><span style={{ color: '#fbbf24' }}>-F</span> <span style={{ color: '#f87171' }}>"language={'{{LANGUAGE}}'}"</span></div>
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerGroup>

        {/* Pre-configured STT providers */}
        <FadeIn>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>FOURNISSEURS STT PRE-CONFIGURES</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sttProviders.map(p => (
              <motion.div
                key={p.name}
                whileHover={{ y: -2, borderColor: 'rgba(255,255,255,0.22)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: p.bg, border: `1px solid ${p.dashed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)'}`, borderStyle: p.dashed ? 'dashed' : 'solid', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
              >
                <div style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.logo
                    ? <img src={p.logo} alt={p.name} width={14} height={14} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: p.dashed ? 14 : 10, fontWeight: 700 }}>{p.dashed ? '+' : p.name.slice(0,1)}</span>
                  }
                </div>
                {p.name}
              </motion.div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const faqData = [
  { q: 'Lamu est-il gratuit ?', a: "Oui. Toutes les fonctionnalites de base fonctionnent gratuitement avec vos propres cles API. La licence Dev Pro debloque des fonctionnalites premium, le raccourci de deplacement de fenetre et le support prioritaire." },
  { q: 'Comment Lamu est-il invisible dans les appels video ?', a: "Lamu utilise une fenetre overlay transparente, toujours au premier plan, exclue de la capture video. Zoom, Google Meet, Teams et toutes les plateformes majeures ne la detectent ni ne l'enregistrent." },
  { q: 'Comment mes donnees sont-elles gerees ?', a: "Toutes les donnees sont stockees localement sur votre appareil via SQLite. Aucune donnee n'est envoyee aux serveurs de Lamu. Vos conversations vont directement de votre machine a votre fournisseur IA." },
  { q: 'Quels fournisseurs IA sont supportes ?', a: "Tout fournisseur avec une API compatible OpenAI : OpenAI, Anthropic, Google Gemini, xAI Grok, Mistral, Cohere, Perplexity, Groq, Ollama, et tout endpoint custom." },
  { q: 'Quels fournisseurs STT sont supportes ?', a: 'OpenAI Whisper, ElevenLabs, Groq Whisper, Google STT, Deepgram, Azure Speech, Speechmatics, Rev.ai, IBM Watson, et tout endpoint STT custom via cURL.' },
  { q: 'Quels systemes sont supportes ?', a: 'macOS 11+, Windows 10/11 (x64) et Linux (Debian, RHEL, AppImage). Builds natifs pour chaque plateforme.' },
  { q: 'Pourquoi Lamu est-il si leger et rapide ?', a: "Lamu est construit avec Tauri et Rust au lieu d'Electron. Resultat : un binaire de ~10MB (vs ~270MB pour les apps Electron), demarrage sub-100ms et ~50MB d'utilisation RAM." },
  { q: "Que comprend le plan Dev Pro ?", a: "Dev Pro debloque des reponses IA plus rapides via routage optimise, le raccourci de deplacement de fenetre (Ctrl+Shift+W), le support email prioritaire, l'acces anticipe aux nouvelles fonctionnalites et l'activation multi-appareils." },
  { q: 'Puis-je connecter mes bases de donnees ?', a: "Oui. Lamu supporte les integrations MySQL et PostgreSQL. Vous pouvez interroger vos bases en langage naturel, l'IA genere le SQL automatiquement. Les lectures sont executees directement, les ecritures necessitent votre approbation." },
  { q: 'Comment fonctionne le simulateur d\'entretien ?', a: "Le simulateur genere des questions comportementales, techniques, system design ou coding. L'IA evalue chaque reponse avec un scoring sur la clarte, la pertinence et la structure (0-10). Parfait pour preparer vos entretiens." },
  { q: "Lamu fonctionne-t-il hors ligne ?", a: "Support partiel hors ligne. L'app elle-meme se lance et fonctionne hors ligne. Les fonctionnalites IA necessitent une connexion internet pour atteindre votre fournisseur, sauf si vous utilisez un modele local via Ollama." },
  { q: 'Sur combien d\'appareils puis-je utiliser ma licence ?', a: "La licence Dev Pro supporte l'activation sur 2 appareils simultanement. Contactez support@lamuka.com si vous avez besoin de sieges supplementaires." },
]

function HomeFAQItem({ q, a, delay = 0 }: { q: string; a: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}
    >
      <details style={{ cursor: 'pointer' }}>
        <summary style={{ padding: '18px 22px', fontSize: 15, fontWeight: 500, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, userSelect: 'none' }}>
          {q}
          <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0, fontSize: 18 }}>+</span>
        </summary>
        <div style={{ padding: '0 22px 18px', fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75 }}>{a}</div>
      </details>
    </motion.div>
  )
}

function FAQSection() {
  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(4,3,12,1),#000)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <SectionHeader tag="FAQ" title="Questions Frequentes" subtitle="Tout ce que vous devez savoir sur Lamu." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {faqData.map((item, i) => (
            <HomeFAQItem key={i} q={item.q} a={item.a} delay={i * 0.04} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Explore ───────────────────────────────────────────────────────────────────

function ExploreSection() {
  const platforms = [
    { name: 'macOS', desc: 'Apple Silicon & Intel', icon: '🍎', formats: ['.dmg'] },
    { name: 'Windows', desc: 'x64', icon: '🪟', formats: ['.msi', '.exe'] },
    { name: 'Linux', desc: 'Debian, RHEL & AppImage', icon: '🐧', formats: ['.deb', '.rpm'] },
  ]

  const browse = [
    { label: 'Tous les Telechargements', to: '/downloads' },
    { label: 'Tarification', to: '/pricing' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(4,3,12,1))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader tag="Explorer" title="Explorez Lamu" subtitle="Tout ce dont vous avez besoin pour demarrer sur votre plateforme." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>

          {/* Platform Downloads */}
          <FadeIn>
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, height: '100%' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'rgba(255,255,255,0.9)' }}>Telechargements par Plateforme</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {platforms.map(p => (
                  <Link
                    key={p.name}
                    to="/downloads"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{p.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {p.formats.map(f => (
                        <span key={f} style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>{f}</span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Browse & Explore */}
          <FadeIn delay={0.1}>
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, height: '100%' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'rgba(255,255,255,0.9)' }}>Parcourir & Explorer</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {browse.map(b => (
                  <Link
                    key={b.label}
                    to={b.to}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, textDecoration: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 500, transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
                  >
                    {b.label}
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Ready to get started */}
          <FadeIn delay={0.2}>
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
              <BorderBeam colorTo="rgba(99,102,241,0.8)" duration={4} />
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Pret a commencer ?</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
                  Telechargez Lamu gratuitement. ~10MB, demarrage en moins de 100ms, compatible avec tout fournisseur IA.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
                <Link
                  to="/downloads"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '12px 20px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}
                >
                  <Download size={15} />
                  Telecharger Lamu
                </Link>
                <Link
                  to="/pricing"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontWeight: 500, padding: '12px 20px', borderRadius: 10, fontSize: 14, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Voir les Tarifs
                </Link>
              </div>
            </div>
          </FadeIn>

        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(4,3,12,1))', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div className="glow-pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 350, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <motion.div
        style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto' }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={stagger(0.05, 0.12)}
      >
        <StaggerItem>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 800, letterSpacing: -1.5, marginBottom: 16, lineHeight: 1.1 }}>Pret a Devenir Invisible ?</h2>
        </StaggerItem>
        <StaggerItem>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.48)', marginBottom: 40, lineHeight: 1.7 }}>
            Telechargez Lamu gratuitement et decouvrez l'assistant IA le plus leger et le plus prive jamais construit.
          </p>
        </StaggerItem>
        <StaggerItem>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Link to="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '14px 32px', borderRadius: 12, fontSize: 16, textDecoration: 'none' }}>
                <Download size={17} />
                Telecharger Lamu
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 500, padding: '14px 32px', borderRadius: 12, fontSize: 16, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.13)' }}>
                Voir les Tarifs
              </Link>
            </motion.div>
          </div>
        </StaggerItem>
      </motion.div>
    </section>
  )
}
