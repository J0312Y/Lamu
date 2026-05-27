import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { safeLocalStorage } from "@/lib";

// ── Types ─────────────────────────────────────────────────────────────────────

export const ACCESS_LEVELS = ["public", "internal", "confidential", "secret"] as const;
export type AccessLevel = typeof ACCESS_LEVELS[number];

export interface KbDocument {
  id: string;
  name: string;
  source_type: string;
  access_level: AccessLevel;
  chunk_count: number;
  created_at: number;
  updated_at: number;
}

export interface KbSearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  source_type: string;
  content: string;
  similarity: number;
  chunk_index: number;
}

export interface KbStats {
  document_count: number;
  chunk_count: number;
  embedded_count: number;
}

export interface KbEmbedConfig {
  provider: string; // "ollama" | "openai" | "none"
  ollama_url: string;
  ollama_model: string;
  openai_key: string;
  openai_model: string;
}

export interface KbIngestProgress {
  step: "parsing" | "crawling" | "embedding" | "done";
  name: string;
  current?: number;
  total?: number;
}

export interface KbWatchedFolder {
  id: string;
  path: string;
  created_at: number;
}

export interface KbIntegration {
  id: string;
  provider: string;
  name: string;
  last_synced_at: number | null;
  sync_interval_hours: number | null;
  created_at: number;
}

export interface KbWebhook {
  id: string;
  name: string;
  provider: string;
  url: string;
  created_at: number;
}

