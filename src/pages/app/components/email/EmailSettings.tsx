import { useState, useEffect } from "react";
import {
  MailIcon, RefreshCwIcon, PlusIcon, Trash2Icon,
  CheckCircleIcon, AlertCircleIcon, Loader2Icon,
  UsersIcon, WifiIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EmailConfig, TlsMode } from "@/types/email";
import { useContacts } from "@/hooks/useContacts";

export const EmailSettings = () => {
  const {
    contacts, isLoading, syncOutlook, isSyncing,
    emailConfig, saveEmailConfig, testConnection,
    add: addContact, remove: removeContact,
  } = useContacts();

  const [cfg, setCfg] = useState<EmailConfig>({
    smtp_host: "", smtp_port: 587, username: "", password: "",
    from_name: "", from_email: "", tls_mode: "starttls",
  });
  const [isSaving, setIsSaving]     = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [isTesting, setIsTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncMsg, setSyncMsg]       = useState<string | null>(null);

  // New contact form
  const [newContact, setNewContact] = useState({ full_name: "", email: "", alias: "" });
  const [isAddingContact, setIsAddingContact] = useState(false);

  useEffect(() => {
    if (emailConfig) setCfg(emailConfig);
  }, [emailConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveEmailConfig(cfg);
    } catch (e: any) {
      setSaveError(typeof e === "string" ? e : e?.message ?? "Failed to save email configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Pass the current form state so no need to save first
      const msg = await testConnection(cfg);
      setTestResult({ ok: true, msg });
    } catch (e: any) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncOutlook = async () => {
    setSyncMsg(null);
    try {
      const r = await syncOutlook();
      setSyncMsg(`Synchronisé : ${r.imported} importés, ${r.skipped} ignorés (source: ${r.source})`);
    } catch (e: any) {
      setSyncMsg(`Erreur : ${e}`);
    }
  };

  const handleAddContact = async () => {
    if (!newContact.full_name || !newContact.email) return;
    setIsAddingContact(true);
    try {
      await addContact({
        full_name: newContact.full_name,
        email: newContact.email,
        alias: newContact.alias || undefined,
      });
      setNewContact({ full_name: "", email: "", alias: "" });
    } finally {
      setIsAddingContact(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* ── SMTP Config ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MailIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Configuration SMTP</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Serveur SMTP</Label>
            <Input
              value={cfg.smtp_host}
              onChange={(e) => setCfg({ ...cfg, smtp_host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Port</Label>
            <Input
              type="number"
              value={cfg.smtp_port}
              onChange={(e) => setCfg({ ...cfg, smtp_port: Number(e.target.value) })}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">TLS</Label>
            <select
              value={cfg.tls_mode}
              onChange={(e) => setCfg({ ...cfg, tls_mode: e.target.value as TlsMode })}
              className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS (465)</option>
              <option value="none">Aucun (non recommandé)</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nom expéditeur</Label>
            <Input
              value={cfg.from_name}
              onChange={(e) => setCfg({ ...cfg, from_name: e.target.value })}
              placeholder="Joel Dupont"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Email expéditeur</Label>
            <Input
              value={cfg.from_email}
              onChange={(e) => setCfg({ ...cfg, from_email: e.target.value })}
              placeholder="joel@example.com"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Identifiant</Label>
            <Input
              value={cfg.username}
              onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
              placeholder="joel@example.com"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mot de passe</Label>
            <Input
              type="password"
              value={cfg.password}
              onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
              placeholder="••••••••"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={cn(
            "flex items-center gap-2 text-xs p-2 rounded-md",
            testResult.ok ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
          )}>
            {testResult.ok
              ? <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
              : <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />}
            {testResult.msg}
          </div>
        )}

        {saveError && (
          <p className="text-xs text-destructive">{saveError}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-7 text-xs">
            {isSaving ? <Loader2Icon className="w-3 h-3 animate-spin mr-1" /> : null}
            Sauvegarder
          </Button>
          <Button size="sm" variant="outline" onClick={handleTest} disabled={isTesting} className="h-7 text-xs gap-1">
            {isTesting
              ? <Loader2Icon className="w-3 h-3 animate-spin" />
              : <WifiIcon className="w-3 h-3" />}
            Tester connexion
          </Button>
        </div>
      </section>

      {/* ── Contacts ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Contacts ({contacts.length})</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncOutlook}
            disabled={isSyncing}
            className="h-7 text-xs gap-1"
          >
            {isSyncing
              ? <Loader2Icon className="w-3 h-3 animate-spin" />
              : <RefreshCwIcon className="w-3 h-3" />}
            Sync Outlook
          </Button>
        </div>

        {syncMsg && (
          <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">{syncMsg}</p>
        )}

        {/* Add contact form */}
        <div className="grid grid-cols-3 gap-2">
          <Input
            value={newContact.full_name}
            onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
            placeholder="Nom complet"
            className="h-7 text-xs"
          />
          <Input
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            placeholder="email@..."
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Input
              value={newContact.alias}
              onChange={(e) => setNewContact({ ...newContact, alias: e.target.value })}
              placeholder="Alias (Joel)"
              className="h-7 text-xs"
            />
            <Button
              size="icon"
              onClick={handleAddContact}
              disabled={isAddingContact || !newContact.full_name || !newContact.email}
              className="h-7 w-7 shrink-0"
            >
              {isAddingContact
                ? <Loader2Icon className="w-3 h-3 animate-spin" />
                : <PlusIcon className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {/* Contact list */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2Icon className="w-3 h-3 animate-spin" />
              Chargement...
            </div>
          )}
          {!isLoading && contacts.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              Aucun contact. Importez depuis Outlook ou ajoutez manuellement.
            </p>
          )}
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{c.full_name}</p>
                <p className="text-[9px] text-muted-foreground truncate">{c.email}</p>
              </div>
              {c.alias && (
                <span className="text-[8px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                  {c.alias}
                </span>
              )}
              <span className={cn(
                "text-[8px] px-1.5 py-0.5 rounded shrink-0",
                c.source === "outlook" ? "bg-blue-500/10 text-blue-400" : "bg-muted text-muted-foreground"
              )}>
                {c.source}
              </span>
              <button
                onClick={() => removeContact(c.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
              >
                <Trash2Icon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
