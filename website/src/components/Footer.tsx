import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '36px 24px', background: '#000' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/lamu-icon.png" alt="Lamu AI" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Lamu</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>© 2026</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {(
            [
              { label: 'Telechargements', to: '/downloads' },
              { label: 'Tarifs', to: '/pricing' },
              { label: 'Affiliation', to: '/affiliate' },
              { label: 'Changelog', to: '/changelog' },
              { label: 'Contact', to: '/contact' },
              { label: 'Récupérer ma licence', to: '/recover' },
              { label: 'Mentions légales', to: '/legal' },
              { label: 'Status', to: '/status' },
            ] as Array<{ label: string; to: string } | { label: string; href: string }>
          ).map(link => (
            'href' in link ? (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none', borderRadius: 6, transition: 'color 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.4)' }}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.to!}
                style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none', borderRadius: 6, transition: 'color 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.4)' }}
              >
                {link.label}
              </Link>
            )
          ))}
        </div>
      </div>
    </footer>
  )
}
