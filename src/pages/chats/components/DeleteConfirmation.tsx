import { Button } from "@/components";

interface DeleteConfirmationDialogProps {
  deleteConfirm: string | null;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

export const DeleteConfirmationDialog = ({
  deleteConfirm,
  cancelDelete,
  confirmDelete,
}: DeleteConfirmationDialogProps) => {
  if (!deleteConfirm) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-2">Supprimer la conversation</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action
          est irréversible.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cancelDelete}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
};
