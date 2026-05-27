import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { PageLayout } from "@/layouts";
import { Input, PremiumGate } from "@/components";
import {
  BookOpenIcon,
  BotIcon,
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  HardDriveIcon,
  Loader2Icon,
  PlusIcon,
  PlugIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  Trash2Icon,
  UploadIcon,
  LinkIcon,
  WebhookIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKnowledgeBase } from "@/hooks";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions";
import { isWriteSql, extractSqlBlocks } from "@/lib/sqlUtils";
import { DbAgentPanel } from "@/pages/app/components/completion/DbAgentPanel";
import { ACCESS_LEVELS } from "@/hooks/useKnowledgeBase";
import type { KbSearchResult } from "@/hooks/useKnowledgeBase";
import { FileSearchPanel } from "./FileSearchPanel";

const ACCEPTED = ".txt,.md,.pdf,.docx,.csv,.rst,.markdown";

const INTEGRATION_LABELS: Record<string, string> = {
  notion: "Notion",
  gdrive: "Google Drive",
  sharepoint: "SharePoint",
  confluence: "Confluence",
  jira: "Jira",
  shopify: "Shopify",
  salesforce: "Salesforce",
  github: "GitHub",
  gitlab: "GitLab",
  postgres: "PostgreSQL",
  mysql: "MySQL / MariaDB",
};

const ACCESS_COLORS: Record<string, string> = {
  public: "bg-green-500/10 text-green-600",
  internal: "bg-blue-500/10 text-blue-600",
  confidential: "bg-orange-500/10 text-orange-600",
  secret: "bg-red-500/10 text-red-600",
};

const sourceIcon = (type: string, size = "w-3.5 h-3.5") => {
  if (type === "url")
    return <GlobeIcon className={cn(size, "text-muted-foreground flex-shrink-0")} />;
  if (type === "folder")
    return <FolderOpenIcon className={cn(size, "text-muted-foreground flex-shrink-0")} />;
  if (type.startsWith("integration:"))
    return <PlugIcon className={cn(size, "text-muted-foreground flex-shrink-0")} />;
  return <FileTextIcon className={cn(size, "text-muted-foreground flex-shrink-0")} />;
};

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ── Knowledge Base Page ────────────────────────────────────────────────────────

