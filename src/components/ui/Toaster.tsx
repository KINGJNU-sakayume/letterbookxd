import { X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`animate-rise pointer-events-auto flex max-w-sm items-center gap-3 rounded-md py-2.5 pl-4 pr-2 text-[14px] shadow-pop ${
            t.tone === 'error' ? 'bg-seal text-paper-raised' : 'bg-ink text-paper-raised'
          }`}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="알림 닫기"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
