import { InfoIcon, MicIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Button } from "@/components";
import { useApp } from "@/contexts";

interface ChatAudioProps {
  micOpen: boolean;
  setMicOpen: (open: boolean) => void;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  disabled: boolean;
}

export const ChatAudio = ({
  micOpen,
  setMicOpen,
  isRecording,
  setIsRecording,
  disabled,
}: ChatAudioProps) => {
  const { selectedSttProvider, lamuApiEnabled } = useApp();
  const isProviderConfigured = lamuApiEnabled || selectedSttProvider.provider;

  const handleMicClick = () => {
    if (!isProviderConfigured) {
      setMicOpen(!micOpen);
      return;
    }

    setIsRecording(!isRecording);
  };

  return (
    <Popover open={micOpen} onOpenChange={setMicOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          onClick={handleMicClick}
          className="size-7 lg:size-9 rounded-lg lg:rounded-xl"
          title={isRecording ? "Recording..." : "Voice input"}
          disabled={disabled}
        >
          <MicIcon
            className={`size-3 lg:size-4 ${
              isRecording ? "text-red-500 animate-pulse" : ""
            }`}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        className={`w-80 p-3 ${isProviderConfigured ? "hidden" : ""}`}
        sideOffset={8}
      >
        <div className="text-sm">
          <div className="font-semibold text-orange-600 mb-1">
            Fournisseur vocal requis
          </div>
          <p className="text-muted-foreground">
            <div className="mt-2 flex items-center gap-1 text-orange-600">
              <InfoIcon size={16} />
              <span>Fournisseur non configuré</span>
            </div>
            <span className="block mt-2">
              Configurez un fournisseur vocal dans les paramètres pour activer la saisie vocale.
            </span>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
