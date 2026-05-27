import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Clock, Activity } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } },
}

const services = [
  { name: 'Serveur de Telechargement Lamu', status: 'operational', uptime: '99.98%' },
  { name: "API d'Activation de Licence", status: 'operational', uptime: '99.95%' },
  { name: 'Lamu API (Optionnel)', status: 'operational', uptime: '99.9%' },
  { name: 'Facturation & Paiements', status: 'operational', uptime: '100%' },
  { name: 'Email Support', status: 'operational', uptime: '100%' },
  { name: 'Site Web', status: 'operational', uptime: '99.99%' },
]

const incidents = [
  {
    date: '10 Avril 2026',
    title: "API d'Activation de Licence — Latence Elevee",
    status: 'resolved',
    duration: '14 minutes',
    detail: "Un bref pic de temps de reponse de l'API a ete observe. La cause etait un epuisement du pool de connexions a la base de donnees. Resolu en augmentant la limite de connexions. Aucune activation de licence n'a ete perdue.",
  },
  {
    date: '3 Mars 2026',
    title: 'Serveur de Telechargement — Panne Partielle',
    status: 'resolved',
    duration: '31 minutes',
    detail: "L'invalidation du cache CDN a provoque des erreurs 404 sur les liens de telechargement dans certaines regions. Entierement resolu apres la propagation CDN.",
  },
]

const statusConfig = {
  operational:   { label: 'Operationnel',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   icon: CheckCircle2 },
  degraded:      { label: 'Degrade',        color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   icon: AlertCircle },
  outage:        { label: 'Panne',          color: '#f87171', bg: 'rgba(248,113,113,0.1)',  icon: AlertCircle },
  maintenance:   { label: 'Maintenance',    color: '#22d3ee', bg: 'rgba(34,211,238,0.1)',   icon: Clock },
}

const allOperational = services.every(s => s.status === 'operational')

export default function Status() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: `radial-gradient(ellipse,${allOperational ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)'} 0%,transparent 70%)`, pointerEvents: 'none' }} />

        <motion.div initial="hidden" animate="show" variants={fadeUp} style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Activity size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Etat du Systeme</span>
          </div>

          {/* Overall status banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: allOperational ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.08)', border: `1px solid ${allOperational ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)'}`, borderRadius: 16, padding: '20px 36px', marginBottom: 24 }}
          >
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: allOperational ? '#4ade80' : '#fbbf24', boxShadow: `0 0 12px ${allOperational ? '#4ade8088' : '#fbbf2488'}` }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{allOperational ? 'Tous les Systemes Operationnels' : 'Certains Systemes Degrades'}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Derniere verification : a l'instant</div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Services */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>SERVICES</h2>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
            {services.map((service, i) => {
              const cfg = statusConfig[service.status as keyof typeof statusConfig]
              const Icon = cfg.icon
              return (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: i < services.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', gap: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Icon size={16} color={cfg.color} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{service.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{service.uptime} disponibilite</span>
                    <span style={{ background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Uptime graph placeholder */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 0.5 }}>DISPONIBILITE SUR 90 JOURS</h2>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
              {Array.from({ length: 90 }, (_, i) => (
                <div key={i} style={{ flex: 1, height: 28, borderRadius: 3, background: i === 28 || i === 61 ? 'rgba(251,191,36,0.4)' : 'rgba(74,222,128,0.5)', transition: 'opacity 0.2s', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              <span>Il y a 90 jours</span>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>99.96% de disponibilite</span>
              <span>Aujourd'hui</span>
            </div>
          </div>
        </div>
      </section>

      {/* Incidents */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 16, letterSpacing: 0.5 }}>INCIDENTS RECENTS</h2>
          {incidents.length === 0 ? (
            <div style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
              <CheckCircle2 size={24} color="#4ade80" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>Aucun incident au cours des 90 derniers jours.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {incidents.map((incident, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>{incident.title}</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{incident.date}</span>
                      <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>Resolu</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 8 }}>{incident.detail}</p>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Duree : {incident.duration}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
