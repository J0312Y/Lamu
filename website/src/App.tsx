import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { CookieBanner } from './components/CookieBanner'
import { initCookieConsent } from './lib/analytics'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmModal'
import Home from './pages/Home'
import Downloads from './pages/Downloads'
import Pricing from './pages/Pricing'

const Affiliate = lazy(() => import('./pages/Affiliate'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Releases = lazy(() => import('./pages/Releases'))
const Promote = lazy(() => import('./pages/Promote'))
const Status = lazy(() => import('./pages/Status'))
const WebApp = lazy(() => import('./pages/WebApp'))
const Recover = lazy(() => import('./pages/Recover'))
const Contact = lazy(() => import('./pages/Contact'))
const Legal = lazy(() => import('./pages/Legal'))
const SharedConversation = lazy(() => import('./pages/SharedConversation'))

function NotFound() {
  const suggestedPages = [
    { label: 'Accueil', to: '/', desc: 'Découvrez Lamu' },
    { label: 'Téléchargements', to: '/downloads', desc: 'macOS, Windows, Linux' },
    { label: 'Tarifs', to: '/pricing', desc: 'Gratuit et Premium' },
    { label: 'App Web', to: '/app', desc: 'Lamu dans votre navigateur' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 12, padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 80, fontWeight: 800, background: 'linear-gradient(135deg, #818cf8, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>404</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>Page introuvable</h2>
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 400, lineHeight: 1.6, margin: '0 0 32px' }}>
        Cette page n'existe pas ou a été déplacée. Voici quelques pages qui pourraient vous intéresser :
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, maxWidth: 500, width: '100%' }}>
        {suggestedPages.map(p => (
          <Link
            key={p.to}
            to={p.to}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '16px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{p.label}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function MarketingLayout() {
  useEffect(() => { initCookieConsent() }, [])
  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff' }}>
      <Navbar />
      <main>
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}><div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/affiliate" element={<Affiliate />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/releases" element={<Releases />} />
            <Route path="/promote" element={<Promote />} />
            <Route path="/status" element={<Status />} />
            <Route path="/recover" element={<Recover />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <CookieBanner />
    </div>
  )
}

function AppLayout() {
  return (
    <div style={{ background: '#080808', height: '100vh', overflow: 'hidden', color: '#fff' }}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/app" element={<WebApp />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function Router() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/app')) return <AppLayout />
  if (pathname.startsWith('/shared/')) return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/shared/:shareId" element={<SharedConversation />} />
      </Routes>
    </Suspense>
  )
  return <MarketingLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <ScrollToTop />
          <Router />
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
