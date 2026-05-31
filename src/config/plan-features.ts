/** Single source of truth for plan feature identifiers.
 *  The same keys are used in:
 *  - The MySQL `plans.features` JSON column
 *  - The backend `/api/license/validate` response
 *  - The Rust `ValidateResponse.features` / offline fallback
 *  - `hasPlanFeature(key)` checks throughout the app
 *  - The admin dashboard checkbox grid
 */
export const PLAN_FEATURES = [
  // ── Chat & IA ──
  { key: "chat",              label: "Chat IA conversationnel",            group: "Chat & IA" },
  { key: "multi_models",      label: "Choix du modèle IA",                group: "Chat & IA" },
  { key: "premium_models",    label: "Modèles premium (GPT-4o, Claude, Gemini Pro)", group: "Chat & IA" },
  { key: "system_prompts",    label: "Prompts système personnalisés",      group: "Chat & IA" },
  { key: "file_attachments",  label: "Pièces jointes (fichiers)",          group: "Chat & IA" },
  { key: "streaming",         label: "Réponses en streaming",              group: "Chat & IA" },

  // ── Base de connaissances ──
  { key: "knowledge_base",    label: "Base de connaissances (KB)",          group: "Connaissances" },
  { key: "kb_upload",         label: "Upload de documents (PDF, texte)",    group: "Connaissances" },
  { key: "kb_url",            label: "Indexation par URL",                  group: "Connaissances" },
  { key: "kb_crawl",          label: "Crawl de site web",                   group: "Connaissances" },
  { key: "kb_gaps",           label: "Détection des lacunes KB (IA)",       group: "Connaissances" },
  { key: "auto_sync",         label: "Auto-sync des sources KB",            group: "Connaissances" },

  // ── Intégrations ──
  { key: "integrations",      label: "Intégrations (Drive, Slack, GitHub...)", group: "Intégrations" },
  { key: "notion",            label: "Intégration Notion",                  group: "Intégrations" },
  { key: "confluence",        label: "Intégration Confluence",              group: "Intégrations" },
  { key: "shopify",           label: "Intégration Shopify",                 group: "Intégrations" },

  // ── Helpdesk & Support ──
  { key: "helpdesk",          label: "Helpdesk IA (tickets)",               group: "Helpdesk" },
  { key: "helpdesk_auto_reply", label: "Réponses automatiques aux tickets", group: "Helpdesk" },
  { key: "helpdesk_channels", label: "Canaux de réception (email, widget, API)", group: "Helpdesk" },
  { key: "escalation",        label: "Règles d'escalade",                  group: "Helpdesk" },
  { key: "csat",              label: "Enquêtes CSAT / NPS",                group: "Helpdesk" },
  { key: "sla",               label: "Suivi SLA",                           group: "Helpdesk" },
  { key: "workflows",         label: "Workflows automatisés",               group: "Helpdesk" },

  // ── Widget & Agents ──
  { key: "widget",            label: "Widget chatbot embeddable",           group: "Widget" },
  { key: "widget_agents",     label: "Agents IA personnalisés (widget)",    group: "Widget" },
  { key: "widget_customization", label: "Personnalisation du widget",       group: "Widget" },

  // ── App Desktop (Tauri) ──
  { key: "drag_window",       label: "Déplacer la fenêtre overlay",        group: "App Desktop" },
  { key: "screenshot",        label: "Capture d'écran automatique",        group: "App Desktop" },
  { key: "audio_capture",     label: "Capture audio / microphone",          group: "App Desktop" },
  { key: "meeting_mode",      label: "Mode réunion (meeting mode)",         group: "App Desktop" },
  { key: "meeting_summary",   label: "Résumé de réunion IA",               group: "App Desktop" },
  { key: "coaching_tips",     label: "Conseils de coaching temps réel",     group: "App Desktop" },
  { key: "playbook",          label: "Playbook / script de réunion",        group: "App Desktop" },
  { key: "tts",               label: "Synthèse vocale (TTS)",               group: "App Desktop" },
  { key: "interview_prep",    label: "Simulateur d'entretien",              group: "App Desktop" },
  { key: "cv_generator",      label: "Générateur CV & lettre motivation",   group: "App Desktop" },
  { key: "email_vocal",       label: "Email par commande vocale",            group: "App Desktop" },

  // ── Analytics & Avancé ──
  { key: "analytics",         label: "Analytiques & statistiques",          group: "Analytics" },
  { key: "custom_dashboards", label: "Dashboards personnalisés",            group: "Analytics" },
  { key: "ab_tests",          label: "A/B Tests de prompts",                group: "Analytics" },
  { key: "simulation",        label: "Simulation de conversations",         group: "Analytics" },
  { key: "ai_actions",        label: "Actions IA automatisées",             group: "Analytics" },

  // ── Équipe ──
  { key: "team",              label: "Gestion d'équipe (multi-utilisateurs)", group: "Équipe" },
  { key: "team_roles",        label: "Rôles & permissions",                 group: "Équipe" },
  { key: "contact_support",   label: "Support prioritaire",                  group: "Équipe" },
  { key: "api_access",        label: "Accès API publique",                   group: "Équipe" },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[number]["key"];
