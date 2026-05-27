import { useRef, useState } from "react";
import { Label, Switch, Input } from "@/components";
import { SemanticDebugPanel } from "./SemanticDebugPanel";
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  DatabaseIcon,
  LinkIcon,
  PlugIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { useKnowledgeBaseType } from "@/hooks/useKnowledgeBase";

interface KnowledgeBasePanelProps {
  kb: useKnowledgeBaseType;
  /** Controlled from useSystemAudio so RAG injection stays in sync */
  kbEnabled: boolean;
  onToggleKbEnabled: (enabled: boolean) => void;
}

const ACCEPTED = ".txt,.md,.pdf,.docx,.csv,.rst,.markdown";

const INTEGRATION_LABELS: Record<string, string> = {
  notion: "Notion",
  gdrive: "Google Drive",
  sharepoint: "SharePoint",
  confluence: "Confluence",
  postgres: "PostgreSQL",
  mysql: "MySQL / MariaDB",
};


export const KnowledgeBasePanel = ({
  kb,
  kbEnabled,
  onToggleKbEnabled,
}: KnowledgeBasePanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showEmbedConfig, setShowEmbedConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<"files" | "folders" | "integrations">("files");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL ingestion state
  const [urlInput, setUrlInput] = useState("");

  // Integration connect form state
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>("");
  const [connectSuccess, setConnectSuccess] = useState<string>("");
  const [integForm, setIntegForm] = useState({
    clientId: "",
    clientSecret: "",
    tenant: "",
    baseUrl: "",
    email: "",
    apiToken: "",
  });

  // DB connection form state
  const [dbForm, setDbForm] = useState({
    alias: "",
    host: "localhost",
    port: "5432",
    dbname: "",
    username: "",
    password: "",
    ssl: false,
  });

  const {
    documents,
    stats,
    embedConfig,
    isIngesting,
    ingestProgress,
    ingestError,
    watchedFolders,
    integrations,
    syncingId,
    ingestFile,
    ingestUrl,
    deleteDocument,
    updateEmbedConfig,
    addWatchedFolder,
    removeWatchedFolder,
    connectIntegration,
    addConfluence,
    addDatabase,
    disconnectIntegration,
    syncIntegration,
  } = kb;

  // ── File handlers ───────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await ingestFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(txt|md|pdf|docx|csv|rst|markdown)$/i.test(f.name)
    );
    for (const file of files) {
      await ingestFile(file);
    }
  };

  // ── URL handler ─────────────────────────────────────────────────────────────

  const handleIngestUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlInput("");
    await ingestUrl(url);
  };

  // ── Folder handler ──────────────────────────────────────────────────────────

  const handleAddFolder = async () => {
    try {
      // Use the Tauri dialog API (shell-based picker not available; ask user to type path)
      const path = window.prompt("Enter the full folder path to watch:");
      if (!path?.trim()) return;
      await addWatchedFolder(path.trim());
    } catch {
      // ignore
    }
  };

  // ── Integration connect handler ─────────────────────────────────────────────

  const handleConnect = async (provider: string) => {
    setIsConnecting(true);
    setConnectError("");
    let ok = false;
    try {
      if (provider === "confluence") {
        ok = await addConfluence(integForm.baseUrl, integForm.email, integForm.apiToken);
      } else if (provider === "postgres" || provider === "mysql") {
        const defaultPort = provider === "mysql" ? 3306 : 5432;
        ok = await addDatabase(
          provider,
          dbForm.alias || dbForm.dbname,
          dbForm.host,
          parseInt(dbForm.port) || defaultPort,
          dbForm.dbname,
          dbForm.username,
          dbForm.password,
          dbForm.ssl,
        );
      } else {
        ok = await connectIntegration(
          provider,
          integForm.clientId,
          integForm.clientSecret,
          provider === "sharepoint" ? integForm.tenant || "common" : undefined
        );
      }
    } catch (e: any) {
      setConnectError(typeof e === "string" ? e : e?.message ?? "Connexion échouée");
      setIsConnecting(false);
      return;
    }

    if (ok) {
      setConnectError("");
      setConnectSuccess(`${INTEGRATION_LABELS[provider] ?? provider} connecté avec succès !`);
      setDbForm({ alias: "", host: "localhost", port: "5432", dbname: "", username: "", password: "", ssl: false });
      setIntegForm({ clientId: "", clientSecret: "", tenant: "", baseUrl: "", email: "", apiToken: "" });
      // Close form after a brief moment so user sees the success message
      setTimeout(() => {
        setConnectingProvider(null);
        setConnectSuccess("");
      }, 1500);
    } else {
      // error already set via ingestError in the hook — mirror it here
      setConnectError("Connexion échouée. Vérifiez vos identifiants.");
    }
    setIsConnecting(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

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

  const sourceIcon = (type: string) => {
    if (type === "url") return <GlobeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />;
    if (type === "folder") return <FolderOpenIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />;
    if (type.startsWith("integration:")) return <PlugIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />;
    return <FileTextIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpenIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Knowledge Base</span>
          {stats.document_count > 0 && (
            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {stats.document_count} doc{stats.document_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1"
          >
            <span className="text-[9px] text-muted-foreground">
              {kbEnabled ? "on" : "off"}
            </span>
            <Switch
              checked={kbEnabled}
              onCheckedChange={onToggleKbEnabled}
              className="scale-75"
            />
          </div>
          <ChevronDownIcon
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          {/* Stats row */}
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <DatabaseIcon className="w-3 h-3" />
              {stats.chunk_count} chunks
            </span>
            <span>·</span>
            <span>
              {stats.embedded_count}/{stats.chunk_count} embedded
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1">
            {(["files", "folders", "integrations"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-1 text-[10px] font-medium rounded transition-all",
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {tab === "files" && "Files & URLs"}
                {tab === "folders" && "Folders"}
                {tab === "integrations" && "Integrations"}
              </button>
            ))}
          </div>

          {/* ── Tab: Files & URLs ── */}
          {activeTab === "files" && (
            <div className="space-y-2">
              {/* URL ingestion */}
              <div className="flex gap-1.5">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
                  placeholder="https://… paste a URL"
                  className="h-6 text-[10px] flex-1"
                />
                <button
                  type="button"
                  onClick={handleIngestUrl}
                  disabled={isIngesting || !urlInput.trim()}
                  className="h-6 px-2 rounded bg-muted hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <LinkIcon className="w-3 h-3" />
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border/60 rounded-lg p-3 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                {isIngesting ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Loader2Icon className="w-5 h-5 text-primary animate-spin" />
                    <span className="text-[10px] text-muted-foreground">
                      {progressLabel()}
                    </span>
                    {ingestProgress?.step === "embedding" &&
                      ingestProgress.total && (
                        <div className="w-full bg-muted rounded-full h-1 mt-1">
                          <div
                            className="bg-primary h-1 rounded-full transition-all"
                            style={{
                              width: `${
                                ((ingestProgress.current ?? 0) /
                                  ingestProgress.total) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <UploadIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      Drop files or click to upload
                    </span>
                    <span className="text-[9px] text-muted-foreground/60">
                      PDF, DOCX, TXT, MD, CSV
                    </span>
                  </div>
                )}
              </div>

              {/* Error */}
              {ingestError && (
                <p className="text-[10px] text-destructive">{ingestError}</p>
              )}

              {/* Document list */}
              {documents.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group"
                    >
                      {sourceIcon(doc.source_type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium truncate">{doc.name}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {doc.chunk_count} chunks · {formatDate(doc.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteDocument(doc.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive"
                      >
                        <Trash2Icon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Watched Folders ── */}
          {activeTab === "folders" && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">
                Files added or modified in watched folders are automatically ingested.
              </p>
              <button
                type="button"
                onClick={handleAddFolder}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-border/60 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                Add folder
              </button>
              {watchedFolders.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {watchedFolders.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group"
                    >
                      <FolderOpenIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <p className="flex-1 text-[10px] font-mono truncate">{f.path}</p>
                      <button
                        type="button"
                        onClick={() => removeWatchedFolder(f.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive"
                      >
                        <Trash2Icon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Integrations ── */}
          {activeTab === "integrations" && (
            <div className="space-y-2">
              {/* Connected integrations */}
              {integrations.length > 0 && (
                <div className="space-y-1">
                  {integrations.map((integ) => (
                    <div
                      key={integ.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/50"
                    >
                      <PlugIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium truncate">
                          {INTEGRATION_LABELS[integ.provider] ?? integ.provider} · {integ.name}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {integ.last_synced_at
                            ? `Synced ${formatDate(integ.last_synced_at)}`
                            : "Not yet synced"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={syncingId === integ.id}
                        onClick={() => syncIntegration(integ.id)}
                        className="p-0.5 hover:text-primary disabled:opacity-50 transition-colors"
                        title="Sync now"
                      >
                        <RefreshCwIcon
                          className={cn("w-3 h-3", syncingId === integ.id && "animate-spin")}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => disconnectIntegration(integ.id)}
                        className="p-0.5 hover:text-destructive transition-colors"
                        title="Disconnect"
                      >
                        <Trash2Icon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Connect buttons */}
              {connectingProvider === null ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {(["notion", "gdrive", "sharepoint", "confluence", "postgres", "mysql"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        if (p === "mysql") setDbForm((f) => ({ ...f, port: "3306" }));
                        if (p === "postgres") setDbForm((f) => ({ ...f, port: "5432" }));
                        setConnectingProvider(p);
                      }}
                      className="flex items-center justify-center gap-1 py-1.5 rounded border border-border/60 text-[10px] hover:bg-accent transition-colors"
                    >
                      <PlusIcon className="w-3 h-3" />
                      {INTEGRATION_LABELS[p]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 p-2 rounded bg-muted/50 border border-border/50">
                  <p className="text-[10px] font-medium">
                    Connect {INTEGRATION_LABELS[connectingProvider]}
                  </p>

                  {connectingProvider === "confluence" ? (
                    <>
                      <Input
                        value={integForm.baseUrl}
                        onChange={(e) => setIntegForm((f) => ({ ...f, baseUrl: e.target.value }))}
                        placeholder="https://yourcompany.atlassian.net"
                        className="h-6 text-[10px]"
                      />
                      <Input
                        value={integForm.email}
                        onChange={(e) => setIntegForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="you@company.com"
                        className="h-6 text-[10px]"
                      />
                      <Input
                        type="password"
                        value={integForm.apiToken}
                        onChange={(e) => setIntegForm((f) => ({ ...f, apiToken: e.target.value }))}
                        placeholder="API token"
                        className="h-6 text-[10px]"
                      />
                    </>
                  ) : (connectingProvider === "postgres" || connectingProvider === "mysql") ? (
                    <>
                      <Input
                        value={dbForm.alias}
                        onChange={(e) => setDbForm((f) => ({ ...f, alias: e.target.value }))}
                        placeholder="Alias (ex: Production DB)"
                        className="h-6 text-[10px]"
                      />
                      <div className="flex gap-1.5">
                        <Input
                          value={dbForm.host}
                          onChange={(e) => setDbForm((f) => ({ ...f, host: e.target.value }))}
                          placeholder="Host"
                          className="h-6 text-[10px] flex-1"
                        />
                        <Input
                          value={dbForm.port}
                          onChange={(e) => setDbForm((f) => ({ ...f, port: e.target.value }))}
                          placeholder="Port"
                          className="h-6 text-[10px] w-16"
                        />
                      </div>
                      <Input
                        value={dbForm.dbname}
                        onChange={(e) => setDbForm((f) => ({ ...f, dbname: e.target.value }))}
                        placeholder="Database name"
                        className="h-6 text-[10px]"
                      />
                      <Input
                        value={dbForm.username}
                        onChange={(e) => setDbForm((f) => ({ ...f, username: e.target.value }))}
                        placeholder="Username"
                        className="h-6 text-[10px]"
                      />
                      <Input
                        type="password"
                        value={dbForm.password}
                        onChange={(e) => setDbForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Password"
                        className="h-6 text-[10px]"
                      />
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={dbForm.ssl}
                          onCheckedChange={(v) => setDbForm((f) => ({ ...f, ssl: v }))}
                          className="scale-75"
                        />
                        <span className="text-[10px] text-muted-foreground">SSL</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        value={integForm.clientId}
                        onChange={(e) => setIntegForm((f) => ({ ...f, clientId: e.target.value }))}
                        placeholder="Client ID"
                        className="h-6 text-[10px]"
                      />
                      <Input
                        type="password"
                        value={integForm.clientSecret}
                        onChange={(e) => setIntegForm((f) => ({ ...f, clientSecret: e.target.value }))}
                        placeholder="Client Secret"
                        className="h-6 text-[10px]"
                      />
                      {connectingProvider === "sharepoint" && (
                        <Input
                          value={integForm.tenant}
                          onChange={(e) => setIntegForm((f) => ({ ...f, tenant: e.target.value }))}
                          placeholder="Tenant (common / org / GUID)"
                          className="h-6 text-[10px]"
                        />
                      )}
                    </>
                  )}

                  {connectSuccess && (
                    <p className="text-[10px] text-green-600 bg-green-500/10 rounded px-2 py-1">{connectSuccess}</p>
                  )}
                  {connectError && (
                    <p className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1">{connectError}</p>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleConnect(connectingProvider)}
                      disabled={isConnecting}
                      className="flex-1 py-1 rounded bg-primary text-primary-foreground text-[10px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-1"
                    >
                      {isConnecting && <Loader2Icon className="w-3 h-3 animate-spin" />}
                      {isConnecting ? "Connexion…"
                        : connectingProvider === "confluence" ? "Connect"
                        : (connectingProvider === "postgres" || connectingProvider === "mysql") ? "Test & Connect"
                        : "Authorize"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConnectingProvider(null); setConnectError(""); }}
                      disabled={isConnecting}
                      className="flex-1 py-1 rounded bg-muted text-muted-foreground text-[10px] hover:bg-accent disabled:opacity-60 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {ingestError && (
                <p className="text-[10px] text-destructive">{ingestError}</p>
              )}
            </div>
          )}

          {/* Embed provider config (collapsible) */}
          <div className="pt-2 border-t border-border/50">
            <button
              type="button"
              className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowEmbedConfig(!showEmbedConfig)}
            >
              <span className="flex items-center gap-1">
                <SettingsIcon className="w-3 h-3" />
                Embedding Provider
                <span className="ml-1 text-[9px] bg-muted px-1.5 py-0.5 rounded">
                  {embedConfig.provider === "ollama"
                    ? `Ollama · ${embedConfig.ollama_model}`
                    : embedConfig.provider === "openai"
                    ? `OpenAI · ${embedConfig.openai_model}`
                    : "not configured"}
                </span>
              </span>
              {showEmbedConfig ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>

            {showEmbedConfig && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1.5">
                  {(["ollama", "openai", "none"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        updateEmbedConfig({ ...embedConfig, provider: p })
                      }
                      className={cn(
                        "flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-all",
                        embedConfig.provider === p
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      )}
                    >
                      {p === "ollama"
                        ? "Ollama (local)"
                        : p === "openai"
                        ? "OpenAI"
                        : "None"}
                    </button>
                  ))}
                </div>

                {embedConfig.provider === "ollama" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Ollama URL</Label>
                      <Input
                        value={embedConfig.ollama_url}
                        onChange={(e) =>
                          updateEmbedConfig({
                            ...embedConfig,
                            ollama_url: e.target.value,
                          })
                        }
                        placeholder="http://localhost:11434"
                        className="h-6 text-[10px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Model</Label>
                      <Input
                        value={embedConfig.ollama_model}
                        onChange={(e) =>
                          updateEmbedConfig({
                            ...embedConfig,
                            ollama_model: e.target.value,
                          })
                        }
                        placeholder="nomic-embed-text"
                        className="h-6 text-[10px]"
                      />
                    </div>
                  </>
                )}

                {embedConfig.provider === "openai" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[10px]">OpenAI API Key</Label>
                      <Input
                        type="password"
                        value={embedConfig.openai_key}
                        onChange={(e) =>
                          updateEmbedConfig({
                            ...embedConfig,
                            openai_key: e.target.value,
                          })
                        }
                        placeholder="sk-…"
                        className="h-6 text-[10px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Model</Label>
                      <Input
                        value={embedConfig.openai_model}
                        onChange={(e) =>
                          updateEmbedConfig({
                            ...embedConfig,
                            openai_model: e.target.value,
                          })
                        }
                        placeholder="text-embedding-3-small"
                        className="h-6 text-[10px]"
                      />
                    </div>
                  </>
                )}

                {embedConfig.provider === "none" && (
                  <p className="text-[10px] text-muted-foreground">
                    Documents will be stored but not embedded — search will be
                    unavailable until a provider is configured.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Semantic Debug Panel */}
          <SemanticDebugPanel className="mt-2" />
        </div>
      )}
    </div>
  );
};
