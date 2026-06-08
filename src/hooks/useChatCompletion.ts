import { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@/contexts";
import { MAX_FILES } from "@/config";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  shouldUseLamuAPI,
  MESSAGE_ID_OFFSET,
  generateMessageId,
  generateRequestId,
  getResponseSettings,
} from "@/lib";
import { safeLocalStorage } from "@/lib/storage/helper";
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

interface ChatCompletionState {
  input: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
}

export const useChatCompletion = (
  conversationId: string,
  messages: ChatConversation | null,
  setMessages: (messages: ChatConversation | null) => void
) => {
  const {
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    screenshotConfiguration,
    setScreenshotConfiguration,
    selectedSttProvider,
    allSttProviders,
    selectedAudioDevices,
    hasActiveLicense,
    hasPlanFeature,
    supportsImages,
    syncEnabled,
    isBlocked,
  } = useApp();

  const [state, setState] = useState<ChatCompletionState>({
    input: "",
    isLoading: false,
    error: null,
    attachedFiles: [],
  });

  const [micOpen, setMicOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const isProcessingScreenshotRef = useRef(false);
  const screenshotConfigRef = useRef(screenshotConfiguration);
  const hasCheckedPermissionRef = useRef(false);
  const screenshotInitiatedByThisContext = useRef(false);

  useEffect(() => {
    screenshotConfigRef.current = screenshotConfiguration;
  }, [screenshotConfiguration]);

  const scrollToBottom = () => {
    const responseSettings = getResponseSettings();
    if (responseSettings.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
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
        const messageHistory = (messages?.messages || []).map((msg) => ({
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

        const useLamuAPI = await shouldUseLamuAPI();

        // ── Trial expired / no licence → block all providers ───────────────
        if (isBlocked) {
          setState((prev) => ({
            ...prev,
            error: "Your free trial has expired. Please get a license to continue.",
            isLoading: false,
          }));
          return;
        }

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

        // Add user message to UI immediately
        const timestamp = Date.now();
        const userMsg: ChatMessage = {
          id: generateMessageId("user", timestamp),
          role: "user",
          content: input,
          timestamp,
        };

        const updatedMessages = {
          ...messages!,
          messages: [...(messages?.messages || []), userMsg],
        };
        setMessages(updatedMessages);

        // Clear input and set loading state
        setState((prev) => ({
          ...prev,
          input: "",
          isLoading: true,
          error: null,
          attachedFiles: [],
        }));

        // Scroll to bottom after adding user message
        setTimeout(scrollToBottom, 100);

        let fullResponse = "";

        // ── Enrich context with KB, integrations, calendar (like overlay) ──
        let enrichedSystemPrompt = systemPrompt || "";
        const kbEnabled = (() => { const v = safeLocalStorage.getItem("kb_enabled"); return v === null ? true : v === "true"; })();

        if (kbEnabled) {
          // 1. Knowledge Base RAG search
          try {
            const kbResults = await invoke<Array<{
              document_name: string;
              content: string;
              similarity: number;
            }>>("kb_search", { query: input, topK: 5 });

            const relevant = kbResults.filter((r) => r.similarity > 0.3);
            if (relevant.length > 0) {
              const kbContext = relevant
                .map((r, i) => `[${i + 1}] From "${r.document_name}":\n${r.content}`)
                .join("\n\n");
              enrichedSystemPrompt += `\n\n--- Relevant knowledge base excerpts ---\n${kbContext}\n---`;
            }
          } catch { /* KB search is best-effort */ }

          // 2. Connected integrations + live data
          try {
            const integrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
            const actionable = integrations.filter((i) =>
              ["gitlab", "github", "jira", "confluence", "notion", "salesforce", "shopify", "postgres", "mysql"].includes(i.provider)
            );
            if (actionable.length > 0) {
              const integList = actionable.map((i) => `- ${i.name} (${i.provider})`).join("\n");
              enrichedSystemPrompt += `\n\n--- Connected integrations ---\n${integList}\n---`;

              const liveContextParts: string[] = [];
              const dbIntegrations = actionable.filter((i) => ["postgres", "mysql"].includes(i.provider));

              // Fetch DB schemas
              await Promise.all(
                dbIntegrations.slice(0, 3).map(async (integ) => {
                  try {
                    const schema = await invoke<string>("kb_database_get_schema", { integrationId: integ.id });
                    if (schema && schema.trim()) {
                      liveContextParts.push(`--- Database schema "${integ.name}" (${integ.provider}) ---\n${schema}`);
                    }
                  } catch { /* best-effort */ }
                })
              );

              // Fetch live data from integrations
              await Promise.all(
                actionable.slice(0, 3).map(async (integ) => {
                  try {
                    const liveData = await invoke<string>("kb_integration_live_query", {
                      integrationId: integ.id,
                      queryHint: input,
                    });
                    if (liveData && liveData.trim()) liveContextParts.push(liveData);
                  } catch { /* best-effort */ }
                })
              );

              if (liveContextParts.length > 0) {
                enrichedSystemPrompt += `\n\n--- Live data ---\n${liveContextParts.join("\n\n")}\n---`;
              }

              // SQL generation instructions for DB integrations
              if (dbIntegrations.length > 0) {
                const dbDetails = dbIntegrations.map((i) => `"${i.name}" (${i.provider})`).join(", ");
                const isMySQL = dbIntegrations.some((i) => i.provider === "mysql");
                const isPG = dbIntegrations.some((i) => i.provider === "postgres");
                let sqlHints = `\n\n[DATABASE INSTRUCTIONS — MANDATORY]`;
                sqlHints += `\nYou have DIRECT access to the following databases: ${dbDetails}.`;
                sqlHints += `\nThe full schema with all tables and columns is provided above. You KNOW the database structure.`;
                sqlHints += `\nYou can execute SQL queries — the system will automatically execute any query in a \`\`\`sql\`\`\` block.`;
                sqlHints += `\nRULES:`;
                sqlHints += `\n1. When the user asks for data, ANALYZE the provided schema to identify the correct table. Then generate the SQL query in a \`\`\`sql\`\`\` block.`;
                sqlHints += `\n2. NEVER say "I cannot access the database" or "I cannot show real data" — you CAN via \`\`\`sql\`\`\` blocks.`;
                sqlHints += `\n3. Only use tables and columns from the provided schema. Do not invent anything.`;
                sqlHints += `\n4. NEVER generate queries on information_schema. You already have the full schema.`;
                sqlHints += `\n5. For reports: generate SQL queries with aggregations (COUNT, SUM, AVG, GROUP BY). You can generate multiple \`\`\`sql\`\`\` blocks in one response.`;
                sqlHints += `\n6. VERY IMPORTANT: NEVER invent fictional data or examples. Only generate SQL block(s) and a brief explanation. Real results will be displayed after execution.`;
                if (isMySQL) sqlHints += `\n7. MySQL: use DATABASE() instead of the database name in WHERE clauses.`;
                if (isPG) sqlHints += `\n7. PostgreSQL: default schema is 'public'.`;
                enrichedSystemPrompt += sqlHints;
              }
            }
          } catch { /* best-effort */ }

          // 3. Calendar events
          try {
            const calendarEvents = await invoke<Array<{
              summary: string;
              start: string;
              end: string;
              description?: string;
              attendees: string[];
              location?: string;
            }>>("kb_calendar_upcoming", { maxResults: 5 });
            if (calendarEvents && calendarEvents.length > 0) {
              const now = new Date();
              const calContext = calendarEvents.map((ev) => {
                const start = new Date(ev.start);
                const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
                const timeLabel = diffMin > 0 ? `in ${diffMin} min` : diffMin === 0 ? "now" : `${Math.abs(diffMin)} min ago`;
                let line = `- ${ev.summary} (${timeLabel}, ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
                if (ev.attendees.length > 0) line += ` — with: ${ev.attendees.slice(0, 5).join(", ")}`;
                if (ev.location) line += ` — ${ev.location}`;
                return line;
              }).join("\n");
              enrichedSystemPrompt += `\n\n--- Upcoming calendar events ---\n${calContext}\n---`;
            }
          } catch { /* best-effort */ }
        }

        // Only send images if the current model/provider supports vision
        const canSendImages =
          imagesBase64.length > 0 &&
          supportsImages &&
          (useLamuAPI || provider?.curl.includes("{{IMAGE}}"));

        // If the user attached images but the current setup can't handle them,
        // surface a clear error instead of silently dropping.
        if (imagesBase64.length > 0 && !canSendImages) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: useLamuAPI
              ? "The selected model does not support images. Please choose a vision-capable model."
              : "The selected provider does not support image input. Switch to a vision-capable provider (e.g. groq-vision).",
          }));
          return;
        }

        try {
          // Use the fetchAIResponse function with signal
          for await (const chunk of fetchAIResponse({
            provider: useLamuAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: enrichedSystemPrompt || undefined,
            history: messageHistory,
            userMessage: input,
            imagesBase64: canSendImages ? imagesBase64 : [],
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

            // Update the last message (assistant's response) in real-time
            const assistantMsg: ChatMessage = {
              id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
              role: "assistant",
              content: fullResponse,
              timestamp: timestamp + MESSAGE_ID_OFFSET,
            };

            const updatedWithResponse = {
              ...updatedMessages,
              messages: [...updatedMessages.messages, assistantMsg],
            };

            // Check if assistant message already exists
            const lastMessage =
              updatedWithResponse.messages[
                updatedWithResponse.messages.length - 1
              ];
            if (lastMessage.role === "assistant") {
              // Update existing assistant message
              updatedWithResponse.messages[
                updatedWithResponse.messages.length - 1
              ] = assistantMsg;
            } else {
              // Add new assistant message
              updatedWithResponse.messages.push(assistantMsg);
            }

            setMessages(updatedWithResponse);

            // Auto-scroll during streaming
            scrollToBottom();
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

        setState((prev) => ({ ...prev, isLoading: false }));

        // Focus input after AI response is complete
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        // Save the conversation after successful completion
        if (fullResponse) {
          const assistantMsg: ChatMessage = {
            id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
            role: "assistant",
            content: fullResponse,
            timestamp: timestamp + MESSAGE_ID_OFFSET,
          };

          const newMessages = [
            ...(messages?.messages || []),
            userMsg,
            assistantMsg,
          ];

          // Get existing conversation if updating
          let existingConversation = null;
          if (conversationId) {
            try {
              existingConversation = await getConversationById(conversationId);
            } catch (error) {
              console.error("Failed to get existing conversation:", error);
            }
          }

          const title =
            existingConversation?.title ||
            messages?.title ||
            generateConversationTitle(input);

          const conversation: ChatConversation = {
            id: conversationId,
            title,
            messages: newMessages,
            createdAt:
              existingConversation?.createdAt ||
              messages?.createdAt ||
              timestamp,
            updatedAt: timestamp,
          };

          try {
            await saveConversation(conversation);

            // Optionally sync to backend if user has given consent
            if (syncEnabled) {
              invoke("sync_conversation", {
                conversationId: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                messages: conversation.messages.map((m) => ({
                  id: m.id,
                  conversationId: conversation.id,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                  attachedFiles: null, // never sync file data
                })),
              }).catch(() => {}); // fire-and-forget — never block UI
            }

            // Reload conversation from database to ensure consistency
            const updatedConversation = await getConversationById(
              conversationId
            );
            if (updatedConversation) {
              setMessages(updatedConversation);
            }
          } catch (error) {
            console.error("Failed to save conversation:", error);
            setState((prev) => ({
              ...prev,
              error: "Failed to save conversation. Please try again.",
            }));
          }
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
      messages,
      conversationId,
      setMessages,
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

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

          // Store files temporarily and submit
          setState((prev) => ({
            ...prev,
            attachedFiles: [...prev.attachedFiles, attachedFile],
            input: prompt,
          }));

          // Submit with the prompt and screenshot
          setTimeout(() => submit(prompt), 100);
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
    [state.attachedFiles.length, submit]
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

  const captureScreenshot = useCallback(async () => {
    if (!handleScreenshotSubmit) return;

    const config = screenshotConfigRef.current;

    // Mark that this context initiated the screenshot
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
        // Reset flag after processing
        screenshotInitiatedByThisContext.current = false;
      } else {
        // Selection Mode: Open overlay to select an area
        // Only allow if user has screenshot feature in their plan
        if (!hasPlanFeature("screenshot")) {
          setState((prev) => ({
            ...prev,
            error: "Selection mode requires an active license with screenshot access",
          }));
          setIsScreenshotLoading(false);
          screenshotInitiatedByThisContext.current = false;
          return;
        }
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
  }, [handleScreenshotSubmit, hasPlanFeature]);

  useEffect(() => {
    let unlisten: any;

    const setupListener = async () => {
      unlisten = await listen("captured-selection", async (event: any) => {
        // Only process if this context initiated the screenshot
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

  return {
    input: state.input,
    setInput,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    submit,
    cancel,
    setState,
    isRecording,
    setIsRecording,
    micOpen,
    setMicOpen,
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotSubmit,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    captureScreenshot,
    isScreenshotLoading,
    messagesEndRef,
    selectedSttProvider,
    allSttProviders,
    selectedAudioDevices,
    hasActiveLicense,
  };
};
