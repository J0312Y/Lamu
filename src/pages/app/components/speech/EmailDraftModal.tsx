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
    // If user typed a valid email directly, use it
    if (value.includes("@") && value.includes(".")) {
      setToEmail(value.trim());
      setToName("");
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    // Clear resolved email when user types a name
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
    let resolvedEmail = toEmail.trim() || (toQuery.includes("@") ? toQuery.trim() : "");
    // If no email yet but we have a name, try to resolve contact one more time
    if (!resolvedEmail && toQuery.trim()) {
      try {
        const contact = await invoke<{ full_name: string; email: string } | null>(
          "contacts_resolve", { name: toQuery.trim() }
        );
        if (contact?.email) {
          resolvedEmail = contact.email;
          setToEmail(contact.email);
          setToName(contact.full_name);
        }
      } catch { /* best-effort */ }
    }
    if (!resolvedEmail) {
      setErrorMsg("Adresse email requise. Tapez un email valide (ex: nom@exemple.com).");
      setStatus("error");
      return;
    }
    if (!subject.trim()) {
      setErrorMsg("Sujet requis.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      await onSend({ to_name: toName || toQuery, to_email: resolvedEmail, to_query: toQuery, subject, body });
      setStatus("sent");
      setTimeout(onDiscard, 1500);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || JSON.stringify(e);
      invoke("debug_log", { message: `[email_send] ERROR: ${msg}` }).catch(() => {});
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  const canSend = status !== "sending" && status !== "sent";

  return (
    <div className={cn(
      "rounded-lg border border-blue-500/40 bg-blue-500/5 p-2 space-y-1.5",
      "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
    )}>
      {/* Header + Actions in one row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MailIcon className="w-3 h-3 text-blue-400" />
          <span className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider">
            Email
          </span>
          {countdown !== null && (
            <span className="text-[9px] text-amber-400 font-medium">
              {countdown}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {countdown !== null && (
            <button onClick={cancelCountdown} className="text-[8px] text-amber-400 hover:text-amber-300 border border-amber-400/40 rounded px-1 py-0.5">
              Stop
            </button>
          )}
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
            className="h-6 px-2 text-[10px] gap-1 bg-blue-500 hover:bg-blue-400 text-white"
          >
            {status === "sending" ? (
              <Loader2Icon className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <SendIcon className="w-2.5 h-2.5" />
            )}
            {status === "sending" ? "..." : "Envoyer"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDiscard}
            disabled={status === "sending"}
            className="h-6 px-2 text-[10px] border-border/50"
          >
            <XIcon className="w-2.5 h-2.5" />
          </Button>
        </div>
      </div>

      {/* Status messages */}
      {status === "error" && (
        <div className="flex items-start gap-1 text-red-400">
          <AlertCircleIcon className="w-2.5 h-2.5 mt-0.5 shrink-0" />
          <p className="text-[9px]">{errorMsg}</p>
        </div>
      )}
      {status === "sent" && (
        <div className="flex items-center gap-1 text-green-400">
          <CheckCircleIcon className="w-2.5 h-2.5" />
          <p className="text-[9px] font-medium">Envoyé !</p>
        </div>
      )}

      {/* To field */}
      <div className="relative">
        <div className="relative">
          <SearchIcon className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground/50" />
          <Input
            value={toQuery}
            onChange={(e) => handleToQueryChange(e.target.value)}
            onFocus={() => toQuery && setSuggestions(suggestions)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="À: tapez un email (ex: nom@mail.com)"
            className={cn(
              "h-6 text-[10px] pl-6",
              toEmail ? "border-green-500/40 pr-6" : ""
            )}
          />
          {toEmail && (
            <CheckCircleIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-green-400" />
          )}
        </div>

        {/* Contact suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 rounded border border-border bg-popover shadow-md overflow-hidden max-h-24 overflow-y-auto">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => selectContact(c)}
                className="w-full flex items-center gap-1.5 px-1.5 py-1 hover:bg-accent text-left transition-colors"
              >
                <UserIcon className="w-2.5 h-2.5 text-primary shrink-0" />
                <span className="text-[10px] truncate">{c.full_name}</span>
                <span className="text-[8px] text-muted-foreground truncate ml-auto">{c.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Subject */}
      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Sujet..."
        className="h-6 text-[10px]"
      />

      {/* Body — compact, scrollable */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Corps..."
        className="text-[10px] min-h-[60px] max-h-[120px] resize-none"
      />
    </div>
  );
};
