import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface AutostartToggleProps {
  className?: string;
}

export const AutostartToggle = ({ className }: AutostartToggleProps) => {
  const { customizable, toggleAutostart } = useApp();

  const isEnabled = customizable?.autostart?.isEnabled ?? true;

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAutostart(checked);
  };

  return (
    <div id="autostart" className={`space-y-2 ${className}`}>
      <Header
        title="Lancer au démarrage"
        description="Ouvrir automatiquement Lamu au démarrage du système"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">Ouvrir au démarrage</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {isEnabled
                ? "Lamu se lancera automatiquement au démarrage du système"
                : "Lamu ne se lancera pas automatiquement"}
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleSwitchChange}
          aria-label="Basculer le démarrage automatique"
        />
      </div>
    </div>
  );
};
