/** Single source of truth for plan feature identifiers.
 *  The same keys are used in:
 *  - The MySQL `plans.features` JSON column
 *  - The backend `/api/license/validate` response
 *  - The Rust `ValidateResponse.features` / offline fallback
 *  - `hasPlanFeature(key)` checks throughout the app
 *  - The admin dashboard checkbox grid
 */
export const PLAN_FEATURES = [
  { key: "drag_window",      label: "Déplacer la fenêtre overlay",       group: "Interface" },
  { key: "screenshot",       label: "Capture d'écran",                   group: "Interface" },
  { key: "file_attachments", label: "Pièces jointes (fichiers)",          group: "Interface" },
  { key: "audio_capture",    label: "Capture audio / microphone",         group: "Audio"     },
  { key: "meeting_mode",     label: "Mode réunion (meeting mode)",        group: "Audio"     },
  { key: "knowledge_base",   label: "Base de connaissances (KB)",         group: "IA"        },
  { key: "contact_support",  label: "Contacter le support",               group: "Support"   },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[number]["key"];
