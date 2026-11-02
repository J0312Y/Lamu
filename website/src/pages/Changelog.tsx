import { motion } from 'framer-motion'
import { Clock, Zap, Shield, Bug, Star } from 'lucide-react'

const releases = [
  {
    version: '0.2.1',
    date: 'Juin 2026',
    tag: 'Dernière',
    tagColor: '#4ade80',
    tagBg: 'rgba(74,222,128,0.1)',
    changes: [
      { type: 'new', text: 'Réduction de bruit spectrale (Rust) — filtrage en temps réel dans le pipeline audio avant STT' },
      { type: 'new', text: 'Auto-join calendrier — démarre automatiquement le meeting mode au début de l\'événement Google Calendar' },
      { type: 'new', text: 'Serveur MCP (Model Context Protocol) — expose la KB, meetings et transcripts aux agents IA externes' },
      { type: 'new', text: 'Conformité SOC 2 / HIPAA — audit logging, rétention configurable, consentement, détection PHI, chiffrement AES-256' },
      { type: 'new', text: 'Normalisation audio (accent) — lissage du pitch, normalisation du gain adaptatif par segment' },
      { type: 'new', text: 'Actions items extraits automatiquement du résumé de réunion avec assignee, deadline et priorité' },
      { type: 'new', text: 'Analyse de sentiment en temps réel pendant les réunions (positif/neutre/négatif + tendance)' },
      { type: 'new', text: 'Soundbites — marquer et exporter les moments clés du transcript' },
      { type: 'new', text: 'Templates de réunions (standup, 1-on-1, retro, sales, interview...) avec 20 modèles préconfigurés' },
      { type: 'new', text: 'Talk-time analytics — répartition du temps de parole (moi vs participants vs silence)' },
      { type: 'new', text: 'Webhooks Zapier-compatible — déclenchement automatique sur événements de réunion' },
      { type: 'new', text: 'Pre-meeting brief IA — analyse KB + participants avant la réunion' },
      { type: 'new', text: 'Recherche cross-meeting dans l\'historique des sessions' },
      { type: 'new', text: 'Support de 32 langues STT (auto-detect, swahili, lingala, etc.)' },
      { type: 'new', text: 'Sync CRM — export automatique vers Salesforce et HubSpot' },
      { type: 'new', text: 'Constructeur d\'agenda avec estimation de durée et suivi de progression' },
      { type: 'improve', text: 'Pipeline audio enrichi : noise gate spectral + pitch smoothing + gain normalization avant émission' },
      { type: 'improve', text: 'Résumé de réunion avec onglets (Résumé / Actions / Analytics)' },
      { type: 'security', text: 'Purge automatique des données selon politique de rétention configurable' },
      { type: 'security', text: 'Détection et rédaction automatique de PHI (SSN, emails, numéros de téléphone)' },
    ],
  },
  {
    version: '0.2.0',
    date: 'Mai 2026',
    changes: [
      { type: 'new', text: 'Application web Lamu (webapp) — accédez à Lamu depuis votre navigateur' },
      { type: 'new', text: 'Système de licences par email — connexion sans clé, rebind automatique sur nouveau PC' },
      { type: 'new', text: 'Authentification OTP par email pour la webapp' },
      { type: 'new', text: 'Plans et tarification configurables depuis l\'admin SaaS' },
      { type: 'new', text: 'Essai gratuit avec 20 messages — aucune carte requise' },
      { type: 'new', text: 'Helpdesk IA — agents configurables avec seuil de confiance et escalade' },
      { type: 'new', text: 'Système de tickets avec suivi du sentiment et résolution automatique' },
      { type: 'new', text: 'Widget chat intégrable sur site externe (snippet JS)' },
      { type: 'new', text: 'Workflows d\'escalade conditionnels (mot-clé, sentiment, nombre de réponses)' },
      { type: 'new', text: 'Déploiement multi-canal (website, Slack, Zendesk, email, WhatsApp, API)' },
      { type: 'new', text: 'Analytiques avancées — sentiments, sujets, taux de résolution auto' },
      { type: 'new', text: 'Gestion d\'équipe avec rôles (membre, éditeur, admin)' },
      { type: 'new', text: 'Intégrations externes (Google Drive, Notion, Slack, Zendesk, HubSpot)' },
      { type: 'new', text: 'Simulation et tests — validez les réponses IA contre des réponses attendues' },
      { type: 'new', text: 'Détection des lacunes dans la base de connaissances (KB Gaps)' },
      { type: 'new', text: 'Tableau de bord avec statistiques d\'utilisation et historique de questions' },
      { type: 'new', text: 'Recherche sémantique dans la base de connaissances depuis la webapp' },
      { type: 'new', text: 'Partage de conversations par lien public' },
      { type: 'improve', text: 'Interface entièrement traduite en français' },
      { type: 'improve', text: 'Thème clair et sombre avec basculement instantané' },
      { type: 'improve', text: 'Onboarding interactif avec suivi de progression en 3 étapes' },
      { type: 'improve', text: 'Synchronisation des conversations sur le serveur avec sauvegarde locale' },
      { type: 'security', text: 'Anti-réutilisation de licence — binding machine + expiration en base de données' },
      { type: 'security', text: 'Endpoint admin protégé par clé API pour le transfert de licences' },
    ],
  },
  {
    version: '0.1.9',
    date: 'Avril 2026',
    changes: [
      { type: 'new', text: 'Capture audio système avec raccourci Ctrl+Shift+M' },
      { type: 'new', text: 'Support du fournisseur STT ElevenLabs' },
      { type: 'new', text: 'Intégrations STT Speechmatics et Rev.ai' },
      { type: 'new', text: 'Intégration bases de données MySQL et PostgreSQL' },
      { type: 'new', text: "Email vocal avec approbation et countdown" },
      { type: 'new', text: "Simulateur d'entretien avec scoring IA" },
      { type: 'new', text: 'Générateur de CV et lettre de motivation' },
      { type: 'new', text: 'Résumé de réunion IA automatique' },
      { type: 'new', text: 'Coaching tips en temps réel' },
      { type: 'new', text: 'Widget calendrier dans l\'overlay' },
      { type: 'improve', text: "Invisibilité de l'overlay significativement améliorée sur Windows 11" },
      { type: 'improve', text: 'Temps de réponse IA optimisé sans perte de contexte' },
      { type: 'fix', text: "Correction de la sélection de zone de capture d'écran sur multi-écrans" },
      { type: 'fix', text: 'Correction du conflit de raccourcis avec certaines applications sur macOS' },
    ],
  },
  {
    version: '0.1.8',
    date: 'Mars 2026',
    changes: [
      { type: 'new', text: "Fenêtre overlay déplaçable avec persistance de position" },
      { type: 'new', text: "Mode capture d'écran automatique avec minuteur et prompt personnalisé" },
      { type: 'new', text: 'Support des fournisseurs STT Groq et Deepgram' },
      { type: 'improve', text: 'Taille du binaire réduite de 12MB à 10MB' },
      { type: 'improve', text: "Latence de l'entrée vocale améliorée de 40%" },
      { type: 'fix', text: "Correction de la fenêtre restant au premier plan après un jeu en plein écran sur Windows" },
    ],
  },
  {
    version: '0.1.7',
    date: 'Février 2026',
    changes: [
      { type: 'new', text: 'Support Azure Speech-to-Text et IBM Watson STT' },
      { type: 'new', text: 'API développeur compatible OpenAI' },
      { type: 'new', text: 'Support des modèles Google Gemini et Mistral' },
      { type: 'improve', text: 'Refonte du tableau de bord avec paramètres plus clairs' },
      { type: 'fix', text: "Correction du verrou de base de données SQLite lors d'envois rapides de messages" },
      { type: 'fix', text: 'Correction du scintillement de transparence sur macOS Sequoia' },
    ],
  },
  {
    version: '0.1.6',
    date: 'Janvier 2026',
    changes: [
      { type: 'new', text: "Système d'activation de licence Dev Pro" },
      { type: 'new', text: "Pièces jointes multi-captures d'écran dans un seul message" },
      { type: 'new', text: 'Prompt système personnalisé par conversation' },
      { type: 'improve', text: 'Temps de démarrage réduit à moins de 100ms' },
      { type: 'fix', text: "Correction de l'overlay ne se masquant pas avec Ctrl+\\ sur certaines distributions Linux" },
    ],
  },
  {
    version: '0.1.5',
    date: 'Décembre 2025',
    changes: [
      { type: 'new', text: 'Support Linux initial (Debian, RPM, AppImage)' },
      { type: 'new', text: 'Entrée vocale OpenAI Whisper et ElevenLabs' },
      { type: 'new', text: "Historique de conversations SQLite local" },
      { type: 'improve', text: 'Installeur Windows (.msi et .exe)' },
      { type: 'fix', text: "Correction du crash sur Windows en l'absence de périphérique audio" },
    ],
  },
]

const typeConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  new:     { label: 'Nouveau',   color: '#4ade80', icon: Star },
  improve: { label: 'Amélioré',  color: '#818cf8', icon: Zap },
  fix:     { label: 'Corrigé',   color: '#fbbf24', icon: Bug },
  security:{ label: 'Sécurité',  color: '#f87171', icon: Shield },
}

export default function Changelog() {
  return (
    <div style={{ paddingTop: 60 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: 'radial-gradient(ellipse,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <motion.div initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6 }} style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 16px', marginBottom: 28 }}>
            <Clock size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#818cf8', textTransform: 'uppercase' }}>Changelog</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, letterSpacing: -2, marginBottom: 16, lineHeight: 1.1 }}>
            Quoi de <span className="gradient-text">Neuf</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Tous les changements notables de Lamu, version par version.
          </p>
        </motion.div>
      </section>

      {/* Releases */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
            {releases.map((release, i) => (
              <motion.div
                key={release.version}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                style={{ paddingLeft: 32, position: 'relative' }}
              >
                {/* Dot */}
                <div style={{ position: 'absolute', left: -5, top: 6, width: 10, height: 10, borderRadius: '50%', background: release.tag ? release.tagColor : 'rgba(255,255,255,0.2)', border: `2px solid ${release.tag ? release.tagColor : 'rgba(255,255,255,0.1)'}` }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>v{release.version}</h2>
                  {release.tag && (
                    <span style={{ background: release.tagBg, border: `1px solid ${release.tagColor}40`, borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: release.tagColor }}>
                      {release.tag}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{release.date}</span>
                </div>

                {/* Changes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {release.changes.map((change, j) => {
                    const cfg = typeConfig[change.type] || typeConfig.fix
                    const Icon = cfg.icon
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 1 }}>
                          <Icon size={13} color={cfg.color} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, letterSpacing: 0.5, minWidth: 52 }}>{cfg.label}</span>
                        </div>
                        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{change.text}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
