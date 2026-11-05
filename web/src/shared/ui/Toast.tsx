import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface ToastItem {
  id: number;
  message: string;
}
type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);
const DURATION_MS = 5500;

/** Toasts styled after shadcn/ui's sonner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((message) => {
    const id = ++nextId.current;
    setItems((current) => [...current.slice(-2), { id, message }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <Icon name="checkCircle" size={16} className="shrink-0 text-success" />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
