import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  labelledBy,
  onClose,
  className = 'max-w-lg',
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panel) {
        return;
      }

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div aria-hidden="true" className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative max-h-full w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/50 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
