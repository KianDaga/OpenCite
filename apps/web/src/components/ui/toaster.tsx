import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Small toast queue, hand-rolled rather than pulled from a library because it
 * only ever has one job: confirm a destructive action and offer the undo that
 * the soft-delete schema already makes free.
 */
export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  tone?: 'default' | 'destructive';
}

interface ToastContextValue {
  toast(message: string, options?: Omit<Toast, 'id' | 'message'>): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast(message, options = {}) {
        const id = nextId.current++;
        setToasts((current) => [...current.slice(-2), { id, message, ...options }]);
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      },
    }),
    [dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
        // Announced politely: a toast confirms something the user just did.
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center justify-between gap-3 rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-lg',
              toast.tone === 'destructive' && 'border-destructive/40',
            )}
          >
            <span className="text-popover-foreground">{toast.message}</span>
            {toast.action && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0"
                onClick={() => {
                  void toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
