import { useState } from "react";
import { Header, Input, Button } from "@/components";
import { useApp } from "@/contexts";
import { invoke } from "@tauri-apps/api/core";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";

export const UserProfile = () => {
  const { userName, setUserName } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(userName);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setUserName(trimmed);
    // Re-sync with backend so the trials table is updated
    invoke("get_trial_status", { userName: trimmed }).catch(() => {});
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(userName);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Your Name"
        description="Used to personalize your experience and identify your account"
        isMainTitle
      />

      <div className="flex items-center gap-2 max-w-sm">
        {editing ? (
          <>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              autoFocus
              className="h-8 text-sm"
              placeholder="Votre prénom"
            />
            <Button size="icon" className="size-8 shrink-0" onClick={handleSave} disabled={!value.trim()}>
              <CheckIcon className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={handleCancel}>
              <XIcon className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium flex-1 truncate">
              {userName || <span className="text-muted-foreground italic">Non défini</span>}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              onClick={() => { setValue(userName); setEditing(true); }}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
