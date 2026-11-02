import { useId } from 'react';
import Button from './Button';
import Modal from './Modal';

export default function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <Modal labelledBy={titleId} onClose={onCancel} className="max-w-sm">
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-white">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm text-slate-300">{description}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
