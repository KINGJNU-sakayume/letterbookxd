import { Heart, Trophy } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import { useLogStore } from '../../store/logStore';

interface SetReviewPanelProps {
  editionSetId: string;
  workId: string;
  publisher: string;
  title?: string;
  isSinglePublisher?: boolean;
}

export function SetReviewPanel({
  editionSetId,
  workId,
  publisher,
  title,
  isSinglePublisher,
}: SetReviewPanelProps) {
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
    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-emerald-600" />
        <span className="text-sm font-semibold text-emerald-800">
          {/* [수정] 단일 출판사면 "작품명 완독", 아니면 "출판사 판본 완독"으로 분기 */}
          {isSinglePublisher && title ? `${title} 완독 — 종합 평가` : `${publisher} 판본 완독 — 종합 평가`}
        </span>
      </div>
      <p className="text-xs text-emerald-700 mb-4">
        {/* [수정] 안내 문구도 상황에 맞게 자연스럽게 변경 */}
        {isSinglePublisher
          ? '이 작품의 모든 권을 읽었습니다. 전체적인 경험을 평가해 주세요.'
          : '이 세트의 모든 권을 읽었습니다. 전체적인 판본 경험을 평가해 주세요.'}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-stone-600 font-medium">별점</span>
          <StarRating rating={log.rating} onChange={handleRating} size="md" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-stone-600 font-medium">좋아요</span>
          <button
            onClick={toggleLiked}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              log.liked
                ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            <Heart
              size={16}
              className={log.liked ? 'fill-rose-500 text-rose-500' : 'text-stone-400'}
            />
            {log.liked ? '인생작' : '좋아요'}
          </button>
        </div>
      </div>
    </div>
  );
}
