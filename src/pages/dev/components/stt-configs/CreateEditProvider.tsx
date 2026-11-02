import {
  Card,
  Button,
  Header,
  TextInput,
  Switch,
  Textarea,
  Selection,
} from "@/components";
import { PlusIcon, SaveIcon } from "lucide-react";
import { useCustomSttProviders } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";

interface CreateEditProviderProps {
  customProviderHook?: ReturnType<typeof useCustomSttProviders>;
}

export const CreateEditProvider = ({
  customProviderHook,
}: CreateEditProviderProps) => {
  const { allSttProviders } = useApp();
  // Use the provided hook instance or create a new one
  const hookInstance = customProviderHook || useCustomSttProviders();

  const {
    showForm,
    setShowForm,
    editingProvider,
    formData,
    setFormData,
    errors,
    handleSave,
    setErrors,
    handleAutoFill,
  } = hookInstance;

  return (
    <>
      {!showForm ? (
        <Button
          onClick={() => {
            setShowForm(true);
            setErrors({});
          }}
          variant="outline"
          className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Ajouter un fournisseur STT personnalisé
        </Button>
      ) : (
        <Card className="p-4 border border-input/50 bg-transparent">
          <div className="flex justify-between items-center">
            <Header
              title={
                editingProvider
                  ? `Modifier le fournisseur STT`
                  : "Ajouter un fournisseur STT personnalisé"
              }
              description="Créez un fournisseur STT personnalisé à utiliser avec vos applications."
            />
            <div className="w-[120px]">
              <Selection
                options={allSttProviders
                  ?.filter((provider) => !provider?.isCustom)
                  .map((provider) => {
                    return {
                      label: provider?.id || "STT Provider",
                      value: provider?.id || "STT Provider",
                    };
                  })}
                placeholder={"Remplissage auto"}
                onChange={(value) => {
                  handleAutoFill(value);
                }}
              />
            </div>
          </div>

          <div className="">
            {/* Basic Configuration */}
            <div className="space-y-1">
              <Header
                title="Commande Curl *"
                description="La commande curl à utiliser avec le fournisseur STT."
              />
              <Textarea
                className={cn(
                  "h-74 font-mono text-sm",
                  errors.curl && "border-red-500"
                )}
                placeholder={`curl -X POST "https://api.openai.com/v1/audio/transcriptions" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F "model={{MODEL}}"`}
                value={formData.curl}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, curl: e.target.value }))
                }
              />
              {errors.curl && (
                <p className="text-xs text-red-500 mt-1">{errors.curl}</p>
              )}

              {/* Variable Instructions */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                <div className="bg-card border p-3 rounded-lg">
                  <p className="text-sm font-medium text-primary mb-2">
                    💡 Important : Vous pouvez ajouter des variables personnalisées ou inclure directement vos clés API/valeurs
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inutile de saisir les variables séparément lors de la sélection du fournisseur — vous pouvez les intégrer directement dans la commande curl (ex. : remplacez YOUR_API_KEY par votre clé réelle ou utilisez{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{MODEL}}"}
                    </code>{" "}
                    pour le nom du modèle).
                  </p>
                </div>

                <h4 className="text-sm font-semibold text-foreground">
                  ⚠️ Variables requises pour les fournisseurs STT :
                </h4>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
                    <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
                      {"{{AUDIO}}"}
                    </code>
                    <span className="text-foreground font-medium">
                      → OBLIGATOIRE : Données audio encodées en Base64 ou fichier audio au format WAV si vous utilisez multipart/form-data (avec -F ou --form)
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Configuration rapide :</strong>{" "}
                    Remplacez{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      YOUR_API_KEY
                    </code>{" "}
                    par votre clé API réelle directement dans la commande curl.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">
                      Variables personnalisées :
                    </strong>{" "}
                    Vous pouvez ajouter vos propres variables en utilisant le même format{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{NOM_VARIABLE}}"}
                    </code>{" "}
                    et elles seront disponibles lors de la sélection de ce fournisseur.
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    💡 Conseil : La variable{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{AUDIO}}"}
                    </code>{" "}
                    est indispensable pour le fonctionnement STT — assurez-vous qu'elle est correctement incluse dans votre commande curl.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-0">
            <div className="flex justify-between items-center space-x-2">
              <Header
                title="Streaming"
                description="Le streaming permet de diffuser la réponse du fournisseur STT en temps réel."
              />
              <Switch
                checked={formData.streaming}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    streaming: checked,
                  }))
                }
                disabled={true}
              />
            </div>
            <span className="text-xs italic text-red-500">
              Le streaming n'est pas pris en charge pour les fournisseurs STT. Cela sera corrigé dans une prochaine version.
            </span>
          </div>
          {/* Response Configuration */}
          <div className="space-y-2">
            <Header
              title="Chemin du contenu de réponse *"
              description="Le chemin pour extraire le contenu de la réponse API."
            />

            <TextInput
              placeholder="text"
              value={formData.responseContentPath || ""}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  responseContentPath: value,
                }))
              }
              error={errors.responseContentPath}
              notes="Le chemin pour extraire le contenu de la réponse API. Exemples : text, transcript, results[0].alternatives[0].transcript"
            />
          </div>

          <div className="flex justify-end gap-2 -mt-3">
            <Button
              variant="outline"
              onClick={() => setShowForm(!showForm)}
              className="h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.curl.trim()}
              className={cn(
                "h-11 border-1 border-input/50 focus:border-primary/50 transition-colors",
                errors.curl && "bg-red-500 hover:bg-red-600 text-white"
              )}
            >
              {errors.curl ? (
                "cURL invalide, réessayez"
              ) : (
                <>
                  <SaveIcon className="h-4 w-4 mr-2" />
                  {editingProvider ? "Mettre à jour" : "Enregistrer"} le fournisseur
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
};
