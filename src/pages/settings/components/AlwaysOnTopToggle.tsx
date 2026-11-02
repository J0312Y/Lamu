import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface AlwaysOnTopToggleProps {
  className?: string;
}

export const AlwaysOnTopToggle = ({ className }: AlwaysOnTopToggleProps) => {
  const { customizable, toggleAlwaysOnTop } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAlwaysOnTop(checked);
  };

  return (
    <div id="always-on-top" className={`space-y-2 ${className}`}>
      <Header
        title="Mode fenêtre au premier plan"
        description="Contrôle si la fenêtre reste au-dessus de toutes les autres applications"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {customizable.alwaysOnTop.isEnabled
                ? "Désactiver le premier plan"
                : "Activer le premier plan"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {customizable.alwaysOnTop.isEnabled
                ? "La fenêtre reste au-dessus de toutes les applications (par défaut)"
                : "La fenêtre se comporte comme une application normale"}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.alwaysOnTop.isEnabled}
          onCheckedChange={handleSwitchChange}
          title={`Basculer vers premier plan ${
            !customizable.alwaysOnTop.isEnabled ? "activé" : "désactivé"
          }`}
          aria-label={`Basculer vers premier plan ${
            customizable.alwaysOnTop.isEnabled ? "activé" : "désactivé"
          }`}
        />
      </div>
    </div>
  );
};
