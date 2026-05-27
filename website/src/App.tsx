import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
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

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function MarketingLayout() {
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
        </Routes>
      </main>
      <Footer />
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
  return <MarketingLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Router />
    </BrowserRouter>
  )
}
