import { createPortal } from 'react-dom';

type ConfirmDialogProps = {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  if (typeof document === 'undefined') return null;
  const trimmedMessage = message.trim();
  const firstQuestionMarkIndex = trimmedMessage.indexOf('?');
  const hasQuestion = firstQuestionMarkIndex !== -1;
  const title = hasQuestion
    ? trimmedMessage.slice(0, firstQuestionMarkIndex + 1)
    : trimmedMessage;
  const description = hasQuestion
    ? trimmedMessage.slice(firstQuestionMarkIndex + 1).trim()
    : '';

  return createPortal(
    <div
      className="modal active"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? 'confirm-dialog-description' : undefined}
    >
      <div className="modal-content">
        <div className="modal-body">
          <div className="modal-copy">
            <h2 id="confirm-dialog-title" className="modal-title">{title}</h2>
            {description && (
              <p id="confirm-dialog-description" className="modal-description">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
