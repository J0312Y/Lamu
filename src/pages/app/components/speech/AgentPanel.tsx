import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";
import {
  BotIcon,
  SendIcon,
  CheckIcon,
  XIcon,
  LoaderIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  SparklesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIntegrations, type DatabaseCredentials } from "../../../../hooks/useIntegrations";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';

interface PendingTool {
  toolCall: { id: string; function: { name: string; arguments: string } };
  args: Record<string, unknown>;
  step_index: number;
  needs_client_execution?: boolean;
}

interface AgentStep {
  id: number;
  step_index: number;
  tool_name: string;
  tool_args: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  status: 'running' | 'success' | 'failed' | 'approved' | 'rejected';
  created_at: string;
}

interface AgentRun {
  id: string;
  goal: string;
  status: AgentStatus;
  result_summary: string | null;
  result_deliverable: string | null;
  pending_tool: PendingTool | null;
  steps: AgentStep[];
  created_at: string;
  updated_at: string;
}

// ── Tool icons & labels ───────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  query_stats:           { icon: '📊', label: 'Requête données',      color: '#60a5fa' },
  search_knowledge_base: { icon: '🔍', label: 'Recherche KB',         color: '#a78bfa' },
  compile_report:        { icon: '📄', label: 'Compilation rapport',  color: '#34d399' },
  send_email:            { icon: '✉️', label: 'Envoi email',           color: '#f59e0b' },
  create_task:           { icon: '✅', label: 'Création tâche',        color: '#4ade80' },
  extract_action_items:  { icon: '🗂️', label: 'Extraction actions',   color: '#fb923c' },
  db_schema:             { icon: '🗄️', label: 'Schéma base de données', color: '#38bdf8' },
  db_query:              { icon: '🔎', label: 'Requête SQL',           color: '#22d3ee' },
  finish:                { icon: '🏁', label: 'Terminé',              color: '#818cf8' },
};

// ── Goal suggestions ──────────────────────────────────────────────────────────

