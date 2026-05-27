import { motion } from 'framer-motion'
import { useState } from 'react'

type Tab = 'terms' | 'privacy'

export default function Legal() {
  const [tab, setTab] = useState<Tab>('terms')

  return (
    <div style={{ paddingTop: 60 }}>
      <section style={{ padding: '60px 24px 40px', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, marginBottom: 24 }}>Mentions légales</h1>
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, gap: 4 }}>
            {(['terms', 'privacy'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 24px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#000' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                {t === 'terms' ? "Conditions d'utilisation" : 'Politique de confidentialité'}
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      <section style={{ padding: '0 24px 100px' }}>
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ maxWidth: 720, margin: '0 auto', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '40px 48px', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8 }}>
          {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </motion.div>
      </section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  )
}

function TermsContent() {
  return (
    <>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 32 }}>Dernière mise à jour : avril 2026</p>
      <Section title="1. Acceptation des conditions">
        <p>En téléchargeant, installant ou utilisant Lamuka ("l'application"), vous acceptez les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser l'application.</p>
      </Section>
      <Section title="2. Licence d'utilisation">
        <p>Lamuka est disponible en deux modes :</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#fff' }}>Mode gratuit</strong> — utilisation illimitée avec vos propres clés API.</li>
          <li><strong style={{ color: '#fff' }}>Licence payante</strong> — débloque des fonctionnalités avancées selon le plan choisi. La licence est personnelle, non transférable et ne peut être partagée ou revendue.</li>
        </ul>
      </Section>
      <Section title="3. Paiement et remboursements">
        <p>Les paiements sont traités via Mobile Money (Airtel Money) par notre partenaire de paiement, Airtel Money. Les licences lifetime sont des achats définitifs. Nous n'offrons pas de remboursement sauf en cas de défaillance technique avérée non résolue dans les 7 jours suivant l'achat. Pour toute demande, contactez <a href="mailto:support@lamuka.com" style={{ color: '#818cf8' }}>support@lamuka.com</a>.</p>
      </Section>
      <Section title="4. Propriété intellectuelle">
        <p>Lamuka et tous ses composants (code, design, marque) sont la propriété exclusive de Lamu. Toute reproduction, distribution ou utilisation commerciale est interdite sans autorisation écrite.</p>
      </Section>
      <Section title="5. Limitation de responsabilité">
        <p>Lamuka est fourni "tel quel". Nous ne garantissons pas une disponibilité ininterrompue et déclinons toute responsabilité pour les pertes de données ou dommages indirects résultant de l'utilisation de l'application.</p>
      </Section>
      <Section title="6. Modification des conditions">
        <p>Nous nous réservons le droit de modifier ces conditions à tout moment. Les changements significatifs seront notifiés via le site web. La poursuite de l'utilisation après modification vaut acceptation.</p>
      </Section>
      <Section title="7. Contact">
        <p>Pour toute question : <a href="mailto:support@lamuka.com" style={{ color: '#818cf8' }}>support@lamuka.com</a></p>
      </Section>
    </>
  )
}

function PrivacyContent() {
  return (
    <>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 32 }}>Dernière mise à jour : avril 2026</p>
      <Section title="1. Données collectées">
        <p>Nous collectons uniquement les données strictement nécessaires :</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#fff' }}>Lors de l'achat</strong> : nom, adresse email, numéro Mobile Money (pour le traitement du paiement).</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#fff' }}>Utilisation de l'app</strong> : Lamuka fonctionne localement. Vos conversations sont stockées sur votre appareil (SQLite local), nous n'y avons pas accès.</li>
          <li><strong style={{ color: '#fff' }}>Statistiques anonymes</strong> : comptage de démarrages de l'app à des fins de support (sans données personnelles).</li>
        </ul>
      </Section>
      <Section title="2. Utilisation des données">
        <p>Vos données personnelles (nom, email) sont utilisées uniquement pour :</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li style={{ marginBottom: 6 }}>Générer et envoyer votre clé de licence.</li>
          <li style={{ marginBottom: 6 }}>Vous permettre de récupérer votre licence en cas de perte.</li>
          <li>Vous contacter en cas de problème technique lié à votre compte.</li>
        </ul>
        <p style={{ marginTop: 8 }}>Nous ne vendons, n'échangeons ni ne partageons vos données avec des tiers.</p>
      </Section>
      <Section title="3. Conservation des données">
        <p>Vos données de licence sont conservées tant que votre licence est active. Vous pouvez demander la suppression de vos données à tout moment en contactant <a href="mailto:support@lamuka.com" style={{ color: '#818cf8' }}>support@lamuka.com</a>. La suppression entraîne la désactivation de votre licence.</p>
      </Section>
      <Section title="4. Sécurité">
        <p>Vos données sont stockées dans une base de données sécurisée. Les clés de licence sont générées cryptographiquement. Nous ne stockons pas vos informations de paiement (Mobile Money) — celles-ci sont traitées directement par Airtel Money.</p>
      </Section>
      <Section title="5. Cookies">
        <p>Le site web Lamuka n'utilise pas de cookies de tracking. Aucune donnée analytique tierce (Google Analytics, etc.) n'est collectée.</p>
      </Section>
      <Section title="6. Vos droits">
        <p>Conformément aux lois sur la protection des données applicables, vous avez le droit d'accéder à vos données, de les corriger ou de les supprimer. Contactez-nous à <a href="mailto:support@lamuka.com" style={{ color: '#818cf8' }}>support@lamuka.com</a>.</p>
      </Section>
    </>
  )
}
