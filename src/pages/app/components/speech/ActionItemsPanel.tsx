import { useState } from "react";
import {
  CheckCircle2Icon,
  CircleIcon,
  UserIcon,
  CalendarIcon,
  FlagIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  deadline?: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

interface ActionItemsPanelProps {
  items: ActionItem[];
  onToggle: (id: string) => void;
  onCopyAll: () => void;
}

const priorityStyle = {
  high: "text-red-500 bg-red-500/10",
  medium: "text-amber-500 bg-amber-500/10",
  low: "text-blue-500 bg-blue-500/10",
};

const priorityLabel = { high: "Haute", medium: "Moyenne", low: "Basse" };

export const ActionItemsPanel = ({ items, onToggle, onCopyAll }: ActionItemsPanelProps) => {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  if (items.length === 0) return null;

  const done = items.filter((i) => i.completed).length;

  const handleCopy = () => {
    onCopyAll();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <CheckCircle2Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider flex-1">
          Actions ({done}/{items.length})
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          title="Copier toutes les actions"
        >
          {copied ? <CheckIcon className="w-3 h-3 text-green-500" /> : <CopyIcon className="w-3 h-3 text-muted-foreground" />}
        </Button>
        {expanded ? <ChevronUpIcon className="w-3 h-3 text-muted-foreground" /> : <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors",
                item.completed && "opacity-60"
              )}
            >
              <button onClick={() => onToggle(item.id)} className="mt-0.5 shrink-0">
                {item.completed ? (
                  <CheckCircle2Icon className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <CircleIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[11px] leading-relaxed", item.completed && "line-through")}>
                  {item.text}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {item.assignee && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <UserIcon className="w-2.5 h-2.5" />{item.assignee}
                    </span>
                  )}
                  {item.deadline && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <CalendarIcon className="w-2.5 h-2.5" />{item.deadline}
                    </span>
                  )}
                  <span className={cn("flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded", priorityStyle[item.priority])}>
                    <FlagIcon className="w-2.5 h-2.5" />{priorityLabel[item.priority]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
