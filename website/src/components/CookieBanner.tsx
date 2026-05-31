import { useState, useEffect } from 'react'

type CookieConsent = 'all' | 'essential' | null

function getConsent(): CookieConsent {
  const v = localStorage.getItem('lamu_cookie_consent')
  if (v === 'all' || v === 'essential') return v
  return null
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analyticsOn, setAnalyticsOn] = useState(true)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!getConsent()) setVisible(true)
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  const accept = (level: 'all' | 'essential') => {
    setClosing(true)
    setTimeout(() => {
      localStorage.setItem('lamu_cookie_consent', level)
      setVisible(false)
      setClosing(false)
      if (level === 'all') loadAnalytics()
    }, 300)
  }

  const handleCustom = () => {
    accept(analyticsOn ? 'all' : 'essential')
  }

  if (!visible) return null

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 20, left: 20, right: 20, zIndex: 99999,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        animation: closing ? 'lamu-cookie-out 0.3s ease-in forwards' : 'lamu-cookie-in 0.4s ease-out',
      }}>
        <div style={{
          pointerEvents: 'auto',
          background: 'linear-gradient(145deg, rgba(17, 17, 28, 0.98), rgba(12, 12, 20, 0.98))',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          borderRadius: 20, padding: 0, width: '100%', maxWidth: 520,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>L</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Cookies & Confidentialite</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Vos donnees, votre choix</div>
              </div>
            </div>
            <p style={{
              margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
            }}>
              Nous utilisons des cookies essentiels pour le fonctionnement du site et, avec votre accord, des cookies analytiques pour ameliorer nos services.
            </p>
          </div>

          {/* Details toggle */}
          {showDetails && (
            <div style={{ padding: '12px 24px 0' }}>
              <div style={{
                borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* Essential */}
                <div style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" fill="none" stroke="#22c55e" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                      </svg>
                      Essentiels
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Session, preferences, securite</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(34,197,94,0.1)', color: '#22c55e', textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>Requis</span>
                </div>

                {/* Analytics */}
                <div style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" fill="none" stroke="#818cf8" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                      </svg>
                      Analytiques
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Google Analytics (IP anonymisee)</div>
                  </div>
                  {/* Toggle switch */}
                  <button onClick={() => setAnalyticsOn(!analyticsOn)} style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: analyticsOn ? '#6366f1' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s', padding: 0,
                  }}>
                    <span style={{
                      position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      left: analyticsOn ? 21 : 3,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{
            padding: '16px 24px 20px',
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <button onClick={() => setShowDetails(!showDetails)} style={{
              padding: '9px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent', color: '#94a3b8',
              transition: 'all 0.15s', fontFamily: 'inherit',
            }}
              onMouseOver={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              {showDetails ? 'Masquer' : 'Personnaliser'}
            </button>

            <div style={{ flex: 1 }} />

            {showDetails ? (
              <button onClick={handleCustom} style={{
                padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: 'none', color: '#fff',
                background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                transition: 'transform 0.1s, box-shadow 0.15s',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                fontFamily: 'inherit',
              }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)' }}
                onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.3)' }}
              >
                Sauvegarder mes choix
              </button>
            ) : (
              <>
                <button onClick={() => accept('essential')} style={{
                  padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                >
                  Refuser
                </button>
                <button onClick={() => accept('all')} style={{
                  padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', border: 'none', color: '#fff',
                  background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                  transition: 'transform 0.1s, box-shadow 0.15s',
                  boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                  fontFamily: 'inherit',
                }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)' }}
                  onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.3)' }}
                >
                  Tout accepter
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lamu-cookie-in {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lamu-cookie-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(30px); }
        }
      `}</style>
    </>
  )
}

function loadAnalytics() {
  const GA_ID = import.meta.env.VITE_GA_ID
  if (!GA_ID) return
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  script.async = true
  document.head.appendChild(script)
  script.onload = () => {
    ;(window as any).dataLayer = (window as any).dataLayer || []
    function gtag(...args: any[]) { (window as any).dataLayer.push(args) }
    gtag('js', new Date())
    gtag('config', GA_ID, { anonymize_ip: true })
  }
}

export function initCookieConsent() {
  if (getConsent() === 'all') loadAnalytics()
}
