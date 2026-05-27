import { motion } from 'framer-motion'
import { DollarSign, Users, Link2, Mail, CheckCircle2, ArrowRight } from 'lucide-react'
import { BorderBeam } from '../components/BorderBeam'

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6 } },
}
const stagger = { show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }

const perks = [
  { icon: DollarSign, title: '30% de Commission', desc: 'Gagnez 30% sur chaque licence Dev Pro vendue via votre lien de parrainage. Paiement mensuel.', color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
  { icon: Users, title: 'Parrainages a Vie', desc: "Votre commission s'applique a vie pour chaque client que vous parrainez — pas seulement le premier achat.", color: '#818cf8', bg: 'rgba(99,102,241,0.08)' },
  { icon: Link2, title: "Lien d'Affilie Unique", desc: 'Obtenez un lien de suivi personnalise et un tableau de bord pour suivre vos clics, conversions et gains.', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  { icon: Mail, title: 'Support Dedie', desc: "Acces a des ressources specifiques aux affilies, bannieres et support direct de l'equipe Lamu.", color: '#22d3ee', bg: 'rgba(34,211,238,0.08)' },
]

const steps = [
  { num: '01', title: 'Postuler', desc: "Envoyez-nous un email a affiliates@lamuka.com avec votre nom et comment vous comptez promouvoir Lamu." },
  { num: '02', title: 'Obtenir Votre Lien', desc: "Nous vous enverrons un lien de suivi unique et l'acces aux ressources promotionnelles sous 2 jours ouvrables." },
  { num: '03', title: 'Promouvoir', desc: 'Partagez Lamu avec votre audience via du contenu, des tutoriels, des posts sociaux ou tout canal de votre choix.' },
  { num: '04', title: 'Gagner', desc: 'Les commissions sont suivies automatiquement et versees mensuellement sur votre mode de paiement prefere.' },
]

const faqs = [
  { q: 'Combien est-ce que je gagne par vente ?', a: "30% de chaque vente de licence Dev Pro (120$) — soit 36$ par conversion." },
  { q: 'Quand suis-je paye ?', a: 'Les commissions sont versees mensuellement, dans les 5 premiers jours ouvrables du mois suivant.' },
  { q: 'Y a-t-il un seuil minimum de versement ?', a: 'Oui, le seuil minimum est de 50$. Les soldes inferieurs sont reportes au mois suivant.' },
  { q: 'Quels materiaux promotionnels sont fournis ?', a: 'Nous fournissons des bannieres, videos de demo, modeles de texte et captures de produit. Visitez la page Promouvoir pour les ressources completes.' },
  { q: 'Puis-je utiliser de la publicite payante ?', a: "Oui, avec approbation ecrite prealable. L'enchere sur nos mots-cles de marque necessite une approbation. Contactez affiliates@lamuka.com." },
]

export default function Affiliate() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(74,222,128,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%,black 0%,transparent 100%)' }} />

        <motion.div initial="hidden" animate="show" variants={{ ...stagger, hidden: {} }} style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <motion.div variants={fadeUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <DollarSign size={13} color="#4ade80" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#4ade80', textTransform: 'uppercase' }}>Programme d'Affiliation</span>
          </motion.div>
          <motion.h1 variants={fadeUp} style={{ fontSize: 'clamp(2.2rem,6vw,3.8rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Gagnez en Partageant<br /><span className="gradient-text">Lamu</span>
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 32 }}>
            Rejoignez notre programme d'affiliation et gagnez <strong style={{ color: '#4ade80' }}>30% de commission</strong> sur chaque licence Dev Pro que vous parrainez. Sans plafond, sans expiration.
          </motion.p>
          <motion.div variants={fadeUp}>
            <a
              href="mailto:affiliates@lamuka.com?subject=Candidature Affilie"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '14px 32px', borderRadius: 12, fontSize: 15, textDecoration: 'none' }}
            >
              <Mail size={16} />
              Postuler Maintenant
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Perks */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {perks.map((p, i) => (
            <motion.div key={p.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }}
              style={{ background: p.bg, border: `1px solid ${p.bg.replace('0.08', '0.2')}`, borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: 40, height: 40, background: p.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <p.icon size={20} color={p.color} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{p.title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 48, letterSpacing: -0.5 }}>
            Comment ca Marche
          </motion.h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
            {steps.map((step, i) => (
              <motion.div key={step.num} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'rgba(99,102,241,0.25)', letterSpacing: -2, marginBottom: 14, lineHeight: 1 }}>{step.num}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.48)', lineHeight: 1.65 }}>{step.desc}</p>
                {i < steps.length - 1 && (
                  <div style={{ position: 'absolute', top: '50%', right: -12, transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.15)', zIndex: 1 }} className="step-arrow">
                    <ArrowRight size={16} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission calculator */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 20, padding: 40, position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
            <BorderBeam colorTo="rgba(74,222,128,0.7)" duration={4} />
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Gains Potentiels</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[{ ref: '5 parrainages/mois', earn: '180$/mois' }, { ref: '20 parrainages/mois', earn: '720$/mois' }, { ref: '50 parrainages/mois', earn: '1 800$/mois' }].map(e => (
                <div key={e.ref} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80', marginBottom: 4 }}>{e.earn}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{e.ref}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Base sur 36$ de commission par vente Dev Pro (120$ x 30%)</p>
            <a href="mailto:affiliates@lamuka.com?subject=Candidature Affilie" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#000', fontWeight: 600, padding: '12px 28px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}>
              <Mail size={15} /> Rejoindre le Programme
            </a>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 32, letterSpacing: -0.5 }}>
            FAQ Affiliation
          </motion.h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5 }}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                <details style={{ cursor: 'pointer' }}>
                  <summary style={{ padding: '18px 22px', fontSize: 15, fontWeight: 500, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, userSelect: 'none' }}>
                    {item.q}<span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0, fontSize: 18 }}>+</span>
                  </summary>
                  <div style={{ padding: '0 22px 18px', fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75 }}>{item.a}</div>
                </details>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Guidelines */}
      <section style={{ padding: '0 24px 100px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {['Pas de spam ni de publicite trompeuse', "Pas d'enchere sur les mots-cles de marque sans approbation", 'Divulgation obligatoire conformement aux directives FTC', 'Commissions retenues pour les parrainages frauduleux'].map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px' }}>
                <CheckCircle2 size={16} color="#4ade80" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{g}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Des questions ? Ecrivez a <a href="mailto:affiliates@lamuka.com" style={{ color: '#818cf8', textDecoration: 'none' }}>affiliates@lamuka.com</a></p>
        </div>
      </section>
    </div>
  )
}
