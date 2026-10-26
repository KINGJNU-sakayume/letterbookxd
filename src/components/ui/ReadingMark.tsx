import { Heart } from 'lucide-react';
import { StarRating } from './StarRating';
import type { ReadingState } from '../../utils/readingState';

interface ReadingMarkProps {
  state: ReadingState;
  percent?: number | null;
  rating?: number | null;
  liked?: boolean;
  className?: string;
}

/** 표지 아래에 붙는 읽기 상태 태그 */
export function ReadingMark({ state, percent, rating, liked, className = '' }: ReadingMarkProps) {
  if (state === 'unread') return null;
  if (state === 'reading') {
    return (
      <span className={`tag tag-in ${className}`}>
        읽는 중{percent != null && <span className="tnum">{percent}%</span>}
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="tag tag-on">완독</span>
      {rating ? <StarRating rating={rating} size="xs" readonly /> : null}
      {liked && <Heart size={11} className="fill-ink text-ink" aria-label="인생책" />}
    </span>
  );
}
