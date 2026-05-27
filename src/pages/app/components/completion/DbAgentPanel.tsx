import { useState } from "react";
import { Button, ScrollArea } from "@/components";
import {
  CheckIcon,
  XIcon,
  DatabaseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2,
  RefreshCwIcon,
} from "lucide-react";

export interface SqlQueryResult {
  sql: string;
  dbName: string;
  integrationId: string;
  data: string;
  error?: string;
  type: "read" | "write";
  executed: boolean;
}

export interface PendingWriteQuery {
  sql: string;
  dbName: string;
  integrationId: string;
  writeQueue: Array<{ sql: string; dbName: string; integrationId: string }>;
}

interface DbOption {
  id: string;
  name: string;
  provider: string;
}

interface Props {
  dbResults: SqlQueryResult[];
  pendingWrite: PendingWriteQuery | null;
  dbQueryLoading: boolean;
  onConfirmWrite: (confirmed: boolean) => Promise<void>;
  onRerun: (sql: string, integrationId: string, dbName: string) => Promise<void>;
  dbOptions?: DbOption[];
}

function extractAlias(name: string): string {
  return name.split(" (")[0].trim();
}

export const DbAgentPanel = ({
  dbResults,
  pendingWrite,
  dbQueryLoading,
  onConfirmWrite,
  onRerun,
  dbOptions = [],
}: Props) => {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [rerunTarget, setRerunTarget] = useState<Record<number, string>>({});

  if (dbResults.length === 0 && !pendingWrite && !dbQueryLoading) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Loading indicator */}
      {dbQueryLoading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Exécution en cours…</span>
        </div>
      )}

      {/* Write confirmation */}
      {pendingWrite && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-600">
              Modification · {extractAlias(pendingWrite.dbName)}
            </span>
            {pendingWrite.writeQueue.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                +{pendingWrite.writeQueue.length} suivante{pendingWrite.writeQueue.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <pre className="text-[10px] bg-background/80 rounded p-2 overflow-x-auto text-foreground/90 font-mono whitespace-pre-wrap">
            {pendingWrite.sql}
          </pre>
          <p className="text-[10px] text-amber-600/80">
            Cette requête va modifier les données. Confirmer ?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-3"
              onClick={() => onConfirmWrite(true)}
              disabled={dbQueryLoading}
            >
              <CheckIcon className="h-3 w-3 mr-1" />
              Exécuter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-3"
              onClick={() => onConfirmWrite(false)}
              disabled={dbQueryLoading}
            >
              <XIcon className="h-3 w-3 mr-1" />
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Query results */}
      {dbResults.map((result, idx) => (
        <div
          key={idx}
          className={`border rounded-lg overflow-hidden text-[11px] ${
            result.error
              ? "border-destructive/30 bg-destructive/5"
              : result.type === "write"
              ? "border-green-500/30 bg-green-500/5"
              : "border-border/60 bg-muted/20"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <button
              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80"
              onClick={() => setCollapsed((p) => ({ ...p, [idx]: !p[idx] }))}
            >
              <DatabaseIcon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono text-muted-foreground truncate">
                {result.sql.replace(/--\s*DB:[^\n]+\n?/i, "").trim().split("\n")[0].slice(0, 70)}
                {result.sql.length > 70 ? "…" : ""}
              </span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {extractAlias(result.dbName)}
              </span>
              {result.type === "write" && result.executed && (
                <span className="text-[10px] text-green-600 font-medium shrink-0">✓</span>
              )}
              {result.error && (
                <span className="text-[10px] text-destructive font-medium shrink-0">Erreur</span>
              )}
            </button>

            {/* Re-run on another DB */}
            {dbOptions.length > 1 && (
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <select
                  className="text-[10px] bg-transparent border border-border/40 rounded px-1 py-0.5 text-muted-foreground"
                  value={rerunTarget[idx] ?? ""}
                  onChange={(e) => setRerunTarget((p) => ({ ...p, [idx]: e.target.value }))}
                >
                  <option value="">autre DB…</option>
                  {dbOptions
                    .filter((db) => db.id !== result.integrationId)
                    .map((db) => (
                      <option key={db.id} value={db.id}>
                        {extractAlias(db.name)}
                      </option>
                    ))}
                </select>
                {rerunTarget[idx] && (
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    title="Relancer sur cette DB"
                    onClick={() => {
                      const targetId = rerunTarget[idx];
                      const targetDb = dbOptions.find((d) => d.id === targetId);
                      if (targetDb) {
                        onRerun(result.sql, targetId, targetDb.name);
                        setRerunTarget((p) => ({ ...p, [idx]: "" }));
                      }
                    }}
                  >
                    <RefreshCwIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            <button
              className="ml-1 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setCollapsed((p) => ({ ...p, [idx]: !p[idx] }))}
            >
              {collapsed[idx] ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronUpIcon className="h-3 w-3" />
              )}
            </button>
          </div>

          {/* Body */}
          {!collapsed[idx] && (
            <div className="border-t border-border/40 px-3 py-2">
              {result.error ? (
                <p className="text-destructive text-[10px] font-mono">{result.error}</p>
              ) : (
                <ScrollArea className="max-h-48">
                  <pre className="text-[10px] font-mono whitespace-pre text-foreground/80 overflow-x-auto">
                    {result.data}
                  </pre>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
