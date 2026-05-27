import { useState, useRef, useEffect } from "react";
import {
  DatabaseIcon, PlayIcon, XIcon, Loader2Icon,
  CheckCircleIcon, AlertCircleIcon, ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PendingSqlWrite, SqlQueryResult } from "@/lib/sqlUtils";

interface Props {
  pendingWrite?: PendingSqlWrite | null;
  onConfirm: (confirmed: boolean) => Promise<void>;
  readResults?: SqlQueryResult[];
}

type Status = "idle" | "executing" | "done" | "error";

export const SqlApprovalModal = ({ pendingWrite, onConfirm, readResults }: Props) => {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState<number | null>(pendingWrite ? 5 : null);
  const [showReads, setShowReads] = useState(!pendingWrite);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 5-second countdown — auto-execute on 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      handleConfirm();
      return;
    }
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => { if (countdownTimer.current) clearInterval(countdownTimer.current); };
  }, [countdown]);

  // Keyboard shortcut: Ctrl+Enter to approve immediately
  useEffect(() => {
    if (!pendingWrite) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && status === "idle") {
        e.preventDefault();
        handleConfirm();
      }
      if (e.key === "Escape" && status === "idle") {
        e.preventDefault();
        handleReject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, pendingWrite]);

  const cancelCountdown = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
  };

  const handleConfirm = async () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
    setStatus("executing");
    setErrorMsg("");
    try {
      await onConfirm(true);
      setStatus("done");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const handleReject = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
    onConfirm(false);
  };

  const queueCount = pendingWrite?.writeQueue.length ?? 0;

  return (
    <div className="space-y-2">
      {/* Read results (collapsible) */}
      {readResults && readResults.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-2">
          <button
            onClick={() => setShowReads(!showReads)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <ChevronDownIcon className={cn("w-3 h-3 text-muted-foreground transition-transform", showReads && "rotate-180")} />
            <DatabaseIcon className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {readResults.length} requ{readResults.length > 1 ? "etes" : "ete"} SQL {readResults.every((r) => r.executed) ? "OK" : ""}
            </span>
          </button>
          {showReads && (
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {readResults.map((r, i) => (
                <div key={i} className={cn(
                  "rounded border p-2 text-[10px]",
                  r.error ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"
                )}>
                  <pre className="font-mono text-[9px] text-muted-foreground mb-1 truncate">{r.sql}</pre>
                  {r.error ? (
                    <p className="text-red-400">{r.error}</p>
                  ) : (
                    <pre className="font-mono text-[9px] max-h-24 overflow-y-auto whitespace-pre-wrap">{r.data}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Write approval card */}
      {pendingWrite && <div className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2.5",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DatabaseIcon className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
              Modification SQL
            </span>
            {countdown !== null && status === "idle" && (
              <span className="text-[10px] text-amber-300 font-medium">
                — exécution dans {countdown}s
              </span>
            )}
            {queueCount > 0 && (
              <span className="text-[9px] text-muted-foreground">
                (+{queueCount} en attente)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {countdown !== null && status === "idle" && (
              <button
                onClick={cancelCountdown}
                className="text-[9px] text-amber-400 hover:text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5"
              >
                Pause
              </button>
            )}
            <button onClick={handleReject} className="text-muted-foreground hover:text-foreground ml-1">
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* DB name badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Base :</span>
          <span className="text-[10px] font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
            {pendingWrite.dbName}
          </span>
        </div>

        {/* SQL preview */}
        <div className="rounded bg-background/80 border border-border/50 p-2 overflow-x-auto">
          <pre className="font-mono text-[10px] text-foreground whitespace-pre-wrap break-all leading-relaxed">
            {pendingWrite.sql}
          </pre>
        </div>

        {/* Status feedback */}
        {status === "executing" && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
            <Loader2Icon className="w-3 h-3 animate-spin" />
            Exécution en cours...
          </div>
        )}
        {status === "done" && (
          <div className="flex items-center gap-1.5 text-[10px] text-green-400">
            <CheckCircleIcon className="w-3 h-3" />
            Requête exécutée avec succès
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-1.5 text-[10px] text-red-400">
            <AlertCircleIcon className="w-3 h-3" />
            {errorMsg || "Erreur lors de l'exécution"}
          </div>
        )}

        {/* Action buttons */}
        {status === "idle" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirm}
              className="h-6 text-[10px] gap-1"
            >
              <PlayIcon className="w-3 h-3" />
              Exécuter
              <span className="text-[8px] opacity-60 ml-1">Ctrl+Enter</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              className="h-6 text-[10px]"
            >
              Annuler
            </Button>
          </div>
        )}
      </div>}
    </div>
  );
};
