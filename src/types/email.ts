// ── Contact types ─────────────────────────────────────────────────────────────

export interface Contact {
  id: string
  full_name: string
  email: string
  alias?: string
  company?: string
  phone?: string
  source: "manual" | "outlook" | "windows_contacts"
}

// ── Email config ──────────────────────────────────────────────────────────────

export type TlsMode = "tls" | "starttls" | "none"

export interface EmailConfig {
  smtp_host: string
  smtp_port: number
  username: string
  password: string
  from_name: string
  from_email: string
  tls_mode: TlsMode
}

// ── Email draft (parsed from AI response) ────────────────────────────────────

export interface EmailDraft {
  to_name: string    // resolved display name (may be empty if only email known)
  to_email: string   // resolved email address
  to_query: string   // original name as said by voice ("Joel")
  subject: string
  body: string
  autoSend?: boolean // true = envoyer automatiquement dès que le modal est prêt
}

// ── Email log entry ───────────────────────────────────────────────────────────

export interface EmailLogEntry {
  id: string
  to_email: string
  to_name?: string
  subject: string
  status: "sent" | "failed"
  error?: string
  sent_at: number
}
