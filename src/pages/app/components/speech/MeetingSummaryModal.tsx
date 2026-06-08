import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, CopyIcon, Loader2Icon, BookOpenIcon, MailIcon, FileTextIcon, DownloadIcon, CheckCircle2Icon, CircleIcon, UserIcon, CalendarIcon, FlagIcon } from "lucide-react";
import { exportAsPdf, exportAsMarkdown } from "@/lib/exportUtils";
import type { ActionItem } from "./ActionItemsPanel";
import { SentimentIndicator, type SentimentData } from "./SentimentIndicator";
import { TalkTimeAnalytics, type TalkTimeData } from "./TalkTimeAnalytics";
import { cn } from "@/lib/utils";

interface MeetingSummaryModalProps {
  open: boolean;
  summary: string;
  isGenerating: boolean;
  savedToKb: boolean;
  meetingDate: Date;
  onClose: () => void;
  onGenerateFollowUp?: (summary: string) => Promise<void>;
  actionItems?: ActionItem[];
  onToggleActionItem?: (id: string) => void;
  onCopyAllActionItems?: () => void;
  sentimentData?: SentimentData | null;
  talkTimeData?: TalkTimeData | null;
}

export const MeetingSummaryModal = ({
  open,
  summary,
  isGenerating,
  savedToKb,
  meetingDate,
  onClose,
  onGenerateFollowUp,
  actionItems = [],
  onToggleActionItem,
  onCopyAllActionItems,
  sentimentData,
  talkTimeData,
}: MeetingSummaryModalProps) => {
  const [copied, setCopied] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [tab, setTab] = useState<"summary" | "actions" | "analytics">("summary");

  useEffect(() => {
    if (!open) { setCopied(false); setTab("summary"); }
  }, [open]);

  const handleCopy = () => {
    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const dateLabel = meetingDate.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-primary" />
            Résumé du meeting
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">{dateLabel}</p>

          {/* Tabs */}
          {!isGenerating && summary && (
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => setTab("summary")}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full transition-colors",
                  tab === "summary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                Résumé
              </button>
              {actionItems.length > 0 && (
                <button
                  onClick={() => setTab("actions")}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full transition-colors",
                    tab === "actions" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  Actions ({actionItems.length})
                </button>
              )}
              {(sentimentData || talkTimeData) && (
                <button
                  onClick={() => setTab("analytics")}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full transition-colors",
                    tab === "analytics" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  Analytics
                </button>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {isGenerating ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2Icon className="w-4 h-4 animate-spin shrink-0" />
              Génération du résumé en cours...
            </div>
          ) : tab === "summary" ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {summary || "Aucun contenu à résumer."}
            </div>
          ) : tab === "actions" ? (
            <div className="space-y-3">
              {actionItems.map((item) => (
                <div key={item.id} className={cn("flex items-start gap-2 p-2 rounded-md border border-border", item.completed && "opacity-60")}>
                  <button onClick={() => onToggleActionItem?.(item.id)} className="mt-0.5 shrink-0">
                    {item.completed ? <CheckCircle2Icon className="w-4 h-4 text-green-500" /> : <CircleIcon className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", item.completed && "line-through")}>{item.text}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {item.assignee && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserIcon className="w-3 h-3" />{item.assignee}
                        </span>
                      )}
                      {item.deadline && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarIcon className="w-3 h-3" />{item.deadline}
                        </span>
                      )}
                      <span className={cn("text-xs px-1.5 py-0.5 rounded",
                        item.priority === "high" ? "text-red-500 bg-red-500/10" :
                        item.priority === "medium" ? "text-amber-500 bg-amber-500/10" :
                        "text-blue-500 bg-blue-500/10"
                      )}>
                        <FlagIcon className="w-3 h-3 inline mr-0.5" />
                        {item.priority === "high" ? "Haute" : item.priority === "medium" ? "Moyenne" : "Basse"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {onCopyAllActionItems && actionItems.length > 0 && (
                <Button size="sm" variant="outline" onClick={onCopyAllActionItems} className="w-full h-7 text-xs gap-1.5">
                  <CopyIcon className="w-3 h-3" />Copier toutes les actions
                </Button>
              )}
            </div>
          ) : tab === "analytics" ? (
            <div className="space-y-3">
              <SentimentIndicator data={sentimentData || null} />
              <TalkTimeAnalytics data={talkTimeData || null} />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            {savedToKb ? (
              <>
                <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="text-green-600 dark:text-green-400">Sauvegardé dans la KB</span>
              </>
            ) : isGenerating ? (
              <span className="text-muted-foreground">Sauvegarde après génération...</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!isGenerating && summary && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-7 text-xs gap-1.5"
                >
                  {copied
                    ? <CheckCircleIcon className="w-3 h-3 text-green-500" />
                    : <CopyIcon className="w-3 h-3" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportAsMarkdown(`Résumé_${meetingDate.toISOString().slice(0, 10)}`, summary)}
                  className="h-7 text-xs gap-1.5"
                  title="Télécharger en Markdown"
                >
                  <DownloadIcon className="w-3 h-3" />
                  .md
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportAsPdf(
                    `Résumé du meeting`,
                    summary,
                    dateLabel
                  )}
                  className="h-7 text-xs gap-1.5"
                  title="Exporter en PDF"
                >
                  <FileTextIcon className="w-3 h-3" />
                  PDF
                </Button>
                {onGenerateFollowUp && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      setGeneratingEmail(true);
                      try {
                        await onGenerateFollowUp(summary);
                        onClose();
                      } finally {
                        setGeneratingEmail(false);
                      }
                    }}
                    disabled={generatingEmail}
                    className="h-7 text-xs gap-1.5"
                  >
                    {generatingEmail
                      ? <Loader2Icon className="w-3 h-3 animate-spin" />
                      : <MailIcon className="w-3 h-3" />}
                    {generatingEmail ? "Génération..." : "Email de suivi"}
                  </Button>
                )}
              </>
            )}
            <Button size="sm" onClick={onClose} className="h-7 text-xs">
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
