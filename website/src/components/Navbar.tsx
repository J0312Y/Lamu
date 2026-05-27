import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { label: 'Telechargements', href: '/downloads' },
  { label: 'Fonctionnalites', href: '/#features' },
  { label: 'Pourquoi Lamu ?', href: '/#why' },
  { label: 'Tarifs', href: '/pricing' },
  { label: 'Affiliation', href: '/affiliate' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location])

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#818cf8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>Lamu</span>
          </Link>

          {/* Desktop links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }} className="hidden-mobile">
            {navLinks.map(link => (
              <NavLink key={link.label} href={link.href} label={link.label} />
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} className="hidden-mobile">
            <a
              href="mailto:support@lamuka.com?subject=Billing"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.06)' }}
            >
              Facturation
            </a>
            <Link
              to="/app"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8, textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.25)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.15)' }}
            >
              App Web
            </Link>
            <Link
              to="/downloads"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#000', fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8, textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#e5e7eb' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#fff' }}
            >
              Obtenir Lamu
            </Link>
          </div>

          {/* Mobile menu btn */}
          <button
            className="show-mobile"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'none' }}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', top: 60, left: 0, right: 0, zIndex: 49, background: 'rgba(0,0,0,0.97)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {navLinks.map(link => (
              <a key={link.label} href={link.href} style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)', fontSize: 15, textDecoration: 'none', borderRadius: 8, transition: 'color 0.2s' }}>
                {link.label}
              </a>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
            <Link to="/app" style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontSize: 14, fontWeight: 600, borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
              App Web
            </Link>
            <Link to="/downloads" style={{ padding: '12px 16px', background: '#fff', color: '#000', fontSize: 14, fontWeight: 600, borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
              Telecharger Lamu
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
      `}</style>
    </>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  const isExternal = href.startsWith('http')
  const props = isExternal ? { href, target: '_blank', rel: 'noreferrer' } : { href }
  return (
    <a
      {...props}
      style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 14, textDecoration: 'none', borderRadius: 8, transition: 'all 0.2s', fontWeight: 450 }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = '#fff'; el.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = 'rgba(255,255,255,0.6)'; el.style.background = 'transparent' }}
    >
      {label}
    </a>
  )
}

export function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}
