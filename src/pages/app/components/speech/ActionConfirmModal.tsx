import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2Icon, ZapIcon, AlertCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LamuAction {
  type: string;
  integration?: string;
  integration_id?: string;
  // Common
  title?: string;
  description?: string;
  body?: string;
  content?: string;
  labels?: string[];
  assignees?: string[];
  // GitLab / GitHub issues & PRs
  issue_iid?: number;
  issue_number?: number;
  state_event?: string;
  source_branch?: string;
  target_branch?: string;
  head?: string;
  base?: string;
  file_path?: string;
  branch?: string;
  commit_message?: string;
  // Jira
  project_key?: string;
  issue_key?: string;
  issue_type?: string;
  transition_name?: string;
  // Confluence
  space_key?: string;
  page_id?: string;
  parent_id?: string;
  version?: number;
  // Notion
  parent_page_id?: string;
  // Salesforce
  object_type?: string;
  record_id?: string;
  fields?: Record<string, unknown>;
  // Shopify
  product_id?: number;
  price?: string;
  // Database
  sql?: string;
  allow_write?: boolean;
}

interface ActionConfirmModalProps {
  action: LamuAction | null;
  integrationName: string;
  onConfirm: (action: LamuAction) => Promise<void>;
  onDismiss: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  // GitLab
  gitlab_create_issue:  "Créer une issue GitLab",
  gitlab_update_issue:  "Modifier une issue GitLab",
  gitlab_comment_issue: "Commenter une issue GitLab",
  gitlab_create_mr:     "Créer une Merge Request GitLab",
  gitlab_upsert_file:   "Créer/modifier un fichier GitLab",
  // GitHub
  github_create_issue:  "Créer une issue GitHub",
  github_update_issue:  "Modifier une issue GitHub",
  github_add_comment:   "Commenter une issue/PR GitHub",
  github_create_pr:     "Créer une Pull Request GitHub",
  // Jira
  jira_create_issue:    "Créer une issue Jira",
  jira_update_issue:    "Modifier une issue Jira",
  jira_add_comment:     "Commenter une issue Jira",
  jira_transition_issue:"Changer le statut d'une issue Jira",
  // Confluence
  confluence_create_page: "Créer une page Confluence",
  confluence_update_page: "Modifier une page Confluence",
  // Notion
  notion_create_page:     "Créer une page Notion",
  notion_append_content:  "Ajouter du contenu Notion",
  // Salesforce
  salesforce_create_record: "Créer un enregistrement Salesforce",
  salesforce_update_record: "Modifier un enregistrement Salesforce",
  // Shopify
  shopify_create_product: "Créer un produit Shopify",
  shopify_update_product: "Modifier un produit Shopify",
  // Database
  db_query: "Exécuter une requête SQL",
};

