import { useState } from "react";
import { Button } from "@/components";
import { invoke } from "@tauri-apps/api/core";
import { ANALYTICS_EVENTS, captureEvent } from "@/lib";
import { useApp } from "@/contexts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivationResponse {
  activated: boolean;
  error?: string;
  instance?: { id: string; name: string; created_at: string };
  is_dev_license: boolean;
}

type Step = "form" | "loading" | "success" | "error";

const LICENSE_KEY_STORAGE_KEY = "lamu_license_key";
const INSTANCE_ID_STORAGE_KEY = "lamu_instance_id";

// ── Modal ─────────────────────────────────────────────────────────────────────

function LicenseModal({
  onClose,
  onActivated,
}: {
  onClose: () => void;
  onActivated: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");

  const handleActivate = async () => {
    const key = licenseKey.trim();
    if (!key) return;
    setStep("loading");
    setError("");
    try {
      const activation: ActivationResponse = await invoke("activate_license_api", {
        licenseKey: key,
      });

      if (activation.activated && activation.instance) {
        await invoke("secure_storage_save", {
          items: [
            { key: LICENSE_KEY_STORAGE_KEY, value: key },
            { key: INSTANCE_ID_STORAGE_KEY, value: activation.instance.id },
          ],
        });
        setStep("success");
        await captureEvent(ANALYTICS_EVENTS.GET_LICENSE);
      } else {
        setError(activation.error || "Clé invalide ou déjà utilisée. Contactez le support.");
        setStep("error");
      }
    } catch (e) {
      setError(`Erreur : ${e}`);
      setStep("error");
    }
  };

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
    backdropFilter: "blur(12px)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  };

  const card: React.CSSProperties = {
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 16, padding: 28, maxWidth: 400, width: "100%",
    position: "relative",
  };

  const input: React.CSSProperties = {
    width: "100%", background: "hsl(var(--muted))",
    border: "1px solid hsl(var(--border))", borderRadius: 8,
    padding: "10px 12px", fontSize: 14, color: "hsl(var(--foreground))",
    fontFamily: "monospace", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {step === "success" ? "✅ Licence activée !" : "Activer votre licence"}
            </div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
              {step === "success" ? "Votre accès premium est actif" : "Entrez la clé reçue après votre achat"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "hsl(var(--muted-foreground))", padding: "4px 8px" }}
          >
            ×
          </button>
        </div>

        {/* ── FORM ── */}
        {step === "form" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 6 }}>
                CLÉ DE LICENCE
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                placeholder="LMKA-XXXX-XXXX-XXXX"
                autoFocus
                style={input}
              />
            </div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted))", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
              Vous avez reçu cette clé par email après votre achat. Elle est liée à votre identité — vous pouvez l'utiliser sur n'importe quel appareil.
            </div>
            <Button onClick={handleActivate} disabled={!licenseKey.trim()} className="w-full">
              Activer la licence
            </Button>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Vérification en cours…</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Validation de la clé de licence</div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === "success" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "hsl(var(--muted))", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>CLÉ ACTIVÉE</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>{licenseKey}</div>
            </div>
            <Button onClick={() => { onActivated(); onClose(); }} className="w-full">
              Continuer →
            </Button>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === "error" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Activation échouée</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.7, marginBottom: 16 }}>{error}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Button onClick={() => { setStep("form"); setError(""); }} variant="outline">
                Réessayer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── GetLicense button ─────────────────────────────────────────────────────────

export const GetLicense = ({
  setState,
  buttonText,
  buttonClassName = "",
}: {
  setState?: React.Dispatch<React.SetStateAction<boolean>>;
  buttonText?: string;
  buttonClassName?: string;
}) => {
  const [showModal, setShowModal] = useState(false);
  const { getActiveLicenseStatus, hasActiveLicense } = useApp();

  if (hasActiveLicense) return null;

  const handleActivated = async () => {
    await getActiveLicenseStatus();
    setShowModal(false);
    setState?.(false);
  };

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        size="sm"
        className={buttonClassName}
      >
        {buttonText || "Get License"}
      </Button>

      {showModal && (
        <LicenseModal
          onClose={() => { setShowModal(false); setState?.(false); }}
          onActivated={handleActivated}
        />
      )}
    </>
  );
};
