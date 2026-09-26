import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** 값 옆에 덧붙일 설명 (예: 비율) */
  note?: string;
  to?: string;
}

interface BarListProps {
  items: BarListItem[];
  color: string;
  unit?: string;
  ranked?: boolean;
  labelWidth?: string;
}

/** 가로 막대 목록. 값은 늘 글자로 함께 적는다. */
export function BarList({ items, color, unit = '권', ranked = false, labelWidth }: BarListProps) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const label = item.to ? (
          <Link to={item.to} className="truncate text-ink decoration-line-strong underline-offset-4 hover:underline">
            {item.label}
          </Link>
        ) : (
          <span className="truncate text-ink">{item.label}</span>
        );
        return (
          <li key={item.key} className="flex items-center gap-3 text-[14px]">
            {ranked && <span className="tnum w-4 shrink-0 text-right text-[12.5px] text-ink-faint">{index + 1}</span>}
            <span className="flex min-w-0 shrink-0 items-center" style={{ width: labelWidth ?? '38%' }}>
              {label}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-sunken" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }} />
            </span>
            <span className="tnum w-16 shrink-0 text-right text-[13px] text-ink-soft">
              {item.value}
              {unit}
              {item.note && <span className="ml-1 text-[12px] text-ink-faint">{item.note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
