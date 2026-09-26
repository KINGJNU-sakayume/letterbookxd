import type { ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink ${className}`}
    />
  );
}

export function PageLoader({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2.5 text-[14px] text-ink-muted">
        <Spinner />
        {label}
      </span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`border-y border-line py-12 ${className}`}>
      <p className="font-serif text-[22px] font-bold text-ink">{title}</p>
      {description && <div className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-muted">{description}</div>}
      {action && <div className="mt-6 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ description, onRetry, className }: { description?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      className={className}
      title="불러오지 못했습니다"
      description={description ?? '네트워크 상태를 확인한 뒤 다시 시도해 주세요.'}
      action={
        onRetry && (
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            다시 시도
          </button>
        )
      }
    />
  );
}

export function CoverGridSkeleton({ count = 12, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[2/3] rounded-[2px]" />
          <div className="skeleton mt-3 h-3.5 w-4/5 rounded-sm" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
