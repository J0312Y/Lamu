import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentRun,
  AgentStep,
  AgentStepType,
  AgentRunCheckpoint,
  RunStatus,
} from "@/types/agent-runtime";

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "lamu_agent_runs";
const MAX_RUNS_STORED = 20;
// Checkpoint partial response every N chunks to avoid excessive writes
const CHECKPOINT_INTERVAL_CHUNKS = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateStepId(type: AgentStepType): string {
  return `${type}_${Date.now()}`;
}

function loadRuns(): AgentRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentRun[]) : [];
  } catch {
    return [];
  }
}

function persistRuns(runs: AgentRun[]): void {
  try {
    // Keep only the most recent runs to avoid localStorage bloat
    const trimmed = runs.slice(-MAX_RUNS_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

function makeStep(type: AgentStepType): AgentStep {
  return {
    id: generateStepId(type),
    type,
    status: "pending",
    startedAt: Date.now(),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface AgentRuntimeHandle {
  /** Currently active run (null when idle) */
  activeRun: AgentRun | null;
  /** Runs that were interrupted and can be resumed */
  interruptedRuns: AgentRun[];
  /** Start a brand-new agent run */
  startRun(): string;
  /** Mark a step as started (running) and save its input checkpoint */
  startStep(runId: string, type: AgentStepType, checkpoint?: Partial<AgentRunCheckpoint>): void;
  /** Mark a step as completed and optionally update the checkpoint */
  completeStep(runId: string, type: AgentStepType, checkpoint?: Partial<AgentRunCheckpoint>): void;
  /** Mark a step as failed */
  failStep(runId: string, type: AgentStepType, error: string): void;
  /** Update the partial AI response checkpoint (called every N chunks) */
  checkpointPartialResponse(runId: string, partial: string): void;
  /** Mark a run as awaiting human validation */
  awaitValidation(runId: string, checkpoint: Partial<AgentRunCheckpoint>): void;
  /** Resume validation — transition back to running */
  resumeFromValidation(runId: string): void;
  /** Mark a run as fully completed */
  completeRun(runId: string): void;
  /** Mark a run as failed */
  failRun(runId: string, error?: string): void;
  /** Discard an interrupted run (user chose not to resume) */
  discardRun(runId: string): void;
  /** Resume an interrupted run — returns its saved checkpoint */
  resumeRun(runId: string): AgentRunCheckpoint | null;
}

export function useAgentRuntime(): AgentRuntimeHandle {
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [interruptedRuns, setInterruptedRuns] = useState<AgentRun[]>([]);
  const chunkCounterRef = useRef<number>(0);

  // ── On mount: detect interrupted runs from previous sessions ─────────────
  useEffect(() => {
    const all = loadRuns();
    const interrupted = all.filter(
      (r) => r.status === "running" || r.status === "interrupted"
    );
    if (interrupted.length > 0) {
      // Mark them officially as interrupted so UI can offer to resume
      const fixed = all.map((r) =>
        r.status === "running" ? { ...r, status: "interrupted" as RunStatus } : r
      );
      persistRuns(fixed);
      setInterruptedRuns(interrupted.map((r) => ({ ...r, status: "interrupted" as RunStatus })));
    }
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const mutateRun = useCallback(
    (runId: string, updater: (run: AgentRun) => AgentRun): AgentRun | null => {
      const all = loadRuns();
      const idx = all.findIndex((r) => r.id === runId);
      if (idx === -1) return null;
      const updated = updater({ ...all[idx] });
      all[idx] = updated;
      persistRuns(all);
      setActiveRun((prev) => (prev?.id === runId ? updated : prev));
      return updated;
    },
    []
  );

  // ── Public API ────────────────────────────────────────────────────────────

  const startRun = useCallback((): string => {
    const run: AgentRun = {
      id: generateRunId(),
      status: "running",
      steps: [
        makeStep("stt"),
        makeStep("prompt_build"),
        makeStep("ai_call"),
        makeStep("response_save"),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checkpoint: {},
    };
    const all = loadRuns();
    all.push(run);
    persistRuns(all);
    setActiveRun(run);
    chunkCounterRef.current = 0;
    return run.id;
  }, []);

  const startStep = useCallback(
    (runId: string, type: AgentStepType, checkpoint?: Partial<AgentRunCheckpoint>) => {
      mutateRun(runId, (run) => ({
        ...run,
        updatedAt: Date.now(),
        checkpoint: checkpoint ? { ...run.checkpoint, ...checkpoint } : run.checkpoint,
        steps: run.steps.map((s) =>
          s.type === type ? { ...s, status: "running", startedAt: Date.now() } : s
        ),
      }));
    },
    [mutateRun]
  );

  const completeStep = useCallback(
    (runId: string, type: AgentStepType, checkpoint?: Partial<AgentRunCheckpoint>) => {
      mutateRun(runId, (run) => ({
        ...run,
        updatedAt: Date.now(),
        checkpoint: checkpoint ? { ...run.checkpoint, ...checkpoint } : run.checkpoint,
        steps: run.steps.map((s) =>
          s.type === type
            ? { ...s, status: "completed", completedAt: Date.now() }
            : s
        ),
      }));
    },
    [mutateRun]
  );

  const failStep = useCallback(
    (runId: string, type: AgentStepType, error: string) => {
      mutateRun(runId, (run) => ({
        ...run,
        updatedAt: Date.now(),
        steps: run.steps.map((s) =>
          s.type === type
            ? { ...s, status: "failed", completedAt: Date.now(), error }
            : s
        ),
      }));
    },
    [mutateRun]
  );

  const checkpointPartialResponse = useCallback(
    (runId: string, partial: string) => {
      chunkCounterRef.current += 1;
      if (chunkCounterRef.current % CHECKPOINT_INTERVAL_CHUNKS !== 0) return;
      mutateRun(runId, (run) => ({
        ...run,
        updatedAt: Date.now(),
        checkpoint: { ...run.checkpoint, partialResponse: partial },
      }));
    },
    [mutateRun]
  );

  const awaitValidation = useCallback(
    (runId: string, checkpoint: Partial<AgentRunCheckpoint>) => {
      mutateRun(runId, (run) => ({
        ...run,
        status: "awaiting_validation",
        updatedAt: Date.now(),
        checkpoint: { ...run.checkpoint, ...checkpoint },
      }));
    },
    [mutateRun]
  );

  const resumeFromValidation = useCallback(
    (runId: string) => {
      mutateRun(runId, (run) => ({
        ...run,
        status: "running",
        updatedAt: Date.now(),
      }));
    },
    [mutateRun]
  );

  const completeRun = useCallback(
    (runId: string) => {
      mutateRun(runId, (run) => ({
        ...run,
        status: "completed",
        updatedAt: Date.now(),
        // Clear audio/image blobs from checkpoint — they are large
        checkpoint: {
          transcription: run.checkpoint.transcription,
          partialResponse: run.checkpoint.partialResponse,
        },
      }));
      setActiveRun(null);
    },
    [mutateRun]
  );

  const failRun = useCallback(
    (runId: string, _error?: string) => {
      mutateRun(runId, (run) => ({
        ...run,
        status: "failed",
        updatedAt: Date.now(),
      }));
      setActiveRun(null);
    },
    [mutateRun]
  );

  const discardRun = useCallback((runId: string) => {
    const all = loadRuns().filter((r) => r.id !== runId);
    persistRuns(all);
    setInterruptedRuns((prev) => prev.filter((r) => r.id !== runId));
  }, []);

  const resumeRun = useCallback((runId: string): AgentRunCheckpoint | null => {
    const all = loadRuns();
    const run = all.find((r) => r.id === runId);
    if (!run) return null;
    const updated = { ...run, status: "running" as RunStatus, updatedAt: Date.now() };
    const idx = all.findIndex((r) => r.id === runId);
    all[idx] = updated;
    persistRuns(all);
    setActiveRun(updated);
    setInterruptedRuns((prev) => prev.filter((r) => r.id !== runId));
    chunkCounterRef.current = 0;
    return run.checkpoint;
  }, []);

  return {
    activeRun,
    interruptedRuns,
    startRun,
    startStep,
    completeStep,
    failStep,
    checkpointPartialResponse,
    awaitValidation,
    resumeFromValidation,
    completeRun,
    failRun,
    discardRun,
    resumeRun,
  };
}
