import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  /** Called when the user dismisses with Esc. */
  onClose: () => void;
  headerAccessory?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * shadcn/ui dialog styling on the native <dialog>, which supplies the focus trap and
 * inert background. (Radix Dialog's scroll lock injects inline <style>, blocked by our CSP.)
 */
export function Dialog({ open, title, onClose, headerAccessory, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-slot="dialog-content"
      className="m-auto h-fit max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col gap-5 rounded-2xl border border-border/80 bg-card p-6 text-foreground shadow-popover backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex open:animate-in open:fade-in-0 open:zoom-in-95"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div data-slot="dialog-header" className="flex flex-col gap-3">
        {headerAccessory && <div className="flex items-center gap-3">{headerAccessory}</div>}
        <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
      </div>
      <div className="flex flex-col gap-4 text-sm">{children}</div>
      {footer && <div data-slot="dialog-footer" className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
    </dialog>
  );
}
