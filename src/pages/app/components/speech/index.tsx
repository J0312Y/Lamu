import { useState, useCallback, useEffect } from "react";
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ScrollArea,
} from "@/components";
import {
  HeadphonesIcon,
  AlertCircleIcon,
  LoaderIcon,
  AudioLinesIcon,
  CameraIcon,
  ClipboardPasteIcon,
  DownloadIcon,
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VolumeXIcon,
  PlusIcon,
  XIcon,
  RadioIcon,
  BookOpenIcon,
  BookMarkedIcon,
  SparklesIcon,
  FileTextIcon,
  BotIcon,
  PlugIcon,
} from "lucide-react";
import { exportTranscriptAsTxt, exportTranscriptAsSrt } from "@/lib/exportUtils";
import { ASSISTANT_MODES, type AssistantMode } from "@/config";
import { invoke } from "@tauri-apps/api/core";
import { ModeSwitcher } from "./ModeSwitcher";
import { RecordingPanel } from "./RecordingPanel";
import { ResultsSection } from "./ResultsSection";
import { SettingsPanel } from "./SettingsPanel";
import { PermissionFlow } from "./PermissionFlow";
import { QuickActions } from "./QuickActions";
import { Warning } from "./Warning";
import { ValidationModal } from "./ValidationModal";
import { ResumeRunBanner } from "./ResumeRunBanner";
import { EmailDraftModal } from "./EmailDraftModal";
import { MeetingSummaryModal } from "./MeetingSummaryModal";
import { PlaybookModal } from "./PlaybookModal";
import { CalendarWidget } from "./CalendarWidget";
import { CoachingTip } from "./CoachingTip";
import { ActionConfirmModal } from "./ActionConfirmModal";
import { SqlApprovalModal } from "./SqlApprovalModal";
import { KnowledgeBasePanel } from "../knowledge/KnowledgeBasePanel";
import { AgentPanel } from "./AgentPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { useSystemAudioType, useKnowledgeBase } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";

