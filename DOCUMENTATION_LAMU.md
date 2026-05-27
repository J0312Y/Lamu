# Lamu — Guide d'utilisation complet (de A à Z)

> Assistant IA de réunion en temps réel. Desktop (Windows, macOS, Linux) + Web App navigateur.

---

## Table des matières

1. [Installer Lamu](#1-installer-lamu)
2. [Premier lancement — Assistant d'onboarding](#2-premier-lancement--assistant-donboarding)
3. [Configurer un fournisseur IA](#3-configurer-un-fournisseur-ia)
4. [Configurer la transcription vocale (STT)](#4-configurer-la-transcription-vocale-stt)
5. [Activer votre licence](#5-activer-votre-licence)
6. [Naviguer dans l'application](#6-naviguer-dans-lapplication)
7. [L'overlay — utilisation de base](#7-loverlay--utilisation-de-base)
8. [Utiliser le micro (enregistrement vocal)](#8-utiliser-le-micro-enregistrement-vocal)
9. [Capture audio système (écouter une réunion)](#9-capture-audio-système-écouter-une-réunion)
10. [Mode réunion (Meeting Mode)](#10-mode-réunion-meeting-mode)
11. [Validation humaine (Human-in-the-Loop)](#11-validation-humaine-human-in-the-loop)
12. [Playbook (script de réunion)](#12-playbook-script-de-réunion)
13. [Coaching Tip (conseil IA en direct)](#13-coaching-tip-conseil-ia-en-direct)
14. [Résumé de réunion (Meeting Summary)](#14-résumé-de-réunion-meeting-summary)
15. [Screenshot & capture d'écran](#15-screenshot--capture-décran)
16. [Coller du contenu (Clipboard Paste)](#16-coller-du-contenu-clipboard-paste)
17. [Exporter la conversation](#17-exporter-la-conversation)
18. [Modes d'assistant (General, Interview, Coding, Sales)](#18-modes-dassistant)
19. [Base de connaissances — ajouter des documents](#19-base-de-connaissances--ajouter-des-documents)
20. [Base de connaissances — recherche sémantique](#20-base-de-connaissances--recherche-sémantique)
21. [Base de connaissances — connecter des intégrations](#21-base-de-connaissances--connecter-des-intégrations)
22. [Base de connaissances — agent SQL (bases de données)](#22-base-de-connaissances--agent-sql)
23. [Base de connaissances — dossiers surveillés](#23-base-de-connaissances--dossiers-surveillés)
24. [Base de connaissances — webhooks](#24-base-de-connaissances--webhooks)
25. [Base de connaissances — paramètres d'embedding](#25-base-de-connaissances--paramètres-dembedding)
26. [Email vocal — configuration SMTP](#26-email-vocal--configuration-smtp)
27. [Email vocal — envoyer un email par la voix](#27-email-vocal--envoyer-un-email-par-la-voix)
28. [Contacts & synchronisation Outlook](#28-contacts--synchronisation-outlook)
29. [Interview Prep — préparer un entretien](#29-interview-prep--préparer-un-entretien)
30. [CV & Lettre de motivation](#30-cv--lettre-de-motivation)
31. [Historique des sessions](#31-historique-des-sessions)
32. [Calendrier Google Calendar](#32-calendrier-google-calendar)
33. [System Prompts (prompts personnalisés)](#33-system-prompts-prompts-personnalisés)
34. [Réglages généraux](#34-réglages-généraux)
35. [Raccourcis clavier](#35-raccourcis-clavier)
36. [Historique des conversations (Chats)](#36-historique-des-conversations)
37. [Activité & statistiques](#37-activité--statistiques)
38. [Web App — s'inscrire et se connecter](#38-web-app--sincrire-et-se-connecter)
39. [Web App — utiliser le chat IA](#39-web-app--utiliser-le-chat-ia)
40. [Web App — Knowledge Base](#40-web-app--knowledge-base)
41. [Web App — Free Trial (essai gratuit)](#41-web-app--free-trial)
42. [Acheter une licence (page Pricing)](#42-acheter-une-licence)
43. [Récupérer une licence perdue](#43-récupérer-une-licence-perdue)
44. [Dashboard admin](#44-dashboard-admin)
45. [Sécurité & invisibilité screen share](#45-sécurité--invisibilité-screen-share)
46. [Résolution de problèmes](#46-résolution-de-problèmes)
47. [Raccourcis clavier — tableau complet](#47-raccourcis-clavier--tableau-complet)

---

## 1. Installer Lamu

### Étapes :

1. Ouvrir votre navigateur et aller sur le site web Lamu
2. Cliquer sur **"Downloads"** dans le menu du site
3. Choisir votre plateforme :
   - **Windows** → télécharger le fichier `.exe`
   - **macOS** → télécharger le fichier `.dmg`
   - **Linux** → télécharger le fichier `.AppImage`
4. Lancer l'installateur :
   - **Windows** : double-cliquer sur le `.exe` → suivre l'assistant → cliquer **"Installer"**
   - **macOS** : ouvrir le `.dmg` → glisser Lamu dans le dossier Applications
   - **Linux** : rendre le `.AppImage` exécutable (`chmod +x`) → double-cliquer
5. Lamu s'ouvre automatiquement après l'installation

---

## 2. Premier lancement — Assistant d'onboarding

Au premier lancement, un assistant de configuration s'affiche automatiquement.

### Étapes :

1. **Étape 1 — Votre nom** :
   - Le champ est pré-rempli avec votre nom d'utilisateur système
   - Modifiez-le si besoin
   - Cliquer **"Suivant"**

2. **Étape 2 — Bienvenue** :
   - Écran "Welcome to Lamu!" avec icône casque
   - Cliquer **"Suivant"**

3. **Étape 3 — Clé API** :
   - Écran "Configure your API key"
   - Cliquer **"Ouvrir Dev Space"** → cela ouvre la page de configuration IA (voir section 3)
   - Ou cliquer **"Suivant"** pour configurer plus tard

4. **Étape 4 — Permissions audio** :
   - Accepter les permissions micro si demandé par le système
   - Cliquer **"Suivant"**

5. **Étape 5 — Calendrier** :
   - Option de connecter Google Calendar (facultatif)
   - Cliquer **"Suivant"**

6. **Étape 6 — Interview Prep** :
   - Présentation du simulateur d'entretien
   - Cliquer **"Interview Prep"** pour essayer ou **"Suivant"** pour passer

7. **Étape 7 — Prêt !** :
   - Écran "You're ready!"
   - Cliquer **"Terminer"**

---

## 3. Configurer un fournisseur IA

Sans fournisseur IA, Lamu ne peut pas générer de réponses. Voici comment en configurer un.

### Étapes :

1. Appuyer sur `Ctrl+Shift+D` (Windows/Linux) ou `Cmd+Shift+D` (macOS) pour ouvrir le **Dev Space**
   - Ou cliquer sur **"Dev Space"** dans la barre latérale du dashboard
2. Vous êtes dans la section **"AI Providers"**
3. Cliquer sur le fournisseur souhaité dans la liste :
   - **OpenAI** — GPT-4o, GPT-4o-mini, o1
   - **Anthropic (Claude)** — Claude Opus 4, Sonnet 4, Haiku
   - **Google (Gemini)** — Gemini 2.0 Flash, Gemini Pro
   - **Grok (xAI)** — Grok-2, Grok-3
   - **Mistral** — Mistral Large, Medium
   - **Cohere** — Command R+
   - **Groq** — LLaMA 3, Mixtral (ultra-rapide)
   - **Ollama** — modèles locaux (gratuit, tourne sur votre machine)
4. Entrer votre **clé API** dans le champ qui s'affiche
   - Pour obtenir une clé : aller sur le site du fournisseur (ex: platform.openai.com) → créer un compte → copier la clé API
5. Sélectionner le **modèle** souhaité dans la liste déroulante
6. (Optionnel) Activer le **Streaming** pour voir les réponses s'afficher mot par mot
7. Cliquer **"Save"**
8. Un indicateur vert confirme que la connexion fonctionne

### Ajouter un fournisseur personnalisé (Custom) :

1. Dans le Dev Space, cliquer **"Add Custom Provider"**
2. Coller la commande **curl** de l'API (trouvable dans la doc du fournisseur)
3. Utiliser les variables :
   - `{TEXT}` → sera remplacé par votre message
   - `{SYSTEM_PROMPT}` → sera remplacé par le prompt système
   - `{IMAGE}` → sera remplacé par l'image en base64
   - `{API_KEY}` → sera remplacé par votre clé
4. Cliquer **"Save"**

---

## 4. Configurer la transcription vocale (STT)

Le STT (Speech-to-Text) convertit votre voix en texte. Nécessaire pour utiliser le micro.

### Étapes :

1. Ouvrir le **Dev Space** (`Ctrl+Shift+D`)
2. Aller dans la section **"STT Providers"**
3. Choisir votre fournisseur STT :
   - **Whisper (OpenAI)** — haute précision, multilingue (recommandé)
   - **Groq** — ultra-rapide, gratuit pour commencer
   - **Deepgram** — temps réel, faible latence
   - **ElevenLabs** — transcription + voix
   - **Google Speech** — Google Cloud
   - **Azure Speech** — Microsoft
   - **Speechmatics** — haute précision
   - **Rev.ai** — professionnel
   - **IBM Watson** — Watson STT
4. Entrer votre **clé API** STT
5. (Optionnel) Sélectionner la **langue** de transcription
6. Cliquer **"Save"**

---

## 5. Activer votre licence

### Méthode A — Avec une clé de licence :

1. Ouvrir le **Dashboard** (page d'accueil de l'app)
2. Trouver la section **licence** → cliquer **"Get License"** si affiché
3. Dans le champ de licence, taper ou coller votre **clé de licence** (reçue par email après achat)
4. Cliquer **"Activer"**
5. Un message de confirmation s'affiche → la licence est active

### Méthode B — Connexion par email :

1. Sur l'écran de licence, cliquer l'onglet **"Connexion email"**
2. Dans le champ email, taper l'**email utilisé lors de l'achat**
3. (Optionnel) Dans le champ nom, taper votre **nom**
4. Cliquer **"Se connecter"**
5. Si une licence existe pour cet email → elle est automatiquement activée sur votre machine

### Changement d'ordinateur :

1. Installer Lamu sur le nouvel ordinateur
2. Utiliser la **Méthode B** (connexion par email)
3. Votre licence se transfère automatiquement — l'ancien ordinateur est délié

---

## 6. Naviguer dans l'application

L'application a deux fenêtres principales :

### La fenêtre overlay (flottante)
- C'est la fenêtre qui reste toujours visible par-dessus vos applications
- Elle contient : le micro, les réponses IA, le chat
- Toggle avec `Ctrl+\` (Windows/Linux) ou `Cmd+\` (macOS)

### Le Dashboard (Dev Space)
- C'est la fenêtre complète avec toutes les fonctionnalités
- Ouvrir avec `Ctrl+Shift+D` ou le bouton dans l'overlay
- **Barre latérale** (à gauche) avec les pages :
  - **Dashboard** — page d'accueil, stats, licence
  - **Knowledge Base** — base de connaissances
  - **Interview Prep** — simulateur d'entretien
  - **Email** — configuration email vocal
  - **CV Generator** — générateur CV / lettre de motivation
  - **Sessions** — historique des réunions et entretiens
  - **System Prompts** — prompts personnalisés
  - **Chats** — historique des conversations
  - **Activity** — statistiques d'utilisation
  - **Settings** — réglages généraux
  - **Dev Space** — configuration fournisseurs IA/STT
  - **Shortcuts** — raccourcis clavier
  - **Audio** — réglages audio
  - **Screenshot** — réglages capture d'écran
  - **Responses** — réglages des réponses IA

---

## 7. L'overlay — utilisation de base

### Poser une question à l'IA (mode texte) :

1. Cliquer sur l'**overlay** pour le mettre au premier plan (ou `Ctrl+\`)
2. L'overlay affiche la zone de conversation
3. Il y a deux façons d'interagir :
   - **Par la voix** : cliquer le bouton **micro** (voir section 8)
   - **Par écrit** : utiliser les **Quick Actions** (boutons en bas de l'overlay)

### Lire la réponse IA :

- La réponse s'affiche dans la **zone de résultats** au centre de l'overlay
- Si le streaming est activé, les mots apparaissent un par un
- Sous chaque réponse, deux boutons :
  - **"Copy"** → copie la réponse dans le presse-papiers (aussi avec `Ctrl+Shift+C`)
  - **"Speak"** → lit la réponse à voix haute (Text-to-Speech du navigateur)

### Démarrer une nouvelle conversation :

1. Cliquer le bouton **"New"** en haut à droite de l'overlay
2. L'historique de la conversation est effacé
3. Lamu est prêt pour un nouveau sujet

### Déplacer la fenêtre overlay :

- `Ctrl+↑` / `Ctrl+↓` / `Ctrl+←` / `Ctrl+→` pour déplacer la fenêtre
- Ou glisser-déposer la fenêtre avec la souris

---

## 8. Utiliser le micro (enregistrement vocal)

### Mode Manuel :

1. Cliquer le bouton **"Start Recording"** dans l'overlay (ou appuyer sur `Espace` / `Entrée`)
2. Une barre de progression rouge s'affiche → **parlez**
3. L'indicateur montre : "Recording Xs / Xs max"
4. Pour envoyer : cliquer **"Stop & Send"** (ou appuyer `Entrée`)
5. Pour annuler : cliquer **"Discard"** (ou appuyer `Échap`)
6. Lamu transcrit votre parole → l'envoie à l'IA → affiche la réponse

### Mode Continu (VAD — Voice Activity Detection) :

1. Dans l'overlay, basculer le mode sur **"Continuous"** (en haut de l'overlay)
2. Un point vert pulsant s'affiche avec **"Listening… X.Xs"**
3. **Parlez naturellement** → Lamu détecte automatiquement quand vous parlez et quand vous vous arrêtez
4. À la fin de votre phrase (silence détecté), Lamu envoie automatiquement le texte à l'IA
5. La réponse s'affiche

### Raccourci micro global :

- `Ctrl+Shift+.` → active/désactive le micro depuis n'importe quelle application

### Régler la sensibilité du micro :

1. Dans l'overlay, ouvrir **Settings** (icône engrenage)
2. Section **Recording** → choisir un preset :
   - **"Low"** — moins sensible (pour environnement bruyant)
   - **"Normal"** — réglage par défaut
   - **"High"** — très sensible (environnement calme)
3. (Avancé) Cliquer **"Advanced Settings"** pour ajuster :
   - **"Speech Sensitivity (Raw)"** — seuil de détection VAD
   - **"Silence Duration"** — durée du silence avant envoi
   - **"Noise Gate"** — filtre les bruits de fond
   - Bouton **"Reset to Defaults"** pour tout remettre par défaut

### Choisir la langue STT :

1. Dans l'overlay, ouvrir **Settings**
2. Section **STT Language** → cliquer le menu déroulant
3. Choisir : **"Auto-detect"**, **"English"**, **"Français"**, etc.
4. Cela aide le moteur STT à être plus précis

---

## 9. Capture audio système (écouter une réunion)

La capture audio système permet à Lamu d'écouter tout ce qui sort des haut-parleurs (Zoom, Teams, YouTube, etc.).

### Étapes :

1. Lancer votre application de réunion (Zoom, Teams, Google Meet, etc.)
2. Dans l'overlay Lamu, cliquer le bouton **casque** (Headphones) intitulé **"Start system audio capture"**
   - Ou utiliser le raccourci `Ctrl+Shift+M`
3. Le bouton devient **vert** → Lamu écoute l'audio système
4. Tout ce que les autres participants disent est capturé et transcrit
5. Pour arrêter : recliquer le bouton casque (ou `Ctrl+Shift+M`)
   - Le bouton redevient normal

### Configurer le périphérique audio :

1. Aller dans **Dashboard** → **Audio** dans la barre latérale
2. **Périphérique d'entrée** : sélectionner votre micro dans la liste déroulante
3. **Périphérique de sortie** : sélectionner vos haut-parleurs/casque
4. Un point vert à côté du périphérique confirme qu'il est détecté

---

## 10. Mode réunion (Meeting Mode)

Le mode réunion transforme Lamu en assistant de réunion continu.

### Activer le mode réunion :

1. Dans l'overlay, cliquer le bouton **"Meeting"** (ou **"Live"**)
2. Le bouton devient **vert** et affiche : **"Live — always listening, auto-restarts after each response"**
3. Un compteur de messages transcript s'affiche entre parenthèses : "(X)"

### Ce qui se passe en mode réunion :

1. Le **VAD** (détection vocale) démarre automatiquement
2. Le **point vert pulsant** apparaît avec "Listening…"
3. Quand quelqu'un parle → Lamu transcrit en temps réel
4. Le texte interim s'affiche en italique (jusqu'à 3 lignes)
5. Quand la personne s'arrête de parler → Lamu envoie le transcript à l'IA
6. La **réponse IA** s'affiche
7. Lamu **recommence automatiquement** à écouter (boucle continue)

### Détection automatique des apps de réunion :

- Lamu détecte automatiquement si une de ces apps est ouverte :
  Zoom, Microsoft Teams, Google Meet, Slack, Discord, OBS, Webex, GoToMeeting, Skype
- Quand une app est détectée, un message s'affiche :
  **"Zoom detected — meeting mode auto-enabled"** (avec point vert pulsant)
- Le mode réunion peut s'activer automatiquement (toggle dans Settings → **"Auto-enable on meeting apps"**)

### Auto-Speak (lecture automatique des réponses) :

1. En mode réunion, un bouton **haut-parleur** apparaît à côté du bouton Meeting
2. Cliquer dessus pour activer : l'infobulle indique **"Auto-speak ON — click to disable"**
3. Chaque réponse IA est automatiquement lue à voix haute
4. Recliquer pour désactiver : **"Auto-speak OFF — click to enable"**
5. Aussi configurable dans Settings → **"Auto-speak responses"** toggle

### Désactiver le mode réunion :

1. Recliquer le bouton **"Meeting"** / **"Live"**
2. Le mode revient à la normale

---

## 11. Validation humaine (Human-in-the-Loop)

Ce mode vous permet de vérifier et modifier la transcription avant de l'envoyer à l'IA.

### Activer :

1. Dans l'overlay, ouvrir **Settings** (engrenage)
2. Trouver le toggle **"Validation avant IA"**
3. L'activer → le toggle devient vert

### Comment ça fonctionne :

1. Vous parlez (micro ou audio système)
2. Lamu transcrit votre parole
3. Au lieu d'envoyer directement à l'IA, un **modal de validation** s'affiche :
   - Bandeau ambre : **"Validation requise"**
   - Le texte transcrit est affiché
   - Lien **"Modifier"** → pour corriger des erreurs de transcription
   - Si un screenshot est joint : indicateur **"Screenshot jointe"**
4. Deux boutons :
   - **"Approuver"** (vert) → envoie à l'IA (raccourci : `Ctrl+Enter`)
   - **"Ignorer"** (rouge) → annule l'envoi

---

## 12. Playbook (script de réunion)

Le Playbook vous permet de charger un document/script que l'IA utilisera comme contexte pendant toute la réunion.

### Étapes :

1. Dans l'overlay, cliquer le bouton **"Playbook"** (dans la barre d'actions en haut)
2. Le modal **"Session Playbook"** s'ouvre
3. Deux options :
   - **Coller du texte** dans la zone de texte (placeholder : *"Paste your document here — job description, company brief, resume, notes…"*)
   - **Uploader un fichier** : cliquer **"Upload .txt / .md"** → sélectionner un fichier texte
4. Cliquer **"Save Playbook"**
5. Le bouton Playbook affiche maintenant **"Playbook ✓"** → le contenu est actif
6. L'IA utilisera ce document comme contexte pour toutes ses réponses

### Effacer le playbook :

1. Rouvrir le modal Playbook
2. Cliquer **"Clear"**
3. Le contexte est supprimé

---

## 13. Coaching Tip (conseil IA en direct)

Pendant une réunion, demandez un conseil contextuel à l'IA.

### Étapes :

1. Être en **mode réunion** avec un transcript en cours
2. Cliquer le bouton **"Coach"** dans la barre d'actions de l'overlay
   - Ce bouton n'apparaît que si un transcript de réunion existe
3. Un bandeau violet **"Coaching"** s'affiche avec le texte **"Analyse en cours..."**
4. Après quelques secondes, le **conseil IA** apparaît
   - Exemple : *"Le prospect semble hésitant sur le prix — proposez un plan de paiement échelonné"*
5. Pour obtenir un nouveau conseil : cliquer l'icône **rafraîchir** (↻)
6. Pour fermer : cliquer le **X**

---

## 14. Résumé de réunion (Meeting Summary)

Générez un résumé structuré de votre réunion.

### Étapes :

1. Avoir un transcript de réunion (mode réunion actif ou terminé)
2. Cliquer le bouton **"Summary"** dans la barre d'actions
   - Ce bouton n'apparaît que si un transcript existe
3. Lamu génère un résumé structuré de la réunion
4. Le résumé est automatiquement **sauvegardé dans la Knowledge Base** sous le nom `Meeting_[date].md`
5. Vous pouvez le retrouver plus tard dans **Sessions** → onglet **"Meetings"**

### Télécharger le transcript brut :

- Bouton **".txt"** → télécharge le transcript en texte brut
- Bouton **".srt"** → télécharge en format sous-titres (avec timestamps)

---

## 15. Screenshot & capture d'écran

### Prendre un screenshot :

1. Appuyer sur `Ctrl+Shift+S` (ou cliquer le bouton **"Screenshot"** dans l'overlay)
2. Selon le mode configuré :
   - **Full screen** : l'écran entier est capturé
   - **Selection** : un sélecteur de zone apparaît → dessiner un rectangle
3. Le screenshot apparaît dans l'overlay avec :
   - Miniature de l'image
   - Texte : **"Screenshot attached"**
   - Sous-texte : **"Will be sent with next transcription"**
   - Bouton **X** pour supprimer
4. La prochaine fois que vous parlez ou envoyez un message, le screenshot est inclus comme contexte visuel

### Configurer la capture d'écran :

1. Aller dans **Dashboard** → **Screenshot** dans la barre latérale
2. **Mode de capture** : choisir "Full screen" ou "Selection"
3. **Mode de traitement** : choisir "Manual" ou "Auto"
   - **Auto** : le screenshot est envoyé automatiquement à l'IA avec un prompt
4. Si mode Auto : configurer le **prompt automatique** dans le champ texte

---

## 16. Coller du contenu (Clipboard Paste)

Envoyez le contenu de votre presse-papiers comme contexte à l'IA.

### Étapes :

1. **Copier** du texte dans n'importe quelle application (`Ctrl+C`)
2. Dans l'overlay, cliquer le bouton **"Paste"**
3. Le bouton change en **"Pasted"** → le contenu est attaché
4. La prochaine question que vous posez à l'IA inclura ce texte comme contexte
5. Après utilisation, le contexte est automatiquement supprimé (usage unique)

---

## 17. Exporter la conversation

### Étapes :

1. Avoir au moins un message dans la conversation
2. Cliquer le bouton **"Export"** dans la barre d'actions de l'overlay
3. Un fichier `.md` (Markdown) est téléchargé contenant toute la conversation
4. Ouvrir le fichier avec n'importe quel éditeur de texte

---

## 18. Modes d'assistant

### Changer de mode :

1. Dans l'overlay, regarder la **rangée de pills** sous la barre d'actions
2. Chaque mode est affiché avec un emoji + nom :
   - ✨ **General** — assistant polyvalent
   - 🎯 **Interview** — coach d'entretien (méthode STAR)
   - 💻 **Coding** — expert code (résolution de problèmes, complexité, debugging)
   - 🤝 **Sales** — coach de vente (objections, closing, signaux d'achat)
3. Cliquer sur le mode souhaité
4. Le system prompt change automatiquement
5. Les **Quick Actions** (boutons en bas) changent aussi selon le mode

### Quick Actions par mode :

**General** : "What should I say?" | "Follow-up questions" | "Fact-check" | "Recap"

**Interview** : "Draft STAR answer" | "What questions might come next?" | "Sharpen this answer" | "Key points to emphasize"

**Coding** : "Solve from screenshot" | "Optimal solution" | "Time & space complexity" | "Edge cases" | "Debug this code" | "Alternative approach"

**Sales** : "Handle this objection" | "Value proposition" | "Suggest next step" | "Closing language"

---

## 19. Base de connaissances — ajouter des documents

### Accéder à la Knowledge Base :

1. Dans le **Dashboard**, cliquer **"Knowledge Base"** dans la barre latérale
2. En haut, vous voyez les stats : **"X documents"** | **"X chunks"** | **"X embedded"**
3. Cliquer l'onglet **"Documents"**

### Ajouter une page web (URL) :

1. Onglet **"Documents"**
2. En haut, trouver le champ URL avec le placeholder *"https://… paste a URL to crawl and ingest"*
3. Coller l'URL de la page web
4. Cliquer **"Add URL"**
5. Lamu télécharge la page, la découpe en chunks, et l'indexe
6. Le document apparaît dans la liste avec son nom, type, nombre de chunks, et date

### Uploader un fichier :

1. Onglet **"Documents"**
2. Trouver la zone de drop : **"Drop files here or click to upload"**
3. Soit **glisser-déposer** un fichier sur cette zone
4. Soit **cliquer** sur la zone → sélectionner un fichier
5. Formats acceptés : **PDF, DOCX, TXT, MD, CSV, RST**
6. Une barre de progression s'affiche pendant l'upload
7. Le document apparaît dans la liste une fois indexé

### Changer le niveau d'accès d'un document :

1. Dans la liste des documents, trouver le document
2. Cliquer le **badge de niveau d'accès** (couleur) à droite
3. Choisir le niveau :
   - **Public** — visible par tous
   - **Internal** — usage interne
   - **Confidential** — accès restreint
   - **Secret** — très restreint

### Supprimer un document :

1. Dans la liste, trouver le document
2. Cliquer l'icône **poubelle** (🗑) à droite
3. Confirmer la suppression

### Résumer un document par l'IA :

1. Dans la liste, trouver le document
2. Cliquer le bouton **"Summarize"**
3. Lamu génère un résumé IA du contenu

### Exporter la KB en CSV :

1. Cliquer le bouton **"Export CSV"** en bas de l'onglet Documents
2. Un fichier CSV est téléchargé avec tous les documents

---

## 20. Base de connaissances — recherche sémantique

### Effectuer une recherche :

1. Aller dans **Knowledge Base** → onglet **"Search"**
2. Dans le champ de recherche, taper votre question :
   - Placeholder : *"Ask a question or search your knowledge base…"*
   - Exemple : "Comment configurer le serveur SMTP ?"
3. Cliquer **"Search"** (ou appuyer Entrée)
4. Les résultats s'affichent :
   - **Réponse IA** : une réponse générée à partir des documents trouvés (Markdown formaté)
   - **Liste de résultats** : chaque résultat montre :
     - Icône de source + nom du fichier
     - **Pourcentage de correspondance** (score de similarité)
     - Extrait du contenu pertinent

### Comment ça fonctionne :

- La recherche utilise un **algorithme hybride** :
  - 75% **cosine similarity** (sens sémantique des phrases)
  - 25% **keyword matching** (mots exacts)
- Cela signifie que même si vous n'utilisez pas les mots exacts du document, Lamu trouve quand même les résultats pertinents

---

## 21. Base de connaissances — connecter des intégrations

### Accéder aux intégrations :

1. Aller dans **Knowledge Base** → onglet **"Sources"**
2. En bas, vous voyez la **grille d'intégrations** avec les boutons :
   Notion | Google Drive | SharePoint | Confluence | Jira | Shopify | Salesforce | GitHub | GitLab | PostgreSQL | MySQL

### Connecter GitHub :

1. Cliquer le bouton **"GitHub"**
2. Un formulaire de connexion s'ouvre
3. Cliquer **"Authorize in Browser"**
4. Une page GitHub s'ouvre dans votre navigateur → un code s'affiche
5. Entrer le code sur la page GitHub pour autoriser Lamu
6. Revenir dans Lamu → la connexion est confirmée
7. Lamu synchronise vos repos, issues, et pull requests

### Connecter Notion :

1. Cliquer **"Notion"**
2. Entrer votre **Token d'intégration Notion** :
   - Pour l'obtenir : aller sur notion.so/my-integrations → créer une intégration → copier le token
3. Cliquer **"Connect"**
4. Lamu synchronise vos pages et bases de données

### Connecter Confluence :

1. Cliquer **"Confluence"**
2. Entrer l'**URL du site** (ex: `https://votre-company.atlassian.net`)
3. Entrer votre **Token API** :
   - Obtenir sur : id.atlassian.com → Security → Create API token
4. Cliquer **"Connect"**

### Connecter Jira :

1. Cliquer **"Jira"**
2. Entrer l'**URL du site Jira** (ex: `https://votre-company.atlassian.net`)
3. Entrer votre **Token API** (même que Confluence)
4. Cliquer **"Connect"**

### Connecter une base de données (PostgreSQL / MySQL) :

1. Cliquer **"PostgreSQL"** ou **"MySQL"**
2. Remplir les champs :
   - **Host** : adresse du serveur (ex: `localhost` ou `db.example.com`)
   - **Port** : port de la DB (5432 pour PostgreSQL, 3306 pour MySQL)
   - **User** : nom d'utilisateur de la DB
   - **Password** : mot de passe
   - **Database** : nom de la base de données
3. Cliquer **"Connect"**
4. Lamu teste la connexion → si OK, le schéma est automatiquement récupéré

### Gérer une intégration connectée :

- Chaque intégration connectée affiche :
  - Nom + alias
  - Date de dernière synchronisation
  - Bouton **"Sync"** (↻) → relancer manuellement la synchronisation
  - Bouton **supprimer** (🗑) → déconnecter l'intégration
  - Menu **"Auto-sync interval"** :
    - "Manual only" | "1 hour" | "6 hours" | "12 hours" | "24 hours" | "Weekly"

---

## 22. Base de connaissances — agent SQL

### Accéder :

1. Aller dans **Knowledge Base** → onglet **"SQL"**
2. En haut, sélectionner votre base de données dans le menu déroulant **"-- Choose a database --"**

### Voir le schéma :

1. Cliquer le bouton **"Schema"**
2. Le schéma de la base s'affiche (tables, colonnes, types)
3. Cliquer à nouveau pour refermer

### Poser une question en langage naturel :

1. Dans la zone de texte SQL (placeholder : *"SELECT * FROM ma_table LIMIT 10"*)
2. Taper votre question en français ou anglais :
   - Exemple : *"Combien de clients ont commandé ce mois-ci ?"*
   - Exemple : *"Liste les 10 produits les plus vendus"*
3. Cliquer **"Execute (Ctrl+Enter)"** ou appuyer `Ctrl+Enter`
4. Lamu génère la requête SQL et l'exécute
5. Les résultats s'affichent en dessous (formaté en tableau)

### Opérations d'écriture (INSERT, UPDATE, DELETE) :

1. Quand Lamu génère une requête qui modifie des données, un **modal d'approbation** s'affiche
2. Le modal montre la **requête SQL exacte** qui sera exécutée
3. Deux boutons :
   - **"Approve"** → exécuter la requête
   - **"Cancel"** → annuler
4. Ceci protège contre les modifications accidentelles

### Effacer les résultats :

- Cliquer le bouton **"Clear"** à côté du bouton Execute

---

## 23. Base de connaissances — dossiers surveillés

Lamu peut surveiller des dossiers sur votre ordinateur et indexer automatiquement les nouveaux fichiers.

### Ajouter un dossier surveillé :

1. Aller dans **Knowledge Base** → onglet **"Fichiers PC"** (icône disque dur)
2. Cliquer **"Add Folder"**
3. Un sélecteur de dossier s'ouvre → naviguer vers le dossier souhaité → cliquer **"Sélectionner"**
4. Tous les fichiers supportés (PDF, DOCX, TXT, MD, CSV) dans ce dossier sont automatiquement ingérés
5. Les nouveaux fichiers ajoutés au dossier seront aussi détectés et indexés

### Supprimer un dossier surveillé :

1. Dans la liste des dossiers surveillés, cliquer l'icône **poubelle** (🗑) à côté du dossier
2. Le dossier n'est plus surveillé (les documents déjà indexés restent dans la KB)

---

## 24. Base de connaissances — webhooks

Les webhooks permettent à des outils externes d'envoyer des notifications à Lamu.

### Ajouter un webhook :

1. Aller dans **Knowledge Base** → onglet **"Settings"** (engrenage)
2. Section **"Outgoing Webhooks"**
3. Cliquer **"Add Webhook"**
4. Remplir le formulaire :
   - **Provider** : sélectionner "Slack" ou "Teams"
   - **Name** : nom du webhook (optionnel)
   - **URL** : coller l'URL du webhook (placeholder : *"https://hooks.slack.com/services/…"*)
5. Cliquer **"Save"**

### Supprimer un webhook :

1. Dans la liste des webhooks, cliquer l'icône **poubelle** à côté

---

## 25. Base de connaissances — paramètres d'embedding

L'embedding est le processus qui convertit vos documents en vecteurs pour la recherche sémantique.

### Configurer l'embedding :

1. Aller dans **Knowledge Base** → onglet **"Settings"**
2. Section **"Embedding Provider"** → choisir :
   - **"Ollama (local)"** → gratuit, tourne sur votre machine
     - Champ **"Ollama URL"** : par défaut `http://localhost:11434`
     - Champ **"Model"** : par défaut `nomic-embed-text`
   - **"OpenAI"** → plus précis, nécessite clé API
     - Champ **"OpenAI API Key"** : coller votre clé
     - Champ **"Model"** : sélectionner le modèle d'embedding
   - **"None"** → désactive l'embedding

### Re-embed les documents :

1. Après avoir changé de provider d'embedding
2. Cliquer **"Embed missing"** → embed uniquement les documents sans embedding
3. Ou cliquer **"Re-embed all"** → recalcule tous les embeddings
4. Une barre de progression s'affiche pendant le processus

---

## 26. Email vocal — configuration SMTP

### Étapes :

1. Aller dans **Dashboard** → cliquer **"Email"** dans la barre latérale
2. Vous voyez le texte : *"Configurez votre SMTP et vos contacts pour envoyer des emails par commande vocale."*
3. Remplir les champs SMTP :
   - **Host** : serveur SMTP (ex: `smtp.gmail.com` ou `mail.example.com`)
   - **Port** : port SMTP (ex: `587` pour STARTTLS, `465` pour SSL)
   - **User** : votre adresse email d'envoi
   - **Password** : mot de passe de l'email (ou App Password pour Gmail)
   - **From** : adresse d'expéditeur affichée
4. Cliquer **"Test"** pour tester la connexion
   - Si ✅ : "Connexion réussie"
   - Si ❌ : vérifier les paramètres
5. Cliquer **"Save"** pour sauvegarder

### Activer l'envoi d'email vocal dans l'overlay :

1. Dans l'overlay, ouvrir **Settings**
2. Activer le toggle **"Envoi d'email vocal"**
3. (Optionnel) Activer **"Envoi automatique"** → les emails sont envoyés avec un countdown de 3 secondes

---

## 27. Email vocal — envoyer un email par la voix

### Étapes :

1. S'assurer que le SMTP est configuré et que **"Envoi d'email vocal"** est activé
2. Parler à Lamu avec une commande email :
   - *"Envoie un email à Jean pour confirmer la réunion de demain à 14h"*
   - *"Rédige un email à marie@example.com pour le devis du projet"*
3. Lamu génère une réponse contenant un marqueur email
4. Le **modal "Email prêt à envoyer"** s'ouvre automatiquement (bandeau bleu)
5. Vérifier et modifier les champs :
   - **"À"** : destinataire(s) — un champ avec **autocomplete** depuis vos contacts
     - Commencez à taper un nom → les suggestions apparaissent (nom, email, entreprise)
     - Cliquer sur une suggestion pour la sélectionner
   - **"Sujet"** : objet de l'email (pré-rempli par l'IA)
   - **"Corps"** : contenu de l'email (pré-rempli par l'IA, modifiable)
6. Si **"Envoi automatique"** est activé :
   - Un compteur s'affiche : **"envoi dans 3s"** → **"envoi dans 2s"** → **"envoi dans 1s"**
   - L'email est envoyé automatiquement
   - Cliquer **"Annuler"** pour stopper le countdown
7. Si envoi manuel : cliquer **"Envoyer"**
8. Message de confirmation : l'email a été envoyé

---

## 28. Contacts & synchronisation Outlook

### Synchroniser les contacts Outlook :

1. S'assurer que Microsoft Outlook est installé et configuré sur votre ordinateur
2. Dans l'app, chercher l'option **"Sync Outlook Contacts"** (dans la page Email ou les réglages)
3. Cliquer → Lamu se connecte à Outlook via PowerShell
4. Vos contacts sont importés dans la base locale de Lamu
5. Ils sont maintenant disponibles dans l'autocomplete email

### Ajouter un contact manuellement :

1. Dans la section contacts, cliquer **"Add Contact"**
2. Remplir : **Nom**, **Email**, **Téléphone** (optionnel), **Notes** (optionnel)
3. Sauvegarder

### Rechercher un contact :

- La recherche est **fuzzy** : même avec des fautes de frappe, Lamu trouve le bon contact
- Taper un nom partiel dans le champ "À" d'un email → les résultats s'affichent

---

## 29. Interview Prep — préparer un entretien

### Accéder :

1. Aller dans **Dashboard** → cliquer **"Interview Prep"** dans la barre latérale
2. Page : *"Interview Prep — Practice with AI-generated questions and get instant feedback"*

### Configurer une session :

1. **"Interview Type"** → choisir dans le menu déroulant :
   - **"Behavioral"** — questions comportementales (méthode STAR, 6 questions)
   - **"Technical"** — questions techniques (data structures, API, 6 questions)
   - **"System Design"** — conception de systèmes (URL shortener, chat system, 5 questions)
   - **"Coding"** — problèmes de code (arrays, linked lists, 5 questions)
2. **"Target Role"** → choisir :
   - "Software Engineer" | "Product Manager" | "Data Scientist" | "Designer" | "Other"
3. **"Number of questions"** → choisir : 3 | 5 | 7 | 10
4. Cliquer **"Start Session"**

### Pendant la session :

1. Un badge s'affiche : **"Question X of Y"** + bouton **"Restart"** + barre de progression
2. La **question** s'affiche dans une carte (avec un hint si disponible)
3. Pour répondre, deux options :
   - **Écrire** : taper dans la zone de texte (placeholder : *"Type your answer here, or use the mic button below to speak…"*)
   - **Parler** : cliquer le bouton **"Record answer"** (rouge quand actif) → parler → cliquer **"Stop recording"**
4. Cliquer **"Next"** pour passer à la question suivante
5. À la dernière question, cliquer **"Finish"**

### Après chaque réponse (scoring) :

- Un score s'affiche immédiatement avec 3 critères :
  - **Clarity** : X/10 — clarté de l'expression
  - **Relevance** : X/10 — pertinence par rapport à la question
  - **Structure** : X/10 — structure de la réponse
- Un **feedback** textuel de l'IA

### Résultats de la session :

1. **Score global** affiché en grand (X/10) avec couleur selon la performance :
   - Vert : excellent
   - Jaune : correct
   - Rouge : à améliorer
2. Message de performance (ex: "Excellent!", "Good job", "Keep practicing")
3. **Détail par question** :
   - Question posée
   - Score global + sous-scores (Clarity, Relevance, Structure)
   - Feedback textuel
   - **"Strengths"** (en-tête vert) : vos points forts identifiés
   - **"Improvements"** (en-tête ambre) : axes d'amélioration
4. Deux boutons :
   - **"New Session"** → nouvelle session avec d'autres questions
   - **"Retry Same Questions"** → refaire les mêmes questions

### Voir les sessions passées :

- En bas de la page, section dépliable **"Past sessions (X)"**
- Chaque session montre : score, type, rôle, date

---

## 30. CV & Lettre de motivation

### Accéder :

1. Aller dans **Dashboard** → cliquer **"CV Generator"** dans la barre latérale

### Générer un CV et une lettre de motivation :

1. En haut, choisir la **langue** : cliquer **"Français"** ou **"English"**
2. **Colonne gauche** — "Description du poste" (icône fichier) :
   - Coller l'offre d'emploi dans le champ (placeholder : *"Collez l'offre d'emploi ici..."*)
3. **Colonne droite** — "Votre profil / background" (icône mail) :
   - Décrire votre expérience, compétences, formation dans le champ
4. Cliquer le bouton **"Générer"** (avec icône ✨)
5. Attendre la génération (quelques secondes)

### Consulter les résultats :

1. Deux onglets apparaissent :
   - **"Résumé CV"** : label *"Résumé professionnel pour votre CV"*
     - Bullet points professionnels adaptés au poste
   - **"Lettre de motivation"** : label *"Lettre de motivation complète"*
     - 3-4 paragraphes personnalisés
2. Pour chaque onglet, deux boutons :
   - **"Copy"** → copie dans le presse-papiers
   - **"Download .md"** → télécharge en fichier Markdown

---

## 31. Historique des sessions

### Accéder :

1. Aller dans **Dashboard** → cliquer **"Sessions"** dans la barre latérale

### Onglet "Meetings" :

1. Liste de tous les résumés de réunion sauvegardés (fichiers `Meeting_*.md` dans la KB)
2. Chaque entrée montre : titre, date
3. Cliquer sur une entrée pour voir le **résumé complet**
4. Bouton **rafraîchir** (↻) pour recharger depuis la KB

### Onglet "Interviews" :

1. Liste de toutes les sessions d'entretien passées (sauvées en localStorage)
2. Chaque entrée montre : score global, durée, nombre de questions, type
3. Cliquer pour revoir les détails et le feedback IA

---

## 32. Calendrier Google Calendar

### Connecter Google Calendar :

1. Dans l'overlay, trouver le **Calendar Widget** (icône calendrier + "Google Calendar")
2. Cliquer le bouton **"Connect Google Calendar"**
3. Une fenêtre d'authentification Google s'ouvre dans le navigateur
4. Connectez-vous avec votre compte Google
5. Accepter les permissions (lecture seule du calendrier)
6. Revenir dans Lamu → le calendrier est connecté

### Ce que le widget affiche :

- **Prochains événements** de la journée
- Pour chaque événement :
  - **Nom** de l'événement + **heure**
  - Icône **vidéo** (🎥) si c'est un appel Google Meet
  - Badge temporel : **"In Xm"** (dans X minutes) ou **"Now"** (en cours)
  - Liste des **participants** (3 premiers affichés, "+X more" si plus)
  - Icône **lien** pour charger l'événement comme contexte IA

---

## 33. System Prompts (prompts personnalisés)

### Accéder :

1. Aller dans **Dashboard** → cliquer **"System Prompts"** dans la barre latérale

### Créer un nouveau prompt :

1. Cliquer le bouton **"Create New"** (icône +)
2. Un formulaire s'ouvre :
   - **Champ "Name"** : donner un nom au prompt (ex: "Expert Python")
   - **Zone de texte "Prompt"** : écrire le system prompt
3. **Ou** utiliser le **générateur IA** :
   - Cliquer le bouton **✨ (AI Generate)**
   - Décrire en quelques mots ce que vous voulez (ex: "Un expert en Python qui écrit du code clean")
   - Lamu génère automatiquement un system prompt professionnel
4. Cliquer **"Save"**

### Utiliser un prompt :

1. Dans la liste des prompts, cliquer sur celui que vous voulez activer
2. Une icône **✓** (checkmark) apparaît sur le prompt actif
3. Ce prompt sera utilisé pour toutes les futures interactions avec l'IA

### Modifier un prompt :

1. Cliquer les **trois points** (⋯) à droite du prompt
2. Choisir **"Edit"** (icône crayon)
3. Modifier le contenu
4. Cliquer **"Save"**

### Supprimer un prompt :

1. Cliquer les **trois points** (⋯)
2. Choisir **"Delete"** (icône poubelle)
3. Confirmer la suppression dans le dialog

### Rechercher un prompt :

- Utiliser la barre de recherche en haut : *"Search system prompts…"*

### Prompts pré-construits (Lamu Prompts) :

- Section en bas de la page avec des prompts prêts à l'emploi
- Cliquer pour les utiliser directement

---

## 34. Réglages généraux

### Accéder :

1. Aller dans **Dashboard** → cliquer **"Settings"** dans la barre latérale

### Réglages disponibles :

| Réglage | Comment le modifier |
|---------|-------------------|
| **Nom** | Cliquer sur le champ → taper votre nom |
| **Thème** | Cliquer sur "Light", "Dark", ou "System" |
| **Langue** | Menu déroulant → choisir parmi 50+ langues |
| **Démarrage auto** | Toggle "Autostart Lamu at login" → ON/OFF |
| **Icône app** | Toggle pour afficher/masquer l'icône dans la barre des tâches/dock |
| **Always on top** | Toggle → la fenêtre reste toujours au-dessus des autres |
| **Sync conversations** | Toggle → synchronise l'historique avec le serveur backend |
| **Supprimer les chats** | Cliquer pour effacer tout l'historique de conversation |

---

## 35. Raccourcis clavier

### Voir et modifier les raccourcis :

1. Aller dans **Dashboard** → cliquer **"Shortcuts"** dans la barre latérale

### Modifier un raccourci :

1. Trouver le raccourci dans la liste
2. Cliquer sur la **combinaison de touches** affichée
3. Le **ShortcutRecorder** s'active (cadre bleu/pulsant)
4. Appuyer sur la **nouvelle combinaison de touches** souhaitée
5. Le raccourci est enregistré automatiquement

### Changer le curseur :

- Section **"Cursor Selection"** :
  - **"Invisible"** — curseur invisible (pour les démos)
  - **"Default"** — curseur normal
  - **"Auto"** — s'adapte automatiquement

---

## 36. Historique des conversations

### Accéder :

1. Aller dans **Dashboard** → cliquer **"Chats"** dans la barre latérale

### Naviguer dans l'historique :

1. Les conversations sont **groupées par date** (Aujourd'hui, Hier, etc.)
2. Chaque conversation montre : titre, nombre de messages, timestamp
3. **Rechercher** : utiliser la barre de recherche en haut
4. **Ouvrir** : cliquer sur une conversation → le détail s'affiche
5. **Supprimer** : icône poubelle → confirmer la suppression

### Dans une conversation ouverte :

- Voir tous les messages (utilisateur + IA)
- **Fichiers joints** : affichés dans le composant ChatFiles
- **Screenshots** : miniatures affichées (ChatScreenshot)
- **Audio** : lecteur audio intégré (ChatAudio)
- Options : **exporter** ou **continuer** la conversation

---

## 37. Activité & statistiques

### Accéder :

1. Aller dans **Dashboard** → cliquer **"Activity"** dans la barre latérale

### Ce qui est affiché :

- **Timeline** des recherches KB effectuées
- Pour chaque recherche :
  - La **requête** posée
  - Les **sources** utilisées pour la réponse
  - Le **score de similarité** (qualité de la correspondance)
  - La **date** (groupé : Today, Yesterday, etc.)
- Bouton **"Refresh"** (↻) pour mise à jour en temps réel
- Bouton **"Clear All"** pour effacer tout l'historique d'activité

### Dashboard principal :

1. Page **Dashboard** (page d'accueil)
2. Affiche :
   - **Graphique d'utilisation** sur 30 jours
   - **Tokens consommés**
   - **Nombre de requêtes** par jour
   - **Statut de la licence**

---

## 38. Web App — s'inscrire et se connecter

La Web App permet d'utiliser Lamu dans le navigateur, sans installer l'application desktop.

### Étapes de connexion :

1. Ouvrir votre navigateur et aller sur la **page /webapp** du site Lamu
2. L'écran de connexion s'affiche :
   - Titre : **"Lamu AI"**
   - Sous-titre : *"Votre assistant IA avec base de connaissances"*
   - Badge vert : *"20 messages gratuits — aucune carte requise"*

3. **Étape 1 — Entrer votre email** :
   - Dans le champ avec l'icône ✉️, taper votre adresse email (placeholder : *"votre@email.com"*)
   - (Optionnel) Dans le champ avec l'icône 👤, taper votre nom (placeholder : *"Votre nom (optionnel)"*)
   - Cliquer le bouton **"Recevoir un code par email"**
   - Note en bas : *"Vous avez une licence ? Entrez le même email — votre plan sera automatiquement activé."*

4. **Étape 2 — Entrer le code OTP** :
   - Vérifier votre boîte email → vous avez reçu un code à 6 chiffres
   - Le titre change en : *"Code envoyé à votre@email.com"*
   - Dans le champ avec l'icône 🛡️ (placeholder : *"000000"*), taper les **6 chiffres** du code
   - **Le code est vérifié automatiquement** dès que vous tapez le 6ème chiffre
   - Ou cliquer **"Vérifier le code"**
   - Si le code est invalide : message d'erreur *"Code invalide"*

5. **Si le code n'arrive pas** :
   - Attendre le countdown : *"Renvoyer (60s)"* → *"Renvoyer (59s)"* → etc.
   - Quand le countdown atteint 0, cliquer **"Renvoyer le code"**
   - Pour changer d'email : cliquer **"Changer d'email"**

6. **Connexion réussie** → vous êtes redirigé vers la page d'accueil de la webapp

---

## 39. Web App — utiliser le chat IA

### Interface de la webapp :

Après connexion, vous voyez :

- **Barre latérale gauche** (sidebar) :
  - Logo **"Lamu AI"** + sous-titre "Knowledge Agent"
  - Bouton **"New chat"** (icône +)
  - Navigation : **"Home"** | **"Conversations"** | **"Knowledge"**
  - Section **"KNOWLEDGE SOURCES"** :
    - "Website" | "Upload PDF" | "Create a file" | "GitHub" | "All sources"
  - Section **"RECENT CHATS"** : vos conversations récentes
  - En bas : **"Dashboard"** | **"Settings"**

- **Barre du haut** :
  - Votre **email**
  - Badge du plan : **"Trial"** (vert) ou le nom de votre plan (indigo)
  - Si trial : barre de progression **"X/20 messages"**
  - Bouton **"Upgrade"** (si trial)
  - Bouton **déconnexion** (icône ↩)

### Envoyer un message :

1. Cliquer **"New chat"** dans la sidebar (ou aller sur la page "Home" et cliquer **"New chat"** dans les Quick actions)
2. La page de chat s'ouvre avec :
   - Une icône Bot au centre
   - Titre : **"How can I help?"**
   - Sous-titre : *"Ask anything — I'm connected to your knowledge base and ready to assist."*
   - Des **suggestions de prompts** (boutons cliquables)
3. Dans la zone de texte en bas (placeholder : *"Message Lamu… (Enter ↵ to send)"*)
   - Taper votre message
   - Appuyer **Entrée** pour envoyer (ou cliquer l'icône envoi ➤)
   - **Shift+Entrée** pour aller à la ligne
4. Votre message apparaît à droite (bulle avec gradient indigo)
5. La réponse IA apparaît à gauche (bulle claire avec bordure)
6. Si le streaming est activé, les mots apparaissent progressivement (points animés pendant le chargement)

### Changer le modèle IA :

1. En haut de la page de chat, cliquer le **bouton du modèle** (icône Bot + nom du modèle)
2. Cliquer l'icône **engrenage** (⚙) en haut à droite pour ouvrir le panneau de config
3. Section **"MODEL"** → cliquer sur le modèle souhaité parmi les boutons
4. Le modèle actif a une bordure indigo

### Modifier le system prompt :

1. Ouvrir le panneau de config (icône ⚙)
2. Section **"SYSTEM PROMPT"** → zone de texte (placeholder : *"You are a helpful assistant…"*)
3. Taper ou modifier le prompt
4. Un badge **"System prompt active"** confirme qu'il est pris en compte

### Utiliser un prompt prédéfini :

1. Cliquer le bouton **✨ "Prompts"** en haut
2. Sélectionner un prompt dans la liste

### Gérer les conversations :

- **Conversations récentes** : visibles dans la sidebar sous "RECENT CHATS"
- **Changer de conversation** : cliquer sur le titre de la conversation dans la sidebar
- **Supprimer** : survoler une conversation → icône poubelle apparaît → cliquer
- **Rechercher** : (dans la sidebar)

---

## 40. Web App — Knowledge Base

### Ajouter un document depuis la Home :

1. Aller sur **"Home"** dans la sidebar
2. Section onboarding **"Connect a knowledge source"** → cliquer pour déplier
3. Cliquer sur un type de source :

   **"Website"** :
   - Le modal s'ouvre avec le titre **"Connect Website URL"**
   - Champ **"Page URL"** → taper l'URL (placeholder : *"https://docs.example.com"*)
   - Cliquer **"Add to knowledge base"**

   **"Upload PDF"** :
   - Le modal s'ouvre avec le titre **"Connect Upload File"**
   - Zone de fichier : **"Click to browse…"** (icône upload)
   - Cliquer → sélectionner un fichier (PDF, TXT, MD, CSV, DOCX)
   - Le nom du fichier s'affiche : *"Selected file: mon-document.pdf"*
   - Cliquer **"Add to knowledge base"**

   **"Create a file"** (Paste Text) :
   - Le modal s'ouvre avec le titre **"Connect Paste Text"**
   - Champ **"Document name"** → taper un nom (placeholder : *"e.g. Product FAQ"*)
   - Zone de texte **"Content"** → coller votre texte (placeholder : *"Paste your text here…"*)
   - Cliquer **"Add to knowledge base"**

   **"GitHub", "Notion", etc.** (intégrations non-natives sur le web) :
   - Le modal s'affiche avec : *"{Source} integration is available in the Lamu desktop app."*
   - Bouton **"Download Lamu"** pour télécharger l'app desktop

4. Bouton **"Cancel"** pour fermer le modal sans rien ajouter

### Recherche sémantique dans la webapp :

1. Cliquer **"Knowledge"** dans la sidebar
2. La page **"Knowledge Search"** s'ouvre avec :
   - Stats : **"Sources X"** | **"Chars Xk"**
3. Dans le champ de recherche (placeholder : *"Search documents, URLs, keywords..."*) → taper votre question
4. Cliquer **"Search"**
5. Les résultats s'affichent avec :
   - Nom du document
   - URL ou type
   - Nombre de caractères
   - Extrait du contenu
6. Cliquer sur un résultat → le panneau de détail s'ouvre :
   - Contenu du document
   - Bouton **"Summarize"** (icône 🧠) → l'IA résume le document
   - Bouton **"Use in chat"** → charge ce document comme contexte dans le prochain chat
7. Bouton **"Reset"** pour effacer les résultats

### Gérer les sources (All sources) :

1. Dans la sidebar, sous "KNOWLEDGE SOURCES", cliquer **"All sources"**
2. La vue KB s'ouvre avec la liste de tous vos documents
3. Vous pouvez ajouter de nouvelles sources ou supprimer des documents existants

---

## 41. Web App — Free Trial

### Comment fonctionne le Free Trial :

1. À la première connexion, vous recevez **20 messages gratuits**
2. **Aucune carte bancaire** n'est demandée
3. La barre en haut affiche votre progression : **"X/20 messages"** avec barre de progression
4. Quand la barre devient **jaune/ambre** → il reste ≤5 messages

### Restrictions du Free Trial :

| Ce que vous pouvez faire | Limite |
|-------------------------|--------|
| Envoyer des messages IA | **20 maximum** |
| Ajouter des documents KB | **1 document maximum** |
| Sources KB | URL, PDF, Texte uniquement |

| Ce qui est bloqué | Message affiché |
|-------------------|----------------|
| Ajouter un 2ème document | *"Limite atteinte — le Free Trial est limité à 1 document."* + lien **"Passer à un plan payant"** |
| Intégrations (GitHub, Notion, etc.) | *"Les intégrations nécessitent un plan payant."* + lien **"Passer à un plan payant"** |
| Dépasser 20 messages | *"Vous avez utilisé vos 20 messages gratuits. Passez à un plan payant pour continuer."* |

### Le compteur ne se réinitialise pas :

- Se déconnecter et se reconnecter **ne remet pas** le compteur à zéro
- Le compteur est lié à votre **email** dans la base de données
- La seule façon de continuer : **acheter un plan payant**

### Passer à un plan payant :

1. Cliquer le bouton **"Upgrade"** dans la barre du haut
2. Ou visiter la page **Pricing** du site web (voir section 42)

---

## 42. Acheter une licence

### Étapes :

1. Aller sur la page **Pricing** du site web
2. L'en-tête affiche : *"Tarification Simple, Honnête"*
3. Les plans sont affichés en cartes avec :
   - Nom du plan
   - Prix (ex: "Gratuit", "XX USD", etc.)
   - Période : "pour toujours" / "à vie" / "/mois" / "/an"
   - Liste des fonctionnalités incluses (✓)

4. **Pour le plan gratuit** : cliquer **"Télécharger Gratuitement"** → redirige vers Downloads

5. **Pour un plan payant** : cliquer **"Obtenir [Nom du plan]"** → le modal de paiement s'ouvre

### Modal de paiement :

**Étape 1/2 — Vos informations** :
1. Champ **"Nom complet"** → taper votre nom (placeholder : *"ex: Jean Dupont"*)
2. Champ **"Adresse email"** → taper votre email (placeholder : *"ex: jean@example.com"*)
3. Note : *"Votre licence vous sera envoyée par email. Vous pourrez aussi la récupérer sur lamuka.com/recover."*
4. Cliquer **"Continuer →"**

**Étape 2/2 — Paiement Mobile Money** :
1. Champ **"Numéro Mobile Money"** → taper votre numéro (placeholder : *"ex: 050489037"*, icône téléphone)
2. Informations affichées :
   - *"Licence unique générée à votre nom"* (icône 🛡)
   - *"Validité : [période]"* (icône 🕐)
   - *"Activation immédiate après paiement"* (icône 📅)
3. Avertissement : *"Une demande de paiement sera envoyée sur votre téléphone. Confirmez-la pour recevoir votre clé."*
4. Cliquer **"Payer [prix] via Mobile Money"**

**Écran d'attente** :
1. Icône téléphone + message : *"Confirmez sur votre téléphone"*
2. *"Une demande de [prix] a été envoyée au [numéro]. Veuillez la confirmer pour valider votre achat."*
3. ID de transaction affiché
4. Spinner avec *"Vérification en cours..."*

**Succès** :
1. Icône ✅ verte + *"Paiement confirmé !"*
2. *"Votre licence est prête, [Nom]. Un email a été envoyé à [email]."*
3. **CLÉ DE LICENCE** affichée en gros (fond vert, police monospace)
4. Bouton **"Copy"** pour copier la clé (affiche *"Copié !"*)
5. Détails : Nom, Email, Produit, Validité, Date d'émission, Montant
6. Instructions d'activation (4 étapes numérotées) :
   - *"1. Ouvrez Lamuka sur votre bureau"*
   - *"2. Allez dans Paramètres → Licence"*
   - *"3. Collez votre clé de licence"*
   - *"4. Cliquez sur Activer — c'est tout !"*
7. Lien : *"Clé perdue ? Récupérer ma licence"*

**En cas d'erreur** :
1. Icône ❌ rouge + *"Une erreur est survenue"*
2. Message d'erreur détaillé
3. Bouton **"Réessayer"** (icône ←)

### FAQ (en bas de la page Pricing) :

- *"Ai-je besoin d'une licence pour utiliser Lamuka ?"*
- *"Comment recevoir ma clé de licence ?"*
- *"J'ai perdu ma clé de licence, que faire ?"*
- *"Quel mode de paiement est accepté ?"*
- *"La licence lifetime est-elle vraiment à vie ?"*
- *"Ma licence est-elle transférable ?"*

Cliquer sur chaque question pour voir la réponse.

---

## 43. Récupérer une licence perdue

### Étapes :

1. Aller sur la page **/recover** du site web
2. Entrer l'**email** utilisé lors de l'achat
3. Cliquer **"Rechercher"**
4. Toutes les licences associées à cet email s'affichent
5. Option de **renvoi par email** : cliquer pour recevoir la clé par email

---

## 44. Dashboard admin

### Accéder :

1. Ouvrir le navigateur → aller sur `http://votre-serveur:3001/admin`
2. Entrer votre **login admin** et **mot de passe**
3. Cliquer **"Login"**

### Gérer les licences :

1. Section **Licences** dans le dashboard admin
2. Tableau avec toutes les licences : email, plan, statut, machine liée, date d'expiration
3. Pour chaque licence :
   - **Activer/Désactiver** : toggle ou bouton
   - **Transférer** : délier de la machine actuelle (le client pourra se reconnecter ailleurs)
4. Bouton **"Export CSV"** → télécharger toutes les licences en fichier CSV

### Gérer les plans :

1. Section **Plans**
2. Voir tous les plans tarifaires
3. **Créer** un nouveau plan : cliquer "Create" → remplir nom, prix, features, limites
4. **Modifier** un plan existant : cliquer "Edit" → modifier → sauvegarder

### Configuration SMTP :

1. Section **Settings**
2. Remplir les champs SMTP : Host, Port, User, Password, From
3. Bouton **"Test SMTP"** → teste la connexion
4. Configurer les **templates email** :
   - Template de livraison de licence
   - Template de récupération
   - Template de réponse support

### Configuration IA :

1. Toujours dans **Settings**
2. Configurer :
   - **URL du fournisseur IA** principal
   - **Clé API**
   - **Modèle par défaut**
   - **Fournisseur de fallback**

### Monitoring :

1. Section dédiée dans l'admin
2. **Statut des fournisseurs IA** : santé, latence, uptime (24h)
3. **Historique des incidents**
4. **Cron automatique** : détecte les licences qui expirent bientôt et envoie des notifications

---

## 45. Sécurité & invisibilité screen share

### Invisibilité pendant le partage d'écran :

- Lamu est **automatiquement invisible** quand vous partagez votre écran
- Technologie : `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (Windows)
- Les participants de votre réunion (Zoom, Teams, Meet, OBS, Discord…) **ne voient pas** la fenêtre Lamu
- Vous pouvez utiliser Lamu librement pendant un partage d'écran

### Stockage sécurisé :

- Vos clés API sont stockées dans le **keychain système** (stockage chiffré du OS)
- Pas en texte clair dans les fichiers de config

### Données locales :

- Les conversations restent sur **votre machine** (base SQLite locale)
- La sync serveur est **optionnelle** (toggle dans Settings)
- Aucune donnée n'est envoyée sans votre consentement

### Logs de debug :

- Fichier : `%APPDATA%/com.lamuka.lamu/debug.log` (Windows)
- Utilisé uniquement pour le diagnostic

---

## 46. Résolution de problèmes

### L'IA ne répond pas

1. Ouvrir le **Dev Space** (`Ctrl+Shift+D`)
2. Vérifier qu'un **fournisseur IA** est configuré et que la clé API est entrée
3. Vérifier que le modèle est sélectionné
4. Aller sur la page **/status** du site web pour vérifier si le fournisseur est opérationnel
5. Consulter les logs : `%APPDATA%/com.lamuka.lamu/debug.log`

### Le micro ne fonctionne pas

1. Aller dans **Dashboard** → **Audio**
2. Vérifier que le **bon micro** est sélectionné (point vert = détecté)
3. Vérifier les **permissions système** :
   - Windows : Paramètres → Confidentialité → Microphone → autoriser Lamu
   - macOS : Préférences Système → Sécurité → Microphone
4. Essayer un autre périphérique d'entrée

### L'audio système ne capture pas

1. Vérifier que le bon **périphérique de sortie** est sélectionné dans Dashboard → Audio
2. S'assurer que l'app de réunion émet bien du son
3. Relancer la capture : `Ctrl+Shift+M` (stop) puis `Ctrl+Shift+M` (start)

### La KB ne retourne pas de résultats

1. Aller dans **Knowledge Base** → onglet **Documents**
2. Vérifier que des documents sont **bien ingérés** (liste non vide)
3. Aller dans onglet **Settings** → vérifier que l'**embedding** est configuré
4. Cliquer **"Embed missing"** si des documents n'ont pas d'embedding
5. Essayer une requête plus large ou avec d'autres mots

### La licence ne s'active pas

1. Vérifier votre **connexion internet**
2. Essayer la **connexion par email** au lieu de la clé
3. Aller sur **/recover** sur le site web pour vérifier que votre licence existe
4. Contacter le support

### La webapp ne charge pas

1. Vérifier que le **serveur backend** est lancé (port 3000)
2. Vérifier votre connexion internet
3. Essayer de vider le cache du navigateur (`Ctrl+Shift+Delete`)
4. Vérifier la console du navigateur (F12) pour les erreurs

---

## 47. Raccourcis clavier — tableau complet

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Toggle micro | `Ctrl+Shift+.` | `Cmd+Shift+.` |
| Capture audio système | `Ctrl+Shift+M` | `Cmd+Shift+M` |
| Screenshot | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Toggle fenêtre overlay | `Ctrl+\` | `Cmd+\` |
| Ouvrir/fermer Dev Space | `Ctrl+Shift+D` | `Cmd+Shift+D` |
| Focus sur le champ de texte | `Ctrl+Shift+I` | `Cmd+Shift+I` |
| Input vocal | `Ctrl+Shift+A` | `Cmd+Shift+A` |
| Copier la dernière réponse IA | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Déplacer la fenêtre | `Ctrl+↑↓←→` | `Cmd+↑↓←→` |
| Approuver la validation | `Ctrl+Enter` | `Cmd+Enter` |
| Démarrer enregistrement (mode manuel) | `Espace` ou `Entrée` | `Espace` ou `Entrée` |
| Envoyer l'enregistrement | `Entrée` | `Entrée` |
| Annuler l'enregistrement | `Échap` | `Échap` |
| Exécuter SQL | `Ctrl+Enter` | `Cmd+Enter` |

> Tous les raccourcis sont **personnalisables** : Dashboard → Shortcuts → cliquer sur un raccourci → taper la nouvelle combinaison.

---

*Documentation Lamu v2 — Guide pas-à-pas complet — Dernière mise à jour : 2026-05-27*
