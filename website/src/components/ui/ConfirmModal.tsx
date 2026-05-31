import { useState, createContext, useContext, useCallback } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType>({ confirm: () => Promise.resolve(false) })

let _globalConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (_globalConfirm) return _globalConfirm(options)
  return Promise.resolve(window.confirm(options.message))
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    visible: boolean
    options: ConfirmOptions
    resolve: ((v: boolean) => void) | null
  }>({ visible: false, options: { title: '', message: '' }, resolve: null })

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ visible: true, options, resolve })
    })
  }, [])

  _globalConfirm = showConfirm

  const close = (result: boolean) => {
    state.resolve?.(result)
    setState(prev => ({ ...prev, visible: false, resolve: null }))
  }

  return (
    <ConfirmContext.Provider value={{ confirm: showConfirm }}>
      {children}
      {state.visible && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99998,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
          animation: 'lamu-fade-in 0.15s ease-out',
        }} onClick={() => close(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#111118', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: 0, width: 400, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            animation: 'lamu-scale-in 0.2s ease-out',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, marginBottom: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: state.options.danger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                border: `1px solid ${state.options.danger ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)'}`,
              }}>
                <svg width="20" height="20" fill="none" stroke={state.options.danger ? '#ef4444' : '#818cf8'} strokeWidth={2} viewBox="0 0 24 24">
                  {state.options.danger
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                  }
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{state.options.title}</h3>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>{state.options.message}</p>
            </div>
            <div style={{
              padding: '14px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <button onClick={() => close(false)} style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                transition: 'background 0.15s',
              }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                 onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
                {state.options.cancelText || 'Annuler'}
              </button>
              <button onClick={() => close(true)} style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: 'none', color: '#fff',
                background: state.options.danger ? '#dc2626' : '#6366f1',
                transition: 'background 0.15s',
              }} onMouseOver={e => (e.currentTarget.style.background = state.options.danger ? '#b91c1c' : '#5558e6')}
                 onMouseOut={e => (e.currentTarget.style.background = state.options.danger ? '#dc2626' : '#6366f1')}>
                {state.options.confirmText || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes lamu-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lamu-scale-in { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() { return useContext(ConfirmContext) }
