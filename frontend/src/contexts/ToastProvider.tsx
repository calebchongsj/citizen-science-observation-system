import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  ToastContext,
  type ToastInput,
  type ToastVariant,
} from './toastContext';

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};
const TOAST_DURATION_MS = 5000;
const TOAST_DUPLICATE_WINDOW_MS = 800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [navOffset, setNavOffset] = useState(84);
  const duplicateGuardRef = useRef<{ signature: string; shownAt: number } | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const updateNavOffset = () => {
      const nav = document.querySelector('.main-nav');
      const navHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0;
      setNavOffset(Math.max(72, Math.round(navHeight) + 12));
    };

    updateNavOffset();

    const nav = document.querySelector('.main-nav');
    const resizeObserver =
      nav instanceof HTMLElement && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateNavOffset)
        : null;

    if (nav instanceof HTMLElement && resizeObserver) {
      resizeObserver.observe(nav);
    }

    window.addEventListener('resize', updateNavOffset);
    return () => {
      window.removeEventListener('resize', updateNavOffset);
      resizeObserver?.disconnect();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(({ message, variant }: ToastInput) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    const signature = `${variant}:${trimmedMessage}`;
    const now = Date.now();
    const lastShown = duplicateGuardRef.current;
    if (
      lastShown &&
      lastShown.signature === signature &&
      now - lastShown.shownAt < TOAST_DUPLICATE_WINDOW_MS
    ) {
      return;
    }

    duplicateGuardRef.current = { signature, shownAt: now };

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${now}-${Math.random().toString(36).slice(2)}`;

    setToasts((current) => [...current, { id, message: trimmedMessage, variant }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      dismissToast,
    }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div
              className="toast-viewport"
              style={{ top: `max(env(safe-area-inset-top, 0px), ${navOffset}px)` }}
              aria-live="polite"
              aria-atomic="false"
            >
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className={`toast toast--${toast.variant}`}
                  role={toast.variant === 'error' ? 'alert' : 'status'}
                >
                  <p className="toast__message">{toast.message}</p>
                  <button
                    type="button"
                    className="toast__close"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss notification"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
