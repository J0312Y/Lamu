import { motion } from 'framer-motion'
import { Download, Apple, Monitor, Terminal, Tag, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BorderBeam } from '../components/BorderBeam'

const releases = [
  {
    version: '0.1.9',
    date: '15 Avril 2026',
    tag: 'Derniere',
    tagColor: '#4ade80',
    size: '~10MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - macOS' },
      { name: 'Windows', icon: Monitor, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - Windows' },
      { name: 'Linux', icon: Terminal, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - Linux' },
    ],
    highlights: ['Capture audio systeme', 'ElevenLabs STT', 'Integrations DB', 'Email vocal'],
  },
  {
    version: '0.1.8',
    date: '20 Mars 2026',
    size: '~11MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - macOS' },
      { name: 'Windows', icon: Monitor, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - Windows' },
      { name: 'Linux', icon: Terminal, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - Linux' },
    ],
    highlights: ['Overlay deplacable', "Mode capture d'ecran auto", 'Groq STT'],
  },
  {
    version: '0.1.7',
    date: '10 Fevrier 2026',
    size: '~11MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - macOS' },
      { name: 'Windows', icon: Monitor, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - Windows' },
      { name: 'Linux', icon: Terminal, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - Linux' },
    ],
    highlights: ['Fournisseur IA custom via cURL', 'Google Gemini & Mistral', 'Refonte du tableau de bord'],
  },
]

export default function Releases() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6 }} style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Tag size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Versions</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Toutes les <span className="gradient-text">Versions</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Telechargez n'importe quelle version de Lamu pour votre plateforme.
          </p>
        </motion.div>
      </section>

      {/* Latest highlight */}
      <section style={{ padding: '0 24px 40px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, padding: '32px 36px', position: 'relative', overflow: 'hidden', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <BorderBeam colorTo="rgba(99,102,241,0.9)" duration={3.5} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>v{releases[0].version}</h2>
                <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>Derniere Version</span>
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>{releases[0].date} · {releases[0].size}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {releases[0].highlights.map(h => (
                  <span key={h} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{h}</span>
                ))}
              </div>
            </div>
            <Link to="/downloads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '12px 24px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}>
              <Download size={15} /> Telecharger la Derniere
            </Link>
          </motion.div>
          <div style={{ textAlign: 'right' }}>
            <Link to="/changelog" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#818cf8', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
              Voir le changelog complet <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* All releases */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {releases.map((release, i) => (
            <motion.div key={release.version} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.5 }}
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>v{release.version}</h3>
                {release.tag && <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: release.tagColor }}>{release.tag}</span>}
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{release.date}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{release.size}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                {release.platforms.map(p => (
                  <a key={p.name} href={p.href}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <p.icon size={16} color="rgba(255,255,255,0.5)" />
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{p.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {p.formats.map(f => <span key={f} style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>{f}</span>)}
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
