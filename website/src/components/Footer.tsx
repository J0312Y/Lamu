import { Link } from 'react-router-dom'

const columns = [
  {
    title: 'Produit',
    links: [
      { label: 'Téléchargements', to: '/downloads' },
      { label: 'Fonctionnalités', to: '/#features' },
      { label: 'Tarifs', to: '/pricing' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'Contact', to: '/contact' },
      { label: 'Affiliation', to: '/affiliate' },
      { label: 'Promouvoir', to: '/promote' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Mentions légales', to: '/legal' },
      { label: 'Récupérer ma licence', to: '/recover' },
    ],
  },
]

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#000' }}>
      {/* Columns */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 40px', display: 'flex', flexWrap: 'wrap', gap: 48, justifyContent: 'space-between' }}>
        {columns.map(col => (
          <div key={col.title} style={{ minWidth: 160, flex: '1 1 160px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
              {col.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map(link => (
                <Link
                  key={link.label}
                  to={link.to}
                  style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#fff' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.5)' }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/lamu-icon.png" alt="Lamu AI" style={{ width: 24, height: 24, borderRadius: 6 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Lamu</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>&copy; 2026</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Link
              to="/status"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 100, padding: '4px 12px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.15)' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              <span style={{ color: 'rgba(74,222,128,0.8)', fontWeight: 500 }}>Tous les systèmes opérationnels</span>
            </Link>
            <a
              href="mailto:support@lamuka-tech.com"
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.35)' }}
            >
              support@lamuka-tech.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
