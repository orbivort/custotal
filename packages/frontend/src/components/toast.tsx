import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckIcon, AlertIcon, XIcon } from './icons';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

let nextId = 0;

const toneCls: Record<ToastType, string> = {
  success: 'border-success/30 bg-success text-white',
  error: 'border-danger/30 bg-danger text-white',
  info: 'border-ink/10 bg-ink text-paper',
};

const iconFor: Record<ToastType, typeof CheckIcon> = {
  success: CheckIcon,
  error: AlertIcon,
  info: AlertIcon,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Memoized so toast mount/dismiss re-renders of the provider do not hand
  // every useToast consumer a fresh context object.
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = iconFor[t.type];
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
              className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg animate-fade-up ${toneCls[t.type]}`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="ml-2 opacity-70 hover:opacity-100 cursor-pointer"
                aria-label="Dismiss"
              >
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
