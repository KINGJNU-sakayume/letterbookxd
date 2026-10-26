import { useState } from 'react';

interface StarRatingProps {
  rating: number | null;
  onChange?: (rating: number | null) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  readonly?: boolean;
  /** 읽기 전용이고 별점이 없을 때 '없음'을 보여 줄지 */
  showEmpty?: boolean;
  label?: string;
}

const SIZE = { xs: 11, sm: 14, md: 18, lg: 30 } as const;
// 손가락으로 누르는 기기: 별 하나의 누르는 면적을 44px로 넓히고, 작은 별은 그림도 조금 키운다
const TOUCH_BUTTON = { xs: '', sm: 'coarse:h-11 coarse:w-10', md: 'coarse:h-11 coarse:w-11', lg: 'coarse:h-11 coarse:w-11' } as const;
const TOUCH_GLYPH = { xs: '', sm: 'coarse:h-[22px] coarse:w-[22px]', md: 'coarse:h-6 coarse:w-6', lg: '' } as const;
/** 빈 별 테두리. 누를 수 있는 별은 종이 바탕에서 3:1을 넘겨 자리가 보이게 한다 */
const EMPTY_STROKE = { readonly: 'var(--color-rule-strong)', interactive: 'var(--color-field-edge)' } as const;
const STAR = 'M12 2.8l2.78 5.9 6.47.78-4.78 4.43 1.26 6.4L12 17.18l-5.73 3.13 1.26-6.4-4.78-4.43 6.47-.78z';

function Star({ filled, px, preview, interactive = false, className = '' }: { filled: boolean; px: number; preview?: boolean; interactive?: boolean; className?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden className={`block ${className}`}>
      <path
        d={STAR}
        style={{
          fill: filled ? (preview ? 'var(--color-muted)' : 'var(--color-ink)') : 'transparent',
          stroke: filled ? (preview ? 'var(--color-muted)' : 'var(--color-ink)') : EMPTY_STROKE[interactive ? 'interactive' : 'readonly'],
        }}
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
      return showEmpty ? <span className="text-[12.5px] leading-none text-ink-faint" aria-label="별점 없음">없음</span> : null;
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
          className={`inline-flex items-center justify-center rounded-sm transition-transform active:scale-90 ${size === 'lg' ? 'p-1' : 'p-[2px]'} ${TOUCH_BUTTON[size]}`}
        >
          <Star filled={s <= shown} px={px} interactive className={TOUCH_GLYPH[size]} preview={hover !== null && s <= shown && hover !== rating} />
        </button>
      ))}
    </div>
  );
}
