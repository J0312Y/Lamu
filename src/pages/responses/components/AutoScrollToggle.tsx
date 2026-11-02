import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";
import { useState, useEffect } from "react";
import { getResponseSettings, updateAutoScroll } from "@/lib";

export const AutoScrollToggle = () => {
  const { isBlocked } = useApp();
  const locked = isBlocked;
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    const settings = getResponseSettings();
    setAutoScroll(settings.autoScroll);
  }, []);

  const handleSwitchChange = (checked: boolean) => {
    if (locked) {
      return;
    }
    setAutoScroll(checked);
    updateAutoScroll(checked);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Défilement automatique"
        description="Contrôlez si les réponses défilent automatiquement vers le bas. Ce paramètre s'applique immédiatement et contrôle si les réponses défilent automatiquement vers le dernier contenu au fil du flux"
        isMainTitle
      />

      <div className="flex items-center justify-between p-4 border rounded-xl">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {autoScroll ? "Défilement automatique activé" : "Défilement automatique désactivé"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {autoScroll
                ? "Les réponses défileront automatiquement vers le bas à leur arrivée"
                : "Les réponses resteront à votre position de défilement actuelle"}
            </p>
          </div>
        </div>
        <Switch
          checked={autoScroll}
          onCheckedChange={handleSwitchChange}
          disabled={locked}
          title={`Basculer pour ${!autoScroll ? "activer" : "désactiver"} le défilement automatique`}
          aria-label={`Basculer pour ${
            autoScroll ? "désactiver" : "activer"
          } le défilement automatique`}
        />
      </div>
    </div>
  );
};
