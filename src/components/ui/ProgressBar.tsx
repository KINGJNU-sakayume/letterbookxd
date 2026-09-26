const FILL = { reading: 'bg-reading', completed: 'bg-completed', ink: 'bg-ink-soft' } as const;
const TRACK = { reading: 'bg-reading-light', completed: 'bg-completed-light', ink: 'bg-paper-sunken' } as const;

interface ProgressBarProps {
  value: number;
  tone?: keyof typeof FILL;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, tone = 'reading', label, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={`h-1.5 overflow-hidden rounded-full ${TRACK[tone]} ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