export const ActionConfirmModal = ({
  action,
  integrationName,
  onConfirm,
  onDismiss,
}: ActionConfirmModalProps) => {
  const [form, setForm] = useState<LamuAction>(action ?? {} as LamuAction);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!action) return null;

  const label = ACTION_LABELS[form.type] ?? form.type;

  const f = <K extends keyof LamuAction>(key: K, value: LamuAction[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleConfirm = async () => {
    setError(null);
    setIsExecuting(true);
    try {
      await onConfirm(form);
      setDone(true);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? "Erreur inconnue");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={!!action} onOpenChange={(v) => { if (!v && !isExecuting) onDismiss(); }}>
      <DialogContent className="max-w-md flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <ZapIcon className="w-4 h-4 text-primary" />
            {label}
          </DialogTitle>
          {integrationName && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{integrationName}</p>
          )}
        </DialogHeader>

        <div className="px-4 py-3 space-y-2 overflow-y-auto max-h-[60vh]">
          {done ? (
            <p className="text-sm text-green-600 dark:text-green-400 py-2">
              Action exécutée avec succès.
            </p>
          ) : (
            <>
              {/* gitlab_create_issue */}
              {(form.type === "gitlab_create_issue") && (
                <>
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Description" value={form.description ?? ""} onChange={(v) => f("description", v)} />
                  <FieldInput label="Labels (séparés par virgule)" value={(form.labels ?? []).join(", ")}
                    onChange={(v) => f("labels", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                  <FieldInput label="Assignés (usernames, séparés par virgule)" value={(form.assignees ?? []).join(", ")}
                    onChange={(v) => f("assignees", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                </>
              )}

              {/* gitlab_update_issue */}
              {form.type === "gitlab_update_issue" && (
                <>
                  <FieldInput label="N° issue (iid)" value={String(form.issue_iid ?? "")} onChange={(v) => f("issue_iid", Number(v))} />
                  <FieldInput label="Nouveau titre (optionnel)" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Nouvelle description (optionnel)" value={form.description ?? ""} onChange={(v) => f("description", v)} />
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Statut</label>
                    <select
                      value={form.state_event ?? ""}
                      onChange={(e) => f("state_event", e.target.value || undefined)}
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      <option value="">— inchangé —</option>
                      <option value="close">Fermer</option>
                      <option value="reopen">Réouvrir</option>
                    </select>
                  </div>
                  <FieldInput label="Labels (séparés par virgule)" value={(form.labels ?? []).join(", ")}
                    onChange={(v) => f("labels", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                </>
              )}

              {/* gitlab_comment_issue */}
              {form.type === "gitlab_comment_issue" && (
                <>
                  <FieldInput label="N° issue (iid)" value={String(form.issue_iid ?? "")} onChange={(v) => f("issue_iid", Number(v))} />
                  <FieldTextarea label="Commentaire" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                </>
              )}

              {/* gitlab_create_mr */}
              {form.type === "gitlab_create_mr" && (
                <>
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldInput label="Branche source" value={form.source_branch ?? ""} onChange={(v) => f("source_branch", v)} />
                  <FieldInput label="Branche cible" value={form.target_branch ?? "main"} onChange={(v) => f("target_branch", v)} />
                  <FieldTextarea label="Description" value={form.description ?? ""} onChange={(v) => f("description", v)} />
                </>
              )}

              {/* gitlab_upsert_file */}
              {form.type === "gitlab_upsert_file" && (
                <>
                  <FieldInput label="Chemin du fichier" value={form.file_path ?? ""} onChange={(v) => f("file_path", v)} />
                  <FieldInput label="Branche" value={form.branch ?? "main"} onChange={(v) => f("branch", v)} />
                  <FieldInput label="Message de commit" value={form.commit_message ?? ""} onChange={(v) => f("commit_message", v)} />
                  <FieldTextarea label="Contenu" value={form.content ?? ""} onChange={(v) => f("content", v)} rows={6} />
                </>
              )}

              {/* github_create_issue */}
              {form.type === "github_create_issue" && (
                <>
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Corps" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                  <FieldInput label="Labels (séparés par virgule)" value={(form.labels ?? []).join(", ")}
                    onChange={(v) => f("labels", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                  <FieldInput label="Assignés (usernames, séparés par virgule)" value={(form.assignees ?? []).join(", ")}
                    onChange={(v) => f("assignees", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                </>
              )}

              {/* github_update_issue */}
              {form.type === "github_update_issue" && (
                <>
                  <FieldInput label="N° issue" value={String(form.issue_number ?? "")} onChange={(v) => f("issue_number", Number(v))} />
                  <FieldInput label="Nouveau titre (optionnel)" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Nouveau corps (optionnel)" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Statut</label>
                    <select
                      value={form.state_event ?? ""}
                      onChange={(e) => f("state_event", e.target.value || undefined)}
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      <option value="">— inchangé —</option>
                      <option value="open">Ouvrir</option>
                      <option value="closed">Fermer</option>
                    </select>
                  </div>
                </>
              )}

              {/* github_add_comment */}
              {form.type === "github_add_comment" && (
                <>
                  <FieldInput label="N° issue / PR" value={String(form.issue_number ?? "")} onChange={(v) => f("issue_number", Number(v))} />
                  <FieldTextarea label="Commentaire" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                </>
              )}

              {/* github_create_pr */}
              {form.type === "github_create_pr" && (
                <>
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldInput label="Branche source (head)" value={form.head ?? ""} onChange={(v) => f("head", v)} />
                  <FieldInput label="Branche cible (base)" value={form.base ?? "main"} onChange={(v) => f("base", v)} />
                  <FieldTextarea label="Description" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                </>
              )}

              {/* jira_create_issue */}
              {form.type === "jira_create_issue" && (
                <>
                  <FieldInput label="Clé projet (ex: PROJ)" value={form.project_key ?? ""} onChange={(v) => f("project_key", v)} />
                  <FieldInput label="Résumé" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Description" value={form.description ?? ""} onChange={(v) => f("description", v)} />
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Type d'issue</label>
                    <select
                      value={form.issue_type ?? "Task"}
                      onChange={(e) => f("issue_type", e.target.value)}
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      <option value="Bug">Bug</option>
                      <option value="Task">Task</option>
                      <option value="Story">Story</option>
                    </select>
                  </div>
                </>
              )}

              {/* jira_update_issue */}
              {form.type === "jira_update_issue" && (
                <>
                  <FieldInput label="Clé issue (ex: PROJ-123)" value={form.issue_key ?? ""} onChange={(v) => f("issue_key", v)} />
                  <FieldInput label="Nouveau résumé (optionnel)" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Nouvelle description (optionnel)" value={form.description ?? ""} onChange={(v) => f("description", v)} />
                </>
              )}

              {/* jira_add_comment */}
              {form.type === "jira_add_comment" && (
                <>
                  <FieldInput label="Clé issue (ex: PROJ-123)" value={form.issue_key ?? ""} onChange={(v) => f("issue_key", v)} />
                  <FieldTextarea label="Commentaire" value={form.body ?? ""} onChange={(v) => f("body", v)} />
                </>
              )}

              {/* jira_transition_issue */}
              {form.type === "jira_transition_issue" && (
                <>
                  <FieldInput label="Clé issue (ex: PROJ-123)" value={form.issue_key ?? ""} onChange={(v) => f("issue_key", v)} />
                  <FieldInput label="Transition (ex: In Progress, Done)" value={form.transition_name ?? ""} onChange={(v) => f("transition_name", v)} />
                </>
              )}

              {/* confluence_create_page */}
              {form.type === "confluence_create_page" && (
                <>
                  <FieldInput label="Clé espace (ex: ENG)" value={form.space_key ?? ""} onChange={(v) => f("space_key", v)} />
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldInput label="ID page parente (optionnel)" value={form.parent_id ?? ""} onChange={(v) => f("parent_id", v)} />
                  <FieldTextarea label="Contenu HTML" value={form.body ?? ""} onChange={(v) => f("body", v)} rows={5} />
                </>
              )}

              {/* confluence_update_page */}
              {form.type === "confluence_update_page" && (
                <>
                  <FieldInput label="ID page" value={form.page_id ?? ""} onChange={(v) => f("page_id", v)} />
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldInput label="Version (numéro actuel)" value={String(form.version ?? "")} onChange={(v) => f("version", Number(v))} />
                  <FieldTextarea label="Contenu HTML" value={form.body ?? ""} onChange={(v) => f("body", v)} rows={5} />
                </>
              )}

              {/* notion_create_page */}
              {form.type === "notion_create_page" && (
                <>
                  <FieldInput label="ID page parente" value={form.parent_page_id ?? ""} onChange={(v) => f("parent_page_id", v)} />
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Contenu" value={form.content ?? ""} onChange={(v) => f("content", v)} rows={5} />
                </>
              )}

              {/* notion_append_content */}
              {form.type === "notion_append_content" && (
                <>
                  <FieldInput label="ID page" value={form.page_id ?? ""} onChange={(v) => f("page_id", v)} />
                  <FieldTextarea label="Contenu à ajouter" value={form.content ?? ""} onChange={(v) => f("content", v)} rows={5} />
                </>
              )}

              {/* salesforce_create_record */}
              {form.type === "salesforce_create_record" && (
                <>
                  <FieldInput label="Type d'objet (ex: Contact, Lead)" value={form.object_type ?? ""} onChange={(v) => f("object_type", v)} />
                  <FieldTextarea
                    label="Champs (JSON)"
                    value={form.fields ? JSON.stringify(form.fields, null, 2) : "{}"}
                    onChange={(v) => { try { f("fields", JSON.parse(v)); } catch {} }}
                    rows={5}
                  />
                </>
              )}

              {/* salesforce_update_record */}
              {form.type === "salesforce_update_record" && (
                <>
                  <FieldInput label="Type d'objet (ex: Contact)" value={form.object_type ?? ""} onChange={(v) => f("object_type", v)} />
                  <FieldInput label="ID enregistrement" value={form.record_id ?? ""} onChange={(v) => f("record_id", v)} />
                  <FieldTextarea
                    label="Champs à modifier (JSON)"
                    value={form.fields ? JSON.stringify(form.fields, null, 2) : "{}"}
                    onChange={(v) => { try { f("fields", JSON.parse(v)); } catch {} }}
                    rows={5}
                  />
                </>
              )}

              {/* shopify_create_product */}
              {form.type === "shopify_create_product" && (
                <>
                  <FieldInput label="Titre" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldInput label="Prix (ex: 29.99)" value={form.price ?? ""} onChange={(v) => f("price", v)} />
                  <FieldTextarea label="Description HTML" value={form.body ?? ""} onChange={(v) => f("body", v)} rows={4} />
                </>
              )}

              {/* shopify_update_product */}
              {form.type === "shopify_update_product" && (
                <>
                  <FieldInput label="ID produit" value={String(form.product_id ?? "")} onChange={(v) => f("product_id", Number(v))} />
                  <FieldInput label="Nouveau titre (optionnel)" value={form.title ?? ""} onChange={(v) => f("title", v)} />
                  <FieldTextarea label="Nouvelle description HTML (optionnel)" value={form.body ?? ""} onChange={(v) => f("body", v)} rows={4} />
                </>
              )}

              {/* db_query */}
              {form.type === "db_query" && (
                <>
                  {form.description && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">{form.description}</p>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Requête SQL</label>
                    <textarea
                      value={form.sql ?? ""}
                      onChange={(e) => f("sql", e.target.value)}
                      rows={8}
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
                        "focus-visible:ring-ring resize-none"
                      )}
                      placeholder="SELECT * FROM ..."
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={form.allow_write ?? false}
                      onChange={(e) => f("allow_write", e.target.checked)}
                      id="allow-write-chk"
                    />
                    <label htmlFor="allow-write-chk" className="cursor-pointer">
                      Autoriser les modifications (INSERT/UPDATE/DELETE)
                    </label>
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
                  <AlertCircleIcon className="w-3 h-3 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
          {done ? (
            <Button size="sm" onClick={onDismiss} className="h-7 text-xs">Fermer</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onDismiss} disabled={isExecuting} className="h-7 text-xs">
                Annuler
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={isExecuting} className="h-7 text-xs gap-1.5">
                {isExecuting
                  ? <><Loader2Icon className="w-3 h-3 animate-spin" />Exécution...</>
                  : <><ZapIcon className="w-3 h-3" />Confirmer</>}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Small field helpers ───────────────────────────────────────────────────────

const FieldInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">{label}</label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
  </div>
);

const FieldTextarea = ({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) => (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
        "focus-visible:ring-ring resize-none"
      )}
    />
  </div>
);
