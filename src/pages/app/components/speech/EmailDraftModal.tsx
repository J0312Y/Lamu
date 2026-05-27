import { useState, useRef, useCallback, useEffect } from "react";
import {
  MailIcon, SendIcon, XIcon, UserIcon, Loader2Icon,
  CheckCircleIcon, AlertCircleIcon, SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EmailDraft, Contact } from "@/types/email";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  draft: EmailDraft;
  onSend: (updated: EmailDraft) => Promise<void>;
  onDiscard: () => void;
}

type Status = "idle" | "sending" | "sent" | "error";

export const EmailDraftModal = ({ draft, onSend, onDiscard }: Props) => {
  const [toQuery, setToQuery]   = useState(draft.to_name || draft.to_query);
  const [toEmail, setToEmail]   = useState(draft.to_email);
  const [toName, setToName]     = useState(draft.to_name);
  const [subject, setSubject]   = useState(draft.subject);
  const [body, setBody]         = useState(draft.body);
  const [status, setStatus]     = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [suggestions, setSuggestions]   = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(draft.autoSend && draft.to_email ? 3 : null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-send countdown if autoSend is enabled
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      handleSend();
      return;
    }
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => { if (countdownTimer.current) clearInterval(countdownTimer.current); };
  }, [countdown]);


  // ── Contact autocomplete ─────────────────────────────────────────────────
  const handleToQueryChange = useCallback(async (value: string) => {
    setToQuery(value);
    // Clear resolved email when user types a new name
    if (value !== toName) {
      setToEmail("");
      setToName("");
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await invoke<Contact[]>("contacts_search", { query: value, limit: 6 });
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setSuggestions([]); }
    }, 200);
  }, [toName]);

  const selectContact = (c: Contact) => {
    setToQuery(c.full_name);
    setToEmail(c.email);
    setToName(c.full_name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const cancelCountdown = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
  };

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
    if (!toEmail.trim()) {
      setErrorMsg("Veuillez sélectionner un destinataire valide.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      await onSend({ to_name: toName, to_email: toEmail, to_query: toQuery, subject, body });
      setStatus("sent");
      setTimeout(onDiscard, 1500);
    } catch (e: any) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  };

  const canSend = toEmail.trim() && subject.trim() && body.trim() && status !== "sending";

  return (
    <div className={cn(
      "rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-3",
      "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MailIcon className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
            Email prêt à envoyer
          </span>
          {countdown !== null && (
            <span className="text-[10px] text-amber-400 font-medium">
              — envoi dans {countdown}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {countdown !== null && (
            <button onClick={cancelCountdown} className="text-[9px] text-amber-400 hover:text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5">
              Annuler
            </button>
          )}
          <button onClick={onDiscard} className="text-muted-foreground hover:text-foreground ml-1">
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* To field */}
      <div className="space-y-1 relative">
        <label className="text-[9px] text-muted-foreground uppercase tracking-wide">À</label>
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <Input
            value={toQuery}
            onChange={(e) => handleToQueryChange(e.target.value)}
            onFocus={() => toQuery && setSuggestions(suggestions)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Nom ou email..."
            className={cn(
              "h-7 text-xs pl-7",
              toEmail ? "border-green-500/40 pr-7" : ""
            )}
          />
          {toEmail && (
            <CheckCircleIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-green-400" />
          )}
        </div>

        {/* Resolved email badge */}
        {toEmail && (
          <p className="text-[9px] text-muted-foreground/70">
            <span className="text-green-400">✓</span> {toEmail}
          </p>
        )}

        {/* Contact suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-md overflow-hidden">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => selectContact(c)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent text-left transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <UserIcon className="w-2.5 h-2.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate">{c.full_name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{c.email}</p>
                </div>
                {c.company && (
                  <span className="text-[8px] text-muted-foreground/60 shrink-0">{c.company}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Subject */}
      <div className="space-y-1">
        <label className="text-[9px] text-muted-foreground uppercase tracking-wide">Sujet</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet de l'email..."
          className="h-7 text-xs"
        />
      </div>

      {/* Body */}
      <div className="space-y-1">
        <label className="text-[9px] text-muted-foreground uppercase tracking-wide">Corps</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Corps de l'email..."
          className="text-xs min-h-[100px] resize-none"
        />
      </div>

      {/* Status messages */}
      {status === "error" && (
        <div className="flex items-start gap-1.5 text-red-400">
          <AlertCircleIcon className="w-3 h-3 mt-0.5 shrink-0" />
          <p className="text-[10px]">{errorMsg}</p>
        </div>
      )}
      {status === "sent" && (
        <div className="flex items-center gap-1.5 text-green-400">
          <CheckCircleIcon className="w-3 h-3" />
          <p className="text-[10px] font-medium">Email envoyé !</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-0.5">
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend}
          className="h-7 flex-1 text-[11px] gap-1.5 bg-blue-500 hover:bg-blue-400 text-white"
        >
          {status === "sending" ? (
            <Loader2Icon className="w-3 h-3 animate-spin" />
          ) : (
            <SendIcon className="w-3 h-3" />
          )}
          {status === "sending" ? "Envoi..." : "Envoyer"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDiscard}
          disabled={status === "sending"}
          className="h-7 px-3 text-[11px] border-border/50"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
};
