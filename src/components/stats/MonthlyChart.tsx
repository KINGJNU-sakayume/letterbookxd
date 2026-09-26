import { useState } from 'react';

interface MonthlyChartProps {
  data: { month: string; count: number }[];
  unit?: string;
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : [1, 2, 5, 10, 20, 50].find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** 한 계열 세로 막대. 가장 높은 달에만 값을 적고 나머지는 마우스·키보드로 읽는다. */
export function MonthlyChart({ data, unit = '권' }: MonthlyChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 0);
  const ticks = niceTicks(Math.max(max, 1));
  const top = ticks[ticks.length - 1];

  return (
    <div className="flex">
      {/* y축 */}
      <div className="relative mr-2 h-[220px] w-6 shrink-0" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="tnum absolute right-0 translate-y-1/2 text-[11.5px] text-ink-faint" style={{ bottom: `${(t / top) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-[220px]" onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={`absolute inset-x-0 border-t ${t === 0 ? 'border-line-strong' : 'border-line-soft'}`}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => {
              const h = (d.count / top) * 100;
              const isMax = d.count === max && max > 0;
              const on = active === i;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${d.month} ${d.count}${unit}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  <span
                    className={`relative block w-[min(24px,56%)] rounded-t-[4px] transition-colors ${on ? 'bg-completed-dark' : 'bg-completed'}`}
                    style={{ height: `${h}%` }}
                  >
                    {isMax && !on && (
                      <span className="tnum absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] font-semibold text-ink">{d.count}</span>
                    )}
                  </span>
                  {on && (
                    <span
                      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-ink px-2.5 py-1.5 text-left shadow-lift"
                      style={{ bottom: `calc(${h}% + 8px)` }}
                    >
                      <span className="tnum block text-[14px] font-semibold leading-tight text-paper-raised">
                        {d.count}
                        {unit}
                      </span>
                      <span className="block text-[11.5px] leading-tight text-paper-deep">{d.month}</span>
                    </span>
                  )}
                  <span aria-hidden className="absolute inset-0 rounded-sm group-focus-visible:ring-2 group-focus-visible:ring-seal" />
                </button>
              );
            })}
          </div>
        </div>
        {/* x축 */}
        <div className="mt-2 flex" aria-hidden>
          {data.map((d, i) => (
            <span key={d.month} className={`flex-1 text-center text-[11.5px] ${active === i ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
              {d.month.replace('월', '')}
              <span className="hidden sm:inline">월</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MonthlyTable({ data, unit = '권' }: MonthlyChartProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-center text-[13px]">
        <caption className="sr-only">달마다 완독한 수</caption>
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th scope="row" className="py-2 pr-3 text-left font-medium">월</th>
            {data.map((d) => (
              <th key={d.month} scope="col" className="py-2 font-medium">{d.month}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink-muted">{unit}</th>
            {data.map((d) => (
              <td key={d.month} className={`tnum py-2.5 ${d.count ? 'font-semibold text-ink' : 'text-ink-faint'}`}>{d.count}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
