import { useState } from "react";
import {
  Button,
  Label,
  Slider,
  Switch,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
} from "@/components";
import {
  ChevronDownIcon,
  SettingsIcon,
  WandIcon,
  RotateCcwIcon,
  ChevronUpIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { VadConfig } from "@/hooks/useSystemAudio";
import {
  PROMPT_TEMPLATES,
  getPromptTemplateById,
} from "@/lib/platform-instructions";
import { cn } from "@/lib/utils";

// Sensitivity presets for simpler UX
const SENSITIVITY_PRESETS = {
  low: {
    sensitivity_rms: 0.06,
    noise_gate_threshold: 0.02,
    label: "Faible",
    description: "Voix forte uniquement — bruit ambiant fort",
  },
  normal: {
    sensitivity_rms: 0.04,
    noise_gate_threshold: 0.015,
    label: "Normal",
    description: "Équilibré pour la plupart des environnements",
  },
  high: {
    sensitivity_rms: 0.02,
    noise_gate_threshold: 0.008,
    label: "Élevée",
    description: "Capture les voix faibles — environnement silencieux",
  },
} as const;

type SensitivityPreset = keyof typeof SENSITIVITY_PRESETS;

// Import expanded language list (32 languages including auto-detect)
import { STT_LANGUAGES as STT_LANGUAGES_CONFIG } from "@/config/sttLanguages";
const STT_LANGUAGES = STT_LANGUAGES_CONFIG.map((l) => ({ code: l.code, label: `${l.flag} ${l.nativeName}` }));

interface SettingsPanelProps {
  // VAD Config
  vadConfig: VadConfig;
  onUpdateVadConfig: (config: VadConfig) => void;
  // Context settings
  useSystemPrompt: boolean;
  setUseSystemPrompt: (value: boolean) => void;
  contextContent: string;
  setContextContent: (content: string) => void;
  // Meeting mode settings
  autoMeetingEnabled: boolean;
  toggleAutoMeeting: (enabled: boolean) => void;
  autoSpeakInMeeting: boolean;
  toggleAutoSpeak: (enabled: boolean) => void;
  // Human-in-the-Loop
  requireValidation: boolean;
  setRequireValidation: (enabled: boolean) => void;
  // Email
  emailEnabled: boolean;
  setEmailEnabled: (enabled: boolean) => void;
  autoSendEmail?: boolean;
  setAutoSendEmail?: (enabled: boolean) => void;
  // STT language
  sttLanguage: string;
  setSttLanguage: (lang: string) => void;
}

export const SettingsPanel = ({
  vadConfig,
  onUpdateVadConfig,
  useSystemPrompt,
  setUseSystemPrompt,
  contextContent,
  setContextContent,
  autoMeetingEnabled,
  toggleAutoMeeting,
  autoSpeakInMeeting,
  toggleAutoSpeak,
  requireValidation,
  setRequireValidation,
  emailEnabled,
  setEmailEnabled,
  sttLanguage,
  setSttLanguage,
}: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [smtpWarning, setSmtpWarning] = useState<string | null>(null);

  const handleEmailToggle = async (enabled: boolean) => {
    setEmailEnabled(enabled);
    setSmtpWarning(null);
    if (enabled) {
      try {
        const config = await invoke<{ smtp_host: string; smtp_port: number; smtp_user: string }>("email_config_get");
        if (!config.smtp_host || !config.smtp_user) {
          setSmtpWarning("SMTP non configuré — allez dans la page Email du dashboard pour configurer l'envoi.");
        }
      } catch {
        setSmtpWarning("SMTP non configuré — allez dans la page Email du dashboard pour configurer l'envoi.");
      }
    }
  };

  // Determine current sensitivity preset based on values
  const getCurrentPreset = (): SensitivityPreset | "custom" => {
    for (const [key, preset] of Object.entries(SENSITIVITY_PRESETS)) {
      if (
        Math.abs(vadConfig.sensitivity_rms - preset.sensitivity_rms) < 0.001 &&
        Math.abs(vadConfig.noise_gate_threshold - preset.noise_gate_threshold) <
          0.001
      ) {
        return key as SensitivityPreset;
      }
    }
    return "custom";
  };

  const currentPreset = getCurrentPreset();

  const handlePresetChange = (preset: SensitivityPreset) => {
    const presetValues = SENSITIVITY_PRESETS[preset];
    onUpdateVadConfig({
      ...vadConfig,
      sensitivity_rms: presetValues.sensitivity_rms,
      noise_gate_threshold: presetValues.noise_gate_threshold,
    });
  };

  const handleTemplateSelection = (templateId: string) => {
    const template = getPromptTemplateById(templateId);
    if (template) {
      setContextContent(template.prompt);
      setSelectedTemplate("");
    }
  };

  const handleResetDefaults = () => {
    const defaultConfig: VadConfig = {
      enabled: vadConfig.enabled, // Keep current mode
      hop_size: 1024,
      sensitivity_rms: 0.012,
      peak_threshold: 0.035,
      silence_chunks: 45,
      min_speech_chunks: 7,
      pre_speech_chunks: 12,
      noise_gate_threshold: 0.003,
      max_recording_duration_secs: 180,
    };
    onUpdateVadConfig(defaultConfig);
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      {/* Settings Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Paramètres</span>
        </div>
        <ChevronDownIcon
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Settings Content */}
      {isOpen && (
        <div className="px-3 pb-3 space-y-4">
          {/* Recording Settings Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Enregistrement
            </h4>

            {/* Sensitivity Presets - Only for VAD mode */}
            {vadConfig.enabled && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Sensibilité vocale
                </Label>
                <div className="flex gap-2">
                  {(
                    Object.entries(SENSITIVITY_PRESETS) as [
                      SensitivityPreset,
                      (typeof SENSITIVITY_PRESETS)[SensitivityPreset]
                    ][]
                  ).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePresetChange(key)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                        currentPreset === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {currentPreset === "custom"
                    ? "Valeurs de sensibilité personnalisées"
                    : SENSITIVITY_PRESETS[currentPreset as SensitivityPreset]
                        .description}
                </p>
              </div>
            )}

            {/* Max Duration - Only for Manual mode */}
            {!vadConfig.enabled && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center justify-between">
                  <span>Durée max d'enregistrement</span>
                  <span className="text-muted-foreground font-normal">
                    {Math.round(vadConfig.max_recording_duration_secs / 60)} min
                  </span>
                </Label>
                <Slider
                  value={[vadConfig.max_recording_duration_secs / 60]}
                  onValueChange={([value]) =>
                    onUpdateVadConfig({
                      ...vadConfig,
                      max_recording_duration_secs: Math.round(value * 60),
                    })
                  }
                  min={1}
                  max={3}
                  step={0.5}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* STT Language */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Langue STT</Label>
            <Select value={sttLanguage} onValueChange={setSttLanguage}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STT_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-xs">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Indication pour Whisper — améliore la précision pour les langues non anglaises
            </p>
          </div>

          {/* Context Section */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Contexte IA
            </h4>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Utiliser le prompt système</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {useSystemPrompt
                    ? "Utilise le prompt par défaut des paramètres"
                    : "Utilise le contexte personnalisé ci-dessous"}
                </p>
              </div>
              <Switch
                checked={useSystemPrompt}
                onCheckedChange={setUseSystemPrompt}
              />
            </div>

            {/* Custom Context */}
            {!useSystemPrompt && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Select
                    value={selectedTemplate}
                    onValueChange={handleTemplateSelection}
                  >
                    <SelectTrigger className="w-auto h-7 text-xs">
                      <WandIcon className="w-3 h-3 mr-1.5" />
                      <SelectValue placeholder="Modèles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-xs py-1">
                          Remplir depuis un modèle
                        </SelectLabel>
                        {PROMPT_TEMPLATES.map((template) => (
                          <SelectItem
                            key={template.id}
                            value={template.id}
                            className="text-xs"
                          >
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Entrez un prompt système personnalisé et du contexte..."
                  value={contextContent}
                  onChange={(e) => setContextContent(e.target.value)}
                  className="min-h-24 resize-none text-xs"
                />
              </div>
            )}
          </div>

          {/* Meeting Mode Section */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Mode réunion
            </h4>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Activer auto sur les apps de réunion</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Démarre le mode réunion quand Zoom, Teams, etc. sont détectés
                </p>
              </div>
              <Switch
                checked={autoMeetingEnabled}
                onCheckedChange={toggleAutoMeeting}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Lecture auto des réponses</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Lire les réponses IA à voix haute en mode réunion
                </p>
              </div>
              <Switch
                checked={autoSpeakInMeeting}
                onCheckedChange={toggleAutoSpeak}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Rejoindre auto depuis le calendrier</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Démarre le mode réunion quand un événement Google Calendar commence
                </p>
              </div>
              <Switch
                checked={JSON.parse(localStorage.getItem("lamu_auto_join_calendar") || "{}").enabled || false}
                onCheckedChange={(checked) => {
                  const config = JSON.parse(localStorage.getItem("lamu_auto_join_calendar") || "{}");
                  localStorage.setItem("lamu_auto_join_calendar", JSON.stringify({ ...config, enabled: checked }));
                }}
              />
            </div>
          </div>

          {/* Human-in-the-Loop Section */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Contrôle
            </h4>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Validation avant IA</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Demander confirmation avant chaque appel IA
                </p>
              </div>
              <Switch
                checked={requireValidation}
                onCheckedChange={setRequireValidation}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Envoi d'email vocal</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Permettre à l'IA de rédiger et envoyer des emails
                </p>
              </div>
              <Switch
                checked={emailEnabled}
                onCheckedChange={handleEmailToggle}
              />
            </div>

            {smtpWarning && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangleIcon className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-400">{smtpWarning}</p>
              </div>
            )}

            {/* Auto-send toggle removed — deferred to post-MVP */}
          </div>

          {/* Advanced Settings Toggle */}
          <div className="pt-3 border-t border-border/50">
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>Paramètres avancés</span>
              {showAdvanced ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                {/* VAD-specific advanced settings */}
                {vadConfig.enabled && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>Sensibilité vocale (brut)</span>
                        <span className="text-muted-foreground font-normal">
                          {(vadConfig.sensitivity_rms * 1000).toFixed(1)}
                        </span>
                      </Label>
                      <Slider
                        value={[vadConfig.sensitivity_rms * 1000]}
                        onValueChange={([value]) =>
                          onUpdateVadConfig({
                            ...vadConfig,
                            sensitivity_rms: value / 1000,
                          })
                        }
                        min={1}
                        max={20}
                        step={0.5}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>Durée du silence</span>
                        <span className="text-muted-foreground font-normal">
                          {(
                            (vadConfig.silence_chunks * vadConfig.hop_size) /
                            44100
                          ).toFixed(1)}
                          s
                        </span>
                      </Label>
                      <Slider
                        value={[vadConfig.silence_chunks]}
                        onValueChange={([value]) =>
                          onUpdateVadConfig({
                            ...vadConfig,
                            silence_chunks: Math.round(value),
                          })
                        }
                        min={20}
                        max={180}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Temps d'attente après la fin de la parole
                      </p>
                    </div>
                  </>
                )}

                {/* Noise gate - both modes */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center justify-between">
                    <span>Porte de bruit</span>
                    <span className="text-muted-foreground font-normal">
                      {(vadConfig.noise_gate_threshold * 1000).toFixed(1)}
                    </span>
                  </Label>
                  <Slider
                    value={[vadConfig.noise_gate_threshold * 1000]}
                    onValueChange={([value]) =>
                      onUpdateVadConfig({
                        ...vadConfig,
                        noise_gate_threshold: value / 1000,
                      })
                    }
                    min={0}
                    max={10}
                    step={0.1}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Filtre le bruit de fond
                  </p>
                </div>

                {/* Reset button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetDefaults}
                  className="w-full text-xs"
                >
                  <RotateCcwIcon className="w-3 h-3 mr-1.5" />
                  Réinitialiser par défaut
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
