import { useEffect, useState, useCallback, useRef } from "react";
import { useWindowResize, useGlobalShortcuts } from ".";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/contexts";
import { fetchSTT, fetchAIResponse } from "@/lib/functions";
import {
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_SYSTEM_PROMPT,
  EMAIL_ACTION_INSTRUCTIONS,
  EMAIL_DISABLED_HINT,
  ACTION_INSTRUCTIONS,
  FILESEARCH_INSTRUCTIONS,
  STORAGE_KEYS,
  ASSISTANT_MODES,
  type AssistantMode,
} from "@/config";
import {
  safeLocalStorage,
  shouldUseLamuAPI,
  generateConversationTitle,
  saveConversation,
  CONVERSATION_SAVE_DEBOUNCE_MS,
  generateConversationId,
  generateMessageId,
} from "@/lib";
import { Message } from "@/types/completion";
import { useAgentRuntime } from "./useAgentRuntime";
import { ValidationArtifact } from "@/types/agent-runtime";
import { isWriteSql, extractSqlBlocks } from "@/lib/sqlUtils";
import type { SqlQueryResult, PendingSqlWrite } from "@/lib/sqlUtils";

// ── Constants ─────────────────────────────────────────────────────────────────
/** Timeout for a single STT transcription request, in milliseconds. */
const STT_TIMEOUT_MS = 30_000;

/**
 * Extract the first complete JSON object that follows `marker:` in `text`.
 * Uses brace-counting to find the matching `}`, correctly handling nested
 * objects and string literals — more robust than a greedy regex.
 */
