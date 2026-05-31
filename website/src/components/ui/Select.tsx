import { useState, useRef, useEffect } from 'react'

interface SelectOption {
  value: string
  label: string
  icon?: string
  color?: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}

export function Select({ value, options, onChange, placeholder = 'Select...', size = 'md', style }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)
  const sm = size === 'sm'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: sm ? '4px 10px' : '8px 14px',
          fontSize: sm ? 11 : 13, fontWeight: 600, color: selected ? '#e2e8f0' : '#64748b',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: sm ? 6 : 8, cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          fontFamily: 'inherit',
        }}
        onMouseOver={e => { if (!open) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
        onMouseOut={e => { if (!open) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
      >
        {selected?.icon && <span style={{ fontSize: sm ? 12 : 14 }}>{selected.icon}</span>}
        <span style={{ flex: 1, textAlign: 'left' }}>{selected?.label || placeholder}</span>
        <svg width={sm ? 10 : 12} height={sm ? 10 : 12} viewBox="0 0 12 12" fill="none" style={{
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 100,
          background: '#161622', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: sm ? 8 : 10, overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          animation: 'lamu-dropdown-in 0.15s ease-out',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {options.map(opt => {
            const isActive = opt.value === value
            return (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: sm ? '6px 10px' : '8px 14px',
                fontSize: sm ? 11 : 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? '#a5b4fc' : '#cbd5e1',
                background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s', fontFamily: 'inherit',
              }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.1)' : 'transparent' }}
              >
                {opt.icon && <span style={{ fontSize: sm ? 12 : 14 }}>{opt.icon}</span>}
                <span>{opt.label}</span>
                {opt.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, marginLeft: 'auto' }} />}
                {isActive && (
                  <svg width="14" height="14" fill="none" stroke="#818cf8" strokeWidth={2} viewBox="0 0 24 24" style={{ marginLeft: 'auto' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
      <style>{`
        @keyframes lamu-dropdown-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
