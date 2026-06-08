import { useState } from "react";
import {
  ListOrderedIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  CheckCircle2Icon,
  CircleIcon,
  XIcon,
  LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AgendaItem {
  id: string;
  text: string;
  durationMin: number;
  completed: boolean;
  notes?: string;
}

interface AgendaBuilderProps {
  items: AgendaItem[];
  onUpdate: (items: AgendaItem[]) => void;
  onLoadAsPlaybook: () => void;
  onClose: () => void;
}

export const AgendaBuilder = ({ items, onUpdate, onLoadAsPlaybook, onClose }: AgendaBuilderProps) => {
  const [newItemText, setNewItemText] = useState("");
  const [newItemDuration, setNewItemDuration] = useState(5);

  const addItem = () => {
    if (!newItemText.trim()) return;
    const item: AgendaItem = {
      id: `agenda_${Date.now()}`,
      text: newItemText.trim(),
      durationMin: newItemDuration,
      completed: false,
    };
    onUpdate([...items, item]);
    setNewItemText("");
    setNewItemDuration(5);
  };

  const toggleItem = (id: string) => {
    onUpdate(items.map((i) => i.id === id ? { ...i, completed: !i.completed } : i));
  };

  const removeItem = (id: string) => {
    onUpdate(items.filter((i) => i.id !== id));
  };

  const totalMin = items.reduce((sum, i) => sum + i.durationMin, 0);
  const completedCount = items.filter((i) => i.completed).length;

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <ListOrderedIcon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold flex-1">Agenda</span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ClockIcon className="w-2.5 h-2.5" />{totalMin}min
        </span>
        {items.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] gap-1"
            onClick={onLoadAsPlaybook}
            title="Charger comme playbook"
          >
            <LinkIcon className="w-2.5 h-2.5" />Playbook
          </Button>
        )}
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Items list */}
      <div className="max-h-40 overflow-y-auto p-2 space-y-1">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors group",
              item.completed && "opacity-60"
            )}
          >
            <span className="text-[10px] text-muted-foreground w-4 text-center">{idx + 1}</span>
            <button onClick={() => toggleItem(item.id)}>
              {item.completed ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <CircleIcon className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            <span className={cn("text-[11px] flex-1 min-w-0 truncate", item.completed && "line-through")}>
              {item.text}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
              <ClockIcon className="w-2.5 h-2.5" />{item.durationMin}m
            </span>
            <button
              onClick={() => removeItem(item.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div className="flex items-center gap-1.5 p-2 border-t border-border">
        <input
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Nouveau point..."
          className="flex-1 text-[11px] bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
        />
        <input
          type="number"
          value={newItemDuration}
          onChange={(e) => setNewItemDuration(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-10 text-[10px] text-center bg-muted rounded px-1 py-0.5 border-none outline-none"
          min={1}
          max={120}
          title="Durée (minutes)"
        />
        <span className="text-[10px] text-muted-foreground">min</span>
        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={addItem} disabled={!newItemText.trim()}>
          <PlusIcon className="w-3 h-3" />
        </Button>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="px-2 pb-2">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(completedCount / items.length) * 100}%` }}
            />
          </div>
          <p className="text-[9px] text-muted-foreground text-right mt-0.5">
            {completedCount}/{items.length} points traités
          </p>
        </div>
      )}
    </div>
  );
};
