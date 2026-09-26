import { useState } from 'react';

interface StarRatingProps {
  rating: number | null;
  onChange?: (rating: number | null) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  readonly?: boolean;
  /** 읽기 전용이고 별점이 없을 때 '—'를 보여 줄지 */
  showEmpty?: boolean;
  label?: string;
}

const SIZE = { xs: 11, sm: 14, md: 18, lg: 30 } as const;
const STAR = 'M12 2.8l2.78 5.9 6.47.78-4.78 4.43 1.26 6.4L12 17.18l-5.73 3.13 1.26-6.4-4.78-4.43 6.47-.78z';

function Star({ filled, px, preview }: { filled: boolean; px: number; preview?: boolean }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden className="block">
      <path
        d={STAR}
        fill={filled ? (preview ? '#d3a54a' : '#b27d17') : 'transparent'}
        stroke={filled ? (preview ? '#d3a54a' : '#b27d17') : '#cfc6b4'}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarRating({
  rating,
  onChange,
  size = 'md',
  readonly = false,
  showEmpty = true,
  label = '별점',
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const px = SIZE[size];
  const interactive = !readonly && !!onChange;

  if (!interactive) {
    if (!rating) {
      return showEmpty ? <span className="text-sm leading-none text-ink-faint" aria-label="별점 없음">—</span> : null;
    }
    return (
      <span role="img" aria-label={`별점 ${rating}점`} className="inline-flex items-center gap-px">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star key={s} filled={s <= rating} px={px} />
        ))}
      </span>
    );
  }

  const shown = hover ?? rating ?? 0;
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={rating === s}
          aria-label={`${s}점`}
          title={rating === s ? '한 번 더 누르면 별점을 지웁니다' : `${s}점`}
          onMouseEnter={() => setHover(s)}
          onFocus={() => setHover(s)}
          onBlur={() => setHover(null)}
          onClick={() => onChange?.(rating === s ? null : s)}
          className={`rounded-sm transition-transform active:scale-90 ${size === 'lg' ? 'p-1' : 'p-[2px]'}`}
        >
          <Star filled={s <= shown} px={px} preview={hover !== null && s <= shown && hover !== rating} />
        </button>
      ))}
    </div>
  );
}
