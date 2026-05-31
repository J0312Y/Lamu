import { useState, useEffect, useCallback, createContext, useContext } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

let _globalToast: ((message: string, type?: ToastType) => void) | null = null
export function toast(message: string, type: ToastType = 'info') {
  if (_globalToast) _globalToast(message, type)
}

const ICONS: Record<ToastType, string> = {
  success: 'M9 12.75 11.25 15 15 9.75',
  error: 'M6 18 18 6M6 6l12 12',
  warning: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z',
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', icon: '#22c55e' },
  error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', icon: '#ef4444' },
  warning: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.3)', icon: '#eab308' },
  info: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)', icon: '#818cf8' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  let idCounter = 0

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + (idCounter++)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => { _globalToast = addToast; return () => { _globalToast = null } }, [addToast])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
        }}>
          {toasts.map(t => {
            const c = COLORS[t.type]
            return (
              <div key={t.id} style={{
                background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
                padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
                backdropFilter: 'blur(16px)', pointerEvents: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                animation: 'lamu-toast-in 0.3s ease-out',
                minWidth: 260, maxWidth: 420,
              }}>
                <svg width="18" height="18" fill="none" stroke={c.icon} strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[t.type]} />
                </svg>
                <span style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>{t.message}</span>
                <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                  cursor: 'pointer', fontSize: 16, marginLeft: 'auto', padding: '0 2px',
                }}>x</button>
              </div>
            )
          })}
        </div>
      )}
      <style>{`
        @keyframes lamu-toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext) }
