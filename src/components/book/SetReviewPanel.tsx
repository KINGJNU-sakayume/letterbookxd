import { StarRating } from '../ui/StarRating';
import { LikeButton } from '../ui/LikeButton';
import { useLogStore } from '../../store/logStore';
import { formatDate } from '../../utils/format';

interface SetReviewPanelProps {
  editionSetId: string;
  workId: string;
  publisher: string;
  title?: string;
  isSinglePublisher?: boolean;
  canEdit?: boolean;
}

/** 여러 권짜리 판본을 모두 읽은 뒤 세트 전체에 남기는 별점 */
export function SetReviewPanel({ editionSetId, workId, publisher, title, isSinglePublisher, canEdit = true }: SetReviewPanelProps) {
  const { getSetCompletionLog, upsertSetCompletionLog } = useLogStore();
  const log = getSetCompletionLog(editionSetId);

  if (!log) return null;

  function handleRating(rating: number | null) {
    upsertSetCompletionLog({ editionSetId, workId, liked: log!.liked, rating });
  }

  function toggleLiked() {
    upsertSetCompletionLog({ editionSetId, workId, liked: !log!.liked, rating: log!.rating });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line bg-completed-light/50 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="-rotate-[4deg] rounded-[3px] border-[1.5px] border-completed px-1.5 py-[3px] font-serif text-[13px] font-bold leading-none text-completed-dark">
          전권 완독
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-ink">
            {isSinglePublisher && title ? `${title} 전체` : `${publisher} 판 전체`}
          </p>
          <p className="text-[12.5px] text-ink-muted">{formatDate(log.createdAt)} · 세트 전체에 대한 평가</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <StarRating rating={log.rating} onChange={canEdit ? handleRating : undefined} readonly={!canEdit} size="md" label="세트 별점" />
        <LikeButton liked={log.liked} onToggle={canEdit ? toggleLiked : undefined} />
      </div>
    </div>
  );
}
