import { RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentRun } from "@/types/agent-runtime";
import { cn } from "@/lib/utils";

interface Props {
  run: AgentRun;
  onResume: (runId: string) => void;
  onDiscard: (runId: string) => void;
}

export const ResumeRunBanner = ({ run, onResume, onDiscard }: Props) => {
  const lastStep = [...run.steps]
    .reverse()
    .find((s) => s.status === "completed" || s.status === "running");

  const stepLabel: Record<string, string> = {
    stt: "transcription",
    prompt_build: "construction du prompt",
    ai_call: "appel IA",
    response_save: "sauvegarde",
  };

  const elapsed = Math.round((Date.now() - run.updatedAt) / 1000);
  const timeAgo =
    elapsed < 60
      ? `il y a ${elapsed}s`
      : elapsed < 3600
      ? `il y a ${Math.round(elapsed / 60)}min`
      : `il y a ${Math.round(elapsed / 3600)}h`;

  return (
    <div
      className={cn(
        "rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 space-y-2",
        "animate-in fade-in-0 slide-in-from-top-2 duration-200"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <RotateCcwIcon className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-400">
            Session interrompue
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground/50">{timeAgo}</span>
      </div>

      {run.checkpoint.transcription && (
        <p className="text-[10px] text-muted-foreground truncate">
          <span className="font-medium">"{run.checkpoint.transcription}"</span>
        </p>
      )}

      {lastStep && (
        <p className="text-[9px] text-muted-foreground/70">
          Arrêtée à : {stepLabel[lastStep.type] ?? lastStep.type}
          {run.checkpoint.partialResponse && " (réponse partielle sauvegardée)"}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onResume(run.id)}
          className="h-6 flex-1 text-[10px] gap-1 bg-blue-500 hover:bg-blue-400 text-white"
        >
          <RotateCcwIcon className="w-2.5 h-2.5" />
          Reprendre
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDiscard(run.id)}
          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <XIcon className="w-2.5 h-2.5" />
        </Button>
      </div>
    </div>
  );
};
