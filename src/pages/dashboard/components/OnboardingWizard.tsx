import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SparklesIcon,
  KeyIcon,
  MicIcon,
  CalendarIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";

const STORAGE_KEY = "lamu_onboarding_complete";

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; route: string };
}

const CONTENT_STEPS: Step[] = [
  {
    id: "welcome",
    icon: <SparklesIcon className="w-8 h-8 text-primary" />,
    title: "Bienvenue dans Lamu !",
    description:
      "Lamu est votre assistant IA discret pour les réunions, interviews et conversations. Il écoute, transcrit et répond en temps réel — sans jamais quitter votre bureau.",
  },
  {
    id: "api",
    icon: <KeyIcon className="w-8 h-8 text-amber-500" />,
    title: "Configurez votre clé API",
    description:
      "Pour utiliser l'IA, configurez votre fournisseur préféré (OpenAI, Anthropic, Groq…) ou activez le plan Lamu intégré. Rendez-vous dans Dev Space → AI Providers.",
    action: { label: "Ouvrir Dev Space", route: "/dev-space" },
  },
  {
    id: "audio",
    icon: <MicIcon className="w-8 h-8 text-blue-500" />,
    title: "Permissions audio",
    description:
      "Lamu a besoin d'accéder à l'audio système pour capturer les conversations. Lors du premier démarrage, acceptez la demande de permission. Sur macOS, activez l'accès au micro dans Préférences Système → Confidentialité.",
    action: { label: "Paramètres audio", route: "/audio" },
  },
  {
    id: "calendar",
    icon: <CalendarIcon className="w-8 h-8 text-green-500" />,
    title: "Connectez votre calendrier",
    description:
      "Synchronisez Google Calendar pour voir vos réunions à venir directement dans l'assistant et charger automatiquement le contexte de chaque meeting.",
  },
  {
    id: "prep",
    icon: <BriefcaseIcon className="w-8 h-8 text-purple-500" />,
    title: "Préparez-vous à performer",
    description:
      "Utilisez Interview Prep pour simuler des entretiens avec scoring IA, créez des playbooks personnalisés pour vos réunions, et consultez l'historique de vos sessions.",
    action: { label: "Interview Prep", route: "/interview-prep" },
  },
  {
    id: "done",
    icon: <CheckCircleIcon className="w-8 h-8 text-green-500" />,
    title: "Vous êtes prêt !",
    description:
      "Cliquez sur l'icône casque dans la barre pour démarrer la capture audio. Bonne chance pour votre prochaine réunion !",
  },
];

// Total steps = name step (0) + content steps
const TOTAL_STEPS = 1 + CONTENT_STEPS.length;

export const OnboardingWizard = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [nameInput, setNameInput] = useState("");
  const { setUserName } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setOpen(true);
      // Pre-fill with OS username
      invoke<string>("get_os_username")
        .then((os) => { if (os && !nameInput) setNameInput(os); })
        .catch(() => {});
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const handleNext = () => {
    if (step === 0) {
      // Save name then move on
      const trimmed = nameInput.trim();
      if (trimmed) {
        setUserName(trimmed);
        // Re-sync trial with the name so backend records it
        invoke("get_trial_status", { userName: trimmed }).catch(() => {});
      }
    }

    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  };

  // Content step index (step 0 is the name step)
  const contentStep = CONTENT_STEPS[step - 1];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="sr-only">Onboarding Lamu</DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pt-4 px-5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <button
              key={i}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "rounded-full transition-all",
                i === step
                  ? "w-5 h-1.5 bg-primary"
                  : i < step
                  ? "w-1.5 h-1.5 bg-primary/40"
                  : "w-1.5 h-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>

        {step === 0 ? (
          /* ── Name step ── */
          <div className="px-5 py-5 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2 w-full">
              <h2 className="text-base font-semibold">Comment vous appelez-vous ?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Votre prénom permet à Lamu de personnaliser votre expérience.
              </p>
              <Input
                className="mt-3 text-center"
                placeholder="Votre prénom"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNext()}
                autoFocus
              />
            </div>
          </div>
        ) : (
          /* ── Content steps ── */
          <div className="px-5 py-5 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              {contentStep.icon}
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-semibold">{contentStep.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {contentStep.description}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-2">
          {step > 0 && contentStep?.action && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                navigate(contentStep.action!.route);
                handleClose();
              }}
            >
              {contentStep.action.label}
            </Button>
          )}
          <Button
            size="sm"
            className={cn(
              "text-xs gap-1.5",
              !(step > 0 && contentStep?.action) && "w-full"
            )}
            onClick={handleNext}
            disabled={step === 0 && !nameInput.trim()}
          >
            {step < TOTAL_STEPS - 1 ? (
              <>
                Suivant
                <ArrowRightIcon className="w-3 h-3" />
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-3 h-3" />
                Commencer
              </>
            )}
          </Button>
          {step > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={handleClose}
            >
              Passer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
