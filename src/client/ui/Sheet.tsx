import { useEffect, useRef, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** A bottom sheet built on the native modal dialog, so focus and Escape work for free. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Focus the sheet itself rather than its first button, which would show a focus ring
      // before anything has been chosen.
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-content">
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {message !== undefined && <p className="sheet-message">{message}</p>}
      <div className="sheet-actions">
        <button
          type="button"
          className={destructive === true ? "button block destructive" : "button block primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="button block plain" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}
