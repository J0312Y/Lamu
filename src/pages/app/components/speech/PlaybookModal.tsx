import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookMarkedIcon, UploadIcon, XIcon } from "lucide-react";

interface PlaybookModalProps {
  open: boolean;
  current: string | null;
  onSave: (text: string | null) => void;
  onClose: () => void;
}

export const PlaybookModal = ({ open, current, onSave, onClose }: PlaybookModalProps) => {
  const [text, setText] = useState(current ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setText((prev) => prev ? prev + "\n\n" + content : content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <BookMarkedIcon className="w-4 h-4 text-primary" />
            Script de session
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Collez un document, CV, fiche de poste ou des notes à utiliser comme contexte pour cette session.
          </p>
        </DialogHeader>

        <div className="px-4 py-3 flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Collez votre document ici — fiche de poste, brief entreprise, CV, notes…"
            className="min-h-48 text-xs resize-none"
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="gap-1.5 text-xs h-7"
            >
              <UploadIcon className="w-3 h-3" />
              Importer .txt / .md
            </Button>
            <input ref={fileRef} type="file" accept=".txt,.md,.text" className="hidden" onChange={handleFile} />

            {(current || text) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setText(""); onSave(null); onClose(); }}
                className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
              >
                <XIcon className="w-3 h-3" />
                Effacer
              </Button>
            )}

            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">Annuler</Button>
              <Button
                size="sm"
                onClick={() => { onSave(text.trim() || null); onClose(); }}
                className="h-7 text-xs"
              >
                Enregistrer
              </Button>
            </div>
          </div>

          {text && (
            <p className="text-[10px] text-muted-foreground">
              {text.length.toLocaleString()} caractères — sera injecté dans chaque appel IA de cette session
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
