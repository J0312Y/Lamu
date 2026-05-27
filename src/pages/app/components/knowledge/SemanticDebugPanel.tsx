import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SearchIcon, Loader2Icon, BrainCircuitIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DebugResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  source_type: string;
  content: string;
  similarity: f32;
  chunk_index: number;
  semantic_score?: number;
  keyword_score?: number;
}

// TypeScript doesn't have f32 — using number
type f32 = number;

interface Props {
  className?: string;
}

export const SemanticDebugPanel = ({ className }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DebugResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setResults([]);
    try {
      const res = await invoke<DebugResult[]>("kb_debug_search", {
        query: query.trim(),
        topK: 10,
      });
      setResults(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const ScoreBar = ({ value, color }: { value: number; color: string }) => (
    <div className="flex items-center gap-1.5 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground w-7 text-right tabular-nums">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );

  return (
    <div className={cn("rounded-lg border border-border/50 bg-muted/30 overflow-hidden", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BrainCircuitIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Debug sémantique</span>
        </div>
        {isOpen
          ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" />
          : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Testez les scores sémantique + keyword pour n'importe quelle requête.
          </p>

          {/* Search input */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: date du contrat..."
              className="h-7 text-xs flex-1"
            />
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={!query.trim() || isSearching}
              className="h-7 px-3"
            >
              {isSearching
                ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                : <SearchIcon className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[10px] text-red-500">{error}</p>
          )}

          {/* Results */}
          {results.length === 0 && !isSearching && !error && query && (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Aucun résultat
            </p>
          )}

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={r.chunk_id}
                className="rounded-md border border-border/40 bg-background/40 p-2 space-y-1.5"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">
                      #{i + 1}
                    </span>
                    <span className="text-[10px] font-medium truncate" title={r.document_name}>
                      {r.document_name}
                    </span>
                    <span className="text-[8px] text-muted-foreground/50 shrink-0">
                      chunk {r.chunk_index}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === r.chunk_id ? null : r.chunk_id)}
                    className="text-[9px] text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {expandedId === r.chunk_id ? "▲" : "▼"}
                  </button>
                </div>

                {/* Score bars */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-muted-foreground/60 w-14 shrink-0">Final</span>
                    <ScoreBar value={r.similarity} color="bg-primary" />
                  </div>
                  {r.semantic_score !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground/60 w-14 shrink-0">Sémant.</span>
                      <ScoreBar value={r.semantic_score} color="bg-blue-400" />
                    </div>
                  )}
                  {r.keyword_score !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground/60 w-14 shrink-0">Keyword</span>
                      <ScoreBar value={r.keyword_score} color="bg-green-400" />
                    </div>
                  )}
                </div>

                {/* Chunk content (expandable) */}
                {expandedId === r.chunk_id && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed bg-muted/30 rounded p-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {r.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
