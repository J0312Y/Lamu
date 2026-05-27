# Lamu — Instructions pour Claude Code

## Qu'est-ce que Lamu ?
Assistant IA de réunion en temps réel (alternative open-source à Cluely), app desktop **Tauri v2 + React + TypeScript + Rust**.

## Stack technique
- **Frontend :** React + TypeScript, Vite, shadcn/ui, TailwindCSS
- **Desktop :** Tauri v2 (backend Rust)
- **DB :** SQLite via `tauri-plugin-sql`
- **Audio :** WASAPI (Windows) / CoreAudio (macOS) / PulseAudio (Linux)
- **Backend serveur :** Node.js/Express → `backend/server.js`

## Arborescence clé
```
src/
  hooks/
    useSystemAudio.ts      ← état central de l'overlay (micro, VAD, AI, transcript)
    useAgentRuntime.ts     ← persistance des étapes pipeline agent
    useCompletion.ts       ← completion IA générique
  pages/
    app/                   ← overlay principal (fenêtre flottante)
      components/speech/   ← tous les composants de l'overlay
        index.tsx           ← composant principal overlay
        SettingsPanel.tsx
        ResultsSection.tsx
        RecordingPanel.tsx
        ValidationModal.tsx ← validation humaine avant appel IA
        EmailDraftModal.tsx
        PlaybookModal.tsx   ← playbook/script chargé en contexte IA
        CoachingTip.tsx     ← conseil IA généré pendant la réunion
        CalendarWidget.tsx  ← agenda affiché dans l'overlay
        MeetingSummaryModal.tsx
        ResumeRunBanner.tsx
    email/                 ← page envoi email vocal
    interview/             ← simulateur d'entretien (questions + scoring IA)
    sessions/              ← historique des réunions + sessions d'entretien
    cv-generator/          ← génération CV/lettre de motivation par IA
    knowledge/             ← base de connaissances RAG
    activity/              ← statistiques d'utilisation
  types/
    agent-runtime.ts       ← AgentRun, AgentStep, AgentRunCheckpoint
  config/
    constants.ts           ← ASSISTANT_MODES (Interview, Coding, Sales, General)

src-tauri/src/
  lib.rs                   ← AudioState, commandes Tauri enregistrées
  capture.rs               ← capture audio système (WASAPI)
  detection.rs             ← détection apps de réunion (Zoom, Teams, etc.)
  window.rs                ← WDA_EXCLUDEFROMCAPTURE (invisibilité screen share)
  speaker/
    mic.rs                 ← MicStream CPAL, commandes start/stop_mic_capture
  email/
    smtp.rs                ← envoi SMTP (lettre crate, TLS/STARTTLS)
    commands.rs
  contacts/
    outlook.rs             ← sync Outlook via PowerShell COM
    db.rs                  ← SQLite contacts + fuzzy match
  knowledge/
    ingest.rs              ← chunking sémantique (CHUNK_TARGET=1200)
    search.rs              ← re-ranking hybride (0.75×cosine + 0.25×keyword)

backend/
  server.js                ← API Express, /api/activity, activity.json
```

## Features implémentées (état 2026-05-25)

