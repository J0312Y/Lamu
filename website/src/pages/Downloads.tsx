import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { BorderBeam } from '../components/BorderBeam'

function AppleLogo({ size = 24 }: { size?: number; color?: string }) {
  return (
    <img src="https://cdn.simpleicons.org/apple/ffffff" alt="Apple" width={size} height={size} style={{ objectFit: 'contain' }} />
  )
}

function WindowsLogo({ size = 24, color = '#0078D4' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  )
}

function TuxLogo({ size = 24 }: { size?: number; color?: string }) {
  return (
    <img src="https://cdn.simpleicons.org/linux/FCC624" alt="Linux" width={size} height={size} style={{ objectFit: 'contain' }} />
  )
}

function RamIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 6V4M10 6V4M14 6V4M18 6V4" />
      <rect x="5" y="9" width="4" height="4" rx="0.5" />
      <rect x="11" y="9" width="4" height="4" rx="0.5" />
    </svg>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } },
}

const stagger = {
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
}

const platforms = [
  {
    icon: AppleLogo,
    name: 'macOS',
    desc: 'Apple Silicon & Intel Mac',
    formats: ['.dmg'],
    color: '#fff',
    bg: 'rgba(255,255,255,0.06)',
    note: 'macOS 11+',
    href: 'mailto:support@lamuka.com?subject=Telecharger Lamu - macOS',
  },
  {
    icon: WindowsLogo,
    name: 'Windows',
    desc: 'Windows 10/11 x64',
    formats: ['.msi', '.exe'],
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.08)',
    note: 'Windows 10+',
    href: 'mailto:support@lamuka.com?subject=Telecharger Lamu - Windows',
    featured: true,
  },
  {
    icon: TuxLogo,
    name: 'Linux',
    desc: 'Debian, RHEL & AppImage',
    formats: ['.deb', '.rpm', '.AppImage'],
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    note: 'Ubuntu 20+',
    href: 'mailto:support@lamuka.com?subject=Telecharger Lamu - Linux',
  },
]

const requirements = [
  { title: 'Windows 10+', value: 'x64, WebView2 inclus', icon: <WindowsLogo size={22} color="#22d3ee" /> },
  { title: 'macOS 11+', value: 'Apple Silicon & Intel', icon: <AppleLogo size={22} color="#ffffff" /> },
  { title: 'Linux', value: 'Ubuntu 20+, Fedora 36+', icon: <TuxLogo size={22} color="#fbbf24" /> },
  { title: 'RAM', value: '~50MB utilisation', icon: <RamIcon size={22} color="#a78bfa" /> },
]

export default function Downloads() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)' }} />

        <motion.div
          initial="hidden"
          animate="show"
          variants={{ ...stagger, hidden: {} }}
          style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}
        >
          <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Download size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Telechargements</span>
          </motion.div>
          <motion.h1 variants={fadeUp} style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Telecharger <span className="gradient-text">Lamu</span>
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 12 }}>
            Disponible sur toutes les plateformes majeures. Seulement ~10MB.
          </motion.p>
          <motion.p variants={fadeUp} style={{ fontSize: 14, color: 'rgba(99,102,241,0.8)', fontWeight: 500 }}>
            Version 0.2.0 — Derniere version
          </motion.p>
        </motion.div>
      </section>

      {/* Platform cards */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            variants={{ ...stagger, hidden: {} }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}
          >
            {platforms.map(p => (
              <motion.div key={p.name} variants={fadeUp}>
                <motion.div
                  whileHover={{ y: -6, borderColor: 'rgba(255,255,255,0.2)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  style={{ background: p.featured ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.025)', border: `1px solid ${p.featured ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: 32, textAlign: 'center', position: 'relative', overflow: 'hidden' }}
                >
                  {p.featured && <BorderBeam colorTo="rgba(99,102,241,0.9)" duration={3.5} />}
                  {p.featured && (
                    <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: '#818cf8' }}>
                      Recommande
                    </div>
                  )}
                  <div style={{ width: 56, height: 56, background: p.bg, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <p.icon size={28} color={p.color} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{p.name}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>{p.desc}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>{p.note}</p>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    {p.formats.map(fmt => (
                      <span key={fmt} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>{fmt}</span>
                    ))}
                  </div>

                  <motion.a
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: p.featured ? '#fff' : 'rgba(255,255,255,0.07)', color: p.featured ? '#000' : '#fff', fontWeight: 600, padding: '12px 20px', borderRadius: 10, fontSize: 14, textDecoration: 'none', border: p.featured ? 'none' : '1px solid rgba(255,255,255,0.1)', transition: 'background 0.2s' }}
                  >
                    <Download size={15} />
                    Telecharger {p.name}
                  </motion.a>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Requirements */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 32 }}
          >
            Systemes Compatibles
          </motion.h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {requirements.map((r, i) => (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, textAlign: 'center' }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>{r.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.value}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
