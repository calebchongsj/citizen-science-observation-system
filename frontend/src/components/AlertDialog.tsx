import { createPortal } from 'react-dom';

type AlertDialogProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export function AlertDialog({ open, message, onClose }: AlertDialogProps) {
  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal active" role="alertdialog" aria-modal="true" aria-labelledby="alert-dialog-title">
      <div className="modal-content">
        <div className="modal-body">
          <div className="modal-copy">
            <h2 id="alert-dialog-title" className="modal-title">Notice</h2>
            <p className="modal-description">{message}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
