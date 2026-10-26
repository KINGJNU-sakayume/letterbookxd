import type { ReactNode } from 'react';

/** 머리글 옆에 두는 큰 숫자 묶음. 숫자는 먹으로 크게, 이름은 그 아래 작게. */
export function Figures({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <dl className={`flex flex-wrap gap-x-8 gap-y-4 sm:gap-x-10 ${className}`}>{children}</dl>;
}

export function Figure({ label, value, unit }: { label: ReactNode; value: ReactNode; unit?: ReactNode }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1.5 text-[13px] text-ink-muted">{label}</dt>
      <dd className="tnum font-serif text-[30px] font-bold leading-none tracking-[-0.03em] text-ink">
        {value}
        {unit && <span className="ml-0.5 font-sans text-[14px] font-semibold tracking-normal text-ink-muted">{unit}</span>}
      </dd>
    </div>
  );
}
