/**
 * SOC 2 / HIPAA Compliance Module for Lamu.
 * Provides audit logging, data retention policies, consent management,
 * encryption helpers, and auto-purge scheduling.
 */

import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "@/lib";

// ── Audit Logging ────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  resource: string;
  details?: string;
  ip_address?: string;
  result: "success" | "failure" | "denied";
}

const AUDIT_BUFFER: AuditLogEntry[] = [];
const AUDIT_FLUSH_INTERVAL_MS = 10_000; // Flush every 10s
const AUDIT_MAX_BUFFER = 100;

/**
 * Log an auditable action. Buffers entries and flushes periodically
 * to the backend for durable storage.
 */
export function auditLog(entry: Omit<AuditLogEntry, "id" | "timestamp">) {
  const fullEntry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...entry,
  };

  AUDIT_BUFFER.push(fullEntry);

  // Also log locally via Tauri debug_log for immediate persistence
  invoke("debug_log", {
    message: `[AUDIT] ${entry.action} | actor=${entry.actor} | resource=${entry.resource} | result=${entry.result}${entry.details ? ` | ${entry.details}` : ""}`,
  }).catch(() => {});

  // Auto-flush if buffer is full
  if (AUDIT_BUFFER.length >= AUDIT_MAX_BUFFER) {
    flushAuditLogs();
  }
}

/**
 * Flush buffered audit logs to the backend.
 */
export async function flushAuditLogs(): Promise<void> {
  if (AUDIT_BUFFER.length === 0) return;

  const entries = AUDIT_BUFFER.splice(0, AUDIT_BUFFER.length);
  try {
    const response = await fetch(`${getBackendUrl()}/api/compliance/audit-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!response.ok) {
      // Re-queue failed entries
      AUDIT_BUFFER.unshift(...entries);
    }
  } catch {
    // Re-queue on network error
    AUDIT_BUFFER.unshift(...entries);
  }
}

// Start periodic flush
if (typeof window !== "undefined") {
  setInterval(flushAuditLogs, AUDIT_FLUSH_INTERVAL_MS);
}

// ── Data Retention Policy ────────────────────────────────────────────────────

export interface RetentionPolicy {
  enabled: boolean;
  /** Retention period in days (0 = indefinite) */
  retentionDays: number;
  /** Auto-purge on schedule */
  autoPurge: boolean;
  /** Types of data to auto-purge */
  purgeTargets: ("transcripts" | "meetings" | "conversations" | "audio")[];
  /** Last purge timestamp */
  lastPurge: number;
}

const RETENTION_STORAGE_KEY = "lamu_retention_policy";

const DEFAULT_RETENTION: RetentionPolicy = {
  enabled: false,
  retentionDays: 90,
  autoPurge: false,
  purgeTargets: ["transcripts", "audio"],
  lastPurge: 0,
};

export function getRetentionPolicy(): RetentionPolicy {
  try {
    const saved = safeLocalStorage.getItem(RETENTION_STORAGE_KEY);
    if (saved) return { ...DEFAULT_RETENTION, ...JSON.parse(saved) };
  } catch { /* use defaults */ }
  return DEFAULT_RETENTION;
}

export function setRetentionPolicy(policy: Partial<RetentionPolicy>): void {
  const current = getRetentionPolicy();
  const updated = { ...current, ...policy };
  safeLocalStorage.setItem(RETENTION_STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Execute data purge based on retention policy.
 * Deletes data older than the retention period.
 */
export async function executePurge(): Promise<{ purged: number }> {
  const policy = getRetentionPolicy();
  if (!policy.enabled || policy.retentionDays <= 0) {
    return { purged: 0 };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
  const cutoffIso = cutoffDate.toISOString();

  let purgedCount = 0;

  try {
    const response = await fetch(`${getBackendUrl()}/api/compliance/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        before: cutoffIso,
        targets: policy.purgeTargets,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      purgedCount = data.purged || 0;
    }
  } catch { /* purge failed — will retry next cycle */ }

  // Update last purge timestamp
  setRetentionPolicy({ lastPurge: Date.now() });

  auditLog({
    action: "data_purge",
    actor: "system",
    resource: "retention_policy",
    result: "success",
    details: `Purged ${purgedCount} records older than ${policy.retentionDays} days`,
  });

  return { purged: purgedCount };
}

