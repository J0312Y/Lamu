import { AudioSelection } from "./components";
import { PageLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const getOsInstructions = () => {
  const platform = getPlatform();

  switch (platform) {
    case "macos":
      return {
        mic: "Préférences Système → Son → Entrée",
        audio: "Préférences Système → Son → Sortie",
      };
    case "windows":
      return {
        mic: "Paramètres → Système → Son → Entrée",
        audio: "Paramètres → Système → Son → Sortie",
      };
    case "linux":
      return {
        mic: "Paramètres Son → Périphériques d'entrée",
        audio: "Paramètres Son → Périphériques de sortie",
      };
    default:
      return {
        mic: "les paramètres son de votre système",
        audio: "les paramètres son de votre système",
      };
  }
};

const Audio = () => {
  const osInstructions = getOsInstructions();

  return (
    <PageLayout
      title="Paramètres audio"
      description="Configurez vos périphériques audio d'entrée et de sortie pour l'interaction vocale et la capture audio système."
    >
      <AudioSelection />

      <div className="text-xs text-amber-600 bg-amber-500/10 p-3 rounded-md mb-4 space-y-2">
        <p>
          <strong>⚠️ Si les périphériques sélectionnés ne fonctionnent pas :</strong> Vérifiez vos
          paramètres audio système par défaut. Accédez à{" "}
          <strong>{osInstructions.mic}</strong> pour le microphone et{" "}
          <strong>{osInstructions.audio}</strong> pour les haut-parleurs/écouteurs.
          Assurez-vous que les bons périphériques sont définis par défaut dans votre système d'exploitation.
        </p>
        <p className="text-amber-600/80">
          <strong>Note :</strong> Si le périphérique sélectionné est défaillant ou indisponible,
          Lamu basculera automatiquement sur les périphériques audio par défaut de votre système.
        </p>
      </div>
    </PageLayout>
  );
};

export default Audio;
