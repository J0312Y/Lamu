import { useState, useCallback, useRef, useEffect } from "react";
import { useWindowResize } from "./useWindow";
import { useGlobalShortcuts } from "@/hooks";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  shouldUseLamuAPI,
  MESSAGE_ID_OFFSET,
  generateConversationId,
  generateMessageId,
  generateRequestId,
  getResponseSettings,
} from "@/lib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Types for completion
interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface SqlQueryResult {
  sql: string;
  dbName: string;
  integrationId: string;
  data: string;
  error?: string;
  type: "read" | "write";
  executed: boolean;
}

interface PendingWriteQuery {
  sql: string;
  dbName: string;
  integrationId: string;
  writeQueue: Array<{ sql: string; dbName: string; integrationId: string }>;
}

interface CompletionState {
  input: string;
  response: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
  dbResults: SqlQueryResult[];
  pendingWrite: PendingWriteQuery | null;
  dbQueryLoading: boolean;
}

export const useCompletion = () => {
  const {
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    screenshotConfiguration,
    setScreenshotConfiguration,
    supportsImages,
  } = useApp();
  const globalShortcuts = useGlobalShortcuts();

  const [state, setState] = useState<CompletionState>({
    input: "",
    response: "",
    isLoading: false,
    error: null,
    attachedFiles: [],
    currentConversationId: null,
    conversationHistory: [],
    dbResults: [],
    pendingWrite: null,
    dbQueryLoading: false,
  });
  const [dbIntegrations, setDbIntegrations] = useState<Array<{ id: string; provider: string; name: string }>>([]);
  const [micOpen, setMicOpen] = useState(false);
  const [enableVAD, setEnableVAD] = useState(false);
  const [messageHistoryOpen, setMessageHistoryOpen] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const [isConversationHistoryOpen, setIsConversationHistoryOpen] = useState(false);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [keepEngaged, setKeepEngaged] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingScreenshotRef = useRef(false);
  const screenshotConfigRef = useRef(screenshotConfiguration);
  const hasCheckedPermissionRef = useRef(false);
  const screenshotInitiatedByThisContext = useRef(false);

  const { resizeWindow } = useWindowResize();

  useEffect(() => {
    screenshotConfigRef.current = screenshotConfiguration;
  }, [screenshotConfiguration]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
  }, []);

  const setResponse = useCallback((value: string) => {
    setState((prev) => ({ ...prev, response: value }));
  }, []);

  const addFile = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const attachedFile: AttachedFile = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        base64,
        size: file.size,
      };

      setState((prev) => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, attachedFile],
      }));
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, attachedFiles: [] }));
  }, []);

  // ── DB agent helpers ───────────────────────────────────────────────────────

  function extractSqlBlocks(text: string): string[] {
    const regex = /```sql\n([\s\S]*?)```/gi;
    const blocks: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const sql = match[1].trim();
      if (sql) blocks.push(sql);
    }
    return blocks;
  }

  function isWriteQuery(sql: string): boolean {
    const upper = sql.trim().toUpperCase();
    return /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE)\b/.test(upper);
  }

  /** Extract short alias from integration name like "prod (myapp)" → "prod" */
  function extractAlias(name: string): string {
    return name.split(" (")[0].trim();
  }

  function findTargetDb(
    sql: string,
    integrations: Array<{ id: string; provider: string; name: string }>
  ): { integrationId: string; dbName: string } {
    // Check for explicit DB comment: -- DB: alias
    const commentMatch = sql.match(/--\s*DB:\s*([^\n]+)/i);
    if (commentMatch) {
      const hint = commentMatch[1].trim().toLowerCase();
      // 1. Exact alias match
      let found = integrations.find((i) => extractAlias(i.name).toLowerCase() === hint);
      // 2. Alias starts-with
      if (!found) found = integrations.find((i) => extractAlias(i.name).toLowerCase().startsWith(hint));
      // 3. Alias contains hint
      if (!found) found = integrations.find((i) => extractAlias(i.name).toLowerCase().includes(hint));
      // 4. Full name contains hint
      if (!found) found = integrations.find((i) => i.name.toLowerCase().includes(hint));
      if (found) return { integrationId: found.id, dbName: found.name };
    }
    // Default: first DB
    const first = integrations[0];
    return { integrationId: first.id, dbName: first.name };
  }

  const processDbQueries = useCallback(async (response: string) => {
    const sqlBlocks = extractSqlBlocks(response);
    if (sqlBlocks.length === 0) return;

    let dbIntegrations: Array<{ id: string; provider: string; name: string }> = [];
    try {
      const all = await invoke<Array<{ id: string; provider: string; name: string }>>(
        "kb_list_integrations"
      );
      dbIntegrations = all.filter((i) => ["postgres", "mysql"].includes(i.provider));
    } catch {
      return;
    }
    if (dbIntegrations.length === 0) return;

    const reads: Array<{ sql: string; integrationId: string; dbName: string }> = [];
    const writes: Array<{ sql: string; integrationId: string; dbName: string }> = [];

    for (const sql of sqlBlocks) {
      const target = findTargetDb(sql, dbIntegrations);
      if (isWriteQuery(sql)) {
        writes.push({ sql, ...target });
      } else {
        reads.push({ sql, ...target });
      }
    }

    if (reads.length === 0 && writes.length === 0) return;

    setState((prev) => ({ ...prev, dbQueryLoading: true }));

    // Execute all reads in parallel
    const readResults: SqlQueryResult[] = await Promise.all(
      reads.map(async ({ sql, integrationId, dbName }) => {
        try {
          const data = await invoke<string>("kb_database_query", {
            integrationId,
            sql,
            allowWrite: false,
          });
          return { sql, dbName, integrationId, data, type: "read" as const, executed: true };
        } catch (e: any) {
          return {
            sql,
            dbName,
            integrationId,
            data: "",
            error: String(e?.message ?? e),
            type: "read" as const,
            executed: false,
          };
        }
      })
    );

    // Queue writes — show first one for confirmation
    const [firstWrite, ...remainingWrites] = writes;
    setState((prev) => ({
      ...prev,
      dbResults: [...prev.dbResults, ...readResults],
      dbQueryLoading: false,
      pendingWrite: firstWrite
        ? { ...firstWrite, writeQueue: remainingWrites }
        : null,
    }));
  }, []);

  const confirmWriteQuery = useCallback(async (confirmed: boolean) => {
    setState((prev) => {
      if (!prev.pendingWrite) return prev;
      return { ...prev, dbQueryLoading: true };
    });

    const pw = state.pendingWrite;
    if (!pw) return;

    let newResult: SqlQueryResult | null = null;

    if (confirmed) {
      try {
        const data = await invoke<string>("kb_database_query", {
          integrationId: pw.integrationId,
          sql: pw.sql,
          allowWrite: true,
        });
        newResult = { sql: pw.sql, dbName: pw.dbName, integrationId: pw.integrationId, data, type: "write", executed: true };
      } catch (e: any) {
        newResult = {
          sql: pw.sql,
          dbName: pw.dbName,
          integrationId: pw.integrationId,
          data: "",
          error: String(e?.message ?? e),
          type: "write",
          executed: false,
        };
      }
    }

    // Advance to next write in queue
    const [nextWrite, ...remaining] = pw.writeQueue;
    setState((prev) => ({
      ...prev,
      dbResults: newResult ? [...prev.dbResults, newResult] : prev.dbResults,
      dbQueryLoading: false,
      pendingWrite: nextWrite ? { ...nextWrite, writeQueue: remaining } : null,
    }));
  }, [state.pendingWrite]);

  const clearDbResults = useCallback(() => {
    setState((prev) => ({ ...prev, dbResults: [], pendingWrite: null, dbQueryLoading: false }));
  }, []);

  // Load DB integrations list once on mount
  useEffect(() => {
    invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations")
      .then((all) => setDbIntegrations(all.filter((i) => ["postgres", "mysql"].includes(i.provider))))
      .catch(() => {});
  }, []);

  const rerunQuery = useCallback(async (sql: string, integrationId: string, dbName: string) => {
    setState((prev) => ({ ...prev, dbQueryLoading: true }));
    try {
      const data = await invoke<string>("kb_database_query", { integrationId, sql, allowWrite: false });
      const newResult: SqlQueryResult = { sql, dbName, integrationId, data, type: "read", executed: true };
      setState((prev) => ({
        ...prev,
        dbQueryLoading: false,
        dbResults: [...prev.dbResults, newResult],
      }));
    } catch (e: any) {
      const newResult: SqlQueryResult = { sql, dbName, integrationId, data: "", error: String(e?.message ?? e), type: "read", executed: false };
      setState((prev) => ({
        ...prev,
        dbQueryLoading: false,
        dbResults: [...prev.dbResults, newResult],
      }));
    }
  }, []);

  const submit = useCallback(
    async (speechText?: string) => {
      const input = speechText || state.input;

      if (!input.trim()) {
        return;
      }

      if (speechText) {
        setState((prev) => ({
          ...prev,
          input: speechText,
        }));
      }

      // Generate unique request ID
      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        // Prepare message history for the AI
        const messageHistory = state.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Handle image attachments
        const imagesBase64: string[] = [];
        if (state.attachedFiles.length > 0) {
          state.attachedFiles.forEach((file) => {
            if (file.type.startsWith("image/")) {
              imagesBase64.push(file.base64);
            }
          });
        }

        let fullResponse = "";

        const useLamuAPI = await shouldUseLamuAPI();
        // Check if AI provider is configured
        if (!selectedAIProvider.provider && !useLamuAPI) {
          setState((prev) => ({
            ...prev,
            error: "Please select an AI provider in settings",
          }));
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !useLamuAPI) {
          setState((prev) => ({
            ...prev,
            error: "Invalid provider selected",
          }));
          return;
        }

        // Clear previous response and set loading state
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
        }));

        // ── KB + live query injection ──────────────────────────────────────
        let enrichedSystemPrompt = systemPrompt || undefined;
        try {
          const kbEnabled = localStorage.getItem("kb_enabled") === "true";
          if (kbEnabled) {
            // Semantic KB search
            const kbResults = await invoke<Array<{ document_name: string; content: string; similarity: number }>>(
              "kb_search", { query: input, topK: 5 }
            );
            const relevant = kbResults.filter((r) => r.similarity > 0.3);
            if (relevant.length > 0) {
              const kbContext = relevant
                .map((r, i) => `[${i + 1}] From "${r.document_name}":\n${r.content}`)
                .join("\n\n");
              enrichedSystemPrompt = `${enrichedSystemPrompt ?? ""}\n\n--- Relevant knowledge base excerpts ---\n${kbContext}\n---`.trimStart();
            }

            // Fetch all integrations once
            const allIntegrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");

            const dbIntegrations = allIntegrations.filter((i) =>
              ["postgres", "mysql"].includes(i.provider)
            );
            const otherActionable = allIntegrations.filter((i) =>
              ["gitlab", "github", "jira", "confluence", "notion", "salesforce", "shopify"].includes(i.provider)
            );

            const liveContextParts: string[] = [];

            // FIX 1: Always inject DB schema + sample data when databases are connected
            // The AI needs to know the DB exists to answer any question about the data
            if (dbIntegrations.length > 0) {
              await Promise.all(
                dbIntegrations.map(async (integ) => {
                  try {
                    const liveData = await invoke<string>("kb_integration_live_query", {
                      integrationId: integ.id,
                      queryHint: input,
                    });
                    if (liveData?.trim()) liveContextParts.push(liveData);
                  } catch (err) {
                    // FIX 3: Log DB connection errors instead of swallowing them
                    console.warn(`[Lamu KB] DB live query failed for "${integ.name}":`, err);
                    try {
                      await invoke("debug_log", { message: `KB DB live query error (${integ.name}): ${err}` });
                    } catch { /* debug_log itself failed, ignore */ }
                  }
                })
              );
            }

            // FIX 2: Broader keywords for non-DB integrations (FR + EN)
            const integrationKeywords = /issue|ticket|bug|task|pr|merge request|mr|commit|repo|project|sprint|jira|gitlab|github|notion|confluence|salesforce|shopify|feature|story/i;
            if (otherActionable.length > 0 && integrationKeywords.test(input)) {
              await Promise.all(
                otherActionable.slice(0, 3).map(async (integ) => {
                  try {
                    const liveData = await invoke<string>("kb_integration_live_query", {
                      integrationId: integ.id,
                      queryHint: input,
                    });
                    if (liveData?.trim()) liveContextParts.push(liveData);
                  } catch (err) {
                    console.warn(`[Lamu KB] Integration live query failed for "${integ.name}":`, err);
                  }
                })
              );
            }

            if (liveContextParts.length > 0) {
              enrichedSystemPrompt = `${enrichedSystemPrompt ?? ""}\n\n--- Données en temps réel ---\n${liveContextParts.join("\n\n")}\n---`.trimStart();
            }

            // SQL agent instructions for all connected databases
            if (dbIntegrations.length > 0) {
              const dbLines = dbIntegrations
                .map((i) => `- alias="${extractAlias(i.name)}" type=${i.provider}`)
                .join("\n");
              const multiDbNote =
                dbIntegrations.length > 1
                  ? `\nBases disponibles (utilise le commentaire -- DB: <alias> pour cibler):\n${dbLines}`
                  : `\nBase: ${extractAlias(dbIntegrations[0].name)} (${dbIntegrations[0].provider})`;
              enrichedSystemPrompt = `${enrichedSystemPrompt ?? ""}\n\n--- SQL Agent ---\nÉcris chaque requête dans un bloc \`\`\`sql. SELECT = auto-exécuté. INSERT/UPDATE/DELETE = confirmation requise. Rapports: plusieurs SELECT + interprétation.${multiDbNote}\n---`.trimStart();
            }
          }
        } catch (kbErr) {
          console.warn("[Lamu KB] Context injection failed:", kbErr);
          try {
            await invoke("debug_log", { message: `KB injection error: ${kbErr}` });
          } catch { /* debug_log itself failed, ignore */ }
        }

        try {
          // Use the fetchAIResponse function with signal
          for await (const chunk of fetchAIResponse({
            provider: useLamuAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: enrichedSystemPrompt,
            history: messageHistory,
            userMessage: input,
            imagesBase64,
            signal,
          })) {
            // Only update if this is still the current request
            if (currentRequestIdRef.current !== requestId) {
              return; // Request was superseded, stop processing
            }

            // Check if request was aborted
            if (signal.aborted) {
              return; // Request was cancelled, stop processing
            }

            fullResponse += chunk;
            setState((prev) => ({
              ...prev,
              response: prev.response + chunk,
            }));
          }
        } catch (e: any) {
          // Only show error if this is still the current request and not aborted
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: e.message || "An error occurred",
            }));
          }
          return;
        }

        // Only proceed if this is still the current request
        if (currentRequestIdRef.current !== requestId || signal.aborted) {
          return;
        }

        setState((prev) => ({ ...prev, isLoading: false, dbResults: [], pendingWrite: null }));

        // Focus input after AI response is complete
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        // Detect and execute SQL blocks from AI response
        if (fullResponse) {
          processDbQueries(fullResponse);
        }

        // Save the conversation after successful completion
        if (fullResponse) {
          await saveCurrentConversation(
            input,
            fullResponse,
            state.attachedFiles
          );
          // Clear input and attached files after saving
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
          }));
        }
      } catch (error) {
        // Only show error if not aborted
        if (!signal?.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [
      state.input,
      state.attachedFiles,
      selectedAIProvider,
      allAiProviders,
      systemPrompt,
      state.conversationHistory,
    ]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    // Don't reset if keep engaged mode is active
    if (keepEngaged) {
      return;
    }
    cancel();
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
      dbResults: [],
      pendingWrite: null,
      dbQueryLoading: false,
    }));
  }, [cancel, keepEngaged]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  // Note: saveConversation, getConversationById, and generateConversationTitle
  // are now imported from lib/database/chat-history.action.ts

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState((prev) => ({
      ...prev,
      currentConversationId: conversation.id,
      conversationHistory: conversation.messages,
      input: "",
      response: "",
      error: null,
      isLoading: false,
    }));
  }, []);

  const startNewConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentConversationId: null,
      conversationHistory: [],
      input: "",
      response: "",
      error: null,
      isLoading: false,
      attachedFiles: [],
      dbResults: [],
      pendingWrite: null,
      dbQueryLoading: false,
    }));
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      _attachedFiles: AttachedFile[]
    ) => {
      // Validate inputs
      if (!userMessage || !assistantResponse) {
        console.error("Cannot save conversation: missing message content");
        return;
      }

      const conversationId =
        state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const userMsg: ChatMessage = {
        id: generateMessageId("user", timestamp),
        role: "user",
        content: userMessage,
        timestamp,
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
        role: "assistant",
        content: assistantResponse,
        timestamp: timestamp + MESSAGE_ID_OFFSET,
      };

      const newMessages = [...state.conversationHistory, userMsg, assistantMsg];

      // Get existing conversation if updating
      let existingConversation = null;
      if (state.currentConversationId) {
        try {
          existingConversation = await getConversationById(
            state.currentConversationId
          );
        } catch (error) {
          console.error("Failed to get existing conversation:", error);
        }
      }

      const title =
        state.conversationHistory.length === 0
          ? generateConversationTitle(userMessage)
          : existingConversation?.title ||
            generateConversationTitle(userMessage);

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: existingConversation?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      try {
        await saveConversation(conversation);

        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));
      } catch (error) {
        console.error("Failed to save conversation:", error);
        // Show error to user
        setState((prev) => ({
          ...prev,
          error: "Failed to save conversation. Please try again.",
        }));
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  // Listen for conversation events from the main ChatHistory component
  useEffect(() => {
    const handleConversationSelected = async (event: any) => {
      console.log(event, "event");
      // Only the conversation ID is passed through the event
      const { id } = event.detail;
      console.log(id, "id");
      if (!id || typeof id !== "string") {
        console.error("No conversation ID provided");
        setState((prev) => ({
          ...prev,
          error: "Invalid conversation selected",
        }));
        return;
      }
      console.log(id, "id");
      try {
        // Fetch the full conversation from SQLite
        const conversation = await getConversationById(id);

        if (conversation) {
          loadConversation(conversation);
        } else {
          console.error(`Conversation ${id} not found in database`);
          setState((prev) => ({
            ...prev,
            error: "Conversation not found. It may have been deleted.",
          }));
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to load conversation. Please try again.",
        }));
      }
    };

    const handleNewConversation = () => {
      startNewConversation();
    };

    const handleConversationDeleted = (event: any) => {
      const deletedId = event.detail;
      // If the currently active conversation was deleted, start a new one
      if (state.currentConversationId === deletedId) {
        startNewConversation();
      }
    };

    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === "lamu-conversation-selected" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const { id } = data;
          if (id && typeof id === "string") {
            const conversation = await getConversationById(id);
            if (conversation) {
              loadConversation(conversation);
            }
          }
        } catch (error) {
          console.error("Failed to parse conversation selection:", error);
        }
      }
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "conversationSelected",
        handleConversationSelected
      );
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener(
        "conversationDeleted",
        handleConversationDeleted
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILES = 6;

    files.forEach((file) => {
      if (
        file.type.startsWith("image/") &&
        state.attachedFiles.length < MAX_FILES
      ) {
        addFile(file);
      }
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleScreenshotSubmit = useCallback(
    async (base64: string, prompt?: string) => {
      if (state.attachedFiles.length >= MAX_FILES) {
        setState((prev) => ({
          ...prev,
          error: `You can only upload ${MAX_FILES} files`,
        }));
        return;
      }

      try {
        if (prompt) {
          // Auto mode: Submit directly to AI with screenshot
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          // Generate unique request ID
          const requestId = generateRequestId();
          currentRequestIdRef.current = requestId;

          // Cancel any existing request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          try {
            // Prepare message history for the AI
            const messageHistory = state.conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

            let fullResponse = "";

            const useLamuAPI = await shouldUseLamuAPI();
            // Check if AI provider is configured
            if (!selectedAIProvider.provider && !useLamuAPI) {
              setState((prev) => ({
                ...prev,
                error: "Please select an AI provider in settings",
              }));
              return;
            }

            const provider = allAiProviders.find(
              (p) => p.id === selectedAIProvider.provider
            );
            if (!provider && !useLamuAPI) {
              setState((prev) => ({
                ...prev,
                error: "Invalid provider selected",
              }));
              return;
            }

            // Clear previous response and set loading state
            setState((prev) => ({
              ...prev,
              input: prompt,
              isLoading: true,
              error: null,
              response: "",
            }));

            // Only send image if the current model/provider supports vision
            const canSendImage =
              supportsImages &&
              (useLamuAPI || provider?.curl.includes("{{IMAGE}}"));

            // If user initiated a screenshot but the current setup can't handle images,
            // surface a clear error instead of silently dropping the image.
            if (!canSendImage) {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: useLamuAPI
                  ? "The selected model does not support images. Please choose a vision-capable model."
                  : "The selected provider does not support image input. Switch to a vision-capable provider (e.g. groq-vision).",
              }));
              return;
            }

            // Use the fetchAIResponse function with image and signal
            for await (const chunk of fetchAIResponse({
              provider: useLamuAPI ? undefined : provider,
              selectedProvider: selectedAIProvider,
              systemPrompt: systemPrompt || undefined,
              history: messageHistory,
              userMessage: prompt,
              imagesBase64: [base64],
              signal,
            })) {
              // Only update if this is still the current request
              if (currentRequestIdRef.current !== requestId || signal.aborted) {
                return; // Request was superseded or cancelled
              }

              fullResponse += chunk;
              setState((prev) => ({
                ...prev,
                response: prev.response + chunk,
              }));
            }

            // Only proceed if this is still the current request
            if (currentRequestIdRef.current !== requestId || signal.aborted) {
              return;
            }

            setState((prev) => ({ ...prev, isLoading: false }));

            // Focus input after screenshot AI response is complete
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);

            // Save the conversation after successful completion
            if (fullResponse) {
              await saveCurrentConversation(prompt, fullResponse, [
                attachedFile,
              ]);
              // Clear input after saving
              setState((prev) => ({
                ...prev,
                input: "",
              }));
            }
          } catch (e: any) {
            // Only show error if this is still the current request and not aborted
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({
                ...prev,
                error: e.message || "An error occurred",
              }));
            }
          } finally {
            // Only update loading state if this is still the current request
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({ ...prev, isLoading: false }));
            }
          }
        } else {
          // Manual mode: Add to attached files
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          setState((prev) => ({
            ...prev,
            attachedFiles: [...prev.attachedFiles, attachedFile],
          }));
        }
      } catch (error) {
        console.error("Failed to process screenshot:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "An error occurred processing screenshot",
          isLoading: false,
        }));
      }
    },
    [
      state.attachedFiles.length,
      state.conversationHistory,
      selectedAIProvider,
      allAiProviders,
      systemPrompt,
      saveCurrentConversation,
      inputRef,
    ]
  );

  const onRemoveAllFiles = () => {
    clearFiles();
    setIsFilesPopoverOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && state.input.trim()) {
        submit();
      }
    }
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      const hasImages = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      );

      // If we have images, prevent default text pasting and process images
      if (hasImages) {
        e.preventDefault();

        const processedFiles: File[] = [];

        Array.from(items).forEach((item) => {
          if (
            item.type.startsWith("image/") &&
            state.attachedFiles.length + processedFiles.length < MAX_FILES
          ) {
            const file = item.getAsFile();
            if (file) {
              processedFiles.push(file);
            }
          }
        });

        // Process all files
        await Promise.all(processedFiles.map((file) => addFile(file)));
      }
    },
    [state.attachedFiles.length, addFile]
  );

  const isPopoverOpen =
    state.isLoading ||
    state.response !== "" ||
    state.error !== null ||
    keepEngaged;

  useEffect(() => {
    resizeWindow(
      isPopoverOpen || micOpen || messageHistoryOpen || isFilesPopoverOpen || isConversationHistoryOpen
    );
  }, [
    isPopoverOpen,
    micOpen,
    messageHistoryOpen,
    resizeWindow,
    isFilesPopoverOpen,
    isConversationHistoryOpen,
  ]);

  // Auto scroll to bottom when response updates
  useEffect(() => {
    const responseSettings = getResponseSettings();
    if (
      !keepEngaged &&
      state.response &&
      scrollAreaRef.current &&
      responseSettings.autoScroll
    ) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [state.response, keepEngaged]);

  // Keyboard arrow key support for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const activeScrollRef = scrollAreaRef.current || scrollAreaRef.current;
      const scrollElement = activeScrollRef?.querySelector(
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
  }, [isPopoverOpen, scrollAreaRef]);

  // Keyboard shortcut for toggling keep engaged mode (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleToggleShortcut = (e: KeyboardEvent) => {
      // Only trigger when popover is open
      if (!isPopoverOpen) return;

      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setKeepEngaged((prev) => !prev);
        // Focus the input after toggle (with delay to ensure DOM is ready)
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    };

    window.addEventListener("keydown", handleToggleShortcut);
    return () => window.removeEventListener("keydown", handleToggleShortcut);
  }, [isPopoverOpen]);

  const captureScreenshot = useCallback(async () => {
    if (!handleScreenshotSubmit) return;

    const config = screenshotConfigRef.current;
    screenshotInitiatedByThisContext.current = true;
    setIsScreenshotLoading(true);

    try {
      // Check screen recording permission on macOS
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac") && !hasCheckedPermissionRef.current) {
        const {
          checkScreenRecordingPermission,
          requestScreenRecordingPermission,
        } = await import("tauri-plugin-macos-permissions-api");

        const hasPermission = await checkScreenRecordingPermission();

        if (!hasPermission) {
          // Request permission
          await requestScreenRecordingPermission();

          // Wait a moment and check again
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const hasPermissionNow = await checkScreenRecordingPermission();

          if (!hasPermissionNow) {
            setState((prev) => ({
              ...prev,
              error:
                "Screen Recording permission required. Please enable it by going to System Settings > Privacy & Security > Screen & System Audio Recording. If you don't see Lamu in the list, click the '+' button to add it. If it's already listed, make sure it's enabled. Then restart the app.",
            }));
            setIsScreenshotLoading(false);
            screenshotInitiatedByThisContext.current = false;
            return;
          }
        }
        hasCheckedPermissionRef.current = true;
      }

      if (config.enabled) {
        const base64 = await invoke("capture_to_base64");

        if (config.mode === "auto") {
          // Auto mode: Submit directly to AI with the configured prompt
          await handleScreenshotSubmit(base64 as string, config.autoPrompt);
        } else if (config.mode === "manual") {
          // Manual mode: Add to attached files without prompt
          await handleScreenshotSubmit(base64 as string);
        }
        screenshotInitiatedByThisContext.current = false;
      } else {
        // Selection Mode: Open overlay to select an area
        isProcessingScreenshotRef.current = false;
        await invoke("start_screen_capture");
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to capture screenshot. Please try again.",
      }));
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    } finally {
      if (config.enabled) {
        setIsScreenshotLoading(false);
      }
    }
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    let unlisten: any;

    const setupListener = async () => {
      unlisten = await listen("captured-selection", async (event: any) => {
        if (!screenshotInitiatedByThisContext.current) {
          return;
        }

        if (isProcessingScreenshotRef.current) {
          return;
        }

        isProcessingScreenshotRef.current = true;
        const base64 = event.payload;
        const config = screenshotConfigRef.current;

        try {
          if (config.mode === "auto") {
            // Auto mode: Submit directly to AI with the configured prompt
            await handleScreenshotSubmit(base64 as string, config.autoPrompt);
          } else if (config.mode === "manual") {
            // Manual mode: Add to attached files without prompt
            await handleScreenshotSubmit(base64 as string);
          }
        } catch (error) {
          console.error("Error processing selection:", error);
        } finally {
          setIsScreenshotLoading(false);
          screenshotInitiatedByThisContext.current = false;
          setTimeout(() => {
            isProcessingScreenshotRef.current = false;
          }, 100);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    const unlisten = listen("capture-closed", () => {
      setIsScreenshotLoading(false);
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleRecording = useCallback(() => {
    setEnableVAD(!enableVAD);
    setMicOpen(!micOpen);
  }, [enableVAD, micOpen]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentRequestIdRef.current = null;
    };
  }, []);

  // register callbacks for global shortcuts
  useEffect(() => {
    globalShortcuts.registerAudioCallback(toggleRecording);
    globalShortcuts.registerInputRef(inputRef.current);
    globalShortcuts.registerScreenshotCallback(captureScreenshot);
  }, [
    globalShortcuts.registerAudioCallback,
    globalShortcuts.registerInputRef,
    globalShortcuts.registerScreenshotCallback,
    toggleRecording,
    captureScreenshot,
    inputRef,
  ]);

  return {
    input: state.input,
    setInput,
    response: state.response,
    setResponse,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    submit,
    cancel,
    reset,
    setState,
    enableVAD,
    setEnableVAD,
    micOpen,
    setMicOpen,
    currentConversationId: state.currentConversationId,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    messageHistoryOpen,
    setMessageHistoryOpen,
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotSubmit,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    isPopoverOpen,
    scrollAreaRef,
    resizeWindow,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    captureScreenshot,
    isScreenshotLoading,
    keepEngaged,
    setKeepEngaged,
    isConversationHistoryOpen,
    setIsConversationHistoryOpen,
    dbResults: state.dbResults,
    pendingWrite: state.pendingWrite,
    dbQueryLoading: state.dbQueryLoading,
    confirmWriteQuery,
    clearDbResults,
    rerunQuery,
    dbIntegrations,
  };
};
