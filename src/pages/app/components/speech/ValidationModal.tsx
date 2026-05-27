import { useState, useEffect, useRef } from "react";
import { CheckIcon, XIcon, PencilIcon, ShieldCheckIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ValidationArtifact } from "@/types/agent-runtime";

interface Props {
  artifact: ValidationArtifact;
  onApprove: (editedTranscription: string) => void;
  onReject: () => void;
  isProcessing?: boolean;
}

export const ValidationModal = ({
  artifact,
  onApprove,
  onReject,
  isProcessing = false,
}: Props) => {
  const [editMode, setEditMode] = useState(false);
  const [editedText, setEditedText] = useState(artifact.data.transcription);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editMode && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editMode]);

  const handleApprove = () => {
    if (isProcessing) return;
    onApprove(editedText.trim() || artifact.data.transcription);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleApprove();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditMode(false);
      setEditedText(artifact.data.transcription);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2.5",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <ShieldCheckIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
          Validation requise
        </span>
        <span className="ml-auto text-[9px] text-muted-foreground/50">
          Ctrl+↵ approuver
        </span>
      </div>

      {/* Transcription — editable or static */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
            Ce qui sera envoyé à l'IA
          </span>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <PencilIcon className="w-2.5 h-2.5" />
              Modifier
            </button>
          )}
        </div>

        {editMode ? (
          <Textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-xs min-h-[60px] resize-none border-amber-500/30 focus:border-amber-500/60 bg-background/60"
            placeholder="Modifiez la transcription..."
          />
        ) : (
          <p
            className="text-xs text-foreground/80 leading-relaxed bg-background/40 rounded-md px-2 py-1.5 border border-border/30 cursor-pointer hover:bg-background/60 transition-colors"
            onClick={() => setEditMode(true)}
            title="Cliquer pour modifier"
          >
            {editedText}
          </p>
        )}
      </div>

      {/* Context badge: image attached? */}
      {artifact.data.imageBase64 && (
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          Capture d'écran jointe
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={isProcessing || !editedText.trim()}
          className={cn(
            "h-7 flex-1 text-[11px] gap-1.5 bg-amber-500 hover:bg-amber-400 text-black",
            "disabled:opacity-50"
          )}
        >
          {isProcessing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckIcon className="w-3 h-3" />
          )}
          {isProcessing ? "Traitement..." : "Approuver"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={isProcessing}
          className="h-7 px-3 text-[11px] gap-1 border-border/50 hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive"
        >
          <XIcon className="w-3 h-3" />
          Ignorer
        </Button>
      </div>
    </div>
  );
};
