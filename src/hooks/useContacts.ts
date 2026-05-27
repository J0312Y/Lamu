import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Contact, EmailConfig, EmailLogEntry } from "@/types/email";

export interface ContactsHandle {
  contacts: Contact[]
  isLoading: boolean
  error: string | null
  // Contact CRUD
  reload(): Promise<void>
  search(query: string): Promise<Contact[]>
  resolve(name: string): Promise<Contact | null>
  add(contact: Omit<Contact, "id" | "source">): Promise<Contact>
  update(contact: Contact): Promise<void>
  remove(id: string): Promise<void>
  // Outlook sync
  syncOutlook(): Promise<{ imported: number; skipped: number; source: string }>
  isSyncing: boolean
  // Email config
  emailConfig: EmailConfig | null
  saveEmailConfig(cfg: EmailConfig): Promise<void>
  testConnection(cfg?: EmailConfig): Promise<string>
  // Email log
  emailLog: EmailLogEntry[]
  reloadLog(): Promise<void>
}

const DEFAULT_CONFIG: EmailConfig = {
  smtp_host: "",
  smtp_port: 587,
  username: "",
  password: "",
  from_name: "",
  from_email: "",
  tls_mode: "starttls",
}

export function useContacts(): ContactsHandle {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null)
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([])

  // Load contacts + config on mount
  useEffect(() => {
    reload()
    loadEmailConfig()
    reloadLog()
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await invoke<Contact[]>("contacts_list")
      setContacts(list)
      setError(null)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const search = useCallback(async (query: string): Promise<Contact[]> => {
    try {
      return await invoke<Contact[]>("contacts_search", { query, limit: 10 })
    } catch {
      return []
    }
  }, [])

  const resolve = useCallback(async (name: string): Promise<Contact | null> => {
    try {
      return await invoke<Contact | null>("contacts_resolve", { name })
    } catch {
      return null
    }
  }, [])

  const add = useCallback(async (contact: Omit<Contact, "id" | "source">): Promise<Contact> => {
    const result = await invoke<Contact>("contacts_add", {
      fullName: contact.full_name,
      email: contact.email,
      alias: contact.alias ?? null,
      company: contact.company ?? null,
      phone: contact.phone ?? null,
    })
    await reload()
    return result
  }, [reload])

  const update = useCallback(async (contact: Contact): Promise<void> => {
    await invoke("contacts_update", {
      id: contact.id,
      fullName: contact.full_name,
      email: contact.email,
      alias: contact.alias ?? null,
      company: contact.company ?? null,
      phone: contact.phone ?? null,
    })
    await reload()
  }, [reload])

  const remove = useCallback(async (id: string): Promise<void> => {
    await invoke("contacts_delete", { id })
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const syncOutlook = useCallback(async () => {
    setIsSyncing(true)
    try {
      const result = await invoke<{ imported: number; skipped: number; source: string }>(
        "contacts_sync_outlook"
      )
      await reload()
      return result
    } finally {
      setIsSyncing(false)
    }
  }, [reload])

  const loadEmailConfig = useCallback(async () => {
    try {
      const cfg = await invoke<EmailConfig>("email_config_get")
      setEmailConfig(cfg)
    } catch {
      setEmailConfig(DEFAULT_CONFIG)
    }
  }, [])

  const saveEmailConfig = useCallback(async (cfg: EmailConfig) => {
    await invoke("email_config_save", { config: cfg })
    setEmailConfig(cfg)
  }, [])

  const testConnection = useCallback(async (cfg?: EmailConfig): Promise<string> => {
    return await invoke<string>("email_test_connection", { config: cfg ?? null })
  }, [])

  const reloadLog = useCallback(async () => {
    try {
      const log = await invoke<EmailLogEntry[]>("email_log_list")
      setEmailLog(log)
    } catch {
      setEmailLog([])
    }
  }, [])

  return {
    contacts, isLoading, error,
    reload, search, resolve, add, update, remove,
    syncOutlook, isSyncing,
    emailConfig, saveEmailConfig, testConnection,
    emailLog, reloadLog,
  }
}
