import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SearchIcon, FolderIcon, FolderOpenIcon, FileIcon,
  PlusCircleIcon, Loader2Icon, AlertCircleIcon, CheckCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FsFileResult {
  path: string;
  filename: string;
  extension: string;
  size_bytes: number;
  modified_at: number;
  content_preview: string;
}

const KB_INGESTABLE = ["txt", "md", "markdown", "rst", "pdf", "docx", "csv"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const EXT_COLORS: Record<string, string> = {
  pdf: "bg-red-500/20 text-red-400",
  docx: "bg-blue-500/20 text-blue-400",
  doc: "bg-blue-500/20 text-blue-400",
  md: "bg-green-500/20 text-green-400",
  txt: "bg-muted text-muted-foreground",
  csv: "bg-yellow-500/20 text-yellow-400",
  xlsx: "bg-green-600/20 text-green-500",
};

export const FileSearchPanel = () => {
  const [query, setQuery]               = useState("");
  const [searchPath, setSearchPath]     = useState("");
  const [results, setResults]           = useState<FsFileResult[]>([]);
  const [isSearching, setIsSearching]   = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [searchError, setSearchError]   = useState<string | null>(null);
  const [ingestingPath, setIngestingPath] = useState<string | null>(null);
  const [ingestResults, setIngestResults] = useState<Record<string, "ok" | "error">>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (q = query, sp = searchPath) => {
    if (!q.trim()) { setResults([]); return; }
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await invoke<FsFileResult[]>("fs_search_files", {
        query: q,
        searchPath: sp || null,
        limit: 50,
      });
      setResults(res);
    } catch (e: any) {
      setSearchError(String(e));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => handleSearch(v, searchPath), 500);
  };

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    try {
      const picked = await invoke<string | null>("fs_open_folder_dialog");
      if (picked) {
        setSearchPath(picked);
        if (query.trim()) handleSearch(query, picked);
      }
    } catch { /* user cancelled */ } finally {
      setIsPickingFolder(false);
    }
  };

  const handleIngest = async (file: FsFileResult) => {
    setIngestingPath(file.path);
    try {
      await invoke("fs_ingest_file_by_path", { path: file.path });
      setIngestResults((prev) => ({ ...prev, [file.path]: "ok" }));
    } catch {
      setIngestResults((prev) => ({ ...prev, [file.path]: "error" }));
    } finally {
      setIngestingPath(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Rechercher un fichier sur votre PC..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePickFolder}
          disabled={isPickingFolder}
          className="h-8 px-2 shrink-0 gap-1 text-xs"
          title="Choisir un dossier"
        >
          {isPickingFolder
            ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            : <FolderOpenIcon className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Active search path */}
      {searchPath && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FolderIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">{searchPath}</span>
          <button
            onClick={() => { setSearchPath(""); if (query.trim()) handleSearch(query, ""); }}
            className="hover:text-foreground ml-auto shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
          <AlertCircleIcon className="w-3 h-3 shrink-0" />
          {searchError}
        </div>
      )}

      {/* Loading */}
      {isSearching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2Icon className="w-3 h-3 animate-spin" />
          Recherche en cours...
        </div>
      )}

      {/* Results */}
      {!isSearching && results.length === 0 && query.trim() && !searchError && (
        <p className="text-[11px] text-muted-foreground text-center py-3">
          Aucun fichier trouvé pour <span className="font-medium">"{query}"</span>
        </p>
      )}

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {results.map((f) => {
          const canIngest = KB_INGESTABLE.includes(f.extension.toLowerCase());
          const ingestState = ingestResults[f.path];
          const isIngesting = ingestingPath === f.path;
          const extColor = EXT_COLORS[f.extension.toLowerCase()] || "bg-muted text-muted-foreground";

          return (
            <div
              key={f.path}
              className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted/40 group transition-colors"
            >
              <FileIcon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium truncate max-w-[200px]">{f.filename}</span>
                  <span className={cn("text-[8px] px-1 py-0.5 rounded font-mono uppercase", extColor)}>
                    {f.extension || "?"}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">
                    {formatSize(f.size_bytes)} · {formatDate(f.modified_at)}
                  </span>
                </div>
                {f.content_preview && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {f.content_preview}
                  </p>
                )}
                <p className="text-[9px] text-muted-foreground/40 mt-0.5 truncate">{f.path}</p>
              </div>

              {/* Add to KB button */}
              {canIngest && (
                <button
                  onClick={() => handleIngest(f)}
                  disabled={isIngesting || ingestState === "ok"}
                  title={ingestState === "ok" ? "Déjà ajouté à la KB" : "Ajouter à la KB"}
                  className={cn(
                    "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                    ingestState === "ok" && "opacity-100"
                  )}
                >
                  {isIngesting ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : ingestState === "ok" ? (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-400" />
                  ) : ingestState === "error" ? (
                    <AlertCircleIcon className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <PlusCircleIcon className="w-3.5 h-3.5 text-primary hover:text-primary/80" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
