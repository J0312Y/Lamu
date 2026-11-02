import { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@/contexts";
import { MAX_FILES, LAMU_IDENTITY, EMAIL_ACTION_INSTRUCTIONS, EMAIL_DISABLED_HINT } from "@/config";
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
import { extractSqlBlocks, isWriteSql } from "@/lib/sqlUtils";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { EmailDraft } from "@/types/email";

/**
 * Extract the first complete JSON object that follows `marker:` in `text`.
 * Uses brace-counting to find the matching `}`, correctly handling nested
 * objects and string literals.
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
  const [pendingEmailDraft, setPendingEmailDraft] = useState<EmailDraft | null>(null);

  // Email feature enabled flag (same localStorage key as overlay)
  const emailEnabled = safeLocalStorage.getItem("email_enabled") === "true";

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
        let enrichedSystemPrompt = systemPrompt
          ? `${LAMU_IDENTITY}\n\n## Additional instructions\n${systemPrompt}`
          : LAMU_IDENTITY;
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
                  } catch (e) {
                    // Schema fetch failed — add a note so the AI knows to query INFORMATION_SCHEMA first
                    liveContextParts.push(`--- Database "${integ.name}" (${integ.provider}) --- Schema not available. Run: SHOW TABLES; first to discover table names.`);
                  }
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
                sqlHints += `\nYou can execute SQL queries — the system will automatically execute any query in a \`\`\`sql\`\`\` block.`;
                sqlHints += `\nRULES:`;
                sqlHints += `\n1. If the schema is provided above, use ONLY the exact table and column names from that schema. Do NOT invent table names.`;
                sqlHints += `\n2. If the schema is NOT available, first run \`\`\`sql\nSHOW TABLES;\n\`\`\` to discover actual table names, then query.`;
                sqlHints += `\n3. NEVER say "I cannot access the database" — you CAN via \`\`\`sql\`\`\` blocks.`;
                sqlHints += `\n4. NEVER prefix table names with the database name (e.g. use \`orders\` NOT \`dbname.orders\`). The connection is already on the correct database.`;
                sqlHints += `\n5. For reports: use aggregations (COUNT, SUM, AVG, GROUP BY). You can use multiple \`\`\`sql\`\`\` blocks.`;
                sqlHints += `\n6. NEVER invent fictional data. Generate ONLY SQL blocks and brief explanations. Real results appear after execution.`;
                if (isMySQL) sqlHints += `\n7. MySQL syntax. Never prefix tables with database name.`;
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

        // ── Inject email instructions (same logic as overlay) ──────────────
        const looksLikeEmailRequest = /\b(email|e-mail|mail|envoie|envoyer|send|message\s+à|write\s+to|rapport.*mail|mail.*rapport)\b/i.test(input);
        if (emailEnabled) {
          enrichedSystemPrompt += `\n\n${EMAIL_ACTION_INSTRUCTIONS}`;
        } else if (looksLikeEmailRequest) {
          enrichedSystemPrompt += `\n\n${EMAIL_DISABLED_HINT}`;
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

        // ── Auto-execute SQL blocks in AI response ──────────────────────
        try {
          const sqlBlocks = extractSqlBlocks(fullResponse);
          if (sqlBlocks.length > 0) {
            const integrations = await invoke<Array<{ id: string; provider: string; name: string }>>("kb_list_integrations");
            const dbIntegs = integrations.filter((i) => ["postgres", "mysql"].includes(i.provider));
            if (dbIntegs.length > 0) {
              const targetDb = dbIntegs[0];
              const reads = sqlBlocks.filter((s) => !isWriteSql(s));
              const writes = sqlBlocks.filter((s) => isWriteSql(s));

              if (reads.length > 0) {
                const resultParts: string[] = [];
                for (const sql of reads) {
                  try {
                    const data = await invoke<string>("kb_database_query", {
                      integrationId: targetDb.id, sql, allowWrite: false,
                    });
                    if (data && data.trim()) {
                      // kb_database_query returns pre-formatted text tables from Rust
                      resultParts.push(data);
                    }
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    resultParts.push(`❌ Error: ${msg}\nSQL: ${sql.replace(/\n/g, " ").slice(0, 150)}`);
                  }
                }

                if (resultParts.length > 0) {
                  fullResponse += `\n\n---\n**📊 ${targetDb.name}**\n\n${resultParts.join("\n\n")}`;
                }
              }

              if (writes.length > 0) {
                fullResponse += `\n\n---\n⚠️ **${writes.length} write operation(s) detected** (INSERT/UPDATE/DELETE). Use the overlay for write operations with approval workflow.`;
              }

              // Update the displayed message with SQL results
              const assistantMsgWithResults: ChatMessage = {
                id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
                role: "assistant",
                content: fullResponse,
                timestamp: timestamp + MESSAGE_ID_OFFSET,
              };
              const updatedWithResults = {
                ...updatedMessages,
                messages: [...updatedMessages.messages.filter(m => m.role !== "assistant" || m.id !== assistantMsgWithResults.id), assistantMsgWithResults],
              };
              setMessages(updatedWithResults);
              scrollToBottom();
            }
          }
        } catch { /* SQL execution is best-effort */ }

        // ── Detect email action from AI response ────────────────────────
        // Done AFTER SQL so fullResponse already contains the query results
        if (fullResponse && fullResponse.includes("LAMU_EMAIL")) {
          const emailJsonStr = extractJsonAfterMarker(fullResponse, "LAMU_EMAIL:");
          if (emailJsonStr) {
            try {
              const raw = JSON.parse(emailJsonStr) as {
                to?: string; subject?: string; body?: string;
              };

              // Enrich the email body with SQL results if they were appended to fullResponse
              let emailBody = (raw.body || "").replace(/\\n/g, "\n");
              // Check if fullResponse has SQL results (added after the ---\n**📊 marker)
              const sqlResultsMatch = fullResponse.match(/---\n\*\*📊.*?\*\*\n\n([\s\S]+?)$/);
              if (sqlResultsMatch) {
                emailBody += `\n\n--- Données extraites ---\n\n${sqlResultsMatch[1].trim()}`;
              }

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
              setPendingEmailDraft({
                to_name: toName,
                to_email: toEmail,
                to_query: toQuery,
                subject: raw.subject || "",
                body: emailBody,
                autoSend: false,
              });
            } catch { /* malformed JSON — ignore */ }
          }
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
    pendingEmailDraft,
    setPendingEmailDraft,
  };
};
