interface BorderBeamProps {
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  size?: number
}

export function BorderBeam({
  duration = 3.5,
  delay = 0,
  colorFrom = 'transparent',
  colorTo = 'rgba(99,102,241,0.9)',
  size = 30,
}: BorderBeamProps) {
  return (
    <span
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{ zIndex: 10 }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${size}%`,
          height: '1.5px',
          background: `linear-gradient(90deg, ${colorFrom}, ${colorTo}, ${colorFrom})`,
          animation: `borderBeam ${duration}s ${delay}s linear infinite`,
          borderRadius: '999px',
        }}
      />
    </span>
  )
}