export const SystemAudio = (props: useSystemAudioType) => {
  const {
    capturing,
    isProcessing,
    isAIProcessing,
    lastTranscription,
    lastAIResponse,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    isPopoverOpen,
    setIsPopoverOpen,
    useSystemPrompt,
    setUseSystemPrompt,
    contextContent,
    setContextContent,
    startNewConversation,
    conversation,
    resizeWindow,
    quickActions,
    addQuickAction,
    removeQuickAction,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    handleQuickActionClick,
    vadConfig,
    updateVadConfiguration,
    isRecordingInContinuousMode,
    recordingProgress,
    manualStopAndSend,
    startContinuousRecording,
    ignoreContinuousRecording,
    scrollAreaRef,
    meetingModeActive,
    toggleMeetingMode,
    assistantMode,
    setAssistantMode,
    meetingTranscript,
    meetingSummaryOpen,
    setMeetingSummaryOpen,
    meetingSummaryText,
    meetingSummaryGenerating,
    meetingSummarySaved,
    meetingSummaryDate,
    clipboardContext,
    pasteClipboard,
    clearClipboardContext,
    micCapturing,
    startMicCapture,
    stopMicCapture,
    setManualScreenshot,
    detectedApps,
    autoSpeakInMeeting,
    toggleAutoSpeak,
    autoMeetingEnabled,
    toggleAutoMeeting,
    exportConversation,
    generateMeetingSummary,
    playbookContext,
    setPlaybookContext,
    generateFollowUpEmail,
    coachingTip,
    coachingGenerating,
    coachingVisible,
    setCoachingVisible,
    generateCoachingTip,
    kbEnabled,
    setKbEnabled,
    // State Runtime + Human-in-the-Loop
    agentRuntime,
    requireValidation,
    setRequireValidation,
    pendingValidation,
    approveValidation,
    rejectValidation,
    resumeInterruptedRun,
    // Email
    pendingEmailDraft,
    dismissEmailDraft,
    // Actions
    pendingAction,
    pendingActionIntegrationName,
    dismissAction,
    executeAction,
    // SQL execution
    pendingSqlWrite,
    dbQueryResults,
    confirmSqlWrite,
  } = props;

  const { hasPlanFeature, supportsImages } = useApp();
  const kb = useKnowledgeBase();

  // View mode toggle
  const [conversationMode, setConversationMode] = useState(false);

  // Agent panel toggle
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);

  // Integrations panel toggle
  const [integrationsPanelOpen, setIntegrationsPanelOpen] = useState(false);

  // Playbook modal
  const [playbookOpen, setPlaybookOpen] = useState(false);

  // Screenshot state
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

  const isVadMode = vadConfig.enabled;
  const hasResponse = lastAIResponse || isAIProcessing;

  // Keyboard shortcut for Cmd+K to toggle view mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      // Cmd+K or Ctrl+K to toggle view mode
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setConversationMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen]);

  // Clear the preview when processing starts — the ref is consumed by processWithAI
  useEffect(() => {
    if (isProcessing && screenshotImage) {
      setScreenshotImage(null);
      // Do NOT clear manualScreenshotRef here — processWithAI hasn't run yet
    }
  }, [isProcessing, screenshotImage]);

  const handleToggleCapture = async () => {
    if (capturing) {
      await stopCapture();
    } else {
      await startCapture();
    }
  };

  const handleModeChange = (vadEnabled: boolean) => {
    updateVadConfiguration({
      ...vadConfig,
      enabled: vadEnabled,
    });
  };

  // Capture screenshot functionality
  const handleCaptureScreenshot = useCallback(async () => {
    if (isCapturingScreenshot) return;

    setIsCapturingScreenshot(true);
    try {
      // Check screen recording permission on macOS
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac")) {
        const {
          checkScreenRecordingPermission,
          requestScreenRecordingPermission,
        } = await import("tauri-plugin-macos-permissions-api");

        const hasPermission = await checkScreenRecordingPermission();
        if (!hasPermission) {
          await requestScreenRecordingPermission();
          setIsCapturingScreenshot(false);
          return;
        }
      }

      // Capture screenshot
      const base64: string = await invoke("capture_to_base64");

      setScreenshotImage(base64);
      setManualScreenshot(base64);
    } catch (err) {
      console.error("Failed to capture screenshot:", err);
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [isCapturingScreenshot]);

  const handleRemoveScreenshot = useCallback(() => {
    setScreenshotImage(null);
    setManualScreenshot(null);
  }, [setManualScreenshot]);

  const getButtonIcon = () => {
    if (setupRequired) return <AlertCircleIcon className="text-orange-500" />;
    if (error && !setupRequired)
      return <AlertCircleIcon className="text-red-500" />;
    if (isProcessing) return <LoaderIcon className="animate-spin" />;
    if (capturing)
      return <AudioLinesIcon className="text-green-500 animate-pulse" />;
    return <HeadphonesIcon />;
  };

  const getButtonTitle = () => {
    if (setupRequired) return "Setup required - Click for instructions";
    if (error && !setupRequired) return `Error: ${error}`;
    if (isProcessing) return "Transcribing audio...";
    if (capturing) return "Stop system audio capture";
    return "Start system audio capture";
  };

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(open) => {
        if (capturing && !open) {
          return;
        }
        setIsPopoverOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          title={getButtonTitle()}
          onClick={handleToggleCapture}
          className={cn(
            capturing && !meetingModeActive && "bg-green-50 hover:bg-green-100",
            meetingModeActive && "bg-green-600 hover:bg-green-700 text-white",
            error && "bg-red-100 hover:bg-red-200"
          )}
        >
          {meetingModeActive && !isProcessing && !setupRequired
            ? <RadioIcon className="text-white animate-pulse" />
            : getButtonIcon()}
        </Button>
      </PopoverTrigger>

      {(capturing || setupRequired || error) && (
        <PopoverContent
          align="end"
          side="bottom"
          className="select-none w-screen p-0 border shadow-lg overflow-hidden border-input/50"
          sideOffset={8}
        >
          <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
            {/* Header - Mode Switcher + Actions */}
            <div className="flex-shrink-0 p-3 border-b border-border/50 space-y-2">
              {/* Row 1: VAD/Continuous switcher + actions */}
              <div className="flex items-center justify-between gap-2">
                {/* Mode Switcher */}
                {!setupRequired && (
                  <ModeSwitcher
                    isVadMode={isVadMode}
                    onModeChange={handleModeChange}
                    disabled={
                      isRecordingInContinuousMode ||
                      isProcessing ||
                      isAIProcessing
                    }
                  />
                )}
                {setupRequired && (
                  <h2 className="font-semibold text-sm">Setup Required</h2>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Mic Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={micCapturing ? "default" : "outline"}
                      onClick={micCapturing ? stopMicCapture : startMicCapture}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        micCapturing && "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                      )}
                      title={micCapturing ? "Stop microphone capture" : "Start microphone input"}
                    >
                      {micCapturing
                        ? <MicOffIcon className="w-3 h-3" />
                        : <MicIcon className="w-3 h-3" />}
                      Mic
                    </Button>
                  )}

                  {/* Screenshot Button */}
                  {hasPlanFeature("screenshot") && !setupRequired && supportsImages && (
                    <Button
                      size="sm"
                      variant={screenshotImage ? "default" : "outline"}
                      onClick={handleCaptureScreenshot}
                      disabled={isCapturingScreenshot}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        screenshotImage && "bg-primary text-primary-foreground"
                      )}
                      title="Capture screenshot to include with transcription"
                    >
                      {isCapturingScreenshot ? (
                        <LoaderIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        <CameraIcon className="w-3 h-3" />
                      )}
                      Screenshot
                    </Button>
                  )}

                  {/* Clipboard Paste Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={clipboardContext ? "default" : "outline"}
                      onClick={clipboardContext ? clearClipboardContext : pasteClipboard}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        clipboardContext && "bg-primary text-primary-foreground"
                      )}
                      title={clipboardContext ? "Clipboard attached — click to clear" : "Paste clipboard as AI context"}
                    >
                      <ClipboardPasteIcon className="w-3 h-3" />
                      {clipboardContext ? "Pasted" : "Paste"}
                    </Button>
                  )}

                  {/* Agent Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={agentPanelOpen ? "default" : "outline"}
                      onClick={() => { setAgentPanelOpen(p => !p); setIntegrationsPanelOpen(false); }}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        agentPanelOpen && "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
                      )}
                      title="Ouvrir le panneau agent autonome"
                    >
                      <BotIcon className="w-3 h-3" />
                      Agent
                    </Button>
                  )}

                  {/* Integrations Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={integrationsPanelOpen ? "default" : "outline"}
                      onClick={() => { setIntegrationsPanelOpen(p => !p); setAgentPanelOpen(false); }}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        integrationsPanelOpen && "bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600"
                      )}
                      title="Gérer les intégrations (GitHub, Jira, Slack…)"
                    >
                      <PlugIcon className="w-3 h-3" />
                      Intégrations
                    </Button>
                  )}

                  {/* Playbook Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={playbookContext ? "default" : "outline"}
                      onClick={() => setPlaybookOpen(true)}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        playbookContext && "bg-primary text-primary-foreground"
                      )}
                      title={playbookContext ? "Playbook loaded — click to edit" : "Load a playbook document for this session"}
                    >
                      <BookMarkedIcon className="w-3 h-3" />
                      {playbookContext ? "Playbook ✓" : "Playbook"}
                    </Button>
                  )}

                  {/* Export Button */}
                  {!setupRequired && conversation.messages.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={exportConversation}
                      className="h-6 text-[10px] gap-1 px-2"
                      title="Export conversation as Markdown"
                    >
                      <DownloadIcon className="w-3 h-3" />
                      Export
                    </Button>
                  )}

                  {/* Summary Button */}
                  {!setupRequired && meetingTranscript.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => generateMeetingSummary(meetingTranscript)}
                      className="h-6 text-[10px] gap-1 px-2"
                      title="Generate meeting summary"
                    >
                      <BookOpenIcon className="w-3 h-3" />
                      Summary
                    </Button>
                  )}

                  {/* Coaching Button */}
                  {!setupRequired && meetingTranscript.length > 0 && (
                    <Button
                      size="sm"
                      variant={coachingVisible ? "default" : "ghost"}
                      onClick={() => {
                        if (coachingVisible) {
                          setCoachingVisible(false);
                        } else {
                          generateCoachingTip(meetingTranscript);
                        }
                      }}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2",
                        coachingVisible && "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                      )}
                      title="Get real-time coaching tip"
                    >
                      <SparklesIcon className="w-3 h-3" />
                      Coach
                    </Button>
                  )}

                  {/* Transcript Download Buttons */}
                  {!setupRequired && meetingTranscript.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => exportTranscriptAsTxt(meetingTranscript)}
                        className="h-6 text-[10px] gap-1 px-2"
                        title="Télécharger la transcription (.txt)"
                      >
                        <FileTextIcon className="w-3 h-3" />
                        .txt
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => exportTranscriptAsSrt(meetingTranscript)}
                        className="h-6 text-[10px] gap-1 px-2"
                        title="Télécharger la transcription (.srt)"
                      >
                        <FileTextIcon className="w-3 h-3" />
                        .srt
                      </Button>
                    </>
                  )}

                  {/* New Conversation Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startNewConversation}
                      className="h-6 text-[10px] gap-1 px-2"
                      title="Start a new conversation"
                    >
                      <PlusIcon className="w-3 h-3" />
                      New
                    </Button>
                  )}

                  {/* Close Button */}
                  {!capturing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Close"
                      onClick={() => {
                        setIsPopoverOpen(false);
                        resizeWindow(false);
                      }}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Row 2: Meeting mode toggle + assistant mode selector */}
              {!setupRequired && (
                <div className="flex items-center gap-2">
                  {/* Meeting mode toggle */}
                  <Button
                    size="sm"
                    variant={meetingModeActive ? "default" : "outline"}
                    onClick={toggleMeetingMode}
                    className={cn(
                      "h-6 text-[10px] gap-1 px-2 flex-shrink-0",
                      meetingModeActive &&
                        "bg-green-600 hover:bg-green-700 text-white border-green-600"
                    )}
                    title={
                      meetingModeActive
                        ? "Meeting mode ON — always listening, auto-restarts after each response"
                        : "Enable meeting mode — always-on automatic listening"
                    }
                  >
                    <RadioIcon className="w-3 h-3" />
                    {meetingModeActive ? "Live" : "Meeting"}
                    {meetingModeActive && meetingTranscript.length > 0 && (
                      <span className="ml-0.5 opacity-70">
                        ({meetingTranscript.length / 2 | 0})
                      </span>
                    )}
                  </Button>

                  {/* Auto-speak toggle (only visible in meeting mode) */}
                  {meetingModeActive && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn("h-6 w-6", autoSpeakInMeeting && "text-primary")}
                      title={autoSpeakInMeeting ? "Auto-speak ON — click to disable" : "Auto-speak OFF — click to enable"}
                      onClick={() => toggleAutoSpeak(!autoSpeakInMeeting)}
                    >
                      {autoSpeakInMeeting
                        ? <Volume2Icon className="w-3 h-3" />
                        : <VolumeXIcon className="w-3 h-3" />}
                    </Button>
                  )}

                  {/* Assistant mode pills */}
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {ASSISTANT_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setAssistantMode(mode.id as AssistantMode)}
                        className={cn(
                          "flex-shrink-0 h-6 px-2 rounded-full text-[10px] font-medium border transition-colors",
                          assistantMode === mode.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        )}
                        title={mode.label}
                      >
                        {mode.emoji} {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Meeting app detected indicator */}
              {detectedApps.length > 0 && !meetingModeActive && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                  <span className="text-[9px] text-muted-foreground">
                    {detectedApps.join(", ")} detected — meeting mode auto-enabled
                  </span>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
              <div className="p-2 space-y-2">
                {/* Screenshot Preview */}
                {screenshotImage && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <img
                      src={`data:image/png;base64,${screenshotImage}`}
                      alt="Screenshot"
                      className="h-12 w-20 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium">
                        Screenshot attached
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        Will be sent with next transcription
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={handleRemoveScreenshot}
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Error Display */}
                {error && !setupRequired && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircleIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-medium text-red-800">
                        Error
                      </p>
                      <p className="text-[10px] text-red-700">{error}</p>
                    </div>
                  </div>
                )}

                {/* Setup Required - Permission Flow */}
                {setupRequired ? (
                  <PermissionFlow
                    onPermissionGranted={() => {
                      startCapture();
                    }}
                    onPermissionDenied={() => {
                      // Keep showing setup instructions
                    }}
                  />
                ) : (
                  <>
                    {/* Resume Interrupted Run Banners */}
                    {agentRuntime.interruptedRuns.map((run) => (
                      <ResumeRunBanner
                        key={run.id}
                        run={run}
                        onResume={resumeInterruptedRun}
                        onDiscard={agentRuntime.discardRun}
                      />
                    ))}

                    {/* Human-in-the-Loop Validation Modal */}
                    {pendingValidation && (
                      <ValidationModal
                        artifact={pendingValidation}
                        onApprove={approveValidation}
                        onReject={rejectValidation}
                        isProcessing={isAIProcessing}
                      />
                    )}

                    {/* Email Draft Modal */}
                    {pendingEmailDraft && (
                      <EmailDraftModal
                        draft={pendingEmailDraft}
                        onSend={async (updated) => {
                          await invoke("email_send", {
                            req: {
                              to_name: updated.to_name,
                              to_email: updated.to_email,
                              subject: updated.subject,
                              body: updated.body,
                            },
                          });
                          dismissEmailDraft();
                        }}
                        onDiscard={dismissEmailDraft}
                      />
                    )}

                    {/* SQL Results + Write Approval */}
                    {(pendingSqlWrite || (dbQueryResults && dbQueryResults.length > 0)) && (
                      <SqlApprovalModal
                        pendingWrite={pendingSqlWrite}
                        onConfirm={confirmSqlWrite}
                        readResults={dbQueryResults}
                      />
                    )}

                    {/* Recording Panel */}
                    <RecordingPanel
                      isVadMode={isVadMode}
                      isRecording={isRecordingInContinuousMode}
                      isProcessing={isProcessing}
                      isAIProcessing={isAIProcessing}
                      recordingProgress={recordingProgress}
                      maxDuration={vadConfig.max_recording_duration_secs}
                      speechInProgressMs={props.speechInProgressMs}
                      interimTranscription={props.interimTranscription}
                      onStartRecording={startContinuousRecording}
                      onStopAndSend={manualStopAndSend}
                      onIgnore={ignoreContinuousRecording}
                    />

                    {/* Coaching Tip */}
                    {coachingVisible && (
                      <CoachingTip
                        tip={coachingTip}
                        isGenerating={coachingGenerating}
                        onRefresh={() => generateCoachingTip(meetingTranscript)}
                        onDismiss={() => setCoachingVisible(false)}
                      />
                    )}

                    {/* AI Response */}
                    <ResultsSection
                      lastTranscription={lastTranscription}
                      lastAIResponse={lastAIResponse}
                      isAIProcessing={isAIProcessing}
                      conversation={conversation}
                      conversationMode={conversationMode}
                      setConversationMode={setConversationMode}
                    />

                    {/* Settings Panel */}
                    <SettingsPanel
                      vadConfig={vadConfig}
                      onUpdateVadConfig={updateVadConfiguration}
                      useSystemPrompt={useSystemPrompt}
                      setUseSystemPrompt={setUseSystemPrompt}
                      contextContent={contextContent}
                      setContextContent={setContextContent}
                      autoMeetingEnabled={autoMeetingEnabled}
                      toggleAutoMeeting={toggleAutoMeeting}
                      autoSpeakInMeeting={autoSpeakInMeeting}
                      toggleAutoSpeak={toggleAutoSpeak}
                      requireValidation={requireValidation}
                      setRequireValidation={setRequireValidation}
                      emailEnabled={props.emailEnabled}
                      setEmailEnabled={props.setEmailEnabled}
                      autoSendEmail={props.autoSendEmail}
                      setAutoSendEmail={props.setAutoSendEmail}
                      sttLanguage={props.sttLanguage}
                      setSttLanguage={props.setSttLanguage}
                    />

                    {/* Agent Panel */}
                    {agentPanelOpen && (
                      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5">
                        <AgentPanel
                          apiBase={import.meta.env.VITE_API_URL || "http://localhost:3000"}
                          authHeader={() => {
                            const key = (import.meta.env.VITE_API_KEY as string) || "";
                            return key ? { "X-API-Key": key } : {} as Record<string, string>;
                          }}
                          meetingTranscript={meetingTranscript.map((m) => `[${m.role}] ${m.text}`).join("\n")}
                        />
                      </div>
                    )}

                    {/* Integrations Panel */}
                    {integrationsPanelOpen && (
                      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                        <IntegrationsPanel
                          apiBase={import.meta.env.VITE_API_URL || "http://localhost:3000"}
                          authHeader={() => {
                            const key = (import.meta.env.VITE_API_KEY as string) || "";
                            return key ? { "X-API-Key": key } : {} as Record<string, string>;
                          }}
                        />
                      </div>
                    )}

                    {/* Knowledge Base Panel */}
                    <KnowledgeBasePanel
                      kb={kb}
                      kbEnabled={kbEnabled}
                      onToggleKbEnabled={setKbEnabled}
                    />

                    {/* Google Calendar Widget */}
                    <CalendarWidget
                      onLoadAsContext={(event) => {
                        const parts: string[] = [`Meeting: ${event.summary}`];
                        if (event.description) parts.push(event.description);
                        if (event.attendees.length > 0) parts.push(`Attendees: ${event.attendees.join(", ")}`);
                        setPlaybookContext(parts.join("\n\n"));
                      }}
                    />

                    {/* Help/Keyboard Shortcuts */}
                    <Warning isVadMode={isVadMode} />
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Quick Actions */}
            {!setupRequired && hasResponse && (
              <div className="flex-shrink-0 border-t border-border/50 p-2">
                <QuickActions
                  actions={quickActions}
                  onActionClick={handleQuickActionClick}
                  onAddAction={addQuickAction}
                  onRemoveAction={removeQuickAction}
                  isManaging={isManagingQuickActions}
                  setIsManaging={setIsManagingQuickActions}
                  show={showQuickActions}
                  setShow={setShowQuickActions}
                />
              </div>
            )}
          </div>
        </PopoverContent>
      )}

      {/* Action Confirm Modal */}
      <ActionConfirmModal
        action={pendingAction ?? null}
        integrationName={pendingActionIntegrationName}
        onConfirm={async (action) => { await executeAction(action); }}
        onDismiss={dismissAction}
      />

      {/* Meeting Summary Modal */}
      <MeetingSummaryModal
        open={meetingSummaryOpen}
        summary={meetingSummaryText}
        isGenerating={meetingSummaryGenerating}
        savedToKb={meetingSummarySaved}
        meetingDate={meetingSummaryDate}
        onClose={() => setMeetingSummaryOpen(false)}
        onGenerateFollowUp={generateFollowUpEmail}
      />

      {/* Playbook Modal */}
      <PlaybookModal
        open={playbookOpen}
        current={playbookContext}
        onSave={setPlaybookContext}
        onClose={() => setPlaybookOpen(false)}
      />
    </Popover>
  );
};
