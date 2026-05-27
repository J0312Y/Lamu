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
        title="Sync Conversations"
        description="Optionally send your conversation history to the admin dashboard for visibility and support"
        isMainTitle
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {syncEnabled ? "Sync enabled" : "Sync disabled"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {syncEnabled
                ? "Your conversations are being synced to the dashboard"
                : "Conversations are stored locally only"}
            </p>
          </div>
        </div>
        <Switch
          checked={syncEnabled}
          onCheckedChange={handleToggle}
          aria-label="Toggle conversation sync"
        />
      </div>

      {/* Privacy notice */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Privacy notice</strong> — when
        enabled, your conversation messages (text only, no attached files) are
        sent to the Lamu backend. They are visible only to the admin. You can
        disable sync at any time and your local data is never deleted.
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
              Enable Conversation Sync?
            </div>
            <p
              style={{
                fontSize: 13,
                color: "hsl(var(--muted-foreground))",
                lineHeight: 1.7,
                marginBottom: 20,
              }}
            >
              By enabling sync, your conversation messages (text only) will be
              sent to the Lamu backend server and stored in the admin database.
              This data is accessible only to the admin and is used to provide
              support and visibility.
              <br />
              <br />
              You can disable sync at any time from Settings. No attached files
              (images, documents) are ever synced.
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
                Cancel
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
                I agree — Enable Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