function extractJsonAfterMarker(text: string, marker: string): string | null {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = text.indexOf("{", markerIdx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// VAD Configuration interface matching Rust
export interface VadConfig {
  enabled: boolean;
  hop_size: number;
  sensitivity_rms: number;
  peak_threshold: number;
  silence_chunks: number;
  min_speech_chunks: number;
  pre_speech_chunks: number;
  noise_gate_threshold: number;
  max_recording_duration_secs: number;
}

// OPTIMIZED VAD defaults - matches backend exactly for perfect performance
const DEFAULT_VAD_CONFIG: VadConfig = {
  enabled: true,
  hop_size: 1024,
  sensitivity_rms: 0.012, // Much less sensitive - only real speech
  peak_threshold: 0.035, // Higher threshold - filters clicks/noise
  silence_chunks: 45, // ~1.0s of required silence
  min_speech_chunks: 7, // ~0.16s - captures short answers
  pre_speech_chunks: 12, // ~0.27s - enough to catch word start
  noise_gate_threshold: 0.003, // Stronger noise filtering
  max_recording_duration_secs: 180, // 3 minutes default
};

// Chat message interface (reusing from useCompletion)
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// Conversation interface (reusing from useCompletion)
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type useSystemAudioType = ReturnType<typeof useSystemAudio>;

export function useSystemAudio() {
  const { resizeWindow } = useWindowResize();
  const globalShortcuts = useGlobalShortcuts();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [lastAIResponse, setLastAIResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [isManagingQuickActions, setIsManagingQuickActions] =
    useState<boolean>(false);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(true);
  const [vadConfig, setVadConfig] = useState<VadConfig>(DEFAULT_VAD_CONFIG);
  const [recordingProgress, setRecordingProgress] = useState<number>(0); // For continuous mode
  const [isContinuousMode, setIsContinuousMode] = useState<boolean>(false);
  const [isRecordingInContinuousMode, setIsRecordingInContinuousMode] =
    useState<boolean>(false);
  // Live listening indicator: null = not listening, number = ms elapsed
  const [speechInProgressMs, setSpeechInProgressMs] = useState<number | null>(null);
  // Live interim transcription from streaming STT (cleared when final transcript arrives)
  const [interimTranscription, setInterimTranscription] = useState<string>("");

  const [conversation, setConversation] = useState<ChatConversation>({
    id: "",
    title: "",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  });

  // Context management states
  const [useSystemPrompt, setUseSystemPrompt] = useState<boolean>(true);
  const [contextContent, setContextContent] = useState<string>("");

  // ── Meeting app detection ─────────────────────────────────────────────────────
  const [detectedApps, setDetectedApps] = useState<string[]>([]);
  const [autoMeetingEnabled, setAutoMeetingEnabled] = useState<boolean>(
    () => safeLocalStorage.getItem("auto_meeting_mode") === "true"
  );

  // ── TTS auto-speak in meeting mode ────────────────────────────────────────────
  const [autoSpeakInMeeting, setAutoSpeakInMeetingState] = useState<boolean>(
    () => safeLocalStorage.getItem("auto_speak_meeting") === "true"
  );
  const toggleAutoSpeak = useCallback((enabled: boolean) => {
    setAutoSpeakInMeetingState(enabled);
    safeLocalStorage.setItem("auto_speak_meeting", String(enabled));
  }, []);

  const exportConversation = useCallback(() => {
    const lines: string[] = [`# Lamu Conversation — ${new Date().toLocaleString()}`, ""];

    // Most recent first in state — reverse for chronological export
    const chrono = [...conversation.messages].reverse();
    for (const msg of chrono) {
      const label = msg.role === "user" ? "**Them**" : msg.role === "assistant" ? "**AI**" : "**System**";
      lines.push(`${label}: ${msg.content}`, "");
    }

    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lamu-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversation.messages]);

  // ── Microphone capture ────────────────────────────────────────────────────────
  const [micCapturing, setMicCapturing] = useState(false);

  // ── Clipboard context ─────────────────────────────────────────────────────────
  const [clipboardContext, setClipboardContext] = useState<string | null>(null);

  // ── Custom playbook (temporary session context) ───────────────────────────────
  const [playbookContext, setPlaybookContextState] = useState<string | null>(null);
  const setPlaybookContext = useCallback((text: string | null) => {
    setPlaybookContextState(text);
  }, []);

  // ── STT language ─────────────────────────────────────────────────────────────
  const [sttLanguage, setSttLanguageState] = useState<string>(
    () => safeLocalStorage.getItem("stt_language") ?? "auto"
  );
  const sttLanguageRef = useRef<string>(
    safeLocalStorage.getItem("stt_language") ?? "auto"
  );
  useEffect(() => { sttLanguageRef.current = sttLanguage; }, [sttLanguage]);
  const setSttLanguage = useCallback((lang: string) => {
    sttLanguageRef.current = lang;
    setSttLanguageState(lang);
    safeLocalStorage.setItem("stt_language", lang);
  }, []);

  // ── Knowledge base RAG toggle ─────────────────────────────────────────────────
  const [kbEnabled, setKbEnabledState] = useState<boolean>(
    () => safeLocalStorage.getItem("kb_enabled") === "true"
  );
  const kbEnabledRef = useRef<boolean>(
    safeLocalStorage.getItem("kb_enabled") === "true"
  );
  // Keep ref in sync with state (mirrors autoSendEmailRef pattern)
  useEffect(() => { kbEnabledRef.current = kbEnabled; }, [kbEnabled]);
  const setKbEnabled = useCallback((enabled: boolean) => {
    kbEnabledRef.current = enabled;
    setKbEnabledState(enabled);
    safeLocalStorage.setItem("kb_enabled", String(enabled));
  }, []);

  // ── Meeting mode (always-on, transcript memory, context fusion) ──────────────
  // Never restore meeting mode as active on startup — always begin idle so the
  // user (or auto-detect) must explicitly enable it each session.
  const [meetingModeActive, setMeetingModeActiveState] = useState<boolean>(false);
  const [assistantMode, setAssistantModeState] = useState<AssistantMode>(
    () =>
      (safeLocalStorage.getItem(STORAGE_KEYS.ASSISTANT_MODE) as AssistantMode) ||
      "general"
  );
  // Accumulates every transcription + AI response for the current session
  const [meetingTranscript, setMeetingTranscript] = useState<
    { role: "them" | "ai" | "me"; text: string; time: string }[]
  >([]);
  // Holds the latest auto-captured screenshot for context fusion
  const autoScreenshotRef = useRef<string | null>(null);
  // Tracks whether capture should auto-restart after AI finishes (meeting mode)
  const meetingModeRef = useRef<boolean>(false);

  const {
    selectedSttProvider,
    allSttProviders,
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedAudioDevices,
    supportsImages,
    isBlocked,
  } = useApp();
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Manual screenshot attached via the Screenshot button in the panel
  const manualScreenshotRef = useRef<string | null>(null);
  const setManualScreenshot = useCallback((base64: string | null) => {
    manualScreenshotRef.current = base64;
  }, []);

  // ── Meeting summary modal ─────────────────────────────────────────────────
  const [meetingSummaryOpen, setMeetingSummaryOpen] = useState(false);
  const [meetingSummaryText, setMeetingSummaryText] = useState("");
  const [meetingSummaryGenerating, setMeetingSummaryGenerating] = useState(false);
  const [meetingSummarySaved, setMeetingSummarySaved] = useState(false);
  const [meetingSummaryDate, setMeetingSummaryDate] = useState(new Date());

  // ── Coaching tips ─────────────────────────────────────────────────────────
  const [coachingTip, setCoachingTip] = useState("");
  const [coachingGenerating, setCoachingGenerating] = useState(false);
  const [coachingVisible, setCoachingVisible] = useState(false);

  // ── Pending external action (LAMU_ACTION) ────────────────────────────────
  const [pendingAction, setPendingAction] = useState<import("../pages/app/components/speech/ActionConfirmModal").LamuAction | null>(null);
  const [pendingActionIntegrationName, setPendingActionIntegrationName] = useState<string>("");

  // ── Email draft (Human-in-the-Loop for email actions) ────────────────────
  const [pendingEmailDraft, setPendingEmailDraft] = useState<import("@/types/email").EmailDraft | null>(null);
  // true when SMTP is configured (checked lazily)
  const [emailEnabled, setEmailEnabled] = useState<boolean>(
    () => safeLocalStorage.getItem("email_enabled") === "true"
  );
  // true = envoyer sans confirmation, false = montrer le modal de validation
  const [autoSendEmail, setAutoSendEmail] = useState<boolean>(
    () => safeLocalStorage.getItem("email_auto_send") === "true"
  );
  const autoSendEmailRef = useRef(autoSendEmail);
  useEffect(() => { autoSendEmailRef.current = autoSendEmail; }, [autoSendEmail]);

  // ── SQL execution from AI response (Human-in-the-Loop for writes) ───────
  const [pendingSqlWrite, setPendingSqlWrite] = useState<PendingSqlWrite | null>(null);
  const [dbQueryResults, setDbQueryResults] = useState<SqlQueryResult[]>([]);

  // ── State Runtime ─────────────────────────────────────────────────────────
  const runtime = useAgentRuntime();
  // Tracks the runId of the currently executing agent pipeline
  const activeRunIdRef = useRef<string | null>(null);

  // ── Human-in-the-Loop (Validation) ───────────────────────────────────────
  const [requireValidation, setRequireValidationState] = useState<boolean>(
    () => safeLocalStorage.getItem("require_validation") === "true"
  );
  const [pendingValidation, setPendingValidation] =
    useState<ValidationArtifact | null>(null);
  // Holds the resolver that resumes the pipeline after human approval
  const pendingValidationResolverRef = useRef<
    ((editedTranscription: string) => void) | null
  >(null);

  const setRequireValidation = useCallback((enabled: boolean) => {
    setRequireValidationState(enabled);
    safeLocalStorage.setItem("require_validation", String(enabled));
  }, []);

  // Load context settings and VAD config from localStorage on mount
  useEffect(() => {
    const savedContext = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT
    );
    if (savedContext) {
      try {
        const parsed = JSON.parse(savedContext);
        setUseSystemPrompt(parsed.useSystemPrompt ?? true);
        setContextContent(parsed.contextContent ?? "");
      } catch (error) {
        console.error("Failed to load system audio context:", error);
      }
    }

    // Load VAD config
    const savedVadConfig = safeLocalStorage.getItem("vad_config");
    if (savedVadConfig) {
      try {
        const parsed = JSON.parse(savedVadConfig);
        setVadConfig(parsed);
      } catch (error) {
        console.error("Failed to load VAD config:", error);
      }
    }
  }, []);

  // Auto-start capture on mount only if meeting mode was active (e.g. app restarted during a meeting)
  useEffect(() => {
    if (meetingModeActive) {
      invoke<boolean>("check_system_audio_access")
        .then((hasAccess) => { if (hasAccess) startCapture(); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Load quick actions from localStorage on mount
  useEffect(() => {
    const savedActions = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS
    );
    if (savedActions) {
      try {
        const parsed = JSON.parse(savedActions);
        setQuickActions(parsed);
      } catch (error) {
        console.error("Failed to load quick actions:", error);
        setQuickActions(DEFAULT_QUICK_ACTIONS);
      }
    } else {
      setQuickActions(DEFAULT_QUICK_ACTIONS);
    }
  }, []);

  // Handle continuous recording progress events AND error events
  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let startUnlisten: (() => void) | undefined;
    let stopUnlisten: (() => void) | undefined;
    let errorUnlisten: (() => void) | undefined;
    let discardedUnlisten: (() => void) | undefined;

    const setupContinuousListeners = async () => {
      try {
        // Progress updates (every second)
        progressUnlisten = await listen("recording-progress", (event) => {
          const seconds = event.payload as number;
          setRecordingProgress(seconds);
        });

        // Recording started
        startUnlisten = await listen("continuous-recording-start", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(true);
        });

        // Recording stopped
        stopUnlisten = await listen("continuous-recording-stopped", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(false);
        });

        // Audio encoding errors
        errorUnlisten = await listen("audio-encoding-error", (event) => {
          const errorMsg = event.payload as string;
          console.error("Audio encoding error:", errorMsg);
          setError(`Failed to process audio: ${errorMsg}`);
          setIsProcessing(false);
          setIsAIProcessing(false);
          setIsRecordingInContinuousMode(false);
        });

        // Speech discarded (too short)
        discardedUnlisten = await listen("speech-discarded", (event) => {
          const reason = event.payload as string;
          console.log("Speech discarded:", reason);
          setSpeechInProgressMs(null);
          // Don't show error - this is expected behavior
        });

        // Live listening progress
        await listen("speech-in-progress", (event) => {
          const ms = event.payload as number;
          if (ms === 0xffffffff) {
            // sentinel: speech segment done / discarded
            setSpeechInProgressMs(null);
          } else {
            setSpeechInProgressMs(ms);
          }
        });
      } catch (err) {
        console.error("Failed to setup continuous recording listeners:", err);
      }
    };

    setupContinuousListeners();

    return () => {
      if (progressUnlisten) progressUnlisten();
      if (startUnlisten) startUnlisten();
      if (stopUnlisten) stopUnlisten();
      if (errorUnlisten) errorUnlisten();
      if (discardedUnlisten) discardedUnlisten();
    };
  }, []);

  // Streaming transcription: background STT on each "speech-chunk" event
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        unlisten = await listen("speech-chunk", async (event) => {
          const base64Audio = event.payload as string;

          // Convert base64 WAV to Blob
          try {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });

            // Fire-and-forget: don't await, don't block the main pipeline
            (async () => {
              try {
                const useLamuAPI = await shouldUseLamuAPI();
                const providerConfig = allSttProviders.find(
                  (p) => p.id === selectedSttProvider.provider
                );
                if (!providerConfig && !useLamuAPI) return;

                const text = await fetchSTT({
                  provider: providerConfig,
                  selectedProvider: selectedSttProvider,
                  audio: audioBlob,
                  language: sttLanguageRef.current !== "auto" ? sttLanguageRef.current : undefined,
                });

                if (text.trim()) {
                  setInterimTranscription(text.trim());
                }
              } catch {
                // interim transcription is best-effort — silently ignore errors
              }
            })();
          } catch {
            // ignore decode errors
          }
        });
      } catch (err) {
        console.error("Failed to setup speech-chunk listener:", err);
      }
    };

    setup();
    return () => { if (unlisten) unlisten(); };
  }, [selectedSttProvider, allSttProviders]);

  // Handle single speech detection event (both VAD and continuous modes)
  useEffect(() => {
    let speechUnlisten: (() => void) | undefined;

    const setupEventListener = async () => {
      try {
        speechUnlisten = await listen("speech-detected", async (event) => {
          try {
            if (!capturing) return; // system audio only

            const base64Audio = event.payload as string;
            // Convert to blob
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });

            if (isBlocked) {
              setError("Your free trial has expired. Get a license to continue.");
              return;
            }

            const useLamuAPI = await shouldUseLamuAPI();
            if (!selectedSttProvider.provider && !useLamuAPI) {
              setError("No speech provider selected.");
              return;
            }

            const providerConfig = allSttProviders.find(
              (p) => p.id === selectedSttProvider.provider
            );

            if (!providerConfig && !useLamuAPI) {
              setError("Speech provider config not found.");
              return;
            }

            setIsProcessing(true);
            setSpeechInProgressMs(null);
            setInterimTranscription("");

            // Add timeout wrapper for STT request (30 seconds)
            const sttPromise = fetchSTT({
              provider: providerConfig,
              selectedProvider: selectedSttProvider,
              audio: audioBlob,
              language: sttLanguageRef.current !== "auto" ? sttLanguageRef.current : undefined,
            });

            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(
                () => reject(new Error(`Speech transcription timed out (${STT_TIMEOUT_MS / 1000}s)`)),
                STT_TIMEOUT_MS
              );
            });

            try {
              const transcription = await Promise.race([
                sttPromise,
                timeoutPromise,
              ]);

              if (transcription.trim()) {
                setLastTranscription(transcription);
                setError("");

                // ── State Runtime: start run, record STT step ─────────────
                const runId = runtime.startRun();
                activeRunIdRef.current = runId;
                runtime.startStep(runId, "stt");
                runtime.completeStep(runId, "stt", { transcription });

                // Build system prompt: mode preset > user system prompt > context
                const modeConfig = ASSISTANT_MODES.find(
                  (m) => m.id === assistantMode
                );
                const effectiveSystemPrompt = useSystemPrompt
                  ? modeConfig?.systemPrompt || systemPrompt || DEFAULT_SYSTEM_PROMPT
                  : contextContent || DEFAULT_SYSTEM_PROMPT;

                const previousMessages = conversation.messages.map((msg) => {
                  return { role: msg.role, content: msg.content };
                });

                // Context fusion: manual screenshot takes priority, then auto
                const screenshotForAI =
                  manualScreenshotRef.current ||
                  autoScreenshotRef.current;
                manualScreenshotRef.current = null; // consume manual screenshot
                autoScreenshotRef.current = null;

                // Auto-capture a fresh screenshot in meeting mode OR coding mode
                if ((meetingModeRef.current || assistantMode === "coding") && !screenshotForAI) {
                  try {
                    const shot = await invoke<string>("capture_to_base64", {
                      displayIndex: 0,
                    });
                    autoScreenshotRef.current = shot;
                  } catch {
                    // screenshot is best-effort
                  }
                }

                const finalScreenshot =
                  screenshotForAI || autoScreenshotRef.current || undefined;

                // ── Human-in-the-Loop: intercept if validation required ────
                if (requireValidation) {
                  runtime.awaitValidation(runId, {
                    transcription,
                    systemPrompt: effectiveSystemPrompt,
                    previousMessages,
                    imageBase64: finalScreenshot,
                  });

                  const artifact: ValidationArtifact = {
                    id: `va_${Date.now()}`,
                    type: "ai_request",
                    runId,
                    createdAt: Date.now(),
                    data: {
                      transcription,
                      systemPrompt: effectiveSystemPrompt,
                      previousMessages,
                      imageBase64: finalScreenshot,
                    },
                  };

                  pendingValidationResolverRef.current = (
                    editedTranscription: string
                  ) => {
                    runtime.resumeFromValidation(runId);
                    processWithAI(
                      editedTranscription,
                      effectiveSystemPrompt,
                      previousMessages,
                      finalScreenshot
                    );
                    autoScreenshotRef.current = null;
                  };

                  setPendingValidation(artifact);
                  // Stop here — pipeline resumes when human approves
                } else {
                  // No validation required — proceed immediately
                  await processWithAI(
                    transcription,
                    effectiveSystemPrompt,
                    previousMessages,
                    finalScreenshot
                  );
                  autoScreenshotRef.current = null;
                }
              } else {
                setError("Received empty transcription");
              }
            } catch (sttError: any) {
              console.error("STT Error:", sttError);
              setError(sttError.message || "Failed to transcribe audio");
              setIsPopoverOpen(true);
            }
          } catch (err) {
            setError("Failed to process speech");
          } finally {
            setIsProcessing(false);
          }
        });
      } catch (err) {
        setError("Failed to setup speech listener");
      }
    };

    setupEventListener();

    return () => {
      if (speechUnlisten) speechUnlisten();
    };
  }, [
    capturing,
    selectedSttProvider,
    allSttProviders,
    conversation.messages.length,
  ]);

  // ── Mic speech: transcribe-only for meeting transcript ("me" role) ────────
  useEffect(() => {
    let micUnlisten: (() => void) | undefined;

    const setupMicListener = async () => {
      micUnlisten = await listen("mic-speech-detected", async (event) => {
        if (!micCapturing) return;

        const base64Audio = event.payload as string;
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const audioBlob = new Blob([bytes], { type: "audio/wav" });

        try {
          const useLamuAPI = await shouldUseLamuAPI();
          const providerConfig = allSttProviders.find((p) => p.id === selectedSttProvider.provider);
          if (!providerConfig && !useLamuAPI) return;

          const transcription = await fetchSTT({
            provider: providerConfig,
            selectedProvider: selectedSttProvider,
            audio: audioBlob,
            language: sttLanguageRef.current !== "auto" ? sttLanguageRef.current : undefined,
          });

          if (!transcription.trim()) return;

          // If in meeting mode → add to transcript as "me" (no AI call)
          if (meetingModeRef.current) {
            const timeLabel = new Date().toLocaleTimeString("fr-FR", {
              hour: "2-digit", minute: "2-digit",
            });
            setMeetingTranscript((prev) => [
              ...prev,
              { role: "me" as const, text: transcription.trim(), time: timeLabel },
            ]);
          } else {
            // Outside meeting mode → normal pipeline (set as last transcription for AI)
            setLastTranscription(transcription);
          }
        } catch {
          // best-effort
        }
      });
    };

    setupMicListener();
    return () => { if (micUnlisten) micUnlisten(); };
  }, [micCapturing, selectedSttProvider, allSttProviders]);

  // Context management functions
  const saveContextSettings = useCallback(
    (usePrompt: boolean, content: string) => {
      try {
        const contextSettings = {
          useSystemPrompt: usePrompt,
          contextContent: content,
        };
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT,
          JSON.stringify(contextSettings)
        );
      } catch (error) {
        console.error("Failed to save context settings:", error);
      }
    },
    []
  );

  const updateUseSystemPrompt = useCallback(
    (value: boolean) => {
      setUseSystemPrompt(value);
      saveContextSettings(value, contextContent);
    },
    [contextContent, saveContextSettings]
  );

  const updateContextContent = useCallback(
    (content: string) => {
      setContextContent(content);
      saveContextSettings(useSystemPrompt, content);
    },
    [useSystemPrompt, saveContextSettings]
  );

  // Quick actions management
  const saveQuickActions = useCallback((actions: string[]) => {
    try {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS,
        JSON.stringify(actions)
      );
    } catch (error) {
      console.error("Failed to save quick actions:", error);
    }
  }, []);

  const addQuickAction = useCallback(
    (action: string) => {
      if (action && !quickActions.includes(action)) {
        const newActions = [...quickActions, action];
        setQuickActions(newActions);
        saveQuickActions(newActions);
      }
    },
    [quickActions, saveQuickActions]
  );

  const removeQuickAction = useCallback(
    (action: string) => {
      const newActions = quickActions.filter((a) => a !== action);
      setQuickActions(newActions);
      saveQuickActions(newActions);
    },
    [quickActions, saveQuickActions]
  );

  const handleQuickActionClick = async (action: string) => {
    setError("");

    // "Solve from screenshot" — auto-capture screen before sending
    if (action === "Solve from screenshot" && assistantMode === "coding") {
      try {
        const shot = await invoke<string>("capture_to_base64", { displayIndex: 0 });
        manualScreenshotRef.current = shot;
      } catch { /* best-effort */ }
    }

    const effectiveSystemPrompt = useSystemPrompt
      ? systemPrompt || DEFAULT_SYSTEM_PROMPT
      : contextContent || DEFAULT_SYSTEM_PROMPT;

    // Include the most recent transcription in conversation history if it exists
    let updatedMessages = [...conversation.messages];

    if (lastTranscription && lastTranscription.trim()) {
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      // Only add if it's not already the last message
      if (!lastMessage || lastMessage.content !== lastTranscription) {
        const timestamp = Date.now();
        const userMessage = {
          id: generateMessageId("user", timestamp),
          role: "user" as const,
          content: lastTranscription,
          timestamp,
        };
        updatedMessages.push(userMessage);

        // Update conversation state with the latest transcription
        setConversation((prev) => ({
          ...prev,
          messages: [userMessage, ...prev.messages],
          updatedAt: timestamp,
          title: prev.title || generateConversationTitle(lastTranscription),
        }));
      }
    }

    const previousMessages = updatedMessages
      .slice(-20)
      .map((msg) => ({ role: msg.role, content: msg.content }));

    await processWithAI(action, effectiveSystemPrompt, previousMessages);
  };

  // Start continuous recording manually
  const startContinuousRecording = useCallback(async () => {
    try {
      setRecordingProgress(0);
      setError("");

      // Stop any existing capture first to avoid "Capture already running"
      try { await invoke("stop_system_audio_capture"); } catch {}

      const deviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start a new continuous recording session
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        deviceId: deviceId,
      });
    } catch (err) {
      console.error("Failed to start continuous recording:", err);
      setError(`Failed to start recording: ${err}`);
    }
  }, [vadConfig, selectedAudioDevices.output.id]);

  // Ignore current recording (stop without transcription)
  const ignoreContinuousRecording = useCallback(async () => {
    try {
      if (!isContinuousMode || !isRecordingInContinuousMode) return;

      // Stop the capture without processing
      await invoke<string>("stop_system_audio_capture");

      // Reset states
      setRecordingProgress(0);
      setIsProcessing(false);
      setIsRecordingInContinuousMode(false);
    } catch (err) {
      console.error("Failed to ignore recording:", err);
      setError(`Failed to ignore recording: ${err}`);
    }
  }, [isContinuousMode, isRecordingInContinuousMode]);

  // AI Processing function
  const processWithAI = useCallback(
    async (
      transcription: string,
      prompt: string,
      previousMessages: Message[],
      imageBase64?: string
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      // Grab the active run ID at call time (may be null for quick-action calls)
      const runId = activeRunIdRef.current;

      try {
        setIsAIProcessing(true);
        setLastAIResponse("");
        setError("");
        setDbQueryResults([]);
        setPendingSqlWrite(null);

        let fullResponse = "";

        if (isBlocked) {
          setError("Your free trial has expired. Get a license to continue.");
          setIsAIProcessing(false);
          return;
        }

        const useLamuAPI = await shouldUseLamuAPI();
        if (!selectedAIProvider.provider && !useLamuAPI) {
          setError("No AI provider selected.");
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !useLamuAPI) {
          setError("AI provider config not found.");
          return;
        }

        // ── State Runtime: start prompt_build step ───────────────────────
        if (runId) runtime.startStep(runId, "prompt_build");

        // Inject email action instructions if email feature is enabled
        invoke("debug_log", { message: `emailEnabled=${emailEnabled} transcription="${transcription}"` }).catch(() => {});
        const looksLikeEmailRequest = /\b(email|e-mail|mail|envoie|envoyer|send|message\s+à|write\s+to)\b/i.test(transcription);
        let effectivePrompt = emailEnabled
          ? `${prompt}\n\n${EMAIL_ACTION_INSTRUCTIONS}`
          : looksLikeEmailRequest
            ? `${prompt}\n\n${EMAIL_DISABLED_HINT}`
            : prompt;

        // Inject file search instructions when the query looks like a file search
        const looksLikeFileSearch = /\b(trouve|trouver|cherche|chercher|localise|localiser|où est|ou est|où se trouve|ou se trouve|find|locate|search|where is|look for|fichier|file|document|dossier|folder|répertoire|repertoire|contrat|rapport|facture|devis|lettre|CV|bureau|desktop|serveur)\b/i.test(transcription);
        if (looksLikeFileSearch) {
          effectivePrompt += `\n\n${FILESEARCH_INSTRUCTIONS}`;
        }

        // Inject action instructions if any integration is connected
        try {
          const integrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
          const actionableIntegrations = integrations.filter((i) =>
            ["gitlab", "github", "jira", "confluence", "notion", "salesforce", "shopify", "postgres", "mysql"].includes(i.provider)
          );
          if (actionableIntegrations.length > 0) {
            const integList = actionableIntegrations
              .map((i) => `- ${i.name} (provider: ${i.provider}, id: ${i.id})`)
              .join("\n");
            effectivePrompt += `\n\n${ACTION_INSTRUCTIONS}\n\nAvailable integrations:\n${integList}`;
          }
        } catch { /* best-effort */ }
        // Reassign for the rest of the function (shadows param)
        const prompt_ = effectivePrompt;

        // Cap history to last 20 messages to avoid token limits
        const cappedMessages = previousMessages.slice(-20);

        // Build transcript context — last 10 exchanges for memory
        const transcriptContext = meetingTranscript
          .slice(-10)
          .map((e) => {
            const label = e.role === "me" ? "Me" : e.role === "them" ? "Them" : "Assistant";
            return `[${label}]: ${e.text}`;
          })
          .join("\n");
        const promptWithTranscript = transcriptContext
          ? `${prompt_}\n\n--- Meeting context so far ---\n${transcriptContext}\n---`
          : prompt_;

        // Append clipboard context if available, then consume it
        const clipboardSnippet = clipboardContext;
        if (clipboardSnippet) setClipboardContext(null);
        const promptWithClipboard = clipboardSnippet
          ? `${promptWithTranscript}\n\n--- Clipboard content (for reference) ---\n${clipboardSnippet}\n---`
          : promptWithTranscript;

        // Inject playbook context if loaded
        const promptWithPlaybook = playbookContext
          ? `${promptWithClipboard}\n\n--- Session playbook / reference document ---\n${playbookContext}\n---`
          : promptWithClipboard;

        // Inject knowledge base context if enabled
        let promptWithContext = promptWithPlaybook;
        if (kbEnabledRef.current) {
          try {
            const kbResults = await invoke<Array<{
              document_name: string;
              content: string;
              similarity: number;
            }>>("kb_search", { query: transcription, topK: 5 });

            const relevant = kbResults.filter((r) => r.similarity > 0.3);
            if (relevant.length > 0) {
              const kbContext = relevant
                .map(
                  (r, i) =>
                    `[${i + 1}] From "${r.document_name}":\n${r.content}`
                )
                .join("\n\n");
              promptWithContext = `${promptWithClipboard}\n\n--- Relevant knowledge base excerpts ---\n${kbContext}\n---`;
            }
          } catch {
            // KB search is best-effort — silently ignore errors
          }
        }

        // Inject live data from integrations if query seems integration-related
        const integrationKeywords = /issue|ticket|bug|task|pr|merge request|mr|commit|repo|project|sprint|jira|gitlab|github|notion|confluence|salesforce|shopify|feature|story|postgres|postgresql|mysql|database|sql|base de donn|requ[eê]te|table|query|schéma|schema|\bdb\b|base de|données|ma base|mon database|ma database/i;
        try {
          const integrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
          const actionable = integrations.filter((i) =>
            ["gitlab", "github", "jira", "confluence", "notion", "salesforce", "shopify", "postgres", "mysql"].includes(i.provider)
          );
          if (actionable.length > 0) {
            // Always tell the AI which integrations are connected
            const integList = actionable.map((i) => `- ${i.name} (${i.provider})`).join("\n");
            promptWithContext += `\n\n--- Intégrations connectées ---\n${integList}\n---`;

            // Fetch live data if the query seems integration-related
            if (integrationKeywords.test(transcription)) {
              const liveContextParts: string[] = [];
              const dbIntegrations = actionable.filter((i) => ["postgres", "mysql"].includes(i.provider));

              // Fetch DB schemas for database integrations
              await Promise.all(
                dbIntegrations.slice(0, 3).map(async (integ) => {
                  try {
                    const schema = await invoke<string>("kb_database_get_schema", {
                      integrationId: integ.id,
                    });
                    if (schema && schema.trim()) {
                      liveContextParts.push(`--- Schéma base de données "${integ.name}" (${integ.provider}) ---\n${schema}`);
                    }
                  } catch (e) {
                    invoke("debug_log", { msg: `[kb_database_get_schema] ${integ.name}: ${e}` }).catch(() => {});
                  }
                })
              );

              // Fetch live data from all integrations
              await Promise.all(
                actionable.slice(0, 3).map(async (integ) => {
                  try {
                    const liveData = await invoke<string>("kb_integration_live_query", {
                      integrationId: integ.id,
                      queryHint: transcription,
                    });
                    if (liveData && liveData.trim()) liveContextParts.push(liveData);
                  } catch (e) {
                    invoke("debug_log", { msg: `[kb_integration_live_query] ${integ.name} (${integ.provider}): ${e}` }).catch(() => {});
                  }
                })
              );
              if (liveContextParts.length > 0) {
                promptWithContext += `\n\n--- Données en temps réel ---\n${liveContextParts.join("\n\n")}\n---`;
              }

              // Add SQL generation instructions for DB integrations
              if (dbIntegrations.length > 0) {
                const dbDetails = dbIntegrations.map((i) => `"${i.name}" (${i.provider})`).join(", ");
                const isMySQL = dbIntegrations.some((i) => i.provider === "mysql");
                const isPG = dbIntegrations.some((i) => i.provider === "postgres");
                let sqlHints = `\n\n[INSTRUCTIONS BASE DE DONNÉES — OBLIGATOIRE]`;
                sqlHints += `\nTu as un accès DIRECT aux bases de données suivantes : ${dbDetails}.`;
                sqlHints += `\nLe schéma complet avec toutes les tables et colonnes est fourni ci-dessus. Tu CONNAIS la structure de la base.`;
                sqlHints += `\nTu peux exécuter des requêtes SQL — le système exécutera automatiquement toute requête dans un bloc \`\`\`sql\`\`\`.`;
                sqlHints += `\nRÈGLES :`;
                sqlHints += `\n1. Quand l'utilisateur demande des données, ANALYSE le schéma fourni pour identifier la bonne table (même si l'utilisateur utilise un terme différent du nom de la table — ex: "commandes" peut correspondre à "orders", "order_items", "sales", etc.). Puis génère la requête SQL dans un bloc \`\`\`sql\`\`\`.`;
                sqlHints += `\n2. Ne dis JAMAIS "je ne peux pas accéder à la base" ou "je ne peux pas afficher les données réelles" — tu PEUX via les blocs \`\`\`sql\`\`\`.`;
                sqlHints += `\n3. Utilise UNIQUEMENT les tables et colonnes du schéma fourni. N'invente rien.`;
                sqlHints += `\n4. Ne génère JAMAIS de requêtes sur information_schema. Tu as déjà le schéma complet.`;
                sqlHints += `\n5. Pour les rapports : génère directement les requêtes SQL avec agrégations (COUNT, SUM, AVG, GROUP BY). Tu peux générer plusieurs blocs \`\`\`sql\`\`\` dans une même réponse.`;
                sqlHints += `\n6. TRÈS IMPORTANT : N'invente JAMAIS de données fictives ou d'exemples. Génère UNIQUEMENT le(s) bloc(s) SQL et une brève explication de ce que la requête fait. Les résultats réels seront affichés automatiquement après exécution. Ne mets PAS de faux tableaux, faux chiffres ou données imaginaires dans ta réponse.`;
                if (isMySQL) sqlHints += `\n6. MySQL : utilise DATABASE() au lieu du nom de la base dans les clauses WHERE.`;
                if (isPG) sqlHints += `\n6. PostgreSQL : le schema par défaut est 'public'.`;
                promptWithContext += sqlHints;
              }
            }
          }
        } catch { /* best-effort */ }

        // Only pass image if the current model/provider supports vision
        const canSendImage = imageBase64 && supportsImages &&
          (useLamuAPI || provider?.curl.includes("{{IMAGE}}"));

        // ── State Runtime: complete prompt_build, start ai_call ──────────
        if (runId) {
          // Normalise messages to plain strings for the checkpoint
          const checkpointMessages = cappedMessages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          }));
          runtime.completeStep(runId, "prompt_build", {
            systemPrompt: promptWithContext,
            previousMessages: checkpointMessages,
            imageBase64: canSendImage ? imageBase64 : undefined,
          });
          runtime.startStep(runId, "ai_call");
        }

        try {
          for await (const chunk of fetchAIResponse({
            provider: useLamuAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: promptWithContext,
            history: cappedMessages,
            userMessage: transcription,
            imagesBase64: canSendImage ? [imageBase64!] : [],
          })) {
            fullResponse += chunk;
            setLastAIResponse((prev) => prev + chunk);
            // Checkpoint partial response periodically for resumability
            if (runId) runtime.checkpointPartialResponse(runId, fullResponse);
          }
          // ── State Runtime: ai_call done ──────────────────────────────
          if (runId) runtime.completeStep(runId, "ai_call", { partialResponse: fullResponse });
        } catch (aiError: any) {
          if (runId) runtime.failStep(runId, "ai_call", String(aiError));
          setError(aiError.message || "Failed to get AI response");
        }

        if (fullResponse) {
          // ── Detect email action from AI response ─────────────────────
          const hasLamu = fullResponse.includes("LAMU_EMAIL");
          invoke("debug_log", { message: `AI response length=${fullResponse.length} hasLAMU_EMAIL=${hasLamu} last100="${fullResponse.slice(-100).replace(/\n/g, "\\n")}"` }).catch(() => {});
          // Handles: LAMU_EMAIL:{...} or LAMU_EMAIL: {...} or inside a code block
          const emailJsonStr = extractJsonAfterMarker(fullResponse, "LAMU_EMAIL:");
          if (emailJsonStr) {
            try {
              const raw = JSON.parse(emailJsonStr) as {
                to?: string; subject?: string; body?: string;
              };
              // Resolve contact name to email
              const toQuery = raw.to || "";
              let toEmail = "";
              let toName = "";
              if (toQuery.includes("@")) {
                toEmail = toQuery;
              } else {
                try {
                  const contact = await invoke<{ full_name: string; email: string } | null>(
                    "contacts_resolve", { name: toQuery }
                  );
                  if (contact) { toEmail = contact.email; toName = contact.full_name; }
                } catch { /* contact resolution is best-effort */ }
              }

              // Toujours afficher le modal pour vérification avant envoi
              // (même en mode auto-send — évite les envois sur mauvaise transcription)
              setPendingEmailDraft({
                to_name: toName,
                to_email: toEmail,
                to_query: toQuery,
                subject: raw.subject || "",
                body: (raw.body || "").replace(/\\n/g, "\n"),
                autoSend: toEmail ? autoSendEmailRef.current : false,
              });
            } catch { /* malformed JSON — ignore */ }
          }

          // ── Detect LAMU_ACTION ────────────────────────────────────────
          const actionJsonStr = extractJsonAfterMarker(fullResponse, "LAMU_ACTION:");
          if (actionJsonStr) {
            try {
              const raw = JSON.parse(actionJsonStr);
              // Find integration name from connected integrations
              let integName = raw.integration ?? "";
              if (raw.integration_id) {
                try {
                  const integrations = await invoke<Array<{ id: string; name: string }>>("kb_list_integrations");
                  const found = integrations.find((i) => i.id === raw.integration_id);
                  if (found) integName = found.name;
                } catch { /* best-effort */ }
              }
              setPendingAction(raw);
              setPendingActionIntegrationName(integName);
            } catch { /* malformed JSON — ignore */ }
          }

          // ── Detect SQL blocks in AI response → auto-execute reads, queue writes ──
          const sqlBlocks = extractSqlBlocks(fullResponse);
          if (sqlBlocks.length > 0) {
            try {
              const integrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
              const dbIntegs = integrations.filter((i) => ["postgres", "mysql"].includes(i.provider));
              if (dbIntegs.length > 0) {
                const targetDb = dbIntegs[0];
                const reads = sqlBlocks.filter((s) => !isWriteSql(s));
                const writes = sqlBlocks.filter((s) => isWriteSql(s));

                // Auto-execute read queries
                if (reads.length > 0) {
                  const readResults = await Promise.all(
                    reads.map(async (sql): Promise<SqlQueryResult> => {
                      try {
                        const data = await invoke<string>("kb_database_query", {
                          integrationId: targetDb.id, sql, allowWrite: false,
                        });
                        return { sql, dbName: targetDb.name, integrationId: targetDb.id, data, type: "read", executed: true };
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e);
                        return { sql, dbName: targetDb.name, integrationId: targetDb.id, data: "", error: msg, type: "read", executed: false };
                      }
                    })
                  );
                  setDbQueryResults(readResults);
                }

                // Queue first write for approval
                if (writes.length > 0) {
                  setPendingSqlWrite({
                    sql: writes[0],
                    dbName: targetDb.name,
                    integrationId: targetDb.id,
                    writeQueue: writes.slice(1).map((sql) => ({ sql, dbName: targetDb.name, integrationId: targetDb.id })),
                  });
                }
              }
            } catch { /* best-effort — no integrations available */ }
          }

          // ── Detect LAMU_FILESEARCH and auto-execute ─────────────────
          const fileSearchJsonStr = extractJsonAfterMarker(fullResponse, "LAMU_FILESEARCH:");
          if (fileSearchJsonStr) {
            try {
              const fsReq = JSON.parse(fileSearchJsonStr) as { query?: string; path?: string };
              if (fsReq.query) {
                const fsResults = await invoke<Array<{
                  path: string; filename: string; extension: string;
                  size_bytes: number; modified_at: number; content_preview: string;
                }>>("fs_search_files", {
                  query: fsReq.query,
                  searchPath: fsReq.path || null,
                  limit: 15,
                });

                if (fsResults.length > 0) {
                  const resultText = fsResults.map((f, i) => {
                    const size = f.size_bytes < 1024 * 1024
                      ? `${(f.size_bytes / 1024).toFixed(0)} KB`
                      : `${(f.size_bytes / (1024 * 1024)).toFixed(1)} MB`;
                    const date = new Date(f.modified_at).toLocaleDateString("fr-FR", {
                      day: "2-digit", month: "short", year: "numeric",
                    });
                    return `${i + 1}. **${f.filename}** (${size}, modifié le ${date})\n   📁 \`${f.path}\`${f.content_preview ? `\n   Aperçu: ${f.content_preview.slice(0, 100)}...` : ""}`;
                  }).join("\n\n");
                  // Append results to the AI response so the user sees them
                  const searchAppend = `\n\n---\n**${fsResults.length} fichier(s) trouvé(s) sur l'ordinateur :**\n\n${resultText}`;
                  fullResponse += searchAppend;
                  setLastAIResponse((prev) => prev + searchAppend);
                } else {
                  const noResult = `\n\n---\n**Aucun fichier trouvé** pour "${fsReq.query}"${fsReq.path ? ` dans ${fsReq.path}` : ""}.`;
                  fullResponse += noResult;
                  setLastAIResponse((prev) => prev + noResult);
                }
              }
            } catch { /* malformed JSON or search error — ignore */ }
          }

          // ── State Runtime: start response_save step ──────────────────
          if (runId) runtime.startStep(runId, "response_save");
          // Auto-speak the response in meeting mode if enabled
          if (meetingModeRef.current && autoSpeakInMeeting) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(fullResponse));
          }

          const timestamp = Date.now();
          const timeLabel = new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          // Add to running meeting transcript
          setMeetingTranscript((prev) => [
            ...prev,
            { role: "them", text: transcription, time: timeLabel },
            { role: "ai", text: fullResponse, time: timeLabel },
          ]);

          setConversation((prev) => ({
            ...prev,
            messages: [
              {
                id: generateMessageId("user", timestamp),
                role: "user" as const,
                content: transcription,
                timestamp,
              },
              {
                id: generateMessageId("assistant", timestamp + 1),
                role: "assistant" as const,
                content: fullResponse,
                timestamp: timestamp + 1,
              },
              ...prev.messages,
            ],
            updatedAt: timestamp,
            title: prev.title || generateConversationTitle(transcription),
          }));

          // ── State Runtime: response saved ────────────────────────────
          if (runId) runtime.completeStep(runId, "response_save");
        }
      } catch (err) {
        if (runId) runtime.failRun(runId);
        setError("Failed to get AI response");
      } finally {
        setIsAIProcessing(false);

        // ── State Runtime: close run ─────────────────────────────────
        if (runId && activeRunIdRef.current === runId) {
          runtime.completeRun(runId);
          activeRunIdRef.current = null;
        }

        // Meeting mode: auto-restart VAD capture so it keeps listening
        if (meetingModeRef.current) {
          try {
            const deviceId =
              selectedAudioDevices.output.id !== "default"
                ? selectedAudioDevices.output.id
                : null;
            await invoke("start_system_audio_capture", {
              vadConfig: { enabled: true },
              deviceId,
            });
          } catch {
            // already running or permission lost — ignore
          }
        }
      }
    },
    [selectedAIProvider, allAiProviders, meetingTranscript, selectedAudioDevices.output.id, clipboardContext, playbookContext, autoSpeakInMeeting, runtime]
  );

  // ── Meeting mode controls ─────────────────────────────────────────────────────

  const setAssistantMode = useCallback((mode: AssistantMode) => {
    setAssistantModeState(mode);
    safeLocalStorage.setItem(STORAGE_KEYS.ASSISTANT_MODE, mode);
    // Update quick actions to match the mode
    const modeConfig = ASSISTANT_MODES.find((m) => m.id === mode);
    if (modeConfig) {
      setQuickActions(modeConfig.quickActions);
      safeLocalStorage.setItem(
        STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS,
        JSON.stringify(modeConfig.quickActions)
      );
    }
  }, []);

  const clearMeetingTranscript = useCallback(() => {
    setMeetingTranscript([]);
    autoScreenshotRef.current = null;
  }, []);

  // ── Meeting summary generation ────────────────────────────────────────────
  const generateMeetingSummary = useCallback(async (
    transcript: { role: "them" | "ai" | "me"; text: string; time: string }[]
  ) => {
    if (transcript.length === 0) return;

    const now = new Date();
    setMeetingSummaryDate(now);
    setMeetingSummaryText("");
    setMeetingSummaryGenerating(true);
    setMeetingSummarySaved(false);
    setMeetingSummaryOpen(true);

    const roleLabel = (role: "them" | "ai" | "me") => {
      if (role === "me") return "Moi";
      if (role === "them") return "Participant";
      return "Assistant IA";
    };
    const transcriptText = transcript
      .map((e) => `[${e.time}] ${roleLabel(e.role)}: ${e.text}`)
      .join("\n");

    const prompt = `Tu es un assistant expert en prise de notes. Voici la transcription complète d'un meeting. Génère un résumé structuré en français avec :
- **Points clés discutés**
- **Décisions prises**
- **Actions à faire** (avec responsables si mentionnés)
- **Points ouverts / à suivre**

Transcription :
${transcriptText}`;

    let summary = "";
    try {
      const useLamuAPI = await shouldUseLamuAPI();
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      for await (const chunk of fetchAIResponse({
        provider: useLamuAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "Tu es un assistant de synthèse de réunions. Réponds toujours en français.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) {
        summary += chunk;
        setMeetingSummaryText(summary);
      }
    } catch (e) {
      summary = "Erreur lors de la génération du résumé.";
      setMeetingSummaryText(summary);
    } finally {
      setMeetingSummaryGenerating(false);
    }

    // Auto-save to KB
    if (summary && summary !== "Erreur lors de la génération du résumé.") {
      try {
        const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
        const filename = `Meeting_${dateStr}.md`;
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(summary));
        await invoke("kb_ingest_file", { name: filename, fileBytes: bytes });
        setMeetingSummarySaved(true);
      } catch (e) {
        console.error("Failed to save meeting summary to KB:", e);
      }
    }
  }, [allAiProviders, selectedAIProvider]);

  // ── Follow-up email generation from meeting summary ───────────────────────
  const generateFollowUpEmail = useCallback(async (summaryText: string) => {
    if (!summaryText) return;

    const prompt = `Voici le résumé d'un meeting. Génère un email de suivi professionnel en français.
Retourne UNIQUEMENT un objet JSON valide avec exactement ces champs (pas de texte autour) :
{"subject":"<sujet court>","body":"<corps complet de l'email>"}

Le corps doit inclure : remerciements, rappel des points clés, actions à suivre, formule de politesse.
Utilise \\n pour les sauts de ligne.

Résumé du meeting :
${summaryText}`;

    try {
      const useLamuAPI = await shouldUseLamuAPI();
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      let raw = "";
      for await (const chunk of fetchAIResponse({
        provider: useLamuAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "Tu es un assistant qui génère des emails de suivi professionnels. Réponds uniquement en JSON valide.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) {
        raw += chunk;
      }

      // Parse JSON (handle markdown code block wrapping)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.subject || !parsed.body) return;

      setPendingEmailDraft({
        to_name: "",
        to_email: "",
        to_query: "",
        subject: parsed.subject,
        body: parsed.body.replace(/\\n/g, "\n"),
        autoSend: false,
      });
    } catch (e) {
      console.error("Failed to generate follow-up email:", e);
    }
  }, [allAiProviders, selectedAIProvider, setPendingEmailDraft]);

  // ── Real-time coaching tip ────────────────────────────────────────────────
  const generateCoachingTip = useCallback(async (
    transcript: { role: "them" | "ai" | "me"; text: string; time: string }[]
  ) => {
    if (transcript.length === 0) return;
    setCoachingGenerating(true);
    setCoachingVisible(true);

    // Use last 10 transcript entries for context
    const recent = transcript.slice(-10);
    const roleLabel = (role: "them" | "ai" | "me") =>
      role === "me" ? "Moi" : role === "them" ? "Participant" : "Assistant IA";
    const transcriptText = recent
      .map((e) => `[${e.time}] ${roleLabel(e.role)}: ${e.text}`)
      .join("\n");

    const prompt = `Voici un extrait de conversation en réunion. Donne un seul conseil de communication court (1-2 phrases max) pour améliorer la dynamique, la clarté ou l'engagement. Sois direct et actionnable. Pas de formule d'introduction.

Conversation récente :
${transcriptText}`;

    try {
      const useLamuAPI = await shouldUseLamuAPI();
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      let tip = "";
      for await (const chunk of fetchAIResponse({
        provider: useLamuAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "Tu es un coach de communication expert. Donne des conseils courts, pratiques et bienveillants.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) {
        tip += chunk;
        setCoachingTip(tip);
      }
    } catch (e) {
      setCoachingTip("Impossible de générer un conseil pour le moment.");
    } finally {
      setCoachingGenerating(false);
    }
  }, [allAiProviders, selectedAIProvider]);

  // ── Human-in-the-Loop: approve or reject a pending validation ────────────

  const approveValidation = useCallback(
    (editedTranscription: string) => {
      if (pendingValidationResolverRef.current) {
        pendingValidationResolverRef.current(editedTranscription);
        pendingValidationResolverRef.current = null;
      }
      setPendingValidation(null);
    },
    []
  );

  const rejectValidation = useCallback(() => {
    if (activeRunIdRef.current) {
      runtime.failRun(activeRunIdRef.current);
      activeRunIdRef.current = null;
    }
    pendingValidationResolverRef.current = null;
    setPendingValidation(null);
    setIsProcessing(false);
  }, [runtime]);

  // ── State Runtime: resume an interrupted run ─────────────────────────────

  const resumeInterruptedRun = useCallback(
    (runId: string) => {
      const checkpoint = runtime.resumeRun(runId);
      if (!checkpoint?.transcription) {
        runtime.discardRun(runId);
        return;
      }
      activeRunIdRef.current = runId;

      const {
        transcription,
        systemPrompt: savedPrompt,
        previousMessages = [],
        imageBase64,
      } = checkpoint;

      processWithAI(
        transcription,
        savedPrompt || DEFAULT_SYSTEM_PROMPT,
        (previousMessages as unknown) as Message[],
        imageBase64
      );
    },
    [runtime, processWithAI]
  );

  const pasteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setClipboardContext(text.trim());
    } catch {
      console.warn("Clipboard read failed — user may need to grant permission");
    }
  }, []);

  const clearClipboardContext = useCallback(() => {
    setClipboardContext(null);
  }, []);

  const startMicCapture = useCallback(async () => {
    try {
      const hasAccess = await invoke<boolean>("check_mic_access");
      if (!hasAccess) {
        setError("Microphone access denied. Please grant microphone permission.");
        return;
      }
      setError("");
      await invoke("start_mic_capture", { vadConfig: vadConfig });
      setMicCapturing(true);
      setIsPopoverOpen(true);
    } catch (err) {
      setError(`Failed to start mic: ${err}`);
    }
  }, [vadConfig]);

  const stopMicCapture = useCallback(async () => {
    try {
      await invoke("stop_mic_capture");
    } catch {
      // ignore
    }
    setMicCapturing(false);
    setSpeechInProgressMs(null);
  }, []);

  const toggleAutoMeeting = useCallback((enabled: boolean) => {
    setAutoMeetingEnabled(enabled);
    safeLocalStorage.setItem("auto_meeting_mode", String(enabled));
  }, []);

  // Poll for meeting apps every 15s and auto-enable meeting mode when detected
  // baselineAppsRef: apps already running at launch — don't trigger for those
  const baselineAppsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const apps = await invoke<string[]>("detect_meeting_apps");
        setDetectedApps(apps);

        // First poll: record baseline (apps already open at launch), don't trigger
        if (baselineAppsRef.current === null) {
          baselineAppsRef.current = apps;
          return;
        }

        // Only trigger if a NEW app appeared that wasn't there at launch
        const newApps = apps.filter(a => !baselineAppsRef.current!.includes(a));

        if (
          newApps.length > 0 &&
          autoMeetingEnabled &&
          !meetingModeRef.current &&
          !capturing
        ) {
          // A new meeting app just appeared — auto-enable meeting mode
          meetingModeRef.current = true;
          setMeetingModeActiveState(true);
          safeLocalStorage.setItem(STORAGE_KEYS.MEETING_MODE_ACTIVE, "true");
          invoke<boolean>("check_system_audio_access")
            .then((ok) => { if (ok) startCapture(); })
            .catch(() => {});
        }
      } catch {
        // ignore — detection is best-effort
      }
    };

    poll(); // run immediately (sets baseline)
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMeetingEnabled, capturing]);

  const startCapture = useCallback(async () => {
    try {
      setError("");

      if (isBlocked) {
        setError("Your free trial has expired. Get a license to continue using the overlay.");
        return;
      }

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (!hasAccess) {
        setSetupRequired(true);
        setIsPopoverOpen(true);
        return;
      }

      const isContinuous = !vadConfig.enabled;

      // Set up conversation
      const conversationId = generateConversationId("sysaudio");
      setConversation({
        id: conversationId,
        title: "",
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });

      setCapturing(true);
      setIsPopoverOpen(true);
      setIsContinuousMode(isContinuous);
      setRecordingProgress(0);

      // If continuous mode — stop any lingering Rust task so Start Recording works cleanly
      if (isContinuous) {
        try { await invoke("stop_system_audio_capture"); } catch {}
        setIsRecordingInContinuousMode(false);
        return;
      }

      // VAD mode: Start recording immediately
      // Stop any existing capture
      await invoke<string>("stop_system_audio_capture");

      const deviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start capture with VAD config
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        deviceId: deviceId,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsPopoverOpen(true);
    }
  }, [vadConfig, selectedAudioDevices.output.id, isBlocked]);

  const stopCapture = useCallback(async () => {
    try {
      // If meeting mode was keeping it alive, turn it off too
      if (meetingModeRef.current) {
        meetingModeRef.current = false;
        setMeetingModeActiveState(false);
        safeLocalStorage.setItem(STORAGE_KEYS.MEETING_MODE_ACTIVE, "false");
      }

      // Abort any ongoing AI requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Stop the audio capture
      await invoke<string>("stop_system_audio_capture");

      // Reset ALL states
      setCapturing(false);
      setIsProcessing(false);
      setIsAIProcessing(false);
      setIsContinuousMode(false);
      setIsRecordingInContinuousMode(false);
      setRecordingProgress(0);
      setSpeechInProgressMs(null);
      setLastTranscription("");
      setLastAIResponse("");
      setError("");
      setIsPopoverOpen(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop capture: ${errorMessage}`);
      console.error("Stop capture error:", err);
    }
  }, []);

  const toggleMeetingMode = useCallback(async () => {
    const next = !meetingModeRef.current;
    meetingModeRef.current = next;
    setMeetingModeActiveState(next);
    safeLocalStorage.setItem(STORAGE_KEYS.MEETING_MODE_ACTIVE, String(next));

    if (next) {
      try {
        const hasAccess = await invoke<boolean>("check_system_audio_access");
        if (hasAccess) await startCapture();
        else setSetupRequired(true);
      } catch {}
    } else {
      const transcriptSnapshot = [...meetingTranscript];
      await stopCapture();
      clearMeetingTranscript();
      if (transcriptSnapshot.length > 0) {
        generateMeetingSummary(transcriptSnapshot);
      }
    }
  }, [startCapture, stopCapture, clearMeetingTranscript, meetingTranscript, generateMeetingSummary]);

  // Manual stop for continuous recording
  const manualStopAndSend = useCallback(async () => {
    try {
      if (!isContinuousMode) {
        console.warn("Not in continuous mode");
        return;
      }

      // Show processing state immediately
      setIsProcessing(true);

      // Trigger manual stop event
      await invoke("manual_stop_continuous");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to manually stop: ${errorMessage}`);
      setIsProcessing(false); // Clear processing state on error
      console.error("Manual stop error:", err);
    }
  }, [isContinuousMode]);

  const handleSetup = useCallback(async () => {
    try {
      const platform = navigator.platform.toLowerCase();

      if (platform.includes("mac") || platform.includes("win")) {
        await invoke("request_system_audio_access");
      }

      // Delay to give the user time to grant permissions in the system dialog.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (hasAccess) {
        setSetupRequired(false);
        await startCapture();
      } else {
        setSetupRequired(true);
        setError("Permission not granted. Please try the manual steps.");
      }
    } catch (err) {
      setError("Failed to request access. Please try the manual steps below.");
      setSetupRequired(true);
    }
  }, [startCapture]);

  useEffect(() => {
    const shouldOpenPopover =
      capturing ||
      setupRequired ||
      isAIProcessing ||
      !!lastAIResponse ||
      !!error;
    setIsPopoverOpen(shouldOpenPopover);
    resizeWindow(shouldOpenPopover);
  }, [
    capturing,
    setupRequired,
    isAIProcessing,
    lastAIResponse,
    error,
    resizeWindow,
  ]);

  useEffect(() => {
    globalShortcuts.registerSystemAudioCallback(async () => {
      if (capturing) {
        await stopCapture();
      } else {
        await startCapture();
      }
    });
  }, [startCapture, stopCapture]);

  // Listen for global mic toggle shortcut emitted by Rust
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("toggle-mic-capture", async () => {
      if (micCapturing) {
        await stopMicCapture();
      } else {
        await startMicCapture();
      }
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [micCapturing, startMicCapture, stopMicCapture]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      invoke("stop_system_audio_capture").catch(() => {});
    };
  }, []);

  // Debounced save to prevent race conditions and improve performance
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only debounce if there are messages to save
    if (
      !conversation.id ||
      conversation.updatedAt === 0 ||
      conversation.messages.length === 0
    ) {
      return;
    }

    // Debounce saves (only save 500ms after last change)
    saveTimeoutRef.current = setTimeout(async () => {
      // Don't save if already saving (prevent concurrent saves)
      if (isSavingRef.current) {
        return;
      }

      try {
        isSavingRef.current = true;
        await saveConversation(conversation);
      } catch (error) {
        console.error("Failed to save system audio conversation:", error);
      } finally {
        isSavingRef.current = false;
      }
    }, CONVERSATION_SAVE_DEBOUNCE_MS);

    // Cleanup on unmount or dependency change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    conversation.messages.length,
    conversation.title,
    conversation.id,
    conversation.updatedAt,
  ]);

  const startNewConversation = useCallback(() => {
    setConversation({
      id: generateConversationId("sysaudio"),
      title: "",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    setLastTranscription("");
    setLastAIResponse("");
    setError("");
    setSetupRequired(false);
    setIsProcessing(false);
    setIsAIProcessing(false);
    setUseSystemPrompt(true);
  }, []);

  // Update VAD configuration
  const updateVadConfiguration = useCallback(async (config: VadConfig) => {
    try {
      setVadConfig(config);
      safeLocalStorage.setItem("vad_config", JSON.stringify(config));
      await invoke("update_vad_config", { config });
    } catch (error) {
      console.error("Failed to update VAD config:", error);
    }
  }, []);

  useEffect(() => {
    if (capturing) {
      setIsContinuousMode(!vadConfig.enabled);

      if (!vadConfig.enabled) {
        setIsRecordingInContinuousMode(false);
      }
    }
  }, [vadConfig.enabled, capturing]);

  // Ctrl+Shift+C — copy last AI response to clipboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c" && lastAIResponse) {
        e.preventDefault();
        navigator.clipboard.writeText(lastAIResponse).catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lastAIResponse]);

  // Auto-scroll to bottom when a new AI response arrives
  useEffect(() => {
    if (!lastAIResponse || isAIProcessing) return;
    const scrollEl = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
    }
  }, [lastAIResponse, isAIProcessing]);

  // Keyboard arrow key support for scrolling (local shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const scrollElement = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen]);

  // Keyboard shortcuts for continuous mode recording (local shortcuts)
  useEffect(() => {
    const handleRecordingShortcuts = (e: KeyboardEvent) => {
      if (!isPopoverOpen || !isContinuousMode) return;
      if (isProcessing || isAIProcessing) return;

      // Enter: Start recording (when not recording) or Stop & Send (when recording)
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!isRecordingInContinuousMode) {
          startContinuousRecording();
        } else {
          manualStopAndSend();
        }
      }

      // Escape: Ignore recording (when recording)
      if (e.key === "Escape" && isRecordingInContinuousMode) {
        e.preventDefault();
        ignoreContinuousRecording();
      }

      // Space: Start recording (when not recording) - only if not typing in input
      if (
        e.key === " " &&
        !isRecordingInContinuousMode &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        startContinuousRecording();
      }
    };

    window.addEventListener("keydown", handleRecordingShortcuts);
    return () =>
      window.removeEventListener("keydown", handleRecordingShortcuts);
  }, [
    isPopoverOpen,
    isContinuousMode,
    isRecordingInContinuousMode,
    isProcessing,
    isAIProcessing,
    startContinuousRecording,
    manualStopAndSend,
    ignoreContinuousRecording,
  ]);

  return {
    capturing,
    isProcessing,
    isAIProcessing,
    lastTranscription,
    lastAIResponse,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    handleSetup,
    isPopoverOpen,
    setIsPopoverOpen,
    // Conversation management
    conversation,
    setConversation,
    // AI processing
    processWithAI,
    // Context management
    useSystemPrompt,
    setUseSystemPrompt: updateUseSystemPrompt,
    contextContent,
    setContextContent: updateContextContent,
    startNewConversation,
    // Window resize
    resizeWindow,
    quickActions,
    addQuickAction,
    removeQuickAction,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    handleQuickActionClick,
    // VAD configuration
    vadConfig,
    updateVadConfiguration,
    // Continuous recording
    isContinuousMode,
    isRecordingInContinuousMode,
    recordingProgress,
    speechInProgressMs,
    interimTranscription,
    manualStopAndSend,
    startContinuousRecording,
    ignoreContinuousRecording,
    // Scroll area ref for keyboard navigation
    scrollAreaRef,
    // ── New: meeting mode, transcript memory, context fusion, modes ──────────
    meetingModeActive,
    toggleMeetingMode,
    meetingTranscript,
    clearMeetingTranscript,
    // ── Meeting summary ───────────────────────────────────────────────────────
    meetingSummaryOpen,
    setMeetingSummaryOpen,
    meetingSummaryText,
    meetingSummaryGenerating,
    meetingSummarySaved,
    meetingSummaryDate,
    generateMeetingSummary,
    // ── Coaching tips ─────────────────────────────────────────────────────────
    coachingTip,
    coachingGenerating,
    coachingVisible,
    setCoachingVisible,
    generateCoachingTip,
    assistantMode,
    setAssistantMode,
    // ── Clipboard context ─────────────────────────────────────────────────────
    clipboardContext,
    pasteClipboard,
    clearClipboardContext,
    // ── Playbook context ──────────────────────────────────────────────────────
    playbookContext,
    setPlaybookContext,
    // ── Microphone capture ────────────────────────────────────────────────────
    micCapturing,
    startMicCapture,
    stopMicCapture,
    // ── Manual screenshot for audio panel ─────────────────────────────────────
    setManualScreenshot,
    // ── Meeting app detection ─────────────────────────────────────────────────
    detectedApps,
    autoMeetingEnabled,
    toggleAutoMeeting,
    // ── TTS auto-speak ────────────────────────────────────────────────────────
    autoSpeakInMeeting,
    toggleAutoSpeak,
    // ── Export ───────────────────────────────────────────────────────────────
    exportConversation,
    // ── STT language ─────────────────────────────────────────────────────────
    sttLanguage,
    setSttLanguage,
    // ── Knowledge base RAG ────────────────────────────────────────────────────
    kbEnabled,
    setKbEnabled,
    // ── State Runtime ────────────────────────────────────────────────────────
    agentRuntime: runtime,
    // ── Human-in-the-Loop ────────────────────────────────────────────────────
    requireValidation,
    setRequireValidation,
    pendingValidation,
    approveValidation,
    rejectValidation,
    resumeInterruptedRun,
    // ── External actions (LAMU_ACTION) ───────────────────────────────────────
    pendingAction,
    pendingActionIntegrationName,
    dismissAction: () => setPendingAction(null),
    executeAction: async (action: import("../pages/app/components/speech/ActionConfirmModal").LamuAction) => {
      // Find the integration_id if not set (pick first matching provider)
      let integId = action.integration_id ?? "";
      if (!integId && action.integration) {
        try {
          const integrations = await invoke<Array<{ id: string; provider: string }>>("kb_list_integrations");
          const found = integrations.find((i) => i.provider === action.integration);
          if (found) integId = found.id;
        } catch { /* best-effort */ }
      }
      try {
      switch (action.type) {
        case "gitlab_create_issue":
          return invoke("kb_gitlab_create_issue", {
            integrationId: integId,
            title: action.title ?? "",
            description: action.description ?? "",
            labels: action.labels ?? null,
            assignees: action.assignees ?? null,
          });
        case "gitlab_update_issue":
          return invoke("kb_gitlab_update_issue", {
            integrationId: integId,
            issueIid: action.issue_iid ?? 0,
            title: action.title ?? null,
            description: action.description ?? null,
            stateEvent: action.state_event ?? null,
            labels: action.labels ?? null,
          });
        case "gitlab_comment_issue":
          return invoke("kb_gitlab_comment_issue", {
            integrationId: integId,
            issueIid: action.issue_iid ?? 0,
            body: action.body ?? "",
          });
        case "gitlab_create_mr":
          return invoke("kb_gitlab_create_mr", {
            integrationId: integId,
            title: action.title ?? "",
            sourceBranch: action.source_branch ?? "",
            targetBranch: action.target_branch ?? "main",
            description: action.description ?? "",
          });
        case "gitlab_upsert_file":
          return invoke("kb_gitlab_upsert_file", {
            integrationId: integId,
            filePath: action.file_path ?? "",
            content: action.content ?? "",
            branch: action.branch ?? "main",
            commitMessage: action.commit_message ?? "Update via Lamu",
          });
        // ── GitHub ──────────────────────────────────────────────────────
        case "github_create_issue":
          return invoke("kb_github_create_issue", {
            integrationId: integId, title: action.title ?? "",
            body: action.description ?? action.body ?? "",
            labels: action.labels ?? null, assignees: action.assignees ?? null,
          });
        case "github_update_issue":
          return invoke("kb_github_update_issue", {
            integrationId: integId, issueNumber: action.issue_iid ?? 0,
            title: action.title ?? null, body: action.description ?? null,
            state: action.state_event === "close" ? "closed" : action.state_event === "reopen" ? "open" : null,
          });
        case "github_add_comment":
          return invoke("kb_github_add_comment", {
            integrationId: integId, issueNumber: action.issue_iid ?? 0, body: action.body ?? "",
          });
        case "github_create_pr":
          return invoke("kb_github_create_pr", {
            integrationId: integId, title: action.title ?? "",
            head: action.source_branch ?? "", base: action.target_branch ?? "main",
            body: action.description ?? "",
          });
        // ── Jira ────────────────────────────────────────────────────────
        case "jira_create_issue":
          return invoke("kb_jira_create_issue", {
            integrationId: integId,
            projectKey: (action as any).project_key ?? "",
            summary: action.title ?? action.body ?? "",
            description: action.description ?? "",
            issueType: (action as any).issue_type ?? "Task",
          });
        case "jira_update_issue":
          return invoke("kb_jira_update_issue", {
            integrationId: integId,
            issueKey: (action as any).issue_key ?? "",
            summary: action.title ?? null,
            description: action.description ?? null,
          });
        case "jira_add_comment":
          return invoke("kb_jira_add_comment", {
            integrationId: integId,
            issueKey: (action as any).issue_key ?? "",
            body: action.body ?? "",
          });
        case "jira_transition_issue":
          return invoke("kb_jira_transition_issue", {
            integrationId: integId,
            issueKey: (action as any).issue_key ?? "",
            transitionName: (action as any).transition_name ?? "",
          });
        // ── Confluence ──────────────────────────────────────────────────
        case "confluence_create_page":
          return invoke("kb_confluence_create_page", {
            integrationId: integId,
            spaceKey: (action as any).space_key ?? "",
            title: action.title ?? "",
            bodyHtml: action.content ?? action.body ?? "",
            parentId: (action as any).parent_id ?? null,
          });
        case "confluence_update_page":
          return invoke("kb_confluence_update_page", {
            integrationId: integId,
            pageId: (action as any).page_id ?? "",
            title: action.title ?? "",
            bodyHtml: action.content ?? action.body ?? "",
            version: (action as any).version ?? 1,
          });
        // ── Notion ──────────────────────────────────────────────────────
        case "notion_create_page":
          return invoke("kb_notion_create_page", {
            integrationId: integId,
            parentPageId: (action as any).parent_page_id ?? "",
            title: action.title ?? "",
            content: action.content ?? action.body ?? "",
          });
        case "notion_append_content":
          return invoke("kb_notion_append_content", {
            integrationId: integId,
            pageId: (action as any).page_id ?? "",
            content: action.content ?? action.body ?? "",
          });
        // ── Salesforce ──────────────────────────────────────────────────
        case "salesforce_create_record":
          return invoke("kb_salesforce_create_record", {
            integrationId: integId,
            objectType: (action as any).object_type ?? "Contact",
            fields: (action as any).fields ?? {},
          });
        case "salesforce_update_record":
          return invoke("kb_salesforce_update_record", {
            integrationId: integId,
            objectType: (action as any).object_type ?? "Contact",
            recordId: (action as any).record_id ?? "",
            fields: (action as any).fields ?? {},
          });
        // ── Shopify ─────────────────────────────────────────────────────
        case "shopify_create_product":
          return invoke("kb_shopify_create_product", {
            integrationId: integId,
            title: action.title ?? "",
            bodyHtml: action.description ?? action.body ?? "",
            price: (action as any).price ?? "0.00",
          });
        case "shopify_update_product":
          return invoke("kb_shopify_update_product", {
            integrationId: integId,
            productId: (action as any).product_id ?? 0,
            title: action.title ?? null,
            bodyHtml: action.description ?? null,
          });
        // ── Database ────────────────────────────────────────────────────
        case "db_query":
          return invoke("kb_database_query", {
            integrationId: integId,
            sql: (action as any).sql ?? "",
            allowWrite: (action as any).allow_write ?? false,
          });
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message ?? "Unknown error";
        throw new Error(`Action "${action.type}" failed: ${msg}`);
      }
    },
    // ── Email draft ───────────────────────────────────────────────────────────
    pendingEmailDraft,
    dismissEmailDraft: () => setPendingEmailDraft(null),
    generateFollowUpEmail,
    emailEnabled,
    setEmailEnabled: (v: boolean) => {
      setEmailEnabled(v);
      safeLocalStorage.setItem("email_enabled", String(v));
    },
    autoSendEmail,
    setAutoSendEmail: (v: boolean) => {
      setAutoSendEmail(v);
      safeLocalStorage.setItem("email_auto_send", String(v));
    },
    // ── SQL execution approval ───────────────────────────────────────────────
    pendingSqlWrite,
    dbQueryResults,
    confirmSqlWrite: async (confirmed: boolean) => {
      if (!pendingSqlWrite) return;
      if (confirmed) {
        try {
          const data = await invoke<string>("kb_database_query", {
            integrationId: pendingSqlWrite.integrationId,
            sql: pendingSqlWrite.sql,
            allowWrite: true,
          });
          setDbQueryResults((prev) => [...prev, {
            sql: pendingSqlWrite.sql,
            dbName: pendingSqlWrite.dbName,
            integrationId: pendingSqlWrite.integrationId,
            data,
            type: "write" as const,
            executed: true,
          }]);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setDbQueryResults((prev) => [...prev, {
            sql: pendingSqlWrite.sql,
            dbName: pendingSqlWrite.dbName,
            integrationId: pendingSqlWrite.integrationId,
            data: "",
            error: msg,
            type: "write" as const,
            executed: false,
          }]);
        }
      }
      // Move to next write in queue, or clear
      const queue = pendingSqlWrite.writeQueue;
      if (queue.length > 0) {
        const next = queue[0];
        setPendingSqlWrite({ ...next, writeQueue: queue.slice(1) });
      } else {
        setPendingSqlWrite(null);
      }
    },
    dismissSqlWrite: () => setPendingSqlWrite(null),
  };
}