const KnowledgeBasePage = () => {
  const kb = useKnowledgeBase();
  const { selectedAIProvider, allAiProviders } = useApp();
  const {
    documents, stats, embedConfig, isIngesting, ingestProgress, ingestError,
    watchedFolders, integrations, syncingId, webhooks,
    builtinProviders, githubDeviceCode,
    ingestFile, ingestUrl, deleteDocument, updateEmbedConfig,
    addWatchedFolder, removeWatchedFolder,
    connectIntegration, connectBuiltin, addConfluence, addJira, addShopify, addSalesforce, addGithub,
    githubDeviceConnect,
    disconnectIntegration, syncIntegration, setSyncInterval,
    addWebhook, removeWebhook,
    exportCsv, setDocumentAccess,
  } = kb;

  const [activeTab, setActiveTab] = useState<"search" | "documents" | "sources" | "files" | "settings" | "sql">("documents");

  const handleTabChange = (tab: "search" | "documents" | "sources" | "files" | "settings" | "sql") => {
    setActiveTab(tab);
    if (tab === "search") kb.refreshStats();
  };

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KbSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [isAiAnswering, setIsAiAnswering] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  // DB agent state for Search tab
  const [searchDbResults, setSearchDbResults] = useState<Array<{
    sql: string; dbName: string; integrationId: string; data: string; error?: string; type: "read" | "write"; executed: boolean;
  }>>([]);
  const [searchDbLoading, setSearchDbLoading] = useState(false);
  const [searchPendingWrite, setSearchPendingWrite] = useState<{
    sql: string; dbName: string; integrationId: string;
  } | null>(null);

  const SUMMARIZE_PATTERN = /\b(summarize|summarise|summary|résume|résumé|résumer|récapitule|récapituler)\b/i;

  function extractAlias(name: string) { return name.split(" (")[0].trim(); }
  // isWriteSql and extractSqlBlocks imported from @/lib/sqlUtils

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    // Detect summarization intent
    if (SUMMARIZE_PATTERN.test(searchQuery)) {
      const queryLower = searchQuery.toLowerCase();
      const matchedDoc =
        documents.find((doc) => queryLower.includes(doc.name.toLowerCase())) ??
        (documents.length === 1 ? documents[0] : null);
      if (matchedDoc) { await summarizeDoc(matchedDoc.id, matchedDoc.name); return; }
    }

    setIsSearching(true);
    setSearchError(null);
    setAiAnswer("");
    setSearchDbResults([]);
    setSearchPendingWrite(null);

    try {
      // Semantic KB search
      const results = await invoke<KbSearchResult[]>("kb_search", { query: searchQuery, topK: 8 });
      setSearchResults(results);

      // Fetch live DB context if query is DB-related
      let liveDbContext = "";
      let dbIntegrationsList: Array<{ id: string; provider: string; name: string }> = [];
      try {
        const allInteg = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
        dbIntegrationsList = allInteg.filter((i) => ["postgres", "mysql"].includes(i.provider));
        if (dbIntegrationsList.length > 0) {
          const parts: string[] = [];
          await Promise.all(dbIntegrationsList.map(async (integ) => {
            try {
              // 1. Always fetch schema
              const schema = await invoke<string>("kb_database_get_schema", { integrationId: integ.id });
              if (schema?.trim()) parts.push(schema);
              // 2. Execute live query to get REAL data rows, pass them to AI as facts
              const liveData = await invoke<string>("kb_integration_live_query", {
                integrationId: integ.id, queryHint: searchQuery,
              });
              if (liveData?.trim()) parts.push(`=== Données réelles extraites de la base ===\n${liveData}`);
            } catch { /* best-effort */ }
          }));
          if (parts.length > 0) liveDbContext = parts.join("\n\n");
        }
      } catch { /* best-effort */ }

      await askAI(searchQuery, results, liveDbContext, dbIntegrationsList);
    } catch (e) {
      console.error("Search error:", e);
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSearching(false);
    }
  };

  const askAI = async (
    question: string,
    chunks: KbSearchResult[],
    liveDbContext = "",
    dbIntegrationsList: Array<{ id: string; provider: string; name: string }> = []
  ) => {
    if (aiAbortRef.current) aiAbortRef.current.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setIsAiAnswering(true);
    setAiAnswer("");

    let systemPrompt = "Tu es un assistant de base de données. Réponds directement et précisément en utilisant les données fournies dans le contexte. Ne dis jamais que tu ne peux pas accéder aux données — elles sont déjà dans ton contexte. Utilise-les pour répondre.";

    // Add KB document context
    if (chunks.length > 0) {
      const context = chunks.map((r, i) => `[${i + 1}] From "${r.document_name}":\n${r.content}`).join("\n\n");
      systemPrompt += `\n\n--- Knowledge base ---\n${context}\n---`;
    }

    // Add live DB context
    if (liveDbContext) {
      systemPrompt += `\n\n--- Base de données connectée (données réelles) ---\n${liveDbContext}\n---\nCes données sont réelles et extraites directement de la base. Utilise-les pour répondre à la question de l'utilisateur. Si l'utilisateur demande des données spécifiques, génère une requête SQL dans un bloc \`\`\`sql\`\`\` en utilisant UNIQUEMENT les colonnes du schéma fourni.`;
    }
    if (dbIntegrationsList.length > 0 && !liveDbContext) {
      systemPrompt += `\n\nBase de données disponible: ${dbIntegrationsList.map((i) => extractAlias(i.name)).join(", ")}`;
    }

    let fullAnswer = "";
    try {
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      for await (const chunk of fetchAIResponse({
        provider, selectedProvider: selectedAIProvider,
        systemPrompt, userMessage: question, signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        fullAnswer += chunk;
        setAiAnswer((prev) => prev + chunk);
      }
    } catch (e) {
      console.error("AI answer error:", e);
    } finally {
      setIsAiAnswering(false);
    }

    // Execute SQL blocks from AI response
    if (fullAnswer && dbIntegrationsList.length > 0) {
      const sqlBlocks = extractSqlBlocks(fullAnswer);
      if (sqlBlocks.length > 0) {
        const firstDb = dbIntegrationsList[0];
        setSearchDbLoading(true);
        const reads = sqlBlocks.filter((s) => !isWriteSql(s));
        const writes = sqlBlocks.filter((s) => isWriteSql(s));

        const readResults = await Promise.all(reads.map(async (sql) => {
          try {
            const data = await invoke<string>("kb_database_query", {
              integrationId: firstDb.id, sql, allowWrite: false,
            });
            return { sql, dbName: firstDb.name, integrationId: firstDb.id, data, type: "read" as const, executed: true };
          } catch (e: any) {
            return { sql, dbName: firstDb.name, integrationId: firstDb.id, data: "", error: String(e?.message ?? e), type: "read" as const, executed: false };
          }
        }));

        setSearchDbResults(readResults);
        setSearchDbLoading(false);
        if (writes.length > 0) {
          setSearchPendingWrite({ sql: writes[0], dbName: firstDb.name, integrationId: firstDb.id });
        }
      }
    }
  };

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) await ingestFile(file);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(txt|md|pdf|docx|csv|rst|markdown)$/i.test(f.name)
    );
    for (const file of files) await ingestFile(file);
  };

  // URL ingestion
  const [urlInput, setUrlInput] = useState("");
  const handleIngestUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlInput("");
    await ingestUrl(url);
  };

  // Folder watcher
  const handleAddFolder = async () => {
    const path = window.prompt("Enter the full path to the folder you want to watch:");
    if (!path?.trim()) return;
    await addWatchedFolder(path.trim());
  };

  // Integration connect form
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [integForm, setIntegForm] = useState({
    clientId: "", clientSecret: "", tenant: "",
    baseUrl: "", email: "", apiToken: "",
    shopDomain: "", accessToken: "",
    instanceUrl: "",
    ghToken: "", owner: "", repo: "",
    glToken: "", glUrl: "https://gitlab.com", glProjectId: "",
    // Database
    dbType: "postgres" as "postgres" | "mysql",
    dbAlias: "", dbHost: "localhost", dbPort: "5432",
    dbName: "", dbUser: "", dbPass: "", dbSsl: false,
  });

  const handleConnect = async (provider: string, useBuiltin = false) => {
    let ok = false;
    if (useBuiltin && ["notion", "gdrive", "salesforce", "sharepoint"].includes(provider)) {
      ok = await connectBuiltin(provider, provider === "sharepoint" ? integForm.tenant || undefined : undefined);
    } else if (provider === "confluence") {
      ok = await addConfluence(integForm.baseUrl, integForm.email, integForm.apiToken);
    } else if (provider === "jira") {
      ok = await addJira(integForm.baseUrl, integForm.email, integForm.apiToken);
    } else if (provider === "shopify") {
      ok = await addShopify(integForm.shopDomain, integForm.accessToken);
    } else if (provider === "salesforce") {
      ok = await addSalesforce(integForm.clientId, integForm.clientSecret, integForm.instanceUrl);
    } else if (provider === "github") {
      if (builtinProviders.includes("github")) {
        // Device Flow (no PAT needed)
        ok = await githubDeviceConnect(integForm.owner, integForm.repo || undefined);
      } else {
        ok = await addGithub(integForm.ghToken, integForm.owner, integForm.repo || undefined);
      }
    } else if (provider === "gitlab") {
      ok = await invoke<boolean>("kb_add_gitlab", {
        token: integForm.glToken,
        gitlabUrl: integForm.glUrl || "https://gitlab.com",
        projectId: integForm.glProjectId,
      }).then(() => true).catch(() => false);
      if (ok) await kb.refreshDocuments();
    } else if (provider === "postgres" || provider === "mysql") {
      try {
        ok = await invoke<boolean>("kb_add_database", {
          dbType: provider,
          alias: integForm.dbAlias || `${provider}-${integForm.dbHost}`,
          host: integForm.dbHost,
          port: parseInt(integForm.dbPort) || (provider === "mysql" ? 3306 : 5432),
          dbname: integForm.dbName,
          username: integForm.dbUser,
          password: integForm.dbPass,
          ssl: integForm.dbSsl,
        });
        if (ok) {
          await kb.refreshDocuments();
          await kb.refreshIntegrations();
        }
      } catch (err) {
        setConnectError(String(err));
        ok = false;
      }
    } else {
      ok = await connectIntegration(
        provider, integForm.clientId, integForm.clientSecret,
        provider === "sharepoint" ? integForm.tenant || "common" : undefined
      );
    }
    if (ok) {
      setConnectingProvider(null);
      setIntegForm({
        clientId: "", clientSecret: "", tenant: "",
        baseUrl: "", email: "", apiToken: "",
        shopDomain: "", accessToken: "",
        instanceUrl: "",
        ghToken: "", owner: "", repo: "",
        glToken: "", glUrl: "https://gitlab.com", glProjectId: "",
        dbType: "postgres", dbAlias: "", dbHost: "localhost", dbPort: "5432",
        dbName: "", dbUser: "", dbPass: "", dbSsl: false,
      });
    }
  };

  // Webhook form
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ name: "", provider: "slack", url: "" });

  const handleAddWebhook = async () => {
    if (!webhookForm.url.trim()) return;
    const ok = await addWebhook(webhookForm.name || webhookForm.provider, webhookForm.provider, webhookForm.url);
    if (ok) {
      setShowWebhookForm(false);
      setWebhookForm({ name: "", provider: "slack", url: "" });
    }
  };

  // Re-embed
  const [isReembedding, setIsReembedding] = useState(false);
  const [reembedProgress, setReembedProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ current: number; total: number }>("kb-reembed-progress", (e) => {
      setReembedProgress(e.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleReembedAll = async (force: boolean) => {
    setIsReembedding(true);
    setReembedProgress(null);
    try {
      await invoke("kb_reembed_all", { force });
      await kb.refreshStats();
    } catch (e) {
      console.error("Re-embed error:", e);
    } finally {
      setIsReembedding(false);
      setReembedProgress(null);
    }
  };

  // Summarize document
  const [summarizingDocId, setSummarizingDocId] = useState<string | null>(null);

  const summarizeDoc = async (docId: string, docName: string) => {
    setSummarizingDocId(docId);
    setActiveTab("search");
    setSearchQuery(`Summary of "${docName}"`);
    setSearchResults([]);
    setAiAnswer("");

    if (aiAbortRef.current) aiAbortRef.current.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setIsAiAnswering(true);

    try {
      const chunks = await invoke<string[]>("kb_get_document_chunks", { documentId: docId });
      if (chunks.length === 0) {
        setAiAnswer("No content found for this document.");
        return;
      }

      const fullText = chunks.join("\n\n");
      const systemPrompt = `You are a helpful assistant. Provide a clear, structured summary of the document below. Highlight the main topics, key points, and any important conclusions.\n\nDocument: "${docName}"\n\n${fullText}`;

      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt,
        userMessage: `Please summarize the document "${docName}".`,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        setAiAnswer((prev) => prev + chunk);
      }
    } catch (e) {
      console.error("Summarize error:", e);
      setAiAnswer(`Error generating summary: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsAiAnswering(false);
      setSummarizingDocId(null);
    }
  };

  // Access level change (per document)
  const [editingAccessId, setEditingAccessId] = useState<string | null>(null);

  const progressLabel = () => {
    if (!ingestProgress) return "";
    if (ingestProgress.step === "crawling") return `Crawling ${ingestProgress.name}…`;
    if (ingestProgress.step === "parsing") return `Parsing ${ingestProgress.name}…`;
    if (ingestProgress.step === "embedding") {
      const { current = 0, total = 1 } = ingestProgress;
      return `Embedding ${current}/${total} chunks…`;
    }
    return "Done";
  };

  // ── Direct SQL panel state ────────────────────────────────────────────────
  const [sqlPanelIntegId, setSqlPanelIntegId] = useState<string>("");
  const [sqlPanelSchema, setSqlPanelSchema] = useState<string>("");
  const [sqlPanelSchemaLoading, setSqlPanelSchemaLoading] = useState(false);
  const [sqlInput, setSqlInput] = useState("SELECT * FROM ");
  const [sqlResult, setSqlResult] = useState<string>("");
  const [sqlError, setSqlError] = useState<string>("");
  const [sqlRunning, setSqlRunning] = useState(false);

  const loadSqlSchema = async (integId: string) => {
    if (!integId) return;
    setSqlPanelSchemaLoading(true);
    setSqlPanelSchema("");
    try {
      const schema = await invoke<string>("kb_database_get_schema", { integrationId: integId });
      setSqlPanelSchema(schema || "");
    } catch (e) {
      setSqlPanelSchema(`Erreur schéma: ${e}`);
    } finally {
      setSqlPanelSchemaLoading(false);
    }
  };

  const runSqlQuery = async () => {
    if (!sqlPanelIntegId || !sqlInput.trim()) return;
    setSqlRunning(true);
    setSqlResult("");
    setSqlError("");
    try {
      const data = await invoke<string>("kb_database_query", {
        integrationId: sqlPanelIntegId,
        sql: sqlInput.trim(),
        allowWrite: false,
      });
      setSqlResult(data || "");
    } catch (e: any) {
      setSqlError(String(e?.message ?? e));
    } finally {
      setSqlRunning(false);
    }
  };

  const tabs = [
    { id: "search", label: "Search", icon: SearchIcon },
    { id: "documents", label: "Documents", icon: FileTextIcon },
    { id: "sources", label: "Sources", icon: DatabaseIcon },
    { id: "sql", label: "SQL", icon: DatabaseIcon },
    { id: "files", label: "Fichiers PC", icon: HardDriveIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ] as const;

  return (
    <PageLayout title="Knowledge Base" description="Manage documents, sources, and semantic search for AI context.">
      <PremiumGate featureName="Knowledge Base">
      {/* Stats bar */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileTextIcon className="w-4 h-4" />
          <strong className="text-foreground">{stats.document_count}</strong> documents
        </span>
        <span className="flex items-center gap-1.5">
          <DatabaseIcon className="w-4 h-4" />
          <strong className="text-foreground">{stats.chunk_count}</strong> chunks
        </span>
        <span className="flex items-center gap-1.5">
          <BookOpenIcon className="w-4 h-4" />
          <strong className="text-foreground">{stats.embedded_count}</strong> embedded
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => handleTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Search tab ── */}
      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Warning: some chunks are missing embeddings (partial state) */}
          {stats.embedded_count > 0 && stats.embedded_count < stats.chunk_count && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-700 dark:text-yellow-400">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>
                {stats.chunk_count - stats.embedded_count} chunk(s) are missing embeddings.
                Go to <button type="button" className="underline font-medium" onClick={() => handleTabChange("settings")}>Settings</button> and click "Embed missing" to fix this.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Ask a question or search your knowledge base…" className="flex-1" />
            <button type="button" onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSearching ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
              Search
            </button>
          </div>

          {searchError && (
            <p className="text-sm text-destructive">{searchError}</p>
          )}

          {/* AI Answer */}
          {(aiAnswer || isAiAnswering) && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BotIcon className="w-4 h-4 text-primary" />
                <span>AI Answer</span>
                {isAiAnswering && <Loader2Icon className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
              {/* DB query results */}
              <DbAgentPanel
                dbResults={searchDbResults}
                pendingWrite={searchPendingWrite ? { ...searchPendingWrite, writeQueue: [] } : null}
                dbQueryLoading={searchDbLoading}
                onConfirmWrite={async (confirmed) => {
                  if (!searchPendingWrite) return;
                  if (confirmed) {
                    try {
                      const data = await invoke<string>("kb_database_query", {
                        integrationId: searchPendingWrite.integrationId,
                        sql: searchPendingWrite.sql,
                        allowWrite: true,
                      });
                      setSearchDbResults((prev) => [...prev, { ...searchPendingWrite, type: "write" as const, data, executed: true }]);
                    } catch (e: any) {
                      setSearchDbResults((prev) => [...prev, { ...searchPendingWrite, type: "write" as const, data: "", error: String(e?.message ?? e), executed: false }]);
                    }
                  }
                  setSearchPendingWrite(null);
                }}
                onRerun={async (sql, integrationId, dbName) => {
                  setSearchDbLoading(true);
                  try {
                    const data = await invoke<string>("kb_database_query", { integrationId, sql, allowWrite: false });
                    setSearchDbResults((prev) => [...prev, { sql, dbName, integrationId, data, type: "read" as const, executed: true }]);
                  } catch (e: any) {
                    setSearchDbResults((prev) => [...prev, { sql, dbName, integrationId, data: "", error: String(e?.message ?? e), type: "read" as const, executed: false }]);
                  } finally {
                    setSearchDbLoading(false);
                  }
                }}
              />
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{searchResults.length} results for "{searchQuery}"</p>
              {searchResults.map((r) => (
                <div key={r.chunk_id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sourceIcon(r.document_name.startsWith("http") ? "url" : "file")}
                      <span className="text-sm font-medium">{r.document_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{(r.similarity * 100).toFixed(0)}% match</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !isSearching && !aiAnswer && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No matching content found. Try different keywords or add more documents.
            </p>
          )}

          {stats.document_count === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpenIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Your knowledge base is empty.</p>
              <p className="text-xs mt-1">Add documents in the Documents tab to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Documents tab ── */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          {/* URL input */}
          <div className="flex gap-2">
            <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
              placeholder="https://… paste a URL to crawl and ingest" className="flex-1" />
            <button type="button" onClick={handleIngestUrl}
              disabled={isIngesting || !urlInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <LinkIcon className="w-4 h-4" /> Add URL
            </button>
          </div>

          {/* Drop zone */}
          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleFileChange} />
            {isIngesting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2Icon className="w-6 h-6 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">{progressLabel()}</span>
                {ingestProgress?.step === "embedding" && ingestProgress.total && (
                  <div className="w-48 bg-muted rounded-full h-1.5 mt-1">
                    <div className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${((ingestProgress.current ?? 0) / ingestProgress.total) * 100}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadIcon className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Drop files here or click to upload</span>
                <span className="text-xs text-muted-foreground/60">PDF, DOCX, TXT, Markdown, CSV</span>
              </div>
            )}
          </div>

          {ingestError && <p className="text-sm text-destructive">{ingestError}</p>}

          {/* Export + document list */}
          {documents.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
                <button type="button" onClick={exportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
                >
                  <DownloadIcon className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>

              <div className="space-y-1">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-lg border border-border/50 hover:border-border transition-all group">
                    <div className="flex items-center gap-3 py-2.5 px-3">
                      {sourceIcon(doc.source_type, "w-4 h-4")}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.source_type} · {doc.chunk_count} chunks · {formatDate(doc.created_at)}
                        </p>
                      </div>

                      {/* Access level badge / selector */}
                      {editingAccessId === doc.id ? (
                        <select
                          autoFocus
                          value={doc.access_level}
                          onBlur={() => setEditingAccessId(null)}
                          onChange={async (e) => {
                            await setDocumentAccess(doc.id, e.target.value);
                            setEditingAccessId(null);
                          }}
                          className="text-xs rounded border border-border bg-background px-1 py-0.5"
                        >
                          {ACCESS_LEVELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      ) : (
                        <button type="button"
                          onClick={() => setEditingAccessId(doc.id)}
                          title="Click to change access level"
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                            ACCESS_COLORS[doc.access_level] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          <ShieldIcon className="w-2.5 h-2.5" />
                          {doc.access_level}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => summarizeDoc(doc.id, doc.name)}
                        disabled={summarizingDocId === doc.id}
                        title="Summarize document"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                      >
                        {summarizingDocId === doc.id
                          ? <Loader2Icon className="w-4 h-4 animate-spin" />
                          : <BookOpenIcon className="w-4 h-4" />}
                      </button>

                      <button type="button" onClick={() => deleteDocument(doc.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {documents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileTextIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents yet. Upload a file or add a URL above.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Sources tab ── */}
      {activeTab === "sources" && (
        <div className="space-y-6">
          {/* Watched Folders */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Watched Folders</h3>
                <p className="text-xs text-muted-foreground">Files added or modified are automatically ingested.</p>
              </div>
              <button type="button" onClick={handleAddFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add Folder
              </button>
            </div>

            {watchedFolders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border/60 rounded-lg">No folders watched yet.</p>
            ) : (
              <div className="space-y-1">
                {watchedFolders.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border/50 group">
                    <FolderOpenIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <p className="flex-1 text-sm font-mono truncate">{f.path}</p>
                    <button type="button" onClick={() => removeWatchedFolder(f.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                    ><Trash2Icon className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Integrations */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Integrations</h3>
              <p className="text-xs text-muted-foreground">Connect Notion, Google Drive, SharePoint, Confluence, Jira, Shopify, Salesforce, or GitHub.</p>
            </div>

            {integrations.length > 0 && (
              <div className="space-y-2">
                {integrations.map((integ) => (
                  <div key={integ.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <PlugIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {INTEGRATION_LABELS[integ.provider] ?? integ.provider}
                          <span className="text-muted-foreground font-normal"> · {integ.name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {integ.last_synced_at ? `Last synced ${formatDate(integ.last_synced_at)}` : "Not yet synced"}
                        </p>
                      </div>
                      <button type="button" disabled={syncingId === integ.id}
                        onClick={() => syncIntegration(integ.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-accent disabled:opacity-50 transition-colors"
                      >
                        <RefreshCwIcon className={cn("w-3 h-3", syncingId === integ.id && "animate-spin")} />
                        Sync
                      </button>
                      <button type="button" onClick={() => disconnectIntegration(integ.id)}
                        className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                      ><Trash2Icon className="w-3.5 h-3.5" /></button>
                    </div>

                    {/* Auto-sync interval */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pl-7">
                      <span>Auto-sync every</span>
                      <select
                        value={integ.sync_interval_hours ?? 0}
                        onChange={(e) => setSyncInterval(integ.id, Number(e.target.value))}
                        className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      >
                        <option value="0">Manual only</option>
                        <option value="1">1 hour</option>
                        <option value="6">6 hours</option>
                        <option value="12">12 hours</option>
                        <option value="24">24 hours</option>
                        <option value="168">Weekly</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {connectingProvider === null ? (
              <div className="grid grid-cols-2 gap-2">
                {(["notion", "gdrive", "sharepoint", "confluence", "jira", "shopify", "salesforce", "github", "gitlab", "postgres", "mysql"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => { setConnectingProvider(p); setUseCustomCredentials(false); setConnectError(null); }}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />{INTEGRATION_LABELS[p]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                <p className="text-sm font-semibold">Connect {INTEGRATION_LABELS[connectingProvider]}</p>

                {(connectingProvider === "confluence" || connectingProvider === "jira") ? (
                  <div className="space-y-2">
                    <Input value={integForm.baseUrl}
                      onChange={(e) => setIntegForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://yourcompany.atlassian.net" />
                    <Input value={integForm.email}
                      onChange={(e) => setIntegForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="your@email.com" />
                    <Input type="password" value={integForm.apiToken}
                      onChange={(e) => setIntegForm((f) => ({ ...f, apiToken: e.target.value }))}
                      placeholder="API token" />
                    <p className="text-xs text-muted-foreground">
                      Generate an API token at id.atlassian.com/manage-profile/security/api-tokens
                    </p>
                  </div>
                ) : connectingProvider === "shopify" ? (
                  <div className="space-y-2">
                    <Input value={integForm.shopDomain}
                      onChange={(e) => setIntegForm((f) => ({ ...f, shopDomain: e.target.value }))}
                      placeholder="yourstore.myshopify.com" />
                    <Input type="password" value={integForm.accessToken}
                      onChange={(e) => setIntegForm((f) => ({ ...f, accessToken: e.target.value }))}
                      placeholder="Admin API access token" />
                    <p className="text-xs text-muted-foreground">
                      Generate a token in Shopify Admin → Apps → Develop apps → API credentials
                    </p>
                  </div>
                ) : connectingProvider === "salesforce" ? (
                  <div className="space-y-2">
                    <Input value={integForm.instanceUrl}
                      onChange={(e) => setIntegForm((f) => ({ ...f, instanceUrl: e.target.value }))}
                      placeholder="https://login.salesforce.com" />
                    <Input value={integForm.clientId}
                      onChange={(e) => setIntegForm((f) => ({ ...f, clientId: e.target.value }))}
                      placeholder="Connected App Consumer Key" />
                    <Input type="password" value={integForm.clientSecret}
                      onChange={(e) => setIntegForm((f) => ({ ...f, clientSecret: e.target.value }))}
                      placeholder="Connected App Consumer Secret" />
                    <p className="text-xs text-muted-foreground">
                      Create a Connected App in Salesforce Setup → Apps → App Manager
                    </p>
                  </div>
                ) : connectingProvider === "github" ? (
                  <div className="space-y-2">
                    <Input value={integForm.owner}
                      onChange={(e) => setIntegForm((f) => ({ ...f, owner: e.target.value }))}
                      placeholder="GitHub username or org (e.g. octocat)" />
                    <Input value={integForm.repo}
                      onChange={(e) => setIntegForm((f) => ({ ...f, repo: e.target.value }))}
                      placeholder="Repo name (optional — leave blank for all repos)" />
                    {builtinProviders.includes("github") ? (
                      <>
                        {/* Device Flow: no PAT needed */}
                        {githubDeviceCode ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              Enter this code at github.com/activate:
                            </p>
                            <p className="font-mono text-lg font-bold tracking-widest text-center select-all">
                              {githubDeviceCode.user_code}
                            </p>
                            <p className="text-xs text-muted-foreground text-center">
                              Browser opened automatically. Waiting for authorization…
                            </p>
                            <Loader2Icon className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No PAT needed — a browser window will open for authorization.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <Input type="password" value={integForm.ghToken}
                          onChange={(e) => setIntegForm((f) => ({ ...f, ghToken: e.target.value }))}
                          placeholder="Personal Access Token" />
                        <p className="text-xs text-muted-foreground">
                          Create a PAT at github.com/settings/tokens (needs repo scope)
                        </p>
                      </>
                    )}
                  </div>
                ) : connectingProvider === "gitlab" ? (
                  <div className="space-y-2">
                    <Input value={integForm.glUrl}
                      onChange={(e) => setIntegForm((f) => ({ ...f, glUrl: e.target.value }))}
                      placeholder="GitLab URL (e.g. https://gitlab.com or https://gitlab.mycompany.com)" />
                    <Input value={integForm.glProjectId}
                      onChange={(e) => setIntegForm((f) => ({ ...f, glProjectId: e.target.value }))}
                      placeholder="Project ID or path (e.g. mygroup/myproject)" />
                    <Input type="password" value={integForm.glToken}
                      onChange={(e) => setIntegForm((f) => ({ ...f, glToken: e.target.value }))}
                      placeholder="Personal Access Token" />
                    <p className="text-xs text-muted-foreground">
                      Create a PAT at GitLab → User Settings → Access Tokens (needs api scope)
                    </p>
                  </div>
                ) : (connectingProvider === "postgres" || connectingProvider === "mysql") ? (
                  <div className="space-y-2">
                    <Input value={integForm.dbAlias}
                      onChange={(e) => setIntegForm((f) => ({ ...f, dbAlias: e.target.value }))}
                      placeholder="Alias (ex: Production DB)" />
                    <div className="flex gap-2">
                      <Input className="flex-1" value={integForm.dbHost}
                        onChange={(e) => setIntegForm((f) => ({ ...f, dbHost: e.target.value }))}
                        placeholder="Host (ex: db.myserver.com)" />
                      <Input className="w-24" value={integForm.dbPort}
                        onChange={(e) => setIntegForm((f) => ({ ...f, dbPort: e.target.value }))}
                        placeholder={connectingProvider === "mysql" ? "3306" : "5432"} />
                    </div>
                    <Input value={integForm.dbName}
                      onChange={(e) => setIntegForm((f) => ({ ...f, dbName: e.target.value }))}
                      placeholder="Database name" />
                    <Input value={integForm.dbUser}
                      onChange={(e) => setIntegForm((f) => ({ ...f, dbUser: e.target.value }))}
                      placeholder="Username" />
                    <Input type="password" value={integForm.dbPass}
                      onChange={(e) => setIntegForm((f) => ({ ...f, dbPass: e.target.value }))}
                      placeholder="Password" />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={integForm.dbSsl}
                        onChange={(e) => setIntegForm((f) => ({ ...f, dbSsl: e.target.checked }))} />
                      Require SSL/TLS
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {connectingProvider === "postgres"
                        ? "PostgreSQL 12+ recommended. The user needs SELECT permission on the target schema."
                        : "MySQL 5.7+ / MariaDB 10.3+. The user needs SELECT permission."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connectingProvider && builtinProviders.includes(connectingProvider) && !useCustomCredentials ? (
                      <>
                        {/* Built-in OAuth: one-click connect */}
                        <p className="text-xs text-muted-foreground">
                          A browser window will open to authorize Lamu. No credentials needed.
                        </p>
                        {connectingProvider === "sharepoint" && (
                          <Input value={integForm.tenant}
                            onChange={(e) => setIntegForm((f) => ({ ...f, tenant: e.target.value }))}
                            placeholder="Tenant ID (optional, defaults to 'common')" />
                        )}
                        <button type="button"
                          onClick={() => setUseCustomCredentials(true)}
                          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                        >
                          Use custom credentials instead
                        </button>
                      </>
                    ) : (
                      <>
                        <Input value={integForm.clientId}
                          onChange={(e) => setIntegForm((f) => ({ ...f, clientId: e.target.value }))}
                          placeholder="Client ID (from your OAuth app)" />
                        <Input type="password" value={integForm.clientSecret}
                          onChange={(e) => setIntegForm((f) => ({ ...f, clientSecret: e.target.value }))}
                          placeholder="Client Secret" />
                        {connectingProvider === "sharepoint" && (
                          <Input value={integForm.tenant}
                            onChange={(e) => setIntegForm((f) => ({ ...f, tenant: e.target.value }))}
                            placeholder="Tenant ID (or 'common')" />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {connectingProvider === "notion" && "Create an integration at notion.so/profile/integrations"}
                          {connectingProvider === "gdrive" && "Enable Drive API in Google Cloud Console"}
                          {connectingProvider === "sharepoint" && "Register an app in Azure Active Directory"}
                        </p>
                        {connectingProvider && builtinProviders.includes(connectingProvider) && (
                          <button type="button"
                            onClick={() => setUseCustomCredentials(false)}
                            className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                          >
                            ← Use built-in credentials
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {connectError && (
                  <p className="text-xs text-red-500 bg-red-500/10 rounded px-2 py-1">{connectError}</p>
                )}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => handleConnect(
                      connectingProvider!,
                      connectingProvider !== null && builtinProviders.includes(connectingProvider) && !useCustomCredentials
                    )}
                    disabled={connectingProvider === "github" && builtinProviders.includes("github") && !!githubDeviceCode}
                    className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {connectingProvider === "github" && builtinProviders.includes("github") && githubDeviceCode
                      ? "Waiting for authorization…"
                      : connectingProvider !== null && builtinProviders.includes(connectingProvider) && !useCustomCredentials
                        ? `Connect with ${INTEGRATION_LABELS[connectingProvider] ?? connectingProvider}`
                        : connectingProvider !== null && ["notion", "gdrive", "sharepoint", "salesforce"].includes(connectingProvider)
                          ? "Authorize in Browser"
                          : "Connect"}
                  </button>
                  <button type="button" onClick={() => { setConnectingProvider(null); setUseCustomCredentials(false); setConnectError(null); }}
                    className="flex-1 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
                  >Cancel</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── SQL Direct tab ── */}
      {activeTab === "sql" && (
        <div className="space-y-3">
          {(() => {
            const dbIntegrations = integrations.filter((i: any) => ["postgres", "mysql"].includes(i.provider));
            if (dbIntegrations.length === 0) {
              return <p className="text-sm text-muted-foreground">Aucune base de données connectée. Ajoutez une intégration MySQL ou PostgreSQL dans l'onglet Sources.</p>;
            }
            return (
              <>
                {/* DB selector */}
                <div className="flex gap-2 items-center">
                  <select
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    value={sqlPanelIntegId}
                    onChange={(e) => { setSqlPanelIntegId(e.target.value); loadSqlSchema(e.target.value); setSqlResult(""); setSqlError(""); }}
                  >
                    <option value="">-- Choisir une base --</option>
                    {dbIntegrations.map((i: any) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  {sqlPanelIntegId && (
                    <button type="button" onClick={() => loadSqlSchema(sqlPanelIntegId)}
                      className="text-xs px-2 py-1.5 rounded border border-border hover:bg-accent">
                      {sqlPanelSchemaLoading ? "…" : "Schéma"}
                    </button>
                  )}
                </div>

                {/* Schema viewer */}
                {sqlPanelSchema && (
                  <details className="rounded border border-border">
                    <summary className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-accent">Schéma de la base</summary>
                    <pre className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48">{sqlPanelSchema}</pre>
                  </details>
                )}

                {/* SQL editor */}
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    value={sqlInput}
                    onChange={(e) => setSqlInput(e.target.value)}
                    placeholder="SELECT * FROM ma_table LIMIT 10"
                    spellCheck={false}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSqlQuery(); } }}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={runSqlQuery}
                      disabled={!sqlPanelIntegId || sqlRunning || !sqlInput.trim()}
                      className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                      {sqlRunning ? "Exécution…" : "Exécuter (Ctrl+Enter)"}
                    </button>
                    <button type="button" onClick={() => { setSqlResult(""); setSqlError(""); }}
                      className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">
                      Effacer
                    </button>
                  </div>
                </div>

                {/* Results */}
                {sqlError && (
                  <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500 font-mono">{sqlError}</div>
                )}
                {sqlResult && (
                  <pre className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono whitespace-pre overflow-auto max-h-96">{sqlResult}</pre>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Fichiers PC tab ── */}
      {activeTab === "files" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Recherchez un fichier sur votre ordinateur et ajoutez-le à la base de connaissances.
          </p>
          <FileSearchPanel />
        </div>
      )}

      {/* ── Settings tab ── */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Embedding provider */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Embedding Provider</h3>
              <p className="text-xs text-muted-foreground">Controls how chunks are converted to vectors for semantic search.</p>
            </div>
            <div className="flex gap-2">
              {(["ollama", "openai", "none"] as const).map((p) => (
                <button key={p} type="button"
                  onClick={() => updateEmbedConfig({ ...embedConfig, provider: p })}
                  className={cn(
                    "flex-1 py-2 rounded-md text-sm font-medium border transition-all",
                    embedConfig.provider === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent"
                  )}
                >
                  {p === "ollama" ? "Ollama (local)" : p === "openai" ? "OpenAI" : "None"}
                </button>
              ))}
            </div>
            {embedConfig.provider === "ollama" && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium">Ollama URL</label>
                  <Input value={embedConfig.ollama_url}
                    onChange={(e) => updateEmbedConfig({ ...embedConfig, ollama_url: e.target.value })}
                    placeholder="http://localhost:11434" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Model</label>
                  <Input value={embedConfig.ollama_model}
                    onChange={(e) => updateEmbedConfig({ ...embedConfig, ollama_model: e.target.value })}
                    placeholder="nomic-embed-text" className="mt-1" />
                </div>
              </div>
            )}
            {embedConfig.provider === "openai" && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium">OpenAI API Key</label>
                  <Input type="password" value={embedConfig.openai_key}
                    onChange={(e) => updateEmbedConfig({ ...embedConfig, openai_key: e.target.value })}
                    placeholder="sk-…" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium">Model</label>
                  <Input value={embedConfig.openai_model}
                    onChange={(e) => updateEmbedConfig({ ...embedConfig, openai_model: e.target.value })}
                    placeholder="text-embedding-3-small" className="mt-1" />
                </div>
              </div>
            )}
            {embedConfig.provider === "none" && (
              <p className="text-sm text-muted-foreground">Documents stored without embeddings — search unavailable.</p>
            )}
          </section>

          {/* Re-embed */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Re-embed Documents</h3>
              <p className="text-xs text-muted-foreground">Useful after switching embedding providers.</p>
            </div>
            {isReembedding && reembedProgress && (
              <div className="space-y-1">
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(reembedProgress.current / Math.max(reembedProgress.total, 1)) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{reembedProgress.current} / {reembedProgress.total} chunks</p>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => handleReembedAll(false)}
                disabled={isReembedding || embedConfig.provider === "none"}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {isReembedding ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
                Embed missing
              </button>
              <button type="button" onClick={() => handleReembedAll(true)}
                disabled={isReembedding || embedConfig.provider === "none"}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {isReembedding ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
                Re-embed all
              </button>
            </div>
          </section>

          {/* Webhooks */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Outgoing Webhooks</h3>
                <p className="text-xs text-muted-foreground">Post AI responses or KB results to Slack or Teams channels.</p>
              </div>
              <button type="button" onClick={() => setShowWebhookForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add Webhook
              </button>
            </div>

            {webhooks.length > 0 && (
              <div className="space-y-1">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border/50 group">
                    <WebhookIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{wh.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{wh.url}</p>
                    </div>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded capitalize">{wh.provider}</span>
                    <button type="button" onClick={() => removeWebhook(wh.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                    ><Trash2Icon className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            {showWebhookForm && (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex gap-2">
                  <select value={webhookForm.provider}
                    onChange={(e) => setWebhookForm((f) => ({ ...f, provider: e.target.value }))}
                    className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="slack">Slack</option>
                    <option value="teams">Teams</option>
                  </select>
                  <Input value={webhookForm.name}
                    onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Name (optional)" className="flex-1" />
                </div>
                <Input value={webhookForm.url}
                  onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://hooks.slack.com/services/…" />
                <div className="flex gap-2">
                  <button type="button" onClick={handleAddWebhook}
                    className="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                  >Save</button>
                  <button type="button" onClick={() => setShowWebhookForm(false)}
                    className="flex-1 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
                  >Cancel</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      </PremiumGate>
    </PageLayout>
  );
};

export default KnowledgeBasePage;
