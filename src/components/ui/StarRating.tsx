import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number | null;
  onChange?: (rating: number | null) => void;
  size?: 'sm' | 'md';
  readonly?: boolean;
}

export function StarRating({ rating, onChange, size = 'md', readonly = false }: StarRatingProps) {
  const iconSize = size === 'sm' ? 14 : 18;

  function handleClick(star: number) {
    if (readonly || !onChange) return;
    if (rating === star) {
      onChange(null);
    } else {
      onChange(star);
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleClick(star)}
          disabled={readonly}
          className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          aria-label={`별점 ${star}점`}
        >
          <Star
            size={iconSize}
            className={
              rating !== null && star <= rating
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-stone-300'
            }
          />
        </button>
      ))}
    </div>
  );
}
