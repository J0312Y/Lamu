// ── Meeting Note Templates ──────────────────────────────────────────────────
// Pre-built templates for different meeting types. Each template provides
// a structured format that the AI uses to generate meeting notes.

export interface MeetingTemplate {
  id: string;
  name: string;
  icon: string; // lucide icon name
  category: "general" | "team" | "sales" | "hr" | "product" | "other";
  description: string;
  prompt: string;
  sections: string[];
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  // ── General ─────────────────────────────────────────────────
  {
    id: "general",
    name: "Réunion générale",
    icon: "Users",
    category: "general",
    description: "Format standard pour toute réunion",
    prompt: `Génère des notes structurées avec : Points clés, Décisions prises, Actions à faire (avec responsables et deadlines si mentionnés), Points ouverts.`,
    sections: ["Points clés", "Décisions", "Actions", "Points ouverts"],
  },
  {
    id: "standup",
    name: "Daily Standup",
    icon: "Zap",
    category: "team",
    description: "Standup quotidien agile",
    prompt: `Formate les notes en standup agile par participant : Ce qui a été fait hier, Ce qui est prévu aujourd'hui, Blockers/obstacles. Résume en bullet points concis.`,
    sections: ["Hier", "Aujourd'hui", "Blockers"],
  },
  {
    id: "one-on-one",
    name: "1-on-1",
    icon: "UserCheck",
    category: "team",
    description: "Entretien individuel manager/collaborateur",
    prompt: `Formate les notes d'un entretien 1-on-1 avec : Humeur/bien-être, Avancement des objectifs, Obstacles rencontrés, Feedback donné/reçu, Actions et engagements, Développement professionnel.`,
    sections: ["Bien-être", "Objectifs", "Obstacles", "Feedback", "Actions", "Développement"],
  },
  {
    id: "retrospective",
    name: "Rétrospective",
    icon: "RotateCcw",
    category: "team",
    description: "Sprint retrospective agile",
    prompt: `Formate la rétro en 3 colonnes : Ce qui a bien marché (Keep), Ce qu'il faut améliorer (Improve), Nouvelles idées à essayer (Try). Ajoute les actions concrètes décidées.`,
    sections: ["Keep", "Improve", "Try", "Actions"],
  },
  {
    id: "sprint-planning",
    name: "Sprint Planning",
    icon: "LayoutList",
    category: "team",
    description: "Planification de sprint agile",
    prompt: `Formate les notes de sprint planning avec : Objectif du sprint, User stories sélectionnées (avec estimations si mentionnées), Capacité de l'équipe, Risques identifiés, Dépendances.`,
    sections: ["Objectif sprint", "Stories", "Capacité", "Risques", "Dépendances"],
  },
  // ── Sales ───────────────────────────────────────────────────
  {
    id: "sales-discovery",
    name: "Sales Discovery",
    icon: "Search",
    category: "sales",
    description: "Appel de découverte commercial",
    prompt: `Formate les notes de discovery call avec : Infos prospect (entreprise, rôle, taille), Problèmes/douleurs identifiés (BANT: Budget, Authority, Need, Timeline), Solutions actuelles utilisées, Objections soulevées, Prochaines étapes, Score de qualification (1-10).`,
    sections: ["Prospect", "Problèmes (BANT)", "Solutions actuelles", "Objections", "Next steps", "Score"],
  },
  {
    id: "sales-demo",
    name: "Démo produit",
    icon: "Presentation",
    category: "sales",
    description: "Démonstration produit pour un prospect",
    prompt: `Formate les notes de démo avec : Participants et rôles, Features présentées, Réactions du prospect (positives/négatives), Questions posées, Objections, Features demandées/manquantes, Prochaines étapes, Probabilité de closing.`,
    sections: ["Participants", "Features montrées", "Réactions", "Questions", "Objections", "Next steps"],
  },
  {
    id: "sales-negotiation",
    name: "Négociation",
    icon: "Handshake",
    category: "sales",
    description: "Appel de négociation commerciale",
    prompt: `Formate les notes de négociation avec : Offre proposée (prix, conditions), Contre-propositions du client, Concessions faites de chaque côté, Points de blocage, Accord final ou prochaines étapes, Deadline de décision.`,
    sections: ["Offre", "Contre-propositions", "Concessions", "Blocages", "Accord/Next", "Deadline"],
  },
  // ── HR ──────────────────────────────────────────────────────
  {
    id: "interview-debrief",
    name: "Debrief entretien",
    icon: "UserSearch",
    category: "hr",
    description: "Debrief après un entretien de recrutement",
    prompt: `Formate le debrief d'entretien avec : Candidat (nom, poste visé), Compétences techniques évaluées (score 1-5 chacune), Soft skills observés, Points forts, Points d'attention, Culture fit (1-5), Recommandation (Hire/No Hire/Maybe), Notes supplémentaires.`,
    sections: ["Candidat", "Compétences techniques", "Soft skills", "Forces", "Attention", "Culture fit", "Recommandation"],
  },
  {
    id: "performance-review",
    name: "Évaluation performance",
    icon: "TrendingUp",
    category: "hr",
    description: "Entretien annuel d'évaluation",
    prompt: `Formate l'évaluation de performance avec : Objectifs de la période (atteints/non atteints), Réalisations marquantes, Axes d'amélioration, Plan de développement, Nouveaux objectifs, Feedback du collaborateur, Note globale.`,
    sections: ["Objectifs", "Réalisations", "Améliorations", "Plan dev", "Nouveaux objectifs", "Feedback"],
  },
  // ── Product ─────────────────────────────────────────────────
  {
    id: "product-review",
    name: "Product Review",
    icon: "Package",
    category: "product",
    description: "Revue produit / roadmap",
    prompt: `Formate la product review avec : Métriques clés (MAU, rétention, NPS…), Features lancées depuis la dernière review, Feedback utilisateurs majeur, Roadmap — prochaines priorités, Décisions produit prises, Risques et dépendances.`,
    sections: ["Métriques", "Features lancées", "Feedback users", "Roadmap", "Décisions", "Risques"],
  },
  {
    id: "design-review",
    name: "Design Review",
    icon: "Palette",
    category: "product",
    description: "Revue de design / UX",
    prompt: `Formate la design review avec : Maquettes/prototypes présentés, Feedback de l'équipe par écran/section, Problèmes UX identifiés, Décisions de design, Modifications à apporter, Validation finale (approuvé/à revoir).`,
    sections: ["Maquettes", "Feedback", "Problèmes UX", "Décisions", "Modifications", "Validation"],
  },
  {
    id: "incident-postmortem",
    name: "Post-mortem incident",
    icon: "AlertTriangle",
    category: "other",
    description: "Analyse post-incident",
    prompt: `Formate le post-mortem avec : Résumé de l'incident (quoi, quand, impact), Timeline des événements, Cause racine identifiée, Actions correctives prises, Actions préventives planifiées (avec responsable et deadline), Leçons apprises.`,
    sections: ["Résumé", "Timeline", "Cause racine", "Corrections", "Prévention", "Leçons"],
  },
  {
    id: "brainstorming",
    name: "Brainstorming",
    icon: "Lightbulb",
    category: "other",
    description: "Session de brainstorming / idéation",
    prompt: `Formate la session de brainstorming avec : Problème/question posée, Idées générées (groupées par thème), Top 3 idées retenues (avec justification), Prochaines étapes pour chaque idée retenue, Idées à explorer plus tard (parking lot).`,
    sections: ["Problème", "Idées par thème", "Top 3 retenues", "Next steps", "Parking lot"],
  },
  {
    id: "board-meeting",
    name: "Réunion de direction",
    icon: "Building2",
    category: "other",
    description: "Comité de direction / board meeting",
    prompt: `Formate les notes de comité de direction avec : Ordre du jour validé, Revue des KPIs, Sujets stratégiques discutés, Décisions prises (avec vote si applicable), Budget/finances, Risques escaladés, Actions et responsables.`,
    sections: ["Ordre du jour", "KPIs", "Sujets stratégiques", "Décisions", "Budget", "Risques", "Actions"],
  },
  {
    id: "client-kickoff",
    name: "Kickoff client",
    icon: "Rocket",
    category: "sales",
    description: "Lancement de projet avec un client",
    prompt: `Formate le kickoff avec : Participants et rôles, Objectifs du projet, Scope validé, Timeline et jalons, Canaux de communication, Points de contact, Risques identifiés, Prochaine réunion planifiée.`,
    sections: ["Participants", "Objectifs", "Scope", "Timeline", "Communication", "Contacts", "Risques", "Prochaine réunion"],
  },
  {
    id: "training",
    name: "Formation",
    icon: "GraduationCap",
    category: "other",
    description: "Session de formation / workshop",
    prompt: `Formate les notes de formation avec : Sujet et formateur, Concepts clés abordés, Exercices pratiques réalisés, Questions/réponses importantes, Ressources partagées (liens, docs), Points à approfondir, Évaluation des participants.`,
    sections: ["Sujet", "Concepts clés", "Exercices", "Q&A", "Ressources", "À approfondir"],
  },
  {
    id: "customer-success",
    name: "Customer Success",
    icon: "HeartHandshake",
    category: "sales",
    description: "Suivi client / QBR",
    prompt: `Formate la réunion customer success avec : Santé du compte (score 1-10), Utilisation produit (features utilisées, adoption), Satisfaction client, Problèmes/tickets ouverts, Opportunités d'upsell/expansion, Risques de churn, Actions et prochaine QBR.`,
    sections: ["Santé compte", "Utilisation", "Satisfaction", "Problèmes", "Upsell", "Risques churn", "Actions"],
  },
  {
    id: "all-hands",
    name: "All-Hands / Town Hall",
    icon: "Megaphone",
    category: "general",
    description: "Réunion plénière de l'entreprise",
    prompt: `Formate les notes all-hands avec : Annonces de la direction, Mises à jour par département, Métriques business partagées, Célébrations / reconnaissances, Q&A des employés, Prochaines étapes annoncées.`,
    sections: ["Annonces", "Mises à jour", "Métriques", "Célébrations", "Q&A", "Next steps"],
  },
  {
    id: "project-status",
    name: "Point projet",
    icon: "ClipboardList",
    category: "general",
    description: "Réunion de suivi de projet",
    prompt: `Formate le point projet avec : Statut global (Vert/Orange/Rouge), Avancement par workstream, Tâches complétées cette semaine, Tâches prévues semaine prochaine, Risques et mitigations, Dépendances bloquantes, Budget consommé vs prévu.`,
    sections: ["Statut global", "Avancement", "Complété", "Prévu", "Risques", "Dépendances", "Budget"],
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: "general", label: "Général" },
  { id: "team", label: "Équipe" },
  { id: "sales", label: "Ventes" },
  { id: "hr", label: "RH" },
  { id: "product", label: "Produit" },
  { id: "other", label: "Autre" },
] as const;