const DEFAULT_EMBED_CONFIG: KbEmbedConfig = {
  provider: "ollama",
  ollama_url: "http://localhost:11434",
  ollama_model: "nomic-embed-text",
  openai_key: "",
  openai_model: "text-embedding-3-small",
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface GithubDeviceCode {
  user_code: string;
  verification_uri: string;
}

export function useKnowledgeBase() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [stats, setStats] = useState<KbStats>({
    document_count: 0,
    chunk_count: 0,
    embedded_count: 0,
  });
  const [embedConfig, setEmbedConfigState] =
    useState<KbEmbedConfig>(DEFAULT_EMBED_CONFIG);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] =
    useState<KbIngestProgress | null>(null);
  const [ingestError, setIngestError] = useState<string>("");

  const [watchedFolders, setWatchedFolders] = useState<KbWatchedFolder[]>([]);
  const [integrations, setIntegrations] = useState<KbIntegration[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<KbWebhook[]>([]);
  const [builtinProviders, setBuiltinProviders] = useState<string[]>([]);
  const [githubDeviceCode, setGithubDeviceCode] = useState<GithubDeviceCode | null>(null);

  // Whether KB context is injected into every AI call
  const [kbEnabled, setKbEnabledState] = useState<boolean>(
    () => safeLocalStorage.getItem("kb_enabled") === "true"
  );

  // ── Refresh helpers ─────────────────────────────────────────────────────────

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await invoke<KbDocument[]>("kb_list_documents");
      setDocuments(docs);
    } catch (e) {
      console.error("KB list documents error:", e);
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const s = await invoke<KbStats>("kb_get_stats");
      setStats(s);
    } catch (e) {
      console.error("KB stats error:", e);
    }
  }, []);

  const loadEmbedConfig = useCallback(async () => {
    try {
      const cfg = await invoke<KbEmbedConfig>("kb_get_embed_config");
      setEmbedConfigState(cfg);
    } catch (e) {
      console.error("KB embed config load error:", e);
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      const folders = await invoke<KbWatchedFolder[]>("kb_list_watched_folders");
      setWatchedFolders(folders);
    } catch (e) {
      console.error("KB folders list error:", e);
    }
  }, []);

  const refreshIntegrations = useCallback(async () => {
    try {
      const list = await invoke<KbIntegration[]>("kb_list_integrations");
      setIntegrations(list);
    } catch (e) {
      console.error("KB integrations list error:", e);
    }
  }, []);

  const refreshWebhooks = useCallback(async () => {
    try {
      const list = await invoke<KbWebhook[]>("kb_list_webhooks");
      setWebhooks(list);
    } catch (e) {
      console.error("KB webhooks list error:", e);
    }
  }, []);

  // ── Mount: load initial data ────────────────────────────────────────────────

  useEffect(() => {
    refreshDocuments();
    refreshStats();
    loadEmbedConfig();
    refreshFolders();
    refreshIntegrations();
    refreshWebhooks();
    // Load which providers have built-in OAuth credentials
    invoke<string[]>("kb_list_builtin_providers")
      .then(setBuiltinProviders)
      .catch(() => {});
  }, []);

  // ── Listen for ingest progress events from Rust ─────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<KbIngestProgress>("kb-ingest-progress", (e) => {
      setIngestProgress(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // ── Listen for GitHub Device Flow code ──────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<GithubDeviceCode>("github-device-code", (e) => {
      setGithubDeviceCode(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const ingestFile = useCallback(
    async (file: File): Promise<KbDocument | null> => {
      setIsIngesting(true);
      setIngestError("");
      setIngestProgress({ step: "parsing", name: file.name });

      try {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));

        const doc = await invoke<KbDocument>("kb_ingest_file", {
          name: file.name,
          fileBytes: bytes,
        });

        await refreshDocuments();
        await refreshStats();
        return doc;
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        setIngestError(msg);
        return null;
      } finally {
        setIsIngesting(false);
        setIngestProgress(null);
      }
    },
    [refreshDocuments, refreshStats]
  );

  const ingestUrl = useCallback(
    async (url: string): Promise<KbDocument | null> => {
      setIsIngesting(true);
      setIngestError("");
      setIngestProgress({ step: "crawling", name: url });

      try {
        const doc = await invoke<KbDocument>("kb_ingest_url", { url });
        await refreshDocuments();
        await refreshStats();
        return doc;
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        setIngestError(msg);
        return null;
      } finally {
        setIsIngesting(false);
        setIngestProgress(null);
      }
    },
    [refreshDocuments, refreshStats]
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      try {
        await invoke("kb_delete_document", { id });
        await refreshDocuments();
        await refreshStats();
      } catch (e) {
        console.error("KB delete error:", e);
      }
    },
    [refreshDocuments, refreshStats]
  );

  const updateEmbedConfig = useCallback(async (config: KbEmbedConfig) => {
    try {
      await invoke("kb_set_embed_config", { config });
      setEmbedConfigState(config);
    } catch (e) {
      console.error("KB embed config update error:", e);
    }
  }, []);

  const toggleKbEnabled = useCallback((enabled: boolean) => {
    setKbEnabledState(enabled);
    safeLocalStorage.setItem("kb_enabled", String(enabled));
  }, []);

  /** Fire a semantic search and return ranked results. Returns [] on error. */
  const searchKb = useCallback(
    async (query: string, topK = 5): Promise<KbSearchResult[]> => {
      try {
        return await invoke<KbSearchResult[]>("kb_search", { query, topK });
      } catch (e) {
        console.error("KB search error:", e);
        return [];
      }
    },
    []
  );

  // ── Watched folder actions ──────────────────────────────────────────────────

  const addWatchedFolder = useCallback(
    async (path: string) => {
      try {
        await invoke("kb_add_watched_folder", { path });
        await refreshFolders();
      } catch (e) {
        console.error("KB add folder error:", e);
      }
    },
    [refreshFolders]
  );

  const removeWatchedFolder = useCallback(
    async (id: string) => {
      try {
        await invoke("kb_remove_watched_folder", { id });
        await refreshFolders();
      } catch (e) {
        console.error("KB remove folder error:", e);
      }
    },
    [refreshFolders]
  );

  // ── Integration actions ─────────────────────────────────────────────────────

  const connectIntegration = useCallback(
    async (
      provider: string,
      clientId: string,
      clientSecret: string,
      tenant?: string
    ): Promise<boolean> => {
      try {
        await invoke("kb_connect_integration", {
          provider,
          clientId,
          clientSecret,
          tenant: tenant ?? null,
        });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        setIngestError(msg);
        return false;
      }
    },
    [refreshIntegrations]
  );

  const addConfluence = useCallback(
    async (
      baseUrl: string,
      email: string,
      apiToken: string
    ): Promise<boolean> => {
      try {
        await invoke("kb_add_confluence", { baseUrl, email, apiToken });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        setIngestError(msg);
        return false;
      }
    },
    [refreshIntegrations]
  );

  const disconnectIntegration = useCallback(
    async (id: string) => {
      try {
        await invoke("kb_disconnect_integration", { id });
        await refreshIntegrations();
      } catch (e) {
        console.error("KB disconnect integration error:", e);
      }
    },
    [refreshIntegrations]
  );

  const syncIntegration = useCallback(
    async (id: string): Promise<number> => {
      setSyncingId(id);
      try {
        const count = await invoke<number>("kb_sync_integration", { id });
        await refreshDocuments();
        await refreshStats();
        await refreshIntegrations();
        return count;
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        setIngestError(msg);
        return 0;
      } finally {
        setSyncingId(null);
      }
    },
    [refreshDocuments, refreshStats, refreshIntegrations]
  );

  // ── Webhook actions ─────────────────────────────────────────────────────────

  const addWebhook = useCallback(
    async (name: string, provider: string, url: string): Promise<boolean> => {
      try {
        await invoke("kb_add_webhook", { name, provider, url });
        await refreshWebhooks();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshWebhooks]
  );

  const removeWebhook = useCallback(
    async (id: string) => {
      try {
        await invoke("kb_remove_webhook", { id });
        await refreshWebhooks();
      } catch (e) {
        console.error("KB remove webhook error:", e);
      }
    },
    [refreshWebhooks]
  );

  const postWebhook = useCallback(async (id: string, message: string) => {
    try {
      await invoke("kb_post_webhook", { id, message });
    } catch (e) {
      console.error("KB post webhook error:", e);
    }
  }, []);

  // ── Export ──────────────────────────────────────────────────────────────────

  const exportCsv = useCallback(async () => {
    try {
      const csv = await invoke<string>("kb_export_csv");
      // Check that the CSV contains data rows beyond just the header line
      const lines = csv.trim().split("\n");
      if (lines.length < 2) {
        console.warn("KB export: knowledge base is empty, nothing to export");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-base-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("KB export CSV error:", e);
    }
  }, []);

  // ── Access control ──────────────────────────────────────────────────────────

  const setDocumentAccess = useCallback(
    async (id: string, accessLevel: string) => {
      try {
        await invoke("kb_set_document_access", { id, accessLevel });
        await refreshDocuments();
      } catch (e) {
        console.error("KB set access error:", e);
      }
    },
    [refreshDocuments]
  );

  // ── Sync interval ───────────────────────────────────────────────────────────

  const setSyncInterval = useCallback(
    async (id: string, hours: number) => {
      try {
        await invoke("kb_set_sync_interval", { id, hours });
        await refreshIntegrations();
      } catch (e) {
        console.error("KB set sync interval error:", e);
      }
    },
    [refreshIntegrations]
  );

  // ── Add Jira ────────────────────────────────────────────────────────────────

  const addJira = useCallback(
    async (baseUrl: string, email: string, apiToken: string): Promise<boolean> => {
      try {
        await invoke("kb_add_jira", { baseUrl, email, apiToken });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── Add Shopify ─────────────────────────────────────────────────────────────

  const addShopify = useCallback(
    async (shopDomain: string, accessToken: string): Promise<boolean> => {
      try {
        await invoke("kb_add_shopify", { shopDomain, accessToken });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── Add Salesforce ──────────────────────────────────────────────────────────

  const addSalesforce = useCallback(
    async (clientId: string, clientSecret: string, instanceUrl: string): Promise<boolean> => {
      try {
        await invoke("kb_add_salesforce", { clientId, clientSecret, instanceUrl });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── Add GitHub ──────────────────────────────────────────────────────────────

  const addGithub = useCallback(
    async (token: string, owner: string, repo?: string): Promise<boolean> => {
      try {
        await invoke("kb_add_github", { token, owner, repo: repo ?? null });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── GitHub Device Flow connect ──────────────────────────────────────────────

  const githubDeviceConnect = useCallback(
    async (owner: string, repo?: string): Promise<boolean> => {
      setGithubDeviceCode(null);
      try {
        await invoke("kb_github_device_connect", { owner, repo: repo ?? null });
        await refreshIntegrations();
        setGithubDeviceCode(null);
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        setGithubDeviceCode(null);
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── Built-in OAuth connect ──────────────────────────────────────────────────

  const connectBuiltin = useCallback(
    async (provider: string, tenant?: string): Promise<boolean> => {
      try {
        await invoke("kb_connect_builtin", { provider, tenant: tenant ?? null });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  // ── Add Database (PostgreSQL / MySQL) ───────────────────────────────────────

  const addDatabase = useCallback(
    async (
      dbType: "postgres" | "mysql",
      alias: string,
      host: string,
      port: number,
      dbname: string,
      username: string,
      password: string,
      ssl: boolean
    ): Promise<boolean> => {
      try {
        await invoke("kb_add_database", { dbType, alias, host, port, dbname, username, password, ssl });
        await refreshIntegrations();
        return true;
      } catch (e: any) {
        setIngestError(typeof e === "string" ? e : e?.message ?? "Unknown error");
        return false;
      }
    },
    [refreshIntegrations]
  );

  return {
    documents,
    stats,
    embedConfig,
    isIngesting,
    ingestProgress,
    ingestError,
    kbEnabled,
    watchedFolders,
    integrations,
    syncingId,
    webhooks,
    builtinProviders,
    githubDeviceCode,
    toggleKbEnabled,
    ingestFile,
    ingestUrl,
    deleteDocument,
    updateEmbedConfig,
    searchKb,
    refreshDocuments,
    refreshStats,
    addWatchedFolder,
    removeWatchedFolder,
    connectIntegration,
    connectBuiltin,
    addConfluence,
    addJira,
    addShopify,
    addSalesforce,
    addGithub,
    githubDeviceConnect,
    addDatabase,
    disconnectIntegration,
    syncIntegration,
    setSyncInterval,
    addWebhook,
    removeWebhook,
    postWebhook,
    exportCsv,
    setDocumentAccess,
    refreshIntegrations,
  };
}

export type useKnowledgeBaseType = ReturnType<typeof useKnowledgeBase>;
