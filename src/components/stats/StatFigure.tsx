interface StatFigureProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  /** 화면에서 가장 먼저 읽을 숫자 하나 */
  hero?: boolean;
}

/** 라벨, 값, 보조 설명. 큰 숫자는 표시용 글꼴 700으로 먹 그대로 둔다. */
export function StatFigure({ label, value, unit, sub, hero = false }: StatFigureProps) {
  return (
    <div className="min-w-0 py-5 pr-4 sm:pr-6">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={`tnum mt-2 font-serif font-bold leading-none tracking-[-0.035em] text-ink ${hero ? 'text-[52px]' : 'text-[32px]'}`}>
        {value}
        {unit && <span className={`ml-1 font-sans font-semibold tracking-normal text-ink-muted ${hero ? 'text-[18px]' : 'text-[15px]'}`}>{unit}</span>}
      </dd>
      {sub && <dd className="mt-2 truncate text-[12.5px] text-ink-muted">{sub}</dd>}
    </div>
  );
}
