import { useState } from "react";
import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

export const ConversationSync = () => {
  const { syncEnabled, setSyncEnabled } = useApp();
  const [showConsent, setShowConsent] = useState(false);

  const handleToggle = (checked: boolean) => {
    if (checked && !syncEnabled) {
      setShowConsent(true);
    } else {
      setSyncEnabled(false);
    }
  };

  const handleAccept = () => {
    setSyncEnabled(true);
    setShowConsent(false);
  };

  return (
    <div className="space-y-2">
      <Header
        title="Synchronisation des conversations"
        description="Envoyez optionnellement votre historique de conversations au tableau de bord administrateur pour suivi et support"
        isMainTitle
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {syncEnabled ? "Synchronisation activée" : "Synchronisation désactivée"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {syncEnabled
                ? "Vos conversations sont synchronisées avec le tableau de bord"
                : "Les conversations sont stockées localement uniquement"}
            </p>
          </div>
        </div>
        <Switch
          checked={syncEnabled}
          onCheckedChange={handleToggle}
          aria-label="Basculer la synchronisation des conversations"
        />
      </div>

      {/* Privacy notice */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Avis de confidentialité</strong> — lorsqu'elle
        est activée, vos messages de conversation (texte uniquement, sans fichiers joints) sont
        envoyés au serveur Lamu. Ils sont visibles uniquement par l'administrateur. Vous pouvez
        désactiver la synchronisation à tout moment et vos données locales ne sont jamais supprimées.
      </div>

      {/* Consent modal */}
      {showConsent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 16,
              padding: 28,
              maxWidth: 420,
              width: "100%",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              Activer la synchronisation ?
            </div>
            <p
              style={{
                fontSize: 13,
                color: "hsl(var(--muted-foreground))",
                lineHeight: 1.7,
                marginBottom: 20,
              }}
            >
              En activant la synchronisation, vos messages de conversation (texte uniquement) seront
              envoyés au serveur Lamu et stockés dans la base de données administrateur.
              Ces données sont accessibles uniquement par l'administrateur et servent à fournir
              du support et de la visibilité.
              <br />
              <br />
              Vous pouvez désactiver la synchronisation à tout moment depuis les Paramètres. Aucun
              fichier joint (images, documents) n'est jamais synchronisé.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConsent(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "hsl(var(--foreground))",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleAccept}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                J'accepte — Activer la sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
