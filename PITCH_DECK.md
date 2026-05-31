# LAMU — Pitch Deck 3 minutes

---

## SLIDE 1 — HOOK (15s)

**LAMU**
*L'IA invisible qui fait gagner chaque conversation*

**$37B** perdus en reunions improductives/an.
**12h** de temps de reponse moyen en support client.

> Cluely fait les meetings. Eesel.ai fait le support. **Lamu fait les deux. Open-source.**

---

## SLIDE 2 — PROBLEME + SOLUTION (45s)

### Le probleme
Les outils IA sont en silos. Eesel.ai = support seulement ($239/mois). Cluely = meetings seulement ($120M de valo). **Personne ne connecte les deux.**

### Lamu = 3 produits en 1

| Support Client | Meeting Assistant | Career Tools |
|---|---|---|
| Copilote IA inline dans Zendesk, Freshdesk, Intercom... | Overlay invisible en reunion, coaching live | Simulateur d'entretien, CV generator |
| Extension navigateur | App desktop Tauri (Rust) | Integre dans l'app |
| Reponse en 30s au lieu de 12h | Invisible en screen share | Score d'entretien +40% |

**L'avantage cle** : le meeting summary de 14h alimente la KB, l'agent support y accede a 15h. Tout est connecte.

---

## SLIDE 3 — PRODUIT + TRACTION (45s)

### Ce n'est pas un prototype. C'est construit.

- **App desktop** : 80+ commandes Rust, capture audio, overlay invisible, 4 modes IA (General, Interview, Coding, Sales)
- **Extension Chrome/Edge** : copilote helpdesk sur 10 plateformes, suggest reply + insert en 1 clic
- **WebApp SaaS** : 23 vues, 13 channels (Zendesk a WhatsApp), 4 e-commerce (Shopify a Magento)
- **RAG avance** : chunking semantique, re-ranking hybride, 100+ langues, auto-sync KB

**9,000+ lignes de backend. Deployable aujourd'hui.**

---

## SLIDE 4 — MARCHE + CONCURRENCE (30s)

### TAM : $36.6B (2 marches en convergence)

- AI Support Client : **$15.1B** (2026) → $47.8B (2030)
- AI Meeting Assistant : **$3.5B** (2026) → $21.5B (2033)
- CAGR : **25.8%**

### Lamu vs concurrence

| | Lamu | eesel.ai | Cluely | Otter.ai |
|---|---|---|---|---|
| Support IA | **Oui** | Oui | Non | Non |
| Meeting IA | **Oui** | Non | Oui | Oui |
| Open-source | **Oui** | Non | Non | Non |
| Extension helpdesk | **Oui** | Oui | Non | Non |
| Prix entry | **Gratuit** | $239/mo | ~$30/mo | $17/mo |

**Seul a combiner les 2 marches. Seul en open-source.**

---

## SLIDE 5 — BUSINESS MODEL + GTM (30s)

### Open-Core SaaS

| Community | Pro | Business | Enterprise |
|---|---|---|---|
| Gratuit (self-hosted) | $29/agent/mois | $79/agent/mois | Sur devis |

### Go-to-market
1. **Mois 1-6** : Launch open-source (GitHub + Product Hunt) → 5K stars
2. **Mois 6-12** : PLG SaaS → **200 clients, $300K ARR**
3. **Mois 12-24** : Mid-market + Sales → **800 clients, $1.8M ARR**

### Comparable : Cluely a fait **$7M ARR et $120M de valo en 3 mois**

---

## SLIDE 6 — L'ASK (15s)

### Seed : $2.5M | Valorisation cible : $12-15M pre-money

**Utilisation :**
- 40% Produit & Engineering
- 25% Go-to-Market
- 20% Sales & CS
- 15% Operations + Legal (SOC2)

**Milestones 18 mois :**
- $1.8M ARR
- 800 clients payants
- 15,000 GitHub stars
- Series A ready

> **"On ne construit pas un outil. On construit le cerveau collectif des equipes."**

*[Nom] — [email] — Demo live disponible*

---

## APPENDIX (si questions)

### Architecture

```
Desktop (Tauri/Rust)  +  Extension (MV3)  +  WebApp (React)
                    \         |          /
                     Backend API (Node.js/Express)
                    /    |      |      \
              Chat AI   RAG   Helpdesk  AI Actions
                    \    |      |      /
              MySQL + Embeddings + Licenses
```

### Unit Economics cible (Annee 2)

| ARPU | CAC | LTV | LTV:CAC | Gross Margin |
|------|-----|-----|---------|--------------|
| $45/mois | $270 | $1,350 | 5:1 | 72% |

### Projections

| | Annee 1 | Annee 2 | Annee 3 |
|---|---------|---------|---------|
| ARR | $300K | $1.8M | $7.2M |
| Clients | 200 | 800 | 2,500 |
| Headcount | 5 | 12 | 25 |
