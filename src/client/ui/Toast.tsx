import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface ToastMessage {
  text: string;
  action?: { label: string; run: () => Promise<void> };
}

const ToastContext = createContext<((toast: ToastMessage) => void) | null>(null);

const TOAST_MS = 4000;
/** Toasts with an action (like Undo) stay longer, and don't time out while focused. */
const ACTION_TOAST_MS = 10_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { key: number }) | null>(null);
  const [paused, setPaused] = useState(false);
  const show = useCallback((next: ToastMessage) => {
    setToast({ ...next, key: Date.now() });
  }, []);

  useEffect(() => {
    if (toast === null || paused) return;
    const timer = setTimeout(
      () => {
        setToast(null);
      },
      toast.action === undefined ? TOAST_MS : ACTION_TOAST_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [toast, paused]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast !== null && (
        <div
          className="toast"
          role="status"
          key={toast.key}
          onFocus={() => {
            setPaused(true);
          }}
          onBlur={() => {
            setPaused(false);
          }}
        >
          <span>{toast.text}</span>
          {toast.action !== undefined && (
            <button
              type="button"
              onClick={() => {
                const action = toast.action;
                setToast(null);
                action?.run().catch((err: unknown) => {
                  setToast({
                    text: `${action.label} failed: ${err instanceof Error ? err.message : String(err)}`,
                    key: Date.now(),
                  });
                });
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastMessage) => void {
  const show = useContext(ToastContext);
  if (show === null) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
