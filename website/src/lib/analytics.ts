export type CookieConsent = 'all' | 'essential' | null

const CONSENT_KEY = 'lamu_cookie_consent'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

export function getConsent(): CookieConsent {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    if (v === 'all' || v === 'essential') return v
  } catch { /* storage unavailable (private mode) — treat as no consent */ }
  return null
}

export function saveConsent(level: 'all' | 'essential') {
  try { localStorage.setItem(CONSENT_KEY, level) } catch { /* storage unavailable */ }
}

let analyticsLoaded = false

export function loadAnalytics() {
  const GA_ID = import.meta.env.VITE_GA_ID
  if (!GA_ID || analyticsLoaded) return
  analyticsLoaded = true
  const dataLayer = (window.dataLayer = window.dataLayer || [])
  // gtag.js only processes `arguments` objects pushed onto dataLayer, not plain arrays.
  const gtag: (...args: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params -- gtag.js requires the Arguments object
    dataLayer.push(arguments)
  }
  gtag('js', new Date())
  gtag('config', GA_ID, { anonymize_ip: true })
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  script.async = true
  document.head.appendChild(script)
}

export function initCookieConsent() {
  if (getConsent() === 'all') loadAnalytics()
}
