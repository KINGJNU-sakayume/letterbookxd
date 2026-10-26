import { Heart } from 'lucide-react';

interface LikeButtonProps {
  liked: boolean;
  onToggle?: () => void;
  /** 글자 없이 하트만 */
  compact?: boolean;
  disabled?: boolean;
}

/** '인생책' 표시 */
export function LikeButton({ liked, onToggle, compact = false, disabled = false }: LikeButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      aria-pressed={liked}
      aria-label={compact ? (liked ? '인생책 표시 해제' : '인생책으로 표시') : undefined}
      title={liked ? '인생책 표시 해제' : '인생책으로 표시'}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control text-[13px] font-medium transition-colors disabled:pointer-events-none coarse:h-11 ${
        compact ? 'w-8 coarse:w-11' : 'border px-2.5 coarse:px-3.5 coarse:text-[14px]'
      } ${
        liked
          ? `text-ink ${compact ? 'hover:bg-paper-sunken' : 'border-ink bg-paper-sunken hover:bg-paper-deep'}`
          : `text-ink-faint hover:text-ink ${compact ? 'hover:bg-paper-sunken' : 'border-line bg-paper-raised hover:border-line-strong'}`
      }`}
    >
      <Heart size={15} className={liked ? 'fill-ink' : ''} aria-hidden />
      {!compact && '인생책'}
    </button>
  );
}
