import { useState } from "react";
import {
  BookmarkIcon,
  TrashIcon,
  ShareIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Soundbite {
  id: string;
  text: string;
  speaker: "me" | "them" | "ai";
  timestamp: string;
  createdAt: number;
}

interface SoundbitesPanelProps {
  soundbites: Soundbite[];
  onRemove: (id: string) => void;
  onExport: () => void;
}

export const SoundbitesPanel = ({ soundbites, onRemove, onExport }: SoundbitesPanelProps) => {
  const [expanded, setExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (soundbites.length === 0) return null;

  const handleCopy = (sb: Soundbite) => {
    const text = `[${sb.timestamp}] ${sb.speaker === "me" ? "Moi" : sb.speaker === "them" ? "Participant" : "IA"}: ${sb.text}`;
    navigator.clipboard.writeText(text);
    setCopiedId(sb.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const speakerStyle = {
    me: "border-blue-500/30 bg-blue-500/5",
    them: "border-green-500/30 bg-green-500/5",
    ai: "border-purple-500/30 bg-purple-500/5",
  };

  const speakerLabel = {
    me: "Moi",
    them: "Participant",
    ai: "IA",
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <BookmarkIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider flex-1">
          Soundbites ({soundbites.length})
        </span>
        {soundbites.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); onExport(); }}
          >
            <ShareIcon className="w-2.5 h-2.5" />Export
          </Button>
        )}
        {expanded ? <ChevronUpIcon className="w-3 h-3 text-muted-foreground" /> : <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {soundbites.map((sb) => (
            <div
              key={sb.id}
              className={cn("rounded-md border p-2 transition-colors", speakerStyle[sb.speaker])}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-medium text-muted-foreground">{sb.timestamp}</span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-background/60 text-muted-foreground">
                  {speakerLabel[sb.speaker]}
                </span>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    onClick={() => handleCopy(sb)}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                    title="Copier"
                  >
                    {copiedId === sb.id ? <CheckIcon className="w-2.5 h-2.5 text-green-500" /> : <CopyIcon className="w-2.5 h-2.5" />}
                  </button>
                  <button
                    onClick={() => onRemove(sb.id)}
                    className="p-0.5 text-muted-foreground hover:text-red-500"
                    title="Supprimer"
                  >
                    <TrashIcon className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed">{sb.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
