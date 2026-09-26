import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/** 모든 화면의 본문 틀. 좌우 여백만 두고 화면 폭을 그대로 쓴다. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main id="main" tabIndex={-1} className={`page-x pb-28 pt-7 outline-none md:pb-20 lg:pt-10 ${className}`}>
      {children}
    </main>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, kicker, description, actions, children, className = '' }: PageHeaderProps) {
  return (
    <header className={`mb-8 border-b border-line pb-6 lg:mb-10 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          {kicker && <div className="mb-2 text-[13px] font-medium text-ink-muted">{kicker}</div>}
          <h1 className="text-balance font-serif text-[32px] font-bold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[40px]">
            {title}
          </h1>
          {description && <div className="mt-3 text-[15px] text-ink-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

interface SectionHeadingProps {
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}

/** 세리프 제목 + 오른쪽으로 이어지는 가는 선 */
export function SectionHeading({ title, count, action, id, className = '' }: SectionHeadingProps) {
  return (
    <div className={`mb-5 flex items-center gap-3 ${className}`}>
      <h2 id={id} className="shrink-0 font-serif text-[21px] font-bold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {count !== undefined && <span className="tnum shrink-0 text-[13px] text-ink-muted">{count}</span>}
      <span aria-hidden className="h-px min-w-6 flex-1 bg-line" />
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="현재 위치" className={`text-[13px] text-ink-muted ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span aria-hidden className="text-line-strong">/</span>}
            {c.to ? (
              <Link to={c.to} className="truncate transition-colors hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink-soft">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
