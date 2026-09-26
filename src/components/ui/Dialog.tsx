import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** 확인 대화상자처럼 닫기 버튼이 필요 없는 경우 */
  hideClose?: boolean;
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' } as const;
// 겹쳐 열린 대화상자 중 맨 위의 것만 Esc·Tab을 처리한다
const openStack: number[] = [];
let nextId = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', hideClose = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = ++nextId;
    openStack.push(id);
    const isTop = () => openStack[openStack.length - 1] === id;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const autofocus = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (autofocus ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(id), 1);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`animate-rise relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-line bg-paper-raised shadow-pop outline-none sm:rounded-lg ${WIDTH[size]}`}
      >
        <div className="flex items-start gap-4 px-6 pb-2 pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-[21px] font-bold leading-snug text-ink">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
                {description}
              </div>
            )}
          </div>
          {!hideClose && (
            <button type="button" onClick={onClose} className="btn-icon -mr-2 -mt-1" aria-label="닫기">
              <X size={18} />
            </button>
          )}
        </div>
        {children && <div className="overflow-y-auto px-6 py-4">{children}</div>}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-paper px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
