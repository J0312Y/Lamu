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
import { useCustomAiProviders } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";

interface CreateEditProviderProps {
  customProviderHook?: ReturnType<typeof useCustomAiProviders>;
}

export const CreateEditProvider = ({
  customProviderHook,
}: CreateEditProviderProps) => {
  const { allAiProviders } = useApp();
  // Use the provided hook instance or create a new one
  const hookInstance = customProviderHook || useCustomAiProviders();

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
          Ajouter un fournisseur personnalisé
        </Button>
      ) : (
        <Card className="p-4 border !bg-transparent border-input/50 ">
          <div className="flex justify-between items-center">
            <Header
              title={editingProvider ? `Modifier le fournisseur` : "Ajouter un fournisseur personnalisé"}
              description="Créez un fournisseur IA personnalisé à utiliser avec vos applications."
            />

            <div className="w-[120px]">
              <Selection
                options={allAiProviders
                  ?.filter((provider) => !provider?.isCustom)
                  .map((provider) => {
                    return {
                      label: provider?.id || "AI Provider",
                      value: provider?.id || "AI Provider",
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
                description="La commande curl à utiliser avec le fournisseur IA."
              />
              <Textarea
                className={cn(
                  "h-74 font-mono text-sm",
                  errors.curl && "border-red-500"
                )}
                placeholder={`curl --location 'http://127.0.0.1:1337/v1/chat/completions' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY or {{API_KEY}}' \
--data '{
        "model": "your-model-name or {{MODEL}}",
        "messages": [
            {
                "role": "system",
                "content": "{{SYSTEM_PROMPT}}"
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "{{TEXT}}"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/jpeg;base64,{{IMAGE}}"
                        }
                    }
                ]
            }
        ]
    }'`}
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
                  ⚠️ Variables requises pour les fournisseurs IA :
                </h4>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
                    <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
                      {"{{TEXT}}"}
                    </code>
                    <span className="text-foreground font-medium">
                      → OBLIGATOIRE : Texte saisi par l'utilisateur
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
                    <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
                      {"{{IMAGE}}"}
                    </code>
                    <span className="text-muted-foreground">
                      → Données image en Base64 (sans le préfixe data:image/jpeg;base64)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-card border rounded-lg">
                    <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
                      {"{{SYSTEM_PROMPT}}"}
                    </code>
                    <span className="text-muted-foreground">
                      → Prompt système / instructions (optionnel)
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
                    💡 Conseil : Utilisez les variables requises (
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{TEXT}}"}
                    </code>
                    ,{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{SYSTEM_PROMPT}}"}
                    </code>
                    ) pour les fonctionnalités de base. Ajoutez{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      {"{{IMAGE}}"}
                    </code>{" "}
                    uniquement si votre fournisseur supporte les images.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center space-x-2">
            <Header
              title="Streaming"
              description="Le streaming permet de diffuser la réponse du fournisseur IA en temps réel."
            />
            <Switch
              checked={formData.streaming}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  streaming: checked,
                }))
              }
            />
          </div>
          {/* Response Configuration */}
          <div className="space-y-2">
            <Header
              title="Chemin du contenu de réponse *"
              description="Le chemin pour extraire le contenu de la réponse API."
            />

            <TextInput
              placeholder="choices[0].message.content"
              value={formData.responseContentPath || ""}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  responseContentPath: value,
                }))
              }
              error={errors.responseContentPath}
              notes="Le chemin pour extraire le contenu de la réponse API. Exemples : choices[0].message.content, text, candidates[0].content.parts[0].text"
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
