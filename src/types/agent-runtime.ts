// ── Agent Runtime Types ───────────────────────────────────────────────────────
// Tracks every step of an agent execution for offline-first resumability
// and human-in-the-loop validation.

export type AgentStepType =
  | "stt"           // Speech-to-text transcription
  | "prompt_build"  // System prompt assembly + context fusion
  | "ai_call"       // LLM API call (streaming)
  | "response_save" // Persist response to conversation

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped"

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "interrupted"       // App closed / network lost mid-run
  | "awaiting_validation" // Paused for human approval

export interface AgentStep {
  id: string
  type: AgentStepType
  status: StepStatus
  startedAt: number
  completedAt?: number
  error?: string
}

// Data saved at each checkpoint so a run can be resumed exactly where it stopped.
export interface AgentRunCheckpoint {
  transcription?: string       // Captured after STT completes
  systemPrompt?: string        // Built before AI call
  previousMessages?: Array<{ role: string; content: string }>
  imageBase64?: string         // Vision context attached
  partialResponse?: string     // Accumulated response if interrupted mid-stream
}

export interface AgentRun {
  id: string
  status: RunStatus
  steps: AgentStep[]
  createdAt: number
  updatedAt: number
  checkpoint: AgentRunCheckpoint
}

// ── Validation Artifact ───────────────────────────────────────────────────────
// Represents a critical action paused for human review before execution.

export type ValidationArtifactType = "ai_request"

export interface ValidationArtifact {
  id: string
  type: ValidationArtifactType
  runId: string          // Linked AgentRun
  createdAt: number
  data: {
    transcription: string
    systemPrompt: string
    previousMessages: Array<{ role: string; content: string }>
    imageBase64?: string
  }
}
