import { useCompletion } from "@/hooks";
import { Screenshot } from "./Screenshot";
import { Files } from "./Files";
import { Audio } from "./Audio";
import { Input } from "./Input";
import { EmailDraftModal } from "@/pages/app/components/speech/EmailDraftModal";
import { invoke } from "@tauri-apps/api/core";

export const Completion = ({ isHidden }: { isHidden: boolean }) => {
  const completion = useCompletion();

  return (
    <>
      <Audio {...completion} />
      <Input {...completion} isHidden={isHidden} />
      <Screenshot {...completion} />
      <Files {...completion} />
      {completion.pendingEmailDraft && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <EmailDraftModal
              draft={completion.pendingEmailDraft}
              onSend={async (updated) => {
                await invoke("email_send", {
                  req: {
                    to_name: updated.to_name,
                    to_email: updated.to_email,
                    subject: updated.subject,
                    body: updated.body,
                  },
                });
                completion.setPendingEmailDraft(null);
              }}
              onDiscard={() => completion.setPendingEmailDraft(null)}
            />
          </div>
        </div>
      )}
    </>
  );
};