### Overlay / Réunion
1. Capture audio système (WASAPI) + micro (CPAL) avec VAD
2. Meeting mode : auto-start VAD, auto-restart après réponse IA
3. Transcript de réunion cumulé passé en contexte IA
4. Screenshot auto au démarrage de la parole → passé à l'IA
5. Modes spécialisés : Interview, Coding, Sales, General (`ASSISTANT_MODES`)
6. TTS : bouton "Speak" sur chaque réponse IA (`window.speechSynthesis`)
7. Auto-speak en meeting mode (toggle)
8. Clipboard integration : bouton "Paste" → contexte IA unique usage
9. Détection auto des apps de réunion (Zoom, Teams, OBS…) → polling 15s
10. Invisibilité screen share : `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
11. Raccourci global micro : `Ctrl+Shift+.` (toggle_mic)
12. Raccourci copie réponse : `Ctrl+Shift+C`
13. Live listening indicator : "Listening… X.Xs" + point vert pulsant
14. Auto-scroll vers la dernière réponse
15. Export conversation en Markdown (.md)
16. Context window cap : 20 derniers messages max
17. Playbook modal : script/notes chargé en contexte IA pendant la réunion
18. Coaching tip : conseil IA généré à la demande depuis le transcript
19. Meeting summary modal : résumé IA de la réunion, sauvegardé en KB
20. Calendar widget : agenda affiché dans l'overlay

### Robustesse pipeline
21. **State Runtime** (`useAgentRuntime.ts`) : chaque étape STT→prompt→IA→save persistée en `localStorage` sous `lamu_agent_runs`. Checkpoint partiel toutes les 15 chunks. `ResumeRunBanner` propose de reprendre au démarrage.
22. **Human-in-the-loop** (`ValidationModal.tsx`) : pause pipeline après STT, avant IA. Toggle "Validation avant IA" dans Settings. Shortcut `Ctrl+Enter` pour approuver.

### Pages dashboard
23. **Email vocal** (`/email`) : détection marker `LAMU_EMAIL:{...}` dans réponse IA, modal draft avec autocomplete contacts, countdown 3s auto-send, config SMTP (mail.lamuka-tech.com:587 STARTTLS)
24. **Interview Prep** (`/interview-prep`) : simulateur entretien, types behavioral/technical/system-design/coding, scoring IA par question (clarity/relevance/structure 0-10)
25. **Sessions** (`/sessions`) : historique réunions (docs KB `Meeting_*.md`) + sessions entretien (localStorage)
26. **CV Generator** (`/cv-generator`) : prompt → CV summary + lettre de motivation, export Markdown, bilingue fr/en
27. **Knowledge Base** (`/knowledge`) : RAG avec chunking sémantique + re-ranking hybride, debug panel avec score bars
28. **Activity** (`/activity`) : stats requêtes/tokens par jour

### Backend
- `GET /api/activity` → `{ success, data: [{date, requests}], total_tokens_used }`
- `POST /api/activity` → persiste par jour dans `activity.json`
- `debug_log` Tauri command → `%APPDATA%/com.lamuka.lamu/debug.log`

## Conventions à respecter
- Composants UI : shadcn/ui uniquement (Button, Badge, Dialog, ScrollArea, etc.)
- Icônes : lucide-react uniquement
- Styles : TailwindCSS, pas de CSS custom sauf si vraiment nécessaire
- Pas de `console.log` en prod, utiliser `debug_log` Tauri pour le debug côté Rust
- Les toggles de features passent par `useSettings.ts` et sont persistés
- Les commandes Tauri sont enregistrées dans `lib.rs` (handler `generate_handler!`)

## État actuel / Ce sur quoi on travaille
_(mettre à jour à chaque fin de session)_

Dernière session : 2026-05-25

### Système de licences — identité email + anti-réutilisation (complété 2026-05-25)

**Architecture :** la licence est liée à l'**email client** (identité), pas à la machine. Quand un client change d'ordinateur, il entre son email et sa licence se rebind automatiquement sur la nouvelle machine. La clé de licence n'est plus nécessaire après le premier achat.

**Fixes anti-réutilisation :**
1. `activate.rs` `validate_license_api` — envoie `instance_id` au backend → machine-binding vérifié à chaque démarrage
2. `activate.rs` fallback Elembotech — appelle d'abord `/api/license/activate` avec `instance_id` → ne bypass plus le check machine-binding
3. `backend/server.js` endpoints `activate` + `validate` — marquent `is_active = 0` quand `expires_at` dépassé → licence expirée définitivement verrouillée en DB

**Nouvelles features :**
4. `backend/server.js` `/api/license/login` — client entre email + instance_id → trouve sa licence active, rebind automatiquement sur la nouvelle machine, retourne la licence
5. `backend/server.js` `/api/license/transfer` (admin, requireAuth) — support peut manuellement délier une licence de sa machine (clear ou set `bound_instance_id`)
6. `activate.rs` `login_with_email(email, user_name?)` — commande Tauri qui appelle `/api/license/login` et sauvegarde le résultat en secure storage
7. `lib.rs` — `login_with_email` enregistrée dans `generate_handler!`
8. `PluelyApiSetup.tsx` — onglet switcher "Clé de licence" | "Connexion email". L'onglet email a deux champs (email + nom optionnel) et appelle `login_with_email`.