// ── Consent Management ───────────────────────────────────────────────────────

export interface ConsentRecord {
  type: "recording" | "ai_processing" | "data_storage" | "third_party_sharing";
  granted: boolean;
  grantedAt: number;
  grantedBy: string;
  expiresAt?: number;
}

const CONSENT_STORAGE_KEY = "lamu_consent_records";

export function getConsentRecords(): ConsentRecord[] {
  try {
    const saved = safeLocalStorage.getItem(CONSENT_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* empty */ }
  return [];
}

export function setConsent(record: ConsentRecord): void {
  const records = getConsentRecords();
  const idx = records.findIndex((r) => r.type === record.type);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  safeLocalStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(records));

  auditLog({
    action: record.granted ? "consent_granted" : "consent_revoked",
    actor: record.grantedBy,
    resource: `consent:${record.type}`,
    result: "success",
  });
}

export function hasConsent(type: ConsentRecord["type"]): boolean {
  const records = getConsentRecords();
  const record = records.find((r) => r.type === type);
  if (!record) return false;
  if (!record.granted) return false;
  if (record.expiresAt && record.expiresAt < Date.now()) return false;
  return true;
}

export function revokeAllConsent(actor: string): void {
  const records = getConsentRecords();
  const updated = records.map((r) => ({
    ...r,
    granted: false,
    grantedAt: Date.now(),
    grantedBy: actor,
  }));
  safeLocalStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(updated));

  auditLog({
    action: "consent_revoked_all",
    actor,
    resource: "consent:all",
    result: "success",
  });
}

// ── Encryption Helpers ───────────────────────────────────────────────────────

/**
 * Encrypt sensitive data using Web Crypto API (AES-GCM).
 * Returns base64-encoded ciphertext with IV prepended.
 */
export async function encryptData(data: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data encrypted with encryptData.
 */
export async function decryptData(encrypted: string, key: CryptoKey): Promise<string> {
  const combined = new Uint8Array(
    atob(encrypted).split("").map((c) => c.charCodeAt(0))
  );
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Generate an AES-GCM key for data encryption.
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// ── PHI Detection (HIPAA) ────────────────────────────────────────────────────

const PHI_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b[A-Z]{1,2}\d{6,10}\b/, // Medical record numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Dates (potential DOB)
];

/**
 * Check if text contains potential PHI (Protected Health Information).
 * Returns detected pattern types for warning purposes.
 */
export function detectPHI(text: string): string[] {
  const detected: string[] = [];
  const labels = ["SSN", "Medical ID", "Phone", "Email", "Date/DOB"];
  PHI_PATTERNS.forEach((pattern, i) => {
    if (pattern.test(text)) {
      detected.push(labels[i]);
    }
  });
  return detected;
}

/**
 * Redact PHI from text by replacing matches with [REDACTED].
 */
export function redactPHI(text: string): string {
  let redacted = text;
  PHI_PATTERNS.forEach((pattern) => {
    redacted = redacted.replace(new RegExp(pattern, "g"), "[REDACTED]");
  });
  return redacted;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBackendUrl(): string {
  // Use the same backend URL as the Tauri app (set during build or at runtime)
  // In dev, this falls back to localhost; in production, APP_ENDPOINT is baked in at build time
  return safeLocalStorage.getItem("lamu_backend_url")
    || (import.meta.env.VITE_APP_ENDPOINT as string | undefined)
    || "https://api.lamu.lamuka-tech.com";
}

// ── Auto-purge scheduler ─────────────────────────────────────────────────────

/**
 * Check if auto-purge should run and execute if due.
 * Called at app startup and periodically.
 */
export async function checkAutoPurge(): Promise<void> {
  const policy = getRetentionPolicy();
  if (!policy.enabled || !policy.autoPurge) return;

  const daysSinceLastPurge = (Date.now() - policy.lastPurge) / (1000 * 60 * 60 * 24);
  // Run purge every 7 days
  if (daysSinceLastPurge >= 7) {
    await executePurge();
  }
}
