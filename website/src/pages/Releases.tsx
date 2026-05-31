import { motion } from 'framer-motion'
import { Download, Apple, Tag, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BorderBeam } from '../components/BorderBeam'

function WindowsIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  )
}

function LinuxIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.345 1.884 1.345.358 0 .705-.127 1.001-.373.9-.5 1.476-1.785 1.476-3.075 0-.533-.081-1.01-.252-1.424-.21-.397-.476-.8-.762-1.023-.037-.065-.074-.13-.106-.195-.118-.234-.248-.606-.155-.867.09-.268.207-.467.296-.672.091-.178.14-.401.14-.601 0-.26-.071-.528-.185-.67-.064-.07-.107-.118-.15-.314-.024-.126-.027-.288.024-.461.065-.18.143-.397.171-.592.032-.198.024-.382-.049-.556-.094-.26-.272-.485-.456-.666-.182-.208-.356-.38-.398-.545-.14-.34-.25-.653-.333-.879l-.006-.018c-.027-.076-.051-.144-.08-.2-.11-.27-.244-.461-.31-.537a2.094 2.094 0 00-.136-.14c-.04-.045-.081-.083-.116-.144a1.12 1.12 0 01-.074-.314c-.022-.134-.023-.296-.023-.49 0-.39-.011-.789-.098-1.134-.09-.398-.237-.724-.477-.94-.165-.148-.352-.264-.532-.353-.053-.041-.092-.082-.09-.137.014-.067.041-.13.055-.143.071-.151.166-.339.168-.39.013-.096.022-.27-.019-.557-.064-.21-.097-.443-.177-.596-.067-.122-.178-.242-.297-.334-.019-.01-.039-.02-.058-.032-.076-.048-.154-.084-.235-.106-.08-.024-.16-.033-.238-.033z"/>
    </svg>
  )
}

const releases = [
  {
    version: '0.2.0',
    date: '29 Mai 2026',
    tag: 'Derniere',
    tagColor: '#4ade80',
    size: '~10MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.2.0 - macOS' },
      { name: 'Windows', icon: WindowsIcon, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.2.0 - Windows' },
      { name: 'Linux', icon: LinuxIcon, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.2.0 - Linux' },
    ],
    highlights: ['Application web', 'Helpdesk IA', 'Multi-canal', 'Licence par email'],
  },
  {
    version: '0.1.9',
    date: '15 Avril 2026',
    size: '~10MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - macOS' },
      { name: 'Windows', icon: WindowsIcon, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - Windows' },
      { name: 'Linux', icon: LinuxIcon, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.9 - Linux' },
    ],
    highlights: ['Capture audio systeme', 'ElevenLabs STT', 'Integrations DB', 'Email vocal'],
  },
  {
    version: '0.1.8',
    date: '20 Mars 2026',
    size: '~11MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - macOS' },
      { name: 'Windows', icon: WindowsIcon, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - Windows' },
      { name: 'Linux', icon: LinuxIcon, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.8 - Linux' },
    ],
    highlights: ['Overlay deplacable', "Mode capture d'ecran auto", 'Groq STT'],
  },
  {
    version: '0.1.7',
    date: '10 Fevrier 2026',
    size: '~11MB',
    platforms: [
      { name: 'macOS', icon: Apple, formats: ['.dmg'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - macOS' },
      { name: 'Windows', icon: WindowsIcon, formats: ['.msi', '.exe'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - Windows' },
      { name: 'Linux', icon: LinuxIcon, formats: ['.deb', '.rpm', '.AppImage'], href: 'mailto:support@lamuka.com?subject=Telecharger v0.1.7 - Linux' },
    ],
    highlights: ['API developpeur', 'Google Gemini & Mistral', 'Refonte du tableau de bord'],
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
