import {
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Header,
} from "@/components";
import { UseSettingsReturn } from "@/types";
import { LaptopMinimalIcon, MousePointer2Icon } from "lucide-react";
import { useApp } from "@/contexts";


export const ScreenshotConfigs = ({
  screenshotConfiguration,
  handleScreenshotModeChange,
  handleScreenshotPromptChange,
  handleScreenshotEnabledChange,
}: UseSettingsReturn) => {
  const { isBlocked } = useApp();
  const locked = isBlocked;
  return (
    <div id="screenshot" className="space-y-3">
      <div className="space-y-3">
        {/* Screenshot Capture Mode: Selection and Screenshot */}
        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Méthode de capture"
              description={
                screenshotConfiguration.enabled
                  ? "Mode Capture d'écran : Capturez rapidement tout l'écran en un clic."
                  : "Mode Sélection : Cliquez et faites glisser pour sélectionner une zone spécifique à capturer."
              }
            />
          </div>
          <Select
            value={screenshotConfiguration.enabled ? "screenshot" : "selection"}
            onValueChange={(value) =>
              handleScreenshotEnabledChange(value === "screenshot")
            }
          >
            <SelectTrigger className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                {screenshotConfiguration.enabled ? (
                  <LaptopMinimalIcon className="size-4" />
                ) : (
                  <MousePointer2Icon className="size-4" />
                )}
                <div className="text-sm font-medium">
                  {screenshotConfiguration.enabled
                    ? "Mode Capture d'écran"
                    : "Mode Sélection"}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selection" disabled={locked}>
                <div className="flex items-center gap-2">
                  <MousePointer2Icon className="size-4" />
                  <div className="font-medium">Mode Sélection</div>
                  {locked && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      Une licence active est requise pour utiliser le mode Sélection.
                    </span>
                  )}
                </div>
              </SelectItem>
              <SelectItem value="screenshot" className="flex flex-row gap-2">
                <LaptopMinimalIcon className="size-4" />
                <div className="font-medium">Mode Capture d'écran</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mode Selection: Auto and Manual */}
        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Mode de traitement"
              description={
                screenshotConfiguration.mode === "manual"
                  ? "Les captures seront ajoutées automatiquement à vos fichiers joints. Vous pouvez ensuite les soumettre avec votre propre prompt. Plusieurs captures peuvent être effectuées et soumises ultérieurement."
                  : "Les captures seront automatiquement soumises à l'IA avec votre prompt personnalisé. Aucune intervention manuelle requise. Une seule capture peut être soumise à la fois."
              }
            />
          </div>
          <Select
            value={screenshotConfiguration.mode}
            onValueChange={handleScreenshotModeChange}
          >
            <SelectTrigger className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">
                  {screenshotConfiguration.mode === "auto" ? "Automatique" : "Manuel"}{" "}
                  Mode
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">
                <div className="font-medium">Mode Manuel</div>
              </SelectItem>
              <SelectItem value="auto">
                <div className="font-medium">Mode Automatique</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Auto Prompt Input - Only show when auto mode is selected */}
        {screenshotConfiguration.mode === "auto" && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Prompt automatique</Label>
            <Input
              placeholder="Saisissez un prompt pour l'analyse automatique des captures..."
              value={screenshotConfiguration.autoPrompt}
              onChange={(e) => handleScreenshotPromptChange(e.target.value)}
              className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              Ce prompt sera utilisé automatiquement lors de la prise de captures
            </p>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="text-xs text-muted-foreground/70">
        <p>
          💡 <strong>Tip:</strong>{" "}
          {screenshotConfiguration.enabled
            ? "Le mode Capture d'écran prend l'intégralité de l'écran en un clic."
            : "Le mode Sélection vous permet de choisir des zones spécifiques à capturer."}{" "}
          Le mode automatique est idéal pour une analyse rapide, le mode manuel offre plus de contrôle.
        </p>
      </div>
    </div>
  );
};
