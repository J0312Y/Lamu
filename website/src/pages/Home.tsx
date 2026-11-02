import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BorderBeam } from '../components/BorderBeam'
import {
  Download, Shield, Zap, EyeOff, Monitor, Globe, ChevronDown, Mic, Database,
  Mail, Brain, FileText, BarChart3, Calendar, MessageSquare,
  GraduationCap, BookOpen, Layers, CheckCircle2, Play,
  Laptop, Cloud, Check, Minus, AudioLines, Lock, Plug, Star, Quote
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
  { icon: EyeOff, label: 'Totalement Invisible', desc: "Indétectable dans les appels vidéo et les partages d'écran", color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  { icon: Shield, label: 'Confidentialité Totale', desc: 'Toutes les données stockées localement, zéro télémétrie', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { icon: Zap, label: 'Ultra Rapide', desc: '~10MB, 27x plus léger que les alternatives', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  { icon: Database, label: 'Intégrations DB', desc: 'Connectez MySQL, PostgreSQL et interrogez vos bases en langage naturel', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
  { icon: Mail, label: 'Email Vocal', desc: 'Dictez vos emails, Lamu les envoie avec approbation et countdown', color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
  { icon: Brain, label: 'Base de Connaissances', desc: 'Importez vos documents et obtenez des réponses précises basées sur vos propres données', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  { icon: GraduationCap, label: "Simulateur d'Entretien", desc: "Entraînez-vous avec des questions réalistes et recevez un score détaillé pour chaque réponse", color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  { icon: FileText, label: 'Générateur CV', desc: 'Créez un CV et une lettre de motivation professionnels en quelques secondes', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { icon: MessageSquare, label: 'Résumé de Réunion', desc: "Obtenez un résumé automatique de chaque réunion, sauvegardé et consultable à tout moment", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  { icon: Globe, label: 'IA Multi-Modèles', desc: 'Accès à GPT-4, Claude, Gemini et plus — IA intégrée ou vos propres clés API', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  { icon: Mic, label: 'Reconnaissance Vocale', desc: 'Transcription haute précision en temps réel, même dans les environnements bruyants', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
  { icon: Monitor, label: 'Multi-Plateforme', desc: 'Disponible sur macOS, Windows et Linux', color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
  { icon: AudioLines, label: 'Réduction de Bruit', desc: 'Filtrage intelligent du bruit ambiant pour une capture audio cristalline', color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  { icon: Lock, label: 'Sécurité Avancée', desc: 'Vos données restent privées avec un chiffrement de bout en bout et une conformité aux normes', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { icon: Plug, label: 'Connexion aux Outils IA', desc: 'Connectez Lamu à vos agents et outils IA existants pour étendre ses capacités', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
]

// SVG data URIs for brands not on simpleicons
const svgIcon = (d: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white">${d}</svg>`)}`
const ICON_OPENAI = svgIcon('<path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.047 6.047 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>')
const ICON_XAI = svgIcon('<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" font-family="Arial" fill="white">𝕏</text>')
const ICON_GROQ = svgIcon('<text x="12" y="17" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial" fill="white">G</text>')
const ICON_COHERE = svgIcon('<text x="12" y="17" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial" fill="white">C</text>')
const ICON_AZURE = svgIcon('<path d="M13.05 4.24L6.56 18.05a.5.5 0 0 0 .44.74h10.5a.5.5 0 0 0 .44-.26l3.7-7a.5.5 0 0 0-.44-.74h-5.26l3.32-6.33a.5.5 0 0 0-.45-.72h-5.32a.5.5 0 0 0-.44.26z" fill="white"/>')
const ICON_IBM = svgIcon('<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="900" font-family="Arial" fill="white" letter-spacing="1">IBM</text>')

const aiProviders = [
  { name: 'OpenAI',     logo: ICON_OPENAI,                                        bg: 'rgba(0,0,0,0.4)' },
  { name: 'Anthropic',  logo: 'https://cdn.simpleicons.org/anthropic/ffffff',      bg: 'rgba(204,150,82,0.15)' },
  { name: 'Google',     logo: 'https://cdn.simpleicons.org/google/ffffff',         bg: 'rgba(66,133,244,0.15)' },
  { name: 'xAI Grok',   logo: ICON_XAI,                                            bg: 'rgba(255,255,255,0.06)' },
  { name: 'Mistral',    logo: 'https://cdn.simpleicons.org/mistralai/ffffff',      bg: 'rgba(255,122,0,0.15)' },
  { name: 'Groq',       logo: ICON_GROQ,                                           bg: 'rgba(139,92,246,0.15)' },
  { name: 'Perplexity', logo: 'https://cdn.simpleicons.org/perplexity/ffffff',     bg: 'rgba(32,178,170,0.15)' },
  { name: 'Ollama',     logo: 'https://cdn.simpleicons.org/ollama/ffffff',         bg: 'rgba(255,255,255,0.06)' },
  { name: 'Cohere',     logo: ICON_COHERE,                                         bg: 'rgba(57,101,223,0.15)' },
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
      <StatsBanner />
      <PlatformsSection />
      <WhySection />
      <FeaturesSection />
      <IntegrationsSection />
      <ProductivitySection />
      <AIControlSection />
      <VoiceAudioSection />
      <CompareSection />
      <FAQSection />
      <TestimonialsSection />
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
              Lamu fonctionne en toute discrétion pendant vos réunions, entretiens et présentations. Indétectable dans les appels vidéo, partages d'écran et enregistrements. Ultra-léger, ultra-rapide, 100% privé.
            </p>
          </StaggerItem>

          {/* Buttons */}
          <StaggerItem>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <Link to="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '13px 26px', borderRadius: 12, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 24px rgba(255,255,255,0.1)' }}>
                  <Download size={16} />
                  Télécharger
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
                { value: '<100ms', label: 'Démarrage' },
                { value: '27x', label: 'Plus léger' },
                { value: '100%', label: 'Privé' },
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
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#fbbf24' }}>AUDIO SYSTÈME</span>
              </div>
              <h3 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15 }}>
                Capture Audio Système
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '3px 10px', fontSize: 14, fontFamily: 'monospace', fontWeight: 600, color: 'rgba(255,255,255,0.6)', verticalAlign: 'middle' }}>Ctrl+Shift+M</span>
              </h3>
            </div>
            <div style={{ paddingTop: 8 }}>
              <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 15, lineHeight: 1.8, marginBottom: 20 }}>
                Capturez l'audio système en direct pendant vos réunions, entretiens et présentations. Lamu écoute ce qui se dit et le transmet directement à votre IA — sans saisie manuelle.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {["Capture l'audio système en temps réel", 'Fonctionne avec toutes les apps de réunion', 'Transcription automatique haute précision', 'Activation/désactivation par raccourci'].map(c => (
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

// ── Stats Banner ─────────────────────────────────────────────────────────────

const statsData = [
  { value: '~10MB', label: "Taille de l'app", color: '#818cf8' },
  { value: '<100ms', label: 'Temps de démarrage', color: '#4ade80' },
  { value: '27x', label: 'Plus léger que Cluely', color: '#fbbf24' },
  { value: '15+', label: 'Fonctionnalités IA', color: '#22d3ee' },
  { value: '100%', label: 'Données locales', color: '#fb7185' },
  { value: '6+', label: 'Apps de réunion supportées', color: '#a78bfa' },
]

function StatsBanner() {
  return (
    <section style={{ padding: '80px 24px', background: '#000', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
          {statsData.map(s => (
            <StaggerItem key={s.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: s.color, letterSpacing: -1, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{s.label}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

// ── Compatible Platforms ─────────────────────────────────────────────────────

const meetingPlatforms = [
  { name: 'Zoom', logo: 'https://cdn.simpleicons.org/zoom/2D8CFF' },
  { name: 'Google Meet', logo: 'https://cdn.simpleicons.org/googlemeet/00897B' },
  { name: 'Microsoft Teams', logo: 'https://cdn.simpleicons.org/microsoftteams/6264A7' },
  { name: 'Slack', logo: 'https://cdn.simpleicons.org/slack/4A154B' },
  { name: 'Discord', logo: 'https://cdn.simpleicons.org/discord/5865F2' },
  { name: 'Webex', logo: 'https://cdn.simpleicons.org/webex/00BCF2' },
  { name: 'OBS Studio', logo: 'https://cdn.simpleicons.org/obsstudio/302E31' },
  { name: 'Skype', logo: 'https://cdn.simpleicons.org/skype/00AFF0' },
]

function PlatformsSection() {
  return (
    <section style={{ padding: '80px 24px', background: 'linear-gradient(to bottom, #000, rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <SectionHeader
          tag="Compatibilité"
          title="Fonctionne avec vos outils"
          subtitle="Lamu est invisible et compatible avec toutes les principales plateformes de visioconférence."
        />

        <StaggerGroup delay={0.05} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
          {meetingPlatforms.map(p => (
            <StaggerItem key={p.name}>
              <motion.div
                whileHover={{ y: -3, borderColor: 'rgba(255,255,255,0.2)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '12px 20px', cursor: 'default',
                }}
              >
                <img
                  src={p.logo}
                  alt={p.name}
                  width={22}
                  height={22}
                  style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.7 }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{p.name}</span>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

// ── Why Section ───────────────────────────────────────────────────────────────

function WhySection() {
  return (
    <section id="why" style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(6,5,15,1),#000)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader tag="Pourquoi Lamu" title="Tout ce dont vous avez besoin" subtitle="Conçu pour ceux qui privilégient la confidentialité et la performance." />

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
      tag: 'INVISIBILITÉ',
      tagColor: '#818cf8',
      tagBg: 'rgba(99,102,241,0.1)',
      tagBorder: 'rgba(99,102,241,0.2)',
      title: 'Complètement Indétectable',
      desc: "La fenêtre overlay reste au-dessus de toutes les applications et reste invisible dans Zoom, Google Meet, Teams et tous les logiciels de partage d'écran. Votre audience ne sait jamais qu'elle est là.",
      checks: ['Invisible sur toutes les plateformes de visio', "Design translucide résistant aux captures d'écran", "Niveau de transparence ajustable"],
      videoSrc: 'https://assets.pluely.com/transparent.mp4',
      beamColor: 'rgba(99,102,241,0.8)',
    },
    {
      tag: 'RACCOURCIS',
      tagColor: '#fbbf24',
      tagBg: 'rgba(251,191,36,0.08)',
      tagBorder: 'rgba(251,191,36,0.2)',
      title: 'Contrôle au Clavier',
      desc: "Chaque action est à une touche de distance. Des raccourcis globaux entièrement personnalisables vous permettent de contrôler l'app sans quitter votre contexte.",
      checks: ['Raccourcis entièrement personnalisables', 'Fonctionne dans toute application', 'Basculer, capturer, parler instantanément'],
      videoSrc: 'https://assets.pluely.com/keyboard-shortcuts.mp4',
      beamColor: 'rgba(251,191,36,0.8)',
      shortcuts: [
        { action: 'Basculer Fenêtre', key: 'Ctrl+\\' },
        { action: 'Tableau de Bord', key: 'Ctrl+Shift+D' },
        { action: "Capture d'Écran", key: 'Ctrl+Shift+S' },
        { action: 'Entrée Vocale', key: 'Ctrl+Shift+A' },
      ],
    },
    {
      tag: "CAPTURE D'ÉCRAN",
      tagColor: '#4ade80',
      tagBg: 'rgba(74,222,128,0.08)',
      tagBorder: 'rgba(74,222,128,0.2)',
      title: 'Analyse Visuelle Instantanée',
      desc: "Capturez votre écran ou sélectionnez une zone et envoyez-la instantanément à l'IA pour analyse. Le mode auto traite les captures automatiquement avec votre prompt personnalisé.",
      checks: ['Plein écran ou sélection de zone', 'Mode auto avec prompt personnalisé', "Joignez plusieurs captures d'écran à la fois"],
      videoSrc: 'https://assets.pluely.com/manual-screenshot.mp4',
      beamColor: 'rgba(74,222,128,0.8)',
    },
    {
      tag: 'TOUJOURS PRÊT',
      tagColor: '#22d3ee',
      tagBg: 'rgba(34,211,238,0.08)',
      tagBorder: 'rgba(34,211,238,0.2)',
      title: 'Toujours Prêt et Accessible',
      desc: "Déplacez l'overlay n'importe où sur votre écran. Un raccourci l'affiche instantanément, peu importe l'application en cours.",
      checks: ['Overlay librement déplaçable', 'Raccourci global de basculement', 'Position persistante entre les sessions'],
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
      title: 'Bases de Données',
      desc: 'Connectez vos bases de données et posez vos questions en langage naturel. Lamu comprend vos données et vous donne des réponses instantanees, avec approbation avant toute modification.',
      color: '#22d3ee',
      bg: 'rgba(34,211,238,0.08)',
      checks: ['MySQL et PostgreSQL supportés', 'Posez vos questions en français ou anglais', 'Approbation requise avant toute modification'],
    },
    {
      icon: Layers,
      title: 'Jira, Confluence, Notion',
      desc: "Connectez vos outils de gestion de projet. Lamu récupère vos tickets, sprints et documentation pour vous donner des réponses contextuelles et précises.",
      color: '#818cf8',
      bg: 'rgba(99,102,241,0.08)',
      checks: ['Sprints et tickets Jira en temps réel', 'Documentation Confluence synchronisée', 'Workspaces Notion connectés'],
    },
    {
      icon: BookOpen,
      title: 'Base de Connaissances RAG',
      desc: "Importez vos documents (PDF, Word, texte) et Lamu les comprend instantanément. Posez vos questions et obtenez des réponses précises basées sur vos propres contenus.",
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.08)',
      checks: ['PDF, Word, Markdown et plus supportés', 'Réponses basées sur vos propres documents', 'Recherche intelligente et contextuelle'],
    },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Intégrations"
          title="Connectez Vos Systèmes"
          subtitle="Lamu s'intègre à vos bases de données et outils existants pour des réponses IA contextuelles et précises."
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
    { icon: Mail, title: 'Email Vocal', desc: "Dictez votre email, Lamu le rédige et l'envoie après votre approbation. Suggestion automatique des contacts.", color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
    { icon: MessageSquare, title: 'Résumé de Réunion', desc: "Obtenez un résumé clair et structuré de chaque réunion. Retrouvez-le à tout moment dans votre espace.", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
    { icon: Brain, title: 'Coaching en Direct', desc: "Recevez des conseils en temps réel pendant vos réunions. Idéal pour les appels de vente ou les entretiens.", color: '#818cf8', bg: 'rgba(99,102,241,0.1)' },
    { icon: Calendar, title: 'Calendrier Intégré', desc: "Consultez votre agenda directement dans Lamu, sans quitter votre réunion.", color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
    { icon: Play, title: 'Playbook / Script', desc: "Chargez vos notes ou scripts de réunion. Lamu les utilise pour vous souffler les bonnes réponses.", color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
    { icon: GraduationCap, title: "Simulateur d'Entretien", desc: "Entraînez-vous avec des questions réalistes et obtenez un feedback détaillé sur chaque réponse.", color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    { icon: FileText, title: 'Générateur de CV', desc: "Créez un CV et une lettre de motivation professionnels en quelques secondes, en français ou en anglais.", color: '#fb7185', bg: 'rgba(251,113,133,0.1)' },
    { icon: BarChart3, title: "Tableau de Bord", desc: "Suivez votre utilisation avec un tableau de bord visuel et un historique complet.", color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(6,5,15,1),#000)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader
          tag="Productivité"
          title="Outils de Productivité Intégrés"
          subtitle="Bien plus qu'un assistant vocal. Lamu est une suite complète d'outils IA pour votre quotidien professionnel."
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
    { name: 'Mistral AI', logo: 'https://cdn.simpleicons.org/mistralai/ffffff', bg: 'rgba(255,122,0,0.12)' },
    { name: 'Cohere',     logo: ICON_COHERE,                                    bg: 'rgba(57,101,223,0.12)' },
    { name: 'Perplexity', logo: 'https://cdn.simpleicons.org/perplexity/ffffff', bg: 'rgba(32,178,170,0.12)' },
    { name: 'Groq',       logo: ICON_GROQ,                                      bg: 'rgba(139,92,246,0.12)' },
    { name: 'Ollama',     logo: 'https://cdn.simpleicons.org/ollama/ffffff',     bg: 'rgba(255,255,255,0.05)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Intelligence Artificielle"
          title="Propulsé par les Meilleurs Modèles IA"
          subtitle="Par défaut, Lamu sélectionne automatiquement le meilleur modèle IA pour chaque situation. Vous pouvez aussi utiliser vos propres clés API pour un contrôle total."
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 100, padding: '3px 12px', marginBottom: 16, fontSize: 11, fontWeight: 700, color: '#4ade80', letterSpacing: 0.5 }}>
                PAR DÉFAUT
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Lamu IA Intégré</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Aucune configuration requise. Lamu sélectionne automatiquement le meilleur modèle IA pour chaque situation — GPT-4, Claude, Gemini et plus.
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '3px 12px', marginBottom: 16, fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: 0.5 }}>
                OPTIONNEL
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Vos Propres Clés API</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 16 }}>
                Vous préférez utiliser vos propres clés ? Connectez directement OpenAI, Anthropic, Google, Mistral, Groq, Ollama ou tout autre fournisseur IA.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Ajoutez votre clé API en un clic', 'Compatible avec tous les fournisseurs majeurs', 'Gardez le contrôle total sur vos coûts'].map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    <div style={{ width: 18, height: 18, background: 'rgba(99,102,241,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    {c}
                  </div>
                ))}
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerGroup>

        {/* All provider tiles */}
        <FadeIn>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>MODÈLES IA DISPONIBLES</h3>
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
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>AUTRES MODÈLES INTÉGRÉS</h3>
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
    { name: 'Groq Whisper',  logo: ICON_GROQ,                                          bg: 'rgba(139,92,246,0.1)' },
    { name: 'Google STT',    logo: 'https://cdn.simpleicons.org/google/ffffff',        bg: 'rgba(66,133,244,0.1)' },
    { name: 'Deepgram',      logo: 'https://cdn.simpleicons.org/deepgram/ffffff',      bg: 'rgba(6,182,212,0.1)' },
    { name: 'Azure Speech',  logo: ICON_AZURE,                                         bg: 'rgba(0,120,212,0.1)' },
    { name: 'Speechmatics',  logo: null,                                               bg: 'rgba(16,185,129,0.08)' },
    { name: 'Rev.ai',        logo: null,                                               bg: 'rgba(249,115,22,0.08)' },
    { name: 'IBM Watson',    logo: ICON_IBM,                                            bg: 'rgba(99,102,241,0.1)' },
    { name: '+ Custom',      logo: null, dashed: true,                                bg: 'rgba(255,255,255,0.04)' },
  ]

  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,rgba(6,5,15,1),#000)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHeader
          tag="Voix & Audio"
          title="Capture Voix & Audio"
          subtitle="Capturez l'audio système en temps réel pendant vos réunions et présentations. Transcription vocale haute précision intégrée."
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
                  <img src={ICON_OPENAI} alt="OpenAI" width={20} height={20} style={{ objectFit: 'contain', opacity: 0.85 }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>OpenAI Whisper</h3>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Supporte 99+ langues avec détection automatique. Précision de transcription leader du marché pour tout accent ou style de parole.
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
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>ElevenLabs</h3>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                Transcription ultra-rapide avec une précision professionnelle. Parfait pour capturer chaque mot pendant vos réunions en temps réel.
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
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Votre Propre Service</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 14 }}>
                Utilisez n'importe quel service de transcription. Connectez votre fournisseur préféré en quelques clics et Lamu l'utilise automatiquement.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Compatible avec tout fournisseur de transcription', 'Configuration simple et rapide', 'Basculez entre les services à tout moment'].map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <div style={{ width: 16, height: 16, background: 'rgba(255,255,255,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    {c}
                  </div>
                ))}
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerGroup>

        {/* STT providers */}
        <FadeIn>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>SERVICES DE TRANSCRIPTION COMPATIBLES</h3>
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

// ── Compare: WebApp vs Desktop ────────────────────────────────────────────────

const compareFeatures: { feature: string; desktop: 'yes' | 'no' | 'partial'; web: 'yes' | 'no' | 'partial'; note?: string }[] = [
  { feature: 'Assistance IA en réunion',        desktop: 'yes',     web: 'no',      note: "Overlay invisible pendant l'appel" },
  { feature: 'Invisible en partage d\'écran',    desktop: 'yes',     web: 'no',      note: 'Indétectable pendant vos appels vidéo' },
  { feature: 'Capture audio système',            desktop: 'yes',     web: 'no',      note: 'Écoute ce qui se dit en temps réel' },
  { feature: 'Transcription vocale',             desktop: 'yes',     web: 'no',      note: 'Transcription automatique haute précision' },
  { feature: 'Raccourcis clavier globaux',       desktop: 'yes',     web: 'no',      note: 'Ctrl+Shift+. pour le micro' },
  { feature: 'Utiliser ses propres clés API',    desktop: 'yes',     web: 'no',      note: 'OpenAI, Anthropic, Google...' },
  { feature: 'Données 100% locales',              desktop: 'yes',     web: 'no',      note: 'Rien ne quitte votre machine' },
  { feature: 'Chat IA',                          desktop: 'yes',     web: 'yes' },
  { feature: 'Base de connaissances',             desktop: 'yes',     web: 'yes' },
  { feature: 'Simulateur d\'entretien',          desktop: 'yes',     web: 'yes' },
  { feature: 'Générateur CV / Lettre',           desktop: 'yes',     web: 'no' },
  { feature: 'Helpdesk & Ticketing',             desktop: 'no',      web: 'yes',     note: 'Support client avec scoring IA' },
  { feature: 'Widget intégrable sur site',       desktop: 'no',      web: 'yes',     note: 'Chat widget en une ligne de code' },
  { feature: 'Gestion d\'équipe',                desktop: 'no',      web: 'yes',     note: 'Rôles, permissions, collaboration' },
  { feature: 'Analytics & Tableaux de bord',     desktop: 'partial', web: 'yes',     note: 'Avancé dans le WebApp' },
  { feature: 'Intégrations (Slack, Email...)',   desktop: 'no',      web: 'yes',     note: 'Canaux de communication unifiés' },
  { feature: 'Accessible depuis un navigateur',  desktop: 'no',      web: 'yes',     note: 'Aucune installation requise' },
  { feature: 'Fonctionne hors ligne',            desktop: 'yes',     web: 'no',      note: 'App native, pas de connexion requise' },
  { feature: 'Réduction de bruit',                desktop: 'yes',     web: 'no',      note: 'Filtrage intelligent du bruit ambiant' },
  { feature: 'Actions items automatiques',       desktop: 'yes',     web: 'partial', note: 'Extraction IA depuis le transcript' },
  { feature: 'Analyse de sentiment',             desktop: 'yes',     web: 'yes',     note: 'Temps réel (desktop) / tickets (web)' },
  { feature: 'Auto-join calendrier',             desktop: 'yes',     web: 'no',      note: 'Démarre automatiquement au début du meeting' },
  { feature: 'Connexion aux outils IA',           desktop: 'no',      web: 'yes',     note: 'Connectez vos agents IA externes' },
  { feature: 'Sécurité & Conformité',             desktop: 'yes',     web: 'yes',     note: 'Chiffrement, audit et conformité aux normes' },
]

function StatusIcon({ status }: { status: 'yes' | 'no' | 'partial' }) {
  if (status === 'yes') return <Check size={15} style={{ color: '#4ade80' }} />
  if (status === 'partial') return <Minus size={15} style={{ color: '#fbbf24' }} />
  return <Minus size={15} style={{ color: 'rgba(255,255,255,0.15)' }} />
}

function CompareSection() {
  return (
    <section style={{ padding: '100px 24px', background: 'linear-gradient(to bottom,#000,rgba(6,5,15,1))' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <SectionHeader
          tag="Comparaison"
          title="Desktop App vs WebApp"
          subtitle="Deux expériences complémentaires. Choisissez celle qui correspond à votre usage — ou utilisez les deux."
        />

        {/* Top cards: Desktop vs WebApp identity */}
        <StaggerGroup delay={0.05} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 40 }}>
          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', height: '100%' }}
            >
              <BorderBeam colorTo="rgba(139,92,246,0.7)" duration={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(139,92,246,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Laptop size={20} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>Desktop App</h3>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>App native • Ultra-léger</span>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 16 }}>
                Pour les individus et les entreprises. Assistant IA natif sur votre machine — en réunion avec overlay invisible, au quotidien pour le chat IA, la préparation d'entretiens, la rédaction de CV, ou l'interrogation de vos bases de données. Données 100% locales.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Réunions', 'Productivité', 'Entretiens', 'Entreprise', 'Confidentialité', 'Hors ligne'].map(tag => (
                  <span key={tag} style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 100, padding: '3px 10px' }}>{tag}</span>
                ))}
              </div>
            </motion.div>
          </StaggerItem>

          <StaggerItem>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', height: '100%' }}
            >
              <BorderBeam colorTo="rgba(99,102,241,0.7)" duration={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(99,102,241,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cloud size={20} style={{ color: '#818cf8' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>WebApp</h3>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Navigateur • Aucune installation</span>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 16 }}>
                Pour les équipes et les entreprises. Chat IA, base de connaissances, helpdesk avec ticketing, widget intégrable et analytics avancés — accessible depuis n'importe quel navigateur, sans rien installer.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Support client', 'Équipe', 'Analytics', 'Widget'].map(tag => (
                  <span key={tag} style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 100, padding: '3px 10px' }}>{tag}</span>
                ))}
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerGroup>

        {/* Comparison table */}
        <FadeIn>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '14px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Fonctionnalité</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Laptop size={13} /> Desktop</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Cloud size={13} /> Web</span>
            </div>
            {/* Rows */}
            {compareFeatures.map((f, i) => (
              <div
                key={f.feature}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '12px 20px',
                  borderBottom: i < compareFeatures.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{f.feature}</span>
                  {f.note && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{f.note}</span>}
                </div>
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center' }}><StatusIcon status={f.desktop} /></div>
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center' }}><StatusIcon status={f.web} /></div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Bottom recommendation */}
        <FadeIn delay={0.1}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 24 }}>
            <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Laptop size={14} /> Idéal pour</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
                Commerciaux, développeurs, candidats, freelances, équipes — toute personne ou entreprise qui veut un assistant IA natif, rapide et confidentiel : en réunion, pour coder, rédiger, analyser des données ou préparer un entretien.
              </p>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Cloud size={14} /> Idéal pour</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
                Startups, PME et grandes entreprises — qui veulent un assistant IA pour leur support client, un widget intégrable, des analytics et une plateforme collaborative sans installation.
              </p>
            </div>
          </div>
        </FadeIn>

      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const faqData = [
  { q: 'Lamu est-il gratuit ?', a: "Oui. Le plan gratuit vous permet de découvrir toutes les fonctionnalités de base. Les plans payants débloquent plus de messages, des fonctionnalités avancées et le support prioritaire. Consultez la page Tarifs pour les détails." },
  { q: 'Comment Lamu est-il invisible dans les appels vidéo ?', a: "Lamu utilise une fenêtre overlay transparente, toujours au premier plan, exclue de la capture vidéo. Zoom, Google Meet, Teams et toutes les plateformes majeures ne la détectent ni ne l'enregistrent." },
  { q: 'Comment mes données sont-elles gérées ?', a: "Toutes les données sont stockées localement sur votre appareil. Aucune donnée n'est envoyée aux serveurs de Lamu. Vos conversations restent privées et sécurisées." },
  { q: 'Quels modèles IA sont utilisés ?', a: "Par défaut, Lamu sélectionne automatiquement le meilleur modèle IA pour chaque situation : GPT-4, Claude, Gemini et bien d'autres. Vous pouvez aussi connecter vos propres clés API dans l'app desktop pour un contrôle total." },
  { q: 'Comment fonctionne la reconnaissance vocale ?', a: "Lamu intègre les meilleurs services de transcription du marché. La transcription est automatique, haute précision, et fonctionne dans plus de 99 langues." },
  { q: 'Quels systèmes sont supportés ?', a: 'macOS, Windows 10/11 et Linux. Application native pour chaque plateforme.' },
  { q: 'Pourquoi Lamu est-il si léger et rapide ?', a: "Lamu est une application native, contrairement aux alternatives basées sur des technologies web lourdes. Résultat : une installation de ~10MB, un démarrage quasi-instantané et une consommation mémoire minimale." },
  { q: "Que comprend le plan Dev Pro ?", a: "Dev Pro débloque des réponses IA plus rapides via routage optimisé, le raccourci de déplacement de fenêtre (Ctrl+Shift+W), le support email prioritaire, l'accès anticipé aux nouvelles fonctionnalités et l'activation multi-appareils." },
  { q: 'Puis-je connecter mes bases de données ?', a: "Oui. Connectez vos bases MySQL ou PostgreSQL et posez vos questions en langage naturel. Lamu vous donne les réponses instantanément, avec approbation requise avant toute modification de vos données." },
  { q: 'Comment fonctionne le simulateur d\'entretien ?', a: "Le simulateur génère des questions réalistes selon le type d'entretien choisi. L'IA évalue chaque réponse sur la clarté, la pertinence et la structure. Parfait pour vous préparer en conditions réelles." },
  { q: "Lamu fonctionne-t-il hors ligne ?", a: "L'application se lance et reste accessible hors ligne. Les fonctionnalités IA nécessitent une connexion internet pour fonctionner." },
  { q: 'Sur combien d\'appareils puis-je utiliser ma licence ?', a: "La licence Dev Pro supporte l'activation sur 2 appareils simultanément. Contactez support@lamuka-tech.com si vous avez besoin de sièges supplémentaires." },
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
        <SectionHeader tag="FAQ" title="Questions Fréquentes" subtitle="Tout ce que vous devez savoir sur Lamu." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {faqData.map((item, i) => (
            <HomeFAQItem key={i} q={item.q} a={item.a} delay={i * 0.04} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Social Proof / Testimonials ──────────────────────────────────────────────

const testimonials = [
  {
    name: 'Sophie M.',
    role: 'Chef de Projet',
    text: "Lamu a transformé mes réunions. Je ne rate plus jamais un point important et mes comptes-rendus sont prêts en quelques secondes.",
    stars: 5,
    color: '#818cf8',
  },
  {
    name: 'Thomas R.',
    role: 'Développeur Full-Stack',
    text: "L'invisibilité en partage d'écran est bluffante. Mes collègues ne savent même pas que j'utilise un assistant IA pendant nos calls.",
    stars: 5,
    color: '#4ade80',
  },
  {
    name: 'Amina K.',
    role: 'Consultante RH',
    text: "Le simulateur d'entretien m'a permis de préparer mes candidats bien plus efficacement. Le scoring par question est un vrai plus.",
    stars: 5,
    color: '#fbbf24',
  },
  {
    name: 'Lucas D.',
    role: 'Responsable Commercial',
    text: "Ultra léger, ultra rapide. En 10 secondes c'est installé, et l'IA me souffle les bons arguments en temps réel pendant mes appels clients.",
    stars: 5,
    color: '#22d3ee',
  },
  {
    name: 'Marie L.',
    role: 'Étudiante en Droit',
    text: "J'utilise Lamu pour mes cours en visio. La transcription est précise et le résumé automatique me fait gagner des heures de prise de notes.",
    stars: 4,
    color: '#fb7185',
  },
  {
    name: 'Karim B.',
    role: 'Freelance Data Analyst',
    text: "Le fait de pouvoir utiliser mes propres clés API et de garder toutes mes données en local, c'est exactement ce que je cherchais. Aucun compromis sur la vie privée.",
    stars: 5,
    color: '#a78bfa',
  },
]

function TestimonialsSection() {
  return (
    <section style={{ padding: '100px 24px', background: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 400, background: 'radial-gradient(ellipse,rgba(99,102,241,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <SectionHeader
          tag="Témoignages"
          title="Ce que nos utilisateurs en pensent"
          subtitle="Des professionnels, étudiants et freelances qui utilisent Lamu au quotidien."
        />

        <StaggerGroup delay={0.1} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {testimonials.map((t, i) => (
            <StaggerItem key={i}>
              <motion.div
                whileHover={{ y: -4, borderColor: `${t.color}33` }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: 28,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star
                      key={s}
                      size={14}
                      fill={s < t.stars ? t.color : 'transparent'}
                      stroke={s < t.stars ? t.color : 'rgba(255,255,255,0.15)'}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>

                <div style={{ position: 'relative' }}>
                  <Quote size={18} style={{ color: `${t.color}44`, position: 'absolute', top: -4, left: -4 }} />
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.75, paddingLeft: 20 }}>
                    {t.text}
                  </p>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${t.color}33, ${t.color}11)`,
                    border: `1px solid ${t.color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: t.color,
                  }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t.role}</div>
                  </div>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
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
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 800, letterSpacing: -1.5, marginBottom: 16, lineHeight: 1.1 }}>Prêt à Devenir Invisible ?</h2>
        </StaggerItem>
        <StaggerItem>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.48)', marginBottom: 40, lineHeight: 1.7 }}>
            Téléchargez Lamu gratuitement et découvrez l'assistant IA le plus léger et le plus privé jamais construit.
          </p>
        </StaggerItem>
        <StaggerItem>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Link to="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '14px 32px', borderRadius: 12, fontSize: 16, textDecoration: 'none' }}>
                <Download size={17} />
                Télécharger Lamu
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
