import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** 라벨 뒤에 붙는 작은 표시 (예: 완독 체크) */
  adornment?: ReactNode;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'md' | 'sm';
}

/** 밑줄 탭. 좌우 화살표로 이동한다. */
export function Tabs<T extends string>({ items, value, onChange, label, className = '', size = 'md' }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const index = items.findIndex((it) => it.value === value);
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    onChange(next.value);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    });
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`hide-scrollbar flex items-end gap-6 overflow-x-auto border-b border-line ${className}`}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 pt-1 font-medium transition-colors ${
              size === 'sm' ? 'text-[14px]' : 'text-[15px]'
            } ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={`tnum text-[12.5px] ${active ? 'text-ink-muted' : 'text-ink-faint'}`}>{it.count}</span>
            )}
            {it.adornment}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-px h-[2px] transition-colors ${active ? 'bg-ink' : 'bg-transparent'}`}
            />
          </button>
        );
      })}
    </div>
  );
}
