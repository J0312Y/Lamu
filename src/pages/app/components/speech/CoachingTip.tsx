import { useState } from "react";
import { SparklesIcon, XIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoachingTipProps {
  tip: string;
  isGenerating: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

export const CoachingTip = ({ tip, isGenerating, onRefresh, onDismiss }: CoachingTipProps) => {
  const [expanded, setExpanded] = useState(true);

  if (!tip && !isGenerating) return null;

  return (
    <div className={cn(
      "rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden",
      "animate-in fade-in-0 slide-in-from-top-1 duration-200"
    )}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <SparklesIcon className="w-3 h-3 text-purple-400 shrink-0" />
        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex-1">
          Coaching
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground p-0.5"
        >
          {expanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        </button>
        <button
          onClick={onRefresh}
          disabled={isGenerating}
          title="Nouveau conseil"
          className="text-muted-foreground hover:text-purple-400 p-0.5 disabled:opacity-50"
        >
          {isGenerating
            ? <Loader2Icon className="w-3 h-3 animate-spin" />
            : <SparklesIcon className="w-3 h-3" />}
        </button>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-0.5 ml-0.5">
          <XIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-2.5">
          {isGenerating && !tip ? (
            <p className="text-[11px] text-muted-foreground italic">Analyse en cours...</p>
          ) : (
            <p className="text-[11px] text-foreground/90 leading-relaxed">{tip}</p>
          )}
        </div>
      )}
    </div>
  );
};
