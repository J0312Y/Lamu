import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { CookieBanner, initCookieConsent } from './components/CookieBanner'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmModal'
import Home from './pages/Home'
import Downloads from './pages/Downloads'
import Pricing from './pages/Pricing'
import Affiliate from './pages/Affiliate'
import Changelog from './pages/Changelog'
import Releases from './pages/Releases'
import Promote from './pages/Promote'
import Status from './pages/Status'
import WebApp from './pages/WebApp'
import Recover from './pages/Recover'
import Contact from './pages/Contact'
import Legal from './pages/Legal'
import SharedConversation from './pages/SharedConversation'

function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1.5rem', padding: '2rem' }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.25rem', color: '#999', margin: 0 }}>Page introuvable</p>
      <Link to="/" style={{ color: '#3b82f6', textDecoration: 'underline', fontSize: '1rem' }}>
        Retour a l'accueil
      </Link>
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
      </main>
      <Footer />
      <CookieBanner />
    </div>
  )
}

function AppLayout() {
  return (
    <div style={{ background: '#080808', height: '100vh', overflow: 'hidden', color: '#fff' }}>
      <Routes>
        <Route path="/app" element={<WebApp />} />
      </Routes>
    </div>
  )
}

function Router() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/app')) return <AppLayout />
  if (pathname.startsWith('/shared/')) return (
    <Routes>
      <Route path="/shared/:shareId" element={<SharedConversation />} />
    </Routes>
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
