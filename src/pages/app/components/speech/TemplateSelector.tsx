import { useState } from "react";
import { MEETING_TEMPLATES, TEMPLATE_CATEGORIES, type MeetingTemplate } from "@/config/meetingTemplates";
import { FileTextIcon, CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateSelectorProps {
  selectedTemplate: MeetingTemplate | null;
  onSelect: (template: MeetingTemplate | null) => void;
  onClose: () => void;
}

export const TemplateSelector = ({ selectedTemplate, onSelect, onClose }: TemplateSelectorProps) => {
  const [category, setCategory] = useState<string>("all");

  const filtered = category === "all"
    ? MEETING_TEMPLATES
    : MEETING_TEMPLATES.filter((t) => t.category === category);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <FileTextIcon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold flex-1">Template de notes</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setCategory("all")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors",
            category === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Tous ({MEETING_TEMPLATES.length})
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => {
          const count = MEETING_TEMPLATES.filter((t) => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors",
                category === cat.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Template list */}
      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
        {/* Clear selection option */}
        {selectedTemplate && (
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-2 p-2 rounded-md text-left hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
          >
            <XIcon className="w-3 h-3" />
            Aucun template (notes libres)
          </button>
        )}
        {filtered.map((tmpl) => (
          <button
            key={tmpl.id}
            onClick={() => { onSelect(tmpl); onClose(); }}
            className={cn(
              "w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors",
              selectedTemplate?.id === tmpl.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium">{tmpl.name}</span>
                {selectedTemplate?.id === tmpl.id && <CheckIcon className="w-3 h-3 text-primary" />}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tmpl.description}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {tmpl.sections.slice(0, 4).map((s) => (
                  <span key={s} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                ))}
                {tmpl.sections.length > 4 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">+{tmpl.sections.length - 4}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