const GOAL_SUGGESTIONS = [
  "Génère le rapport d'activité mensuel et prépare un email pour le chef de service",
  "Analyse les notes de cette réunion et crée les tâches dans Notion",
  "Donne-moi un résumé des licences qui expirent ce mois + liste des trials actifs",
  "Cherche dans la KB tout ce qui concerne la politique de remboursement et compile un résumé",
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentPanelProps {
  apiBase: string;
  authHeader?: () => Record<string, string>;
  meetingTranscript?: string;
  lastAIResponse?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── SQL write detection ───────────────────────────────────────────────────────

function isSqlWrite(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|UPSERT)\b/i.test(sql);
}

// ── DB write confirmation state ───────────────────────────────────────────────

interface DbWritePending {
  runId: string;
  sql: string;
  description: string;
  executing: boolean;
}

export function AgentPanel({ apiBase, authHeader, meetingTranscript }: AgentPanelProps) {
  const { getIntegrationsPayload } = useIntegrations();
  const [enabledIntegrations, setEnabledIntegrations] = useState<string[]>([]);
  const [dbWritePending, setDbWritePending] = useState<DbWritePending | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/enabled-integrations`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.enabled)) setEnabledIntegrations(d.enabled); })
      .catch(() => {});
  }, [apiBase]);
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', ...(authHeader?.() || {}) }), [authHeader]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const resumeWithResult = useCallback(async (runId: string, toolResult: Record<string, unknown>) => {
    try {
      await fetch(`${apiBase}/api/agent/run/${runId}/resume-tool`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ tool_result: toolResult }),
      });
    } catch { /* ignore — pollRun will retry */ }
  }, [apiBase, headers]);

  const executeClientTool = useCallback(async (runId: string, pending: PendingTool) => {
    const toolName = pending.toolCall.function.name;
    let toolResult: Record<string, unknown>;

    try {
      const dbCreds = getIntegrationsPayload().database as DatabaseCredentials | undefined;
      const integrationId = dbCreds?.integration_id;

      if (toolName === 'db_schema') {
        if (!integrationId) {
          toolResult = { error: 'Aucune base de données connectée. Connectez votre DB dans le panneau Intégrations.' };
        } else {
          const schema = await invoke<string>('kb_database_get_schema', { integrationId });
          toolResult = { success: true, schema };
        }
        await resumeWithResult(runId, toolResult);

      } else if (toolName === 'db_query') {
        const sql = String(pending.args.sql || '');
        const description = String(pending.args.description || '');
        const allowWrite = !!(pending.args.allow_write);

        if (!integrationId) {
          await resumeWithResult(runId, { error: 'Aucune base de données connectée.' });
        } else if (!sql) {
          await resumeWithResult(runId, { error: 'SQL manquant.' });
        } else if (allowWrite || isSqlWrite(sql)) {
          // Write operation — pause for human confirmation (do NOT auto-resume)
          setDbWritePending({ runId, sql, description, executing: false });
          return; // wait for user to approve/cancel
        } else {
          // Read query — auto-execute
          const result = await invoke<string>('kb_database_query', { integrationId, sql, allowWrite: false });
          await resumeWithResult(runId, { success: true, result });
        }
      } else {
        await resumeWithResult(runId, { error: `Outil client inconnu : ${toolName}` });
      }
    } catch (e) {
      await resumeWithResult(runId, { error: String(e) });
    }
  }, [apiBase, headers, getIntegrationsPayload, resumeWithResult]);

  const pollRun = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${apiBase}/api/agent/run/${id}`, { headers: headers() });
      if (!r.ok) return;
      const { run: data } = await r.json();

      // Auto-execute client-side DB tools without user interaction
      if (
        data.status === 'waiting_approval' &&
        data.pending_tool?.needs_client_execution
      ) {
        setRun(data);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        await executeClientTool(id, data.pending_tool);
        // Restart polling to pick up the resumed run
        pollRef.current = setInterval(() => pollRun(id), 1500);
        return;
      }

      setRun(data);
      // Stop polling only when truly terminal (not when waiting for DB write confirmation)
      if (!['running', 'waiting_approval'].includes(data.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch { /* ignore */ }
  }, [apiBase, headers, executeClientTool]);

  useEffect(() => {
    if (runId && !pollRef.current) {
      pollRef.current = setInterval(() => pollRun(runId), 1500);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [runId, pollRun]);

  // ── Start agent run ────────────────────────────────────────────────────────

  const startRun = async () => {
    if (!goal.trim() || loading) return;
    setLoading(true);
    setError(null);
    setRun(null);
    setRunId(null);
    setExpandedSteps(new Set());

    // Append transcript context if available
    let fullGoal = goal.trim();
    if (meetingTranscript && fullGoal.toLowerCase().includes('réunion')) {
      fullGoal += `\n\n[Transcript de réunion]\n${meetingTranscript.slice(0, 3000)}`;
    }

    try {
      // Strip integrations disabled by admin
      const allCreds = getIntegrationsPayload();
      const filteredCreds = Object.fromEntries(
        Object.entries(allCreds).filter(([k]) => enabledIntegrations.length === 0 || enabledIntegrations.includes(k))
      );

      const r = await fetch(`${apiBase}/api/agent/run`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ goal: fullGoal, integrations: filteredCreds }),
      });
      const data = await r.json();
      if (!r.ok || !data.run_id) { setError(data.error || 'Erreur démarrage agent'); return; }
      setRunId(data.run_id);
    } catch (err) {
      setError('Connexion au backend impossible');
    } finally {
      setLoading(false);
    }
  };

  // ── Approve / reject tool call ─────────────────────────────────────────────

  const respond = async (approved: boolean) => {
    if (!runId) return;
    try {
      await fetch(`${apiBase}/api/agent/run/${runId}/approve`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ approved }),
      });
      await pollRun(runId);
      if (!pollRef.current) {
        pollRef.current = setInterval(() => pollRun(runId), 1500);
      }
    } catch { setError('Erreur lors de la réponse'); }
  };

  // ── DB write confirmation ──────────────────────────────────────────────────

  const confirmDbWrite = async () => {
    if (!dbWritePending || dbWritePending.executing) return;
    setDbWritePending(p => p ? { ...p, executing: true } : null);
    const { runId, sql } = dbWritePending;
    const dbCreds = getIntegrationsPayload().database as DatabaseCredentials | undefined;
    let toolResult: Record<string, unknown>;
    try {
      const result = await invoke<string>('kb_database_query', {
        integrationId: dbCreds?.integration_id,
        sql,
        allowWrite: true,
      });
      toolResult = { success: true, result };
    } catch (e) {
      toolResult = { error: String(e) };
    }
    setDbWritePending(null);
    await resumeWithResult(runId, toolResult);
    if (!pollRef.current) pollRef.current = setInterval(() => pollRun(runId), 1500);
  };

  const cancelDbWrite = async () => {
    if (!dbWritePending) return;
    const { runId } = dbWritePending;
    setDbWritePending(null);
    await resumeWithResult(runId, { error: 'Opération d\'écriture annulée par l\'utilisateur.' });
    if (!pollRef.current) pollRef.current = setInterval(() => pollRun(runId), 1500);
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const cancelRun = async () => {
    if (!runId) return;
    await fetch(`${apiBase}/api/agent/run/${runId}/cancel`, { method: 'POST', headers: headers() });
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    await pollRun(runId);
  };

  // ── Copy deliverable ───────────────────────────────────────────────────────

  const copyDeliverable = () => {
    if (!run?.result_deliverable) return;
    navigator.clipboard.writeText(run.result_deliverable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Render step ────────────────────────────────────────────────────────────

  const renderStep = (step: AgentStep) => {
    const meta = TOOL_META[step.tool_name] || { icon: '🔧', label: step.tool_name, color: '#6b7280' };
    const isExpanded = expandedSteps.has(step.id);
    const isRunning = step.status === 'running';

    return (
      <div key={step.id} className="rounded-lg border border-border/40 overflow-hidden">
        <button
          onClick={() => setExpandedSteps(prev => { const next = new Set(prev); isExpanded ? next.delete(step.id) : next.add(step.id); return next; })}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-sm">{meta.icon}</span>
          <span className="text-xs font-medium flex-1" style={{ color: meta.color }}>{meta.label}</span>
          {isRunning && <LoaderIcon className="w-3 h-3 animate-spin text-muted-foreground" />}
          {step.status === 'approved' && <CheckIcon className="w-3 h-3 text-green-400" />}
          {step.status === 'rejected' && <XIcon className="w-3 h-3 text-red-400" />}
          {step.status === 'failed' && <span className="text-xs text-red-400">Erreur</span>}
          {isExpanded ? <ChevronDownIcon className="w-3 h-3 text-muted-foreground" /> : <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />}
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-border/30">
            {step.tool_args && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 mt-2">Arguments</p>
                <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(step.tool_args, null, 2)}</pre>
              </div>
            )}
            {step.tool_result && !('pending_approval' in step.tool_result) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Résultat</p>
                <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-48">{JSON.stringify(step.tool_result, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Status badge ───────────────────────────────────────────────────────────

  const StatusBadge = () => {
    if (!run) return null;
    if (dbWritePending) return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-blue-400 bg-blue-400/10">
        <LoaderIcon className="w-3 h-3 inline mr-1 animate-pulse" />
        Confirmation requise
      </span>
    );
    const isClientTool = run.status === 'waiting_approval' && run.pending_tool?.needs_client_execution;
    const cfg = isClientTool
      ? { label: 'Requête DB…', cls: 'text-cyan-400 bg-cyan-400/10' }
      : (({
          running:          { label: 'En cours…',             cls: 'text-blue-400 bg-blue-400/10'     },
          waiting_approval: { label: 'En attente approbation', cls: 'text-amber-400 bg-amber-400/10'  },
          completed:        { label: 'Terminé',                cls: 'text-green-400 bg-green-400/10'  },
          failed:           { label: 'Erreur',                 cls: 'text-red-400 bg-red-400/10'      },
          cancelled:        { label: 'Annulé',                 cls: 'text-muted-foreground bg-white/5' },
        } as Record<string, { label: string; cls: string }>)[run.status] || { label: run.status, cls: 'text-muted-foreground' });
    return (
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cfg.cls)}>
        {(run.status === 'running' || isClientTool) && <LoaderIcon className="w-3 h-3 inline mr-1 animate-spin" />}
        {cfg.label}
      </span>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BotIcon className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-foreground">Agent Autonome</span>
        <span className="text-xs text-muted-foreground ml-auto">Lamu Agent</span>
      </div>

      {/* Goal input */}
      {!run || ['completed', 'failed', 'cancelled'].includes(run.status) ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startRun(); }}
            placeholder="Décrivez l'objectif à accomplir… (Ctrl+Enter pour lancer)"
            className="w-full text-xs bg-white/5 border border-border/50 rounded-lg p-2.5 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50 min-h-[80px]"
          />

          {/* Suggestions */}
          {!goal && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggestions :</p>
              {GOAL_SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => setGoal(s)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground">
                  <SparklesIcon className="w-3 h-3 inline mr-1.5 text-violet-400" />{s}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button
            onClick={startRun}
            disabled={!goal.trim() || loading}
            size="sm"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          >
            {loading ? <LoaderIcon className="w-3 h-3 animate-spin mr-1" /> : <SendIcon className="w-3 h-3 mr-1" />}
            Lancer l'agent
          </Button>

          {/* Previous run summary */}
          {run?.status === 'completed' && run.result_summary && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
              <p className="text-xs font-medium text-green-400">✓ Dernière exécution réussie</p>
              <p className="text-xs text-muted-foreground">{run.result_summary}</p>
            </div>
          )}
        </div>
      ) : (
        /* Active run */
        <div className="space-y-3">
          {/* Goal + status */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground flex-1 line-clamp-2">{run.goal}</p>
            <StatusBadge />
          </div>

          {/* DB write confirmation modal */}
          {dbWritePending && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-400">🗄️ Confirmation écriture base de données</p>
              {dbWritePending.description && (
                <p className="text-xs text-foreground">{dbWritePending.description}</p>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">SQL à exécuter :</p>
                <pre className="text-xs bg-black/30 border border-border/30 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-amber-300">{dbWritePending.sql}</pre>
              </div>
              <p className="text-[10px] text-muted-foreground">⚠️ Cette opération modifiera vos données. Vérifiez le SQL avant de confirmer.</p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={confirmDbWrite}
                  disabled={dbWritePending.executing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                >
                  {dbWritePending.executing
                    ? <><LoaderIcon className="w-3 h-3 animate-spin mr-1" />Exécution…</>
                    : <><CheckIcon className="w-3 h-3 mr-1" />Confirmer &amp; exécuter</>
                  }
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelDbWrite}
                  disabled={dbWritePending.executing}
                  className="flex-1 text-xs"
                >
                  <XIcon className="w-3 h-3 mr-1" />Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Approval modal — only for human approval, not client-side DB tools */}
          {run.status === 'waiting_approval' && run.pending_tool && !run.pending_tool.needs_client_execution && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-400">⚠️ Approbation requise</p>
              <p className="text-xs text-foreground font-medium">
                {TOOL_META[run.pending_tool.toolCall.function.name]?.icon} Envoi email
              </p>
              {run.pending_tool.args.to != null && (
                <p className="text-xs text-muted-foreground">À : <span className="text-foreground">{String(run.pending_tool.args.to)}</span></p>
              )}
              {run.pending_tool.args.subject != null && (
                <p className="text-xs text-muted-foreground">Objet : <span className="text-foreground">{String(run.pending_tool.args.subject)}</span></p>
              )}
              {run.pending_tool.args.body_markdown != null && (
                <pre className="text-xs bg-black/20 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">{String(run.pending_tool.args.body_markdown)}</pre>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => respond(true)} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs">
                  <CheckIcon className="w-3 h-3 mr-1" /> Envoyer
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond(false)} className="flex-1 text-xs">
                  <XIcon className="w-3 h-3 mr-1" /> Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Steps */}
          {run.steps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Étapes ({run.steps.length})</p>
              {run.steps.map(renderStep)}
            </div>
          )}

          {/* Running spinner */}
          {run.status === 'running' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderIcon className="w-3 h-3 animate-spin" />
              <span>Agent en cours d'exécution…</span>
            </div>
          )}

          {/* Result */}
          {run.status === 'completed' && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-green-400">✓ Objectif accompli</p>
              {run.result_summary && <p className="text-xs text-muted-foreground">{run.result_summary}</p>}
              {run.result_deliverable && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-foreground">Livrable</p>
                    <button onClick={copyDeliverable} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      {copied ? <CheckIcon className="w-3 h-3 text-green-400" /> : <ClipboardCopyIcon className="w-3 h-3" />}
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  <pre className="text-xs bg-black/20 rounded p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">{run.result_deliverable}</pre>
                </div>
              )}
            </div>
          )}

          {run.status === 'failed' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="text-xs font-semibold text-red-400">✗ Échec</p>
              {run.result_summary && <p className="text-xs text-muted-foreground mt-1">{run.result_summary}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => { setRun(null); setRunId(null); setGoal(''); }}
              className="flex-1 text-xs"
            >
              Nouvelle tâche
            </Button>
            {(['running', 'waiting_approval'].includes(run.status) || dbWritePending) && (
              <Button size="sm" variant="outline" onClick={dbWritePending ? cancelDbWrite : cancelRun} className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10">
                Annuler
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
