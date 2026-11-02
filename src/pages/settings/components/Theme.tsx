import { useApp, useTheme } from "@/contexts";
import { Header, Label, Slider, Button } from "@/components";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components";

export const Theme = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();
  const { isBlocked } = useApp();
  const locked = isBlocked;

  return (
    <div id="theme" className="relative space-y-3">
      <Header
        title={`Personnalisation du thème${
          locked ? " (Une licence active est requise pour cette fonctionnalité)" : ""
        }`}
        description="Personnalisez votre expérience avec un thème et des paramètres de transparence"
        isMainTitle
      />

      {/* Theme Toggle */}
      <div
        className={`space-y-2 ${
          locked ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div>
              <Label className="text-sm font-medium flex items-center gap-2">
                {theme === "system" ? (
                  <>
                    <MonitorIcon className="h-4 w-4" />
                    Système
                  </>
                ) : theme === "light" ? (
                  <>
                    <SunIcon className="h-4 w-4" />
                    Mode clair
                  </>
                ) : (
                  <>
                    <MoonIcon className="h-4 w-4" />
                    Mode sombre
                  </>
                )}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {theme === "light"
                  ? "Thème clair pour une meilleure lisibilité dans les environnements lumineux"
                  : "Thème sombre pour un confort visuel en faible luminosité"}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                {theme === "system" ? (
                  <MonitorIcon className="h-[1.2rem] w-[1.2rem]" />
                ) : (
                  <>
                    <SunIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                    <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                Clair
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                Sombre
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                Système
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Transparency Slider */}
      <div
        className={`space-y-2 ${
          locked ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <Header
          title="Transparence de la fenêtre"
          description="Ajustez le niveau de transparence de la fenêtre de l'application"
        />
        <div className="space-y-3">
          <div className="flex items-center gap-4 mt-4">
            <Slider
              value={[transparency]}
              onValueChange={(value: number[]) => onSetTransparency(value[0])}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>

          <p className="text-xs text-muted-foreground/70">
            💡 Astuce : une transparence élevée permet de voir à travers la fenêtre, idéal
            pour l'overlay sombre. Les modifications sont appliquées immédiatement.
          </p>
        </div>
      </div>
    </div>
  );
};
