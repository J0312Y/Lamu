import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface AppIconToggleProps {
  className?: string;
}

export const AppIconToggle = ({ className }: AppIconToggleProps) => {
  const { customizable, toggleAppIconVisibility } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAppIconVisibility(checked);
  };

  return (
    <div id="app-icon" className={`space-y-2 ${className}`}>
      <Header
        title="Mode discret — icône de l'application"
        description="Contrôle la visibilité de l'icône dans le dock/la barre des tâches quand la fenêtre est masquée"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {!customizable.appIcon.isVisible
                ? "Afficher l'icône dans le dock/la barre des tâches"
                : "Masquer l'icône du dock/de la barre des tâches"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {`Basculer pour rendre l'icône ${
                !customizable.appIcon.isVisible ? "visible" : "masquée"
              }`}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.appIcon.isVisible}
          onCheckedChange={handleSwitchChange}
          aria-label="Basculer la visibilité de l'icône"
        />
      </div>
    </div>
  );
};
