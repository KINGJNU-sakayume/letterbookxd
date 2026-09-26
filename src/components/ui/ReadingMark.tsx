import { Check, Heart } from 'lucide-react';
import { StarRating } from './StarRating';
import type { ReadingState } from '../../utils/readingState';

interface ReadingMarkProps {
  state: ReadingState;
  percent?: number | null;
  rating?: number | null;
  liked?: boolean;
  className?: string;
}

/** 표지 아래에 붙는 한 줄짜리 읽기 상태 */
export function ReadingMark({ state, percent, rating, liked, className = '' }: ReadingMarkProps) {
  if (state === 'unread') return null;
  if (state === 'reading') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-reading ${className}`}>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-reading" />
        읽는 중{percent != null && <span className="tnum">{percent}%</span>}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-completed-dark ${className}`}>
      <Check aria-hidden size={12} strokeWidth={3} />
      완독
      {rating ? <StarRating rating={rating} size="xs" readonly /> : null}
      {liked && <Heart size={11} className="fill-seal text-seal" aria-label="인생책" />}
    </span>
  );
}
