import { useKbActivity, KbActivityEntry, KbActivityResult } from "@/hooks/useKbActivity";
import { PageLayout } from "@/layouts";
import {
  RefreshCwIcon,
  Trash2Icon,
  SearchIcon,
  FileTextIcon,
  GlobeIcon,
  PlugIcon,
  FolderIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useState } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sourceIcon(sourceType: string) {
  if (sourceType.startsWith("integration:")) return <PlugIcon className="w-3 h-3" />;
  if (sourceType === "url") return <GlobeIcon className="w-3 h-3" />;
  if (sourceType === "folder") return <FolderIcon className="w-3 h-3" />;
  return <FileTextIcon className="w-3 h-3" />;
}

function sourceLabel(sourceType: string): string {
  if (sourceType.startsWith("integration:")) return sourceType.replace("integration:", "");
  return sourceType;
}

function similarityBar(score: number) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

// ── Entry card ─────────────────────────────────────────────────────────────────

function ActivityCard({ entry }: { entry: KbActivityEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 flex-shrink-0">
          <SearchIcon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{entry.query}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entry.result_count} source{entry.result_count !== 1 ? "s" : ""} retrieved
            &nbsp;·&nbsp;{relativeTime(entry.created_at)}
          </p>
        </div>
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded source list */}
      {expanded && entry.results.length > 0 && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {entry.results.map((r: KbActivityResult, i: number) => (
            <div key={i} className="px-4 py-2.5 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{sourceIcon(r.source_type)}</span>
                <span className="text-xs font-medium truncate flex-1">{r.doc_name}</span>
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                  {sourceLabel(r.source_type)}
                </span>
                {similarityBar(r.similarity)}
              </div>
              {r.snippet && (
                <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
                  {r.snippet}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

// Group entries by calendar date label
function groupByDate(entries: KbActivityEntry[]): Record<string, KbActivityEntry[]> {
  const groups: Record<string, KbActivityEntry[]> = {};
  for (const e of entries) {
    const d = new Date(e.created_at);
    const now = new Date();
    let label: string;
    if (d.toDateString() === now.toDateString()) {
      label = "Today";
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        label = "Yesterday";
      } else {
        label = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      }
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  }
  return groups;
}

const ActivityPage = () => {
  const { entries, isLoading, refresh, clearAll } = useKbActivity(100);

  const grouped = groupByDate(entries);
  const dateKeys = Object.keys(grouped);

  return (
    <PageLayout
      title="KB Activity"
      description="Timeline of knowledge base lookups made during AI sessions"
    >
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <RefreshCwIcon className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2Icon className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {!isLoading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="p-4 rounded-full bg-muted">
              <SearchIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Activity is recorded whenever the AI retrieves context from your knowledge base.
              Connect sources and start a conversation to see results here.
            </p>
          </div>
        )}

        {/* Timeline grouped by date */}
        {dateKeys.map((date) => (
          <section key={date} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {date}
            </p>
            <div className="space-y-2">
              {grouped[date].map((entry) => (
                <ActivityCard key={entry.id} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageLayout>
  );
};

export default ActivityPage;
