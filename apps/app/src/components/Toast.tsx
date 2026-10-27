import { Toast } from 'radix-ui';
import { createContext, type ReactNode, use, useRef, useState } from 'react';

type Notice = { id: number; text: string };

const ToastContext = createContext<(text: string) => void>(() => {});

const MAX_VISIBLE = 3;

/** Short, self-dismissing confirmations ("Link copied"). Without a provider `useToast()` is a no-op. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const next = useRef(0);
  const push = (text: string) => {
    next.current += 1;
    const id = next.current;
    setNotices((all) => [...all.slice(1 - MAX_VISIBLE), { id, text }]);
  };
  const drop = (id: number) => setNotices((all) => all.filter((n) => n.id !== id));

  return (
    <ToastContext value={push}>
      <Toast.Provider duration={2600} label="Notification" swipeDirection="down">
        {children}
        {notices.map((n) => (
          <Toast.Root
            key={n.id}
            data-popover
            onOpenChange={(open) => {
              if (!open) drop(n.id);
            }}
            className="rounded-lg border border-(--hairline) bg-surface-raised px-4 py-2.5 text-sm font-medium text-foreground shadow-lg"
          >
            {/* TODO(motion): slide the toast up from the dock edge and let it settle out downward */}
            <Toast.Description>{n.text}</Toast.Description>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed right-0 bottom-12 left-0 z-(--z-pencil) m-0 flex list-none flex-col items-center gap-2 p-(--gutter) outline-none md:left-(--sidebar-w)" />
      </Toast.Provider>
    </ToastContext>
  );
}

export const useToast = (): ((text: string) => void) => use(ToastContext);
